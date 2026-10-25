// Integration tests against a real (in-memory) SQLite database, for behavior
// that model mocks can't verify: unique indexes, conditional updates under
// concurrent clicks, JSON columns and the reputation queries.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const Sequelize = require("sequelize");
const { initModels } = require("../models");
const { createInteraction } = require("./helpers/interaction");
const confirmTransaction = require("../events/operations/confirmTransaction");
const confirmListing = require("../events/operations/confirmListing");
const rateUser = require("../events/operations/rateUser");
const threadCreate = require("../events/threadCreate");
const threadUpdate = require("../events/threadUpdate");
const { getUserReputation } = require("../utils/reputation");

let sequelize;
let models;

beforeEach(async () => {
	sequelize = new Sequelize({ dialect: "sqlite", storage: ":memory:", logging: false });
	models = initModels(sequelize);
	await sequelize.sync();
});

function makeClient() {
	const sent = [];
	return {
		sent,
		channels: {
			fetch: async (id) => ({
				id,
				guild: { id: "guild1" },
				send: async (m) => sent.push({ to: id, content: m.content }),
			}),
		},
		users: {
			fetch: async (id) => ({ id, send: async (m) => sent.push({ to: id, content: m.content }) }),
		},
	};
}

async function seedListing(overrides = {}) {
	await models.User.upsert({ id: "seller", username: "seller" });
	return models.Listing.create({
		userId: "seller",
		region: "EU",
		type: "SELL",
		item: "Item",
		offer: "100g",
		threadId: "thread1",
		status: "confirmed",
		...overrides,
	});
}

async function indexNames(table) {
	const [rows] = await sequelize.query(`PRAGMA index_list(${table})`);
	return rows.map((r) => r.name);
}

test("db: sync adds the unique indexes to tables that already exist without them", async () => {
	await sequelize.query("DROP INDEX listings_thread_id");
	await sequelize.query("DROP INDEX ratings_transaction_id_rater_id");
	await sequelize.sync();
	assert.ok((await indexNames("Listings")).includes("listings_thread_id"));
	assert.ok((await indexNames("Ratings")).includes("ratings_transaction_id_rater_id"));
});

test("db: a thread can only have one listing", async () => {
	await seedListing();
	await assert.rejects(seedListing(), Sequelize.UniqueConstraintError);
});

test("db: concurrent transaction confirms only confirm once", async () => {
	const listing = await seedListing();
	const transaction = await models.Transaction.create({
		listingId: listing.id,
		sellerId: "seller",
		buyerId: "buyer",
		type: "purchase",
	});
	const client = makeClient();
	const customId = `confirm_transaction_${transaction.id}_buyer_seller_confirm`;
	const clicks = [1, 2].map(() =>
		createInteraction({ isButton: () => true, customId, user: { id: "seller" } }),
	);

	await Promise.all(clicks.map((i) => confirmTransaction.execute(i, { ...models, client })));

	await transaction.reload();
	assert.strictEqual(transaction.status, "confirmed");
	assert.strictEqual(transaction.initiatorId, "buyer", "initiator is the /confirm caller");
	assert.strictEqual(
		client.sent.filter((m) => m.to === "thread1").length,
		1,
		"one forum announcement",
	);
	assert.strictEqual(client.sent.filter((m) => m.to === "buyer").length, 1, "one rating DM");
	const outcomes = clicks.flatMap((i) => i.state.edits);
	assert.strictEqual(outcomes.filter((e) => e.includes("already been confirmed")).length, 1);
});

test("db: cancelling a transaction deletes it and unlinks it from the listing", async () => {
	const listing = await seedListing();
	const keep = await models.Transaction.create({
		listingId: listing.id,
		sellerId: "seller",
		buyerId: "other",
		type: "purchase",
		status: "confirmed",
	});
	const cancel = await models.Transaction.create({
		listingId: listing.id,
		sellerId: "seller",
		buyerId: "buyer",
		type: "trade",
	});
	await listing.update({ transactionIds: [keep.id, cancel.id] });

	const interaction = createInteraction({
		isButton: () => true,
		customId: `confirm_transaction_${cancel.id}_buyer_seller_deny`,
		user: { id: "seller" },
	});
	await confirmTransaction.execute(interaction, { ...models, client: makeClient() });

	assert.strictEqual(await models.Transaction.findByPk(cancel.id), null, "transaction deleted");
	await listing.reload();
	assert.deepStrictEqual(listing.transactionIds, [keep.id], "only the cancelled id removed");
});

