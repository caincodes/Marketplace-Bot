const { test } = require("node:test");
const assert = require("node:assert");
const confirm = require("../commands/confirm");
const { createInteraction } = require("./helpers/interaction");

function makeListing(overrides = {}) {
	return {
		id: 1,
		userId: "seller123",
		type: "SELL",
		item: "Test Item",
		offer: "100g",
		status: "confirmed",
		closed: false,
		update: async () => {},
		...overrides,
	};
}

const mockClient = {
	users: {
		fetch: async (id) => ({ id, bot: false, send: async () => {} }),
	},
};

function createMockUser(id) {
	return { id, bot: false, send: async () => {} };
}

function makeInteraction(overrides = {}) {
	return createInteraction({
		isCommand: () => true,
		channel: { isThread: () => true, id: "thread123" },
		guildId: "guild123",
		user: { id: "buyer456" },
		options: {
			getUser: () => createMockUser("seller123"),
			getString: () => "purchase",
		},
		...overrides,
	});
}

function baseModels(overrides = {}) {
	return {
		Listing: { findOne: async () => makeListing() },
		Transaction: { create: async (data) => ({ id: 1, ...data }) },
		client: mockClient,
		...overrides,
	};
}

test("confirm: valid confirm command sends confirmation", async () => {
	const interaction = makeInteraction();
	await confirm.execute(interaction, baseModels());
	assert.ok(
		interaction.state.messages.some((r) => r.includes("Transaction confirmation sent")),
		"confirmation reply sent",
	);
});

test("confirm: rejects when not run in a thread", async () => {
	const interaction = makeInteraction({ channel: { isThread: () => false, id: "thread123" } });
	await confirm.execute(interaction, baseModels());
	assert.ok(
		interaction.state.messages.some((r) => r.includes("must be run inside a forum post")),
		"thread requirement enforced",
	);
});

test("confirm: rejects when no listing found", async () => {
	const interaction = makeInteraction();
	await confirm.execute(interaction, baseModels({ Listing: { findOne: async () => null } }));
	assert.ok(
		interaction.state.messages.some((r) => r.includes("No listing found")),
		"missing listing handled",
	);
});

test("confirm: rejects when the wrong seller is specified", async () => {
	const interaction = makeInteraction({
		options: { getUser: () => createMockUser("wrong123"), getString: () => "purchase" },
	});
	await confirm.execute(interaction, baseModels());
	assert.ok(
		interaction.state.messages.some((r) => r.includes("not the seller of this listing")),
		"seller mismatch rejected",
	);
});

test("confirm: database error handled gracefully", async (t) => {
	t.mock.method(console, "error", () => {}); // error path is expected
	const interaction = makeInteraction();
	await confirm.execute(
		interaction,
		baseModels({
			Transaction: {
				create: async () => {
					throw new Error("Database error");
				},
			},
		}),
	);
	assert.ok(
		interaction.state.messages.some((r) => r.includes("An error occurred")),
		"error surfaced to user, not thrown",
	);
});

test("confirm: rejects closed listings", async () => {
	const interaction = makeInteraction();
	await confirm.execute(
		interaction,
		baseModels({ Listing: { findOne: async () => makeListing({ closed: true }) } }),
	);
	assert.ok(
		interaction.state.messages.some((r) => r.includes("listing is closed")),
		"closed rejected",
	);
});

test("confirm: rejects listings that are still pending", async () => {
	const interaction = makeInteraction();
	await confirm.execute(
		interaction,
		baseModels({ Listing: { findOne: async () => makeListing({ status: "pending" }) } }),
	);
	assert.ok(
		interaction.state.messages.some((r) => r.includes("hasn't been confirmed yet")),
		"pending rejected",
	);
});

test("confirm: failed DM removes the transaction and tells the user", async (t) => {
	t.mock.method(console, "error", () => {}); // error path is expected
	let destroyedWhere = null;
	const interaction = makeInteraction({
		options: {
			getUser: () => ({
				id: "seller123",
				bot: false,
				send: async () => {
					throw new Error("Cannot send messages to this user");
				},
			}),
			getString: () => "purchase",
		},
	});
	await confirm.execute(
		interaction,
		baseModels({
			Listing: {
				findOne: async () => makeListing(),
			},
			Transaction: {
				create: async (data) => ({ id: 7, ...data }),
				destroy: async ({ where }) => (destroyedWhere = where),
			},
		}),
	);
	assert.deepStrictEqual(destroyedWhere, { id: 7 }, "orphaned transaction destroyed");
	assert.ok(
		interaction.state.messages.some((r) => r.includes("Couldn't send a confirmation DM")),
		"user told the DM failed",
	);
});
