const { test } = require("node:test");
const assert = require("node:assert");
const confirmTransaction = require("../events/operations/confirmTransaction");
const { createInteraction } = require("./helpers/interaction");

function makeInteraction(overrides = {}) {
	return createInteraction({
		isButton: () => true,
		customId: "confirm_transaction_1_initiator1_intended2_confirm",
		user: { id: "intended2" },
		...overrides,
	});
}

function makeClient(sent) {
	return {
		channels: {
			fetch: async () => ({ guild: { id: "guild1" }, send: async (m) => sent.push(m.content) }),
		},
		users: { fetch: async (id) => ({ id, send: async (m) => sent.push(m.content) }) },
	};
}

test("confirmTransaction: confirm updates records and prompts for ratings", async () => {
	const sent = [];
	const transaction = {
		id: 1,
		listingId: 9,
		sellerId: "intended2",
		buyerId: "buyer-x",
		type: "purchase",
		status: "pending",
	};
	const models = {
		Transaction: {
			findByPk: async () => transaction,
			update: async (data, { where }) => {
				if (where.id !== transaction.id || where.status !== transaction.status) return [0];
				Object.assign(transaction, data);
				return [1];
			},
		},
		Listing: { findByPk: async () => ({ id: 9, threadId: "thread1" }) },
		client: makeClient(sent),
	};
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, models);
	assert.strictEqual(interaction.deferred, true, "deferred");
	assert.strictEqual(transaction.status, "confirmed", "transaction confirmed");
	assert.deepStrictEqual(transaction.confirmations, ["intended2"], "confirmation recorded");
	assert.strictEqual(transaction.initiatorId, "initiator1", "initiator taken from customId");
	assert.ok(
		sent.some((m) => m.includes("purchased an item from")),
		"purchase message posted to forum",
	);
	assert.ok(
		sent.some((m) => m.includes("How was your experience")),
		"rating prompt DM sent to other user",
	);
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Transaction confirmed")),
		"initiator DM updated with rating prompt",
	);
});

test("confirmTransaction: trade is announced as a trade, not a purchase", async () => {
	const sent = [];
	const transaction = {
		id: 1,
		listingId: 9,
		sellerId: "s1",
		buyerId: "intended2",
		type: "trade",
		status: "pending",
	};
	await confirmTransaction.execute(makeInteraction(), {
		Transaction: { findByPk: async () => transaction, update: async () => [1] },
		Listing: { findByPk: async () => ({ id: 9, threadId: "thread1" }) },
		client: makeClient(sent),
	});
	assert.ok(
		sent.some((m) => m.includes("completed a trade")),
		"trade announcement posted",
	);
	assert.ok(!sent.some((m) => m.includes("purchased")), "no purchase wording");
});

test("confirmTransaction: deny destroys the transaction", async () => {
	let destroyedWhere = null;
	const listing = {
		id: 9,
		transactionIds: [1, 2],
		update: async function (data) {
			Object.assign(this, data);
		},
	};
	const interaction = makeInteraction({
		customId: "confirm_transaction_1_initiator1_intended2_deny",
	});
	await confirmTransaction.execute(interaction, {
		Transaction: {
			findByPk: async () => ({ id: 1, listingId: 9, status: "pending" }),
			destroy: async ({ where }) => {
				destroyedWhere = where;
			},
		},
		Listing: { findByPk: async () => listing },
		client: makeClient([]),
	});
	assert.deepStrictEqual(listing.transactionIds, [2], "cancelled id removed from listing");
	assert.deepStrictEqual(
		destroyedWhere,
		{ id: 1, status: "pending" },
		"pending transaction destroyed by id",
	);
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Transaction cancelled")),
		"cancellation message shown",
	);
});

test("confirmTransaction: already-confirmed transaction is not confirmed again", async () => {
	const sent = [];
	let updateCalled = false;
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, {
		Transaction: {
			findByPk: async () => ({ id: 1, listingId: 9, status: "confirmed" }),
			update: async () => {
				updateCalled = true;
				return [1];
			},
		},
		Listing: { findByPk: async () => ({ id: 9, threadId: "thread1" }) },
		client: makeClient(sent),
	});
	assert.strictEqual(updateCalled, false, "no second update");
	assert.strictEqual(sent.length, 0, "no duplicate announcements or rating prompts");
	assert.ok(
		interaction.state.edits.some((e) => e.includes("already been confirmed")),
		"user told it is already confirmed",
	);
});

test("confirmTransaction: concurrent confirm that loses the race sends nothing", async () => {
	const sent = [];
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, {
		Transaction: {
			findByPk: async () => ({ id: 1, listingId: 9, status: "pending" }),
			update: async () => [0],
		},
		Listing: { findByPk: async () => ({ id: 9, threadId: "thread1" }) },
		client: makeClient(sent),
	});
	assert.strictEqual(sent.length, 0, "no duplicate announcements or rating prompts");
});

test("confirmTransaction: wrong user cannot confirm", async () => {
	const interaction = makeInteraction({ user: { id: "someone-else" } });
	await confirmTransaction.execute(interaction, {
		Transaction: { findByPk: async () => ({ id: 1 }) },
		Listing: { findByPk: async () => ({}) },
		client: makeClient([]),
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("Only <@intended2> can confirm")),
		"intended-user check enforced",
	);
});

test("confirmTransaction: transaction not found", async () => {
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, {
		Transaction: { findByPk: async () => null },
		Listing: { findByPk: async () => null },
		client: makeClient([]),
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("Transaction not found")),
		"missing transaction handled",
	);
});

test("confirmTransaction: database error handled", async () => {
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, {
		Transaction: {
			findByPk: async () => {
				throw new Error("db error");
			},
		},
		Listing: { findByPk: async () => null },
		client: makeClient([]),
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("An error occurred")),
		"error surfaced",
	);
});
