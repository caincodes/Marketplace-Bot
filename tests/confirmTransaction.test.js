const { test } = require("node:test");
const assert = require("node:assert");
const confirmTransaction = require("../events/operations/confirmTransaction");

function makeInteraction(overrides = {}) {
	const state = { followUps: [], edits: [], deferred: false };
	const interaction = {
		state,
		customId: "confirm_transaction_1_initiator1_intended2_confirm",
		user: { id: "intended2" },
		deferUpdate: async () => {
			state.deferred = true;
		},
		followUp: async (opts) => state.followUps.push(opts.content),
		editReply: async (opts) => state.edits.push(opts.content),
		...overrides,
	};
	return interaction;
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
		update: async function (data) {
			Object.assign(this, data);
		},
	};
	const models = {
		Transaction: { findByPk: async () => transaction },
		Listing: { findByPk: async () => ({ id: 9, threadId: "thread1" }) },
		client: makeClient(sent),
	};
	const interaction = makeInteraction();
	await confirmTransaction.execute(interaction, models);
	assert.strictEqual(interaction.state.deferred, true, "deferred");
	assert.strictEqual(transaction.status, "confirmed", "transaction confirmed");
	assert.deepStrictEqual(transaction.confirmations, ["intended2"], "confirmation recorded");
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

test("confirmTransaction: deny destroys the transaction", async () => {
	let destroyedWhere = null;
	const interaction = makeInteraction({
		customId: "confirm_transaction_1_initiator1_intended2_deny",
	});
	await confirmTransaction.execute(interaction, {
		Transaction: {
			findByPk: async () => ({ id: 1, listingId: 9 }),
			destroy: async ({ where }) => {
				destroyedWhere = where;
			},
		},
		Listing: { findByPk: async () => ({ id: 9 }) },
		client: makeClient([]),
	});
	assert.deepStrictEqual(destroyedWhere, { id: "1" }, "transaction destroyed by id");
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Transaction cancelled")),
		"cancellation message shown",
	);
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
