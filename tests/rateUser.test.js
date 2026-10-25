const { test } = require("node:test");
const assert = require("node:assert");
const { UniqueConstraintError } = require("sequelize");
const rateUser = require("../events/operations/rateUser");

function makeInteraction(overrides = {}) {
	const state = { followUps: [], edits: [], deferred: false };
	const interaction = {
		state,
		customId: "rate_user_1_rater123_positive",
		user: { id: "rater123" },
		deferUpdate: async () => {
			state.deferred = true;
		},
		followUp: async (opts) => state.followUps.push(opts.content),
		editReply: async (opts) => state.edits.push(opts.content),
		...overrides,
	};
	return interaction;
}

test("rateUser: creates rating and offers review options", async () => {
	let created = null;
	const transaction = {
		id: 1,
		sellerId: "rater123",
		buyerId: "ratee456",
		status: "confirmed",
		ratingIds: [],
		update: async function (data) {
			Object.assign(this, data);
		},
	};
	const listing = {
		id: 9,
		threadId: "thread1",
		ratingIds: [],
		update: async function (data) {
			Object.assign(this, data);
		},
	};
	const models = {
		Transaction: { findByPk: async () => transaction },
		Listing: { findByPk: async () => listing },
		Rating: {
			create: async (data) => {
				created = data;
				return { id: 77, ...data };
			},
		},
		client: { channels: { fetch: async () => ({ guild: { id: "g1" } }) } },
	};
	const interaction = makeInteraction();
	await rateUser.execute(interaction, models);
	assert.strictEqual(interaction.state.deferred, true, "deferred");
	assert.strictEqual(created.raterId, "rater123", "rater recorded");
	assert.strictEqual(created.rateeId, "ratee456", "ratee derived from transaction");
	assert.strictEqual(created.rating, "positive", "rating value from customId");
	assert.deepStrictEqual(transaction.ratingIds, [77], "rating id added to transaction");
	assert.deepStrictEqual(listing.ratingIds, [77], "rating id added to listing");
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Rating submitted")),
		"review prompt shown",
	);
});

function confirmedTransaction(overrides = {}) {
	return {
		id: 1,
		sellerId: "rater123",
		buyerId: "ratee456",
		status: "confirmed",
		ratingIds: [],
		update: async () => {},
		...overrides,
	};
}

test("rateUser: second rating by the same user is rejected", async () => {
	const interaction = makeInteraction();
	await rateUser.execute(interaction, {
		Transaction: { findByPk: async () => confirmedTransaction() },
		Listing: { findByPk: async () => null },
		Rating: {
			create: async () => {
				throw new UniqueConstraintError({});
			},
		},
		client: {},
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("already rated")),
		"duplicate rating rejected",
	);
	assert.strictEqual(interaction.state.edits.length, 0, "no review prompt shown");
});

test("rateUser: unconfirmed transaction cannot be rated", async () => {
	let created = false;
	const interaction = makeInteraction();
	await rateUser.execute(interaction, {
		Transaction: { findByPk: async () => confirmedTransaction({ status: "pending" }) },
		Listing: { findByPk: async () => null },
		Rating: { create: async () => (created = true) },
		client: {},
	});
	assert.strictEqual(created, false, "no rating created");
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("can't be rated")),
		"user told it can't be rated",
	);
});

test("rateUser: non-party cannot rate", async () => {
	let created = false;
	const interaction = makeInteraction();
	await rateUser.execute(interaction, {
		Transaction: {
			findByPk: async () => confirmedTransaction({ sellerId: "a", buyerId: "b" }),
		},
		Listing: { findByPk: async () => null },
		Rating: { create: async () => (created = true) },
		client: {},
	});
	assert.strictEqual(created, false, "no rating created");
});

test("rateUser: unauthorized rater rejected", async () => {
	const interaction = makeInteraction({ user: { id: "intruder" } });
	await rateUser.execute(interaction, {
		Transaction: { findByPk: async () => ({}) },
		Listing: { findByPk: async () => ({}) },
		Rating: { create: async () => ({}) },
		client: {},
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("not authorized to rate")),
		"rater check enforced",
	);
});

test("rateUser: transaction not found", async () => {
	const interaction = makeInteraction();
	await rateUser.execute(interaction, {
		Transaction: { findByPk: async () => null },
		Listing: { findByPk: async () => null },
		Rating: { create: async () => ({}) },
		client: {},
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("Transaction not found")),
		"missing transaction handled",
	);
});

test("rateUser: database error handled", async () => {
	const interaction = makeInteraction();
	await rateUser.execute(interaction, {
		Transaction: {
			findByPk: async () => {
				throw new Error("db error");
			},
		},
		Listing: { findByPk: async () => ({}) },
		Rating: { create: async () => ({}) },
		client: {},
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("An error occurred")),
		"error surfaced",
	);
});