test("db: concurrent rating clicks store a single rating", async () => {
	const listing = await seedListing();
	const transaction = await models.Transaction.create({
		listingId: listing.id,
		sellerId: "seller",
		buyerId: "buyer",
		type: "purchase",
		status: "confirmed",
	});
	const clicks = ["positive", "negative"].map((value) =>
		createInteraction({
			isButton: () => true,
			customId: `rate_user_${transaction.id}_buyer_${value}`,
			user: { id: "buyer" },
		}),
	);

	await Promise.all(clicks.map((i) => rateUser.execute(i, { ...models, client: makeClient() })));

	const ratings = await models.Rating.findAll({ where: { transactionId: transaction.id } });
	assert.strictEqual(ratings.length, 1, "one rating stored");
	assert.strictEqual(ratings[0].rateeId, "seller");
	const followUps = clicks.flatMap((i) => i.state.followUps);
	assert.deepStrictEqual(followUps, ["You have already rated this transaction."]);
});

test("db: concurrent listing confirms only confirm once", async () => {
	await seedListing({ status: "pending" });
	const clicks = ["confirm", "trade"].map((customId) =>
		createInteraction({
			isButton: () => true,
			customId,
			channelId: "thread1",
			channel: { parent: { type: 15, availableTags: [] } },
			user: { id: "seller" },
		}),
	);

	await Promise.all(clicks.map((i) => confirmListing.execute(i, models)));

	const listing = await models.Listing.findOne({ where: { threadId: "thread1" } });
	assert.strictEqual(listing.status, "confirmed");
	const outcomes = clicks.flatMap((i) => i.state.edits);
	assert.strictEqual(outcomes.filter((e) => e.includes("already been confirmed")).length, 1);
});

test("db: reputation counts confirmed listings, confirmed transactions and received ratings", async () => {
	await seedListing();
	await seedListing({ threadId: "thread2", status: "pending" });
	const listing = await models.Listing.findOne({ where: { threadId: "thread1" } });
	const tx = (overrides) =>
		models.Transaction.create({ listingId: listing.id, status: "confirmed", ...overrides });
	const sale = await tx({ sellerId: "seller", buyerId: "b1", type: "purchase" });
	await tx({ sellerId: "s2", buyerId: "seller", type: "purchase" });
	await tx({ sellerId: "seller", buyerId: "b3", type: "money+trade" });
	await tx({ sellerId: "seller", buyerId: "b4", type: "purchase", status: "pending" });
	await tx({ sellerId: "x", buyerId: "y", type: "purchase" });
	await models.Rating.create({
		transactionId: sale.id,
		raterId: "b1",
		rateeId: "seller",
		rating: "positive",
	});
	await models.Rating.create({
		transactionId: sale.id,
		raterId: "seller",
		rateeId: "b1",
		rating: "negative",
	});

	const text = await getUserReputation("seller", models);

	assert.ok(text.includes("Listings: `1` total"), "pending listing excluded");
	assert.ok(text.includes("`1` buys, `1` sells, `1` trades"), "only own confirmed transactions");
	assert.ok(text.includes("`100%` positive based on `1` ratings"), "only ratings received");
});

test("db: threadCreate and threadUpdate racing on a new post create one listing quietly", async () => {
	const sends = [];
	const thread = {
		id: "race-thread",
		name: "[EU-BE] [H] Item [W] 100g",
		parent: { type: 15, availableTags: [] },
		fetchStarterMessage: async () => ({ author: { id: "seller", username: "seller" } }),
		send: async (m) => {
			sends.push(typeof m === "string" ? m : m.content);
			return { id: `msg${sends.length}` };
		},
		messages: { edit: async () => {} },
	};

	await Promise.all([
		threadCreate.execute(thread, true, models),
		threadUpdate.execute({ name: "[EU-BE] [H] Item" }, thread, models),
	]);

	assert.strictEqual(await models.Listing.count({ where: { threadId: "race-thread" } }), 1);
	assert.strictEqual(sends.length, 1, "exactly one prompt, no error message");
	assert.ok(sends[0].includes("Is this correct?"), "the message sent is the prompt");
});
