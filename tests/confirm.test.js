const { test } = require("node:test");
const assert = require("node:assert");
const confirm = require("../commands/confirm");

function makeListing() {
	return {
		id: 1,
		userId: "seller123",
		type: "SELL",
		item: "Test Item",
		offer: "100g",
		transactionIds: [],
		update: async () => {},
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
	const replies = [];
	const interaction = {
		replies,
		channel: { isThread: () => true, id: "thread123" },
		guildId: "guild123",
		user: { id: "buyer456" },
		options: {
			getUser: () => createMockUser("seller123"),
			getString: () => "purchase",
		},
		reply: async (opts) => replies.push(opts.content),
		...overrides,
	};
	return interaction;
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
		interaction.replies.some((r) => r.includes("Transaction confirmation sent")),
		"confirmation reply sent",
	);
});

test("confirm: rejects when not run in a thread", async () => {
	const interaction = makeInteraction({ channel: { isThread: () => false, id: "thread123" } });
	await confirm.execute(interaction, baseModels());
	assert.ok(
		interaction.replies.some((r) => r.includes("must be run inside a forum post")),
		"thread requirement enforced",
	);
});

test("confirm: rejects when no listing found", async () => {
	const interaction = makeInteraction();
	await confirm.execute(interaction, baseModels({ Listing: { findOne: async () => null } }));
	assert.ok(
		interaction.replies.some((r) => r.includes("No listing found")),
		"missing listing handled",
	);
});

test("confirm: rejects when the wrong seller is specified", async () => {
	const interaction = makeInteraction({
		options: { getUser: () => createMockUser("wrong123"), getString: () => "purchase" },
	});
	await confirm.execute(interaction, baseModels());
	assert.ok(
		interaction.replies.some((r) => r.includes("not the seller of this listing")),
		"seller mismatch rejected",
	);
});

test("confirm: database error handled gracefully", async () => {
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
		interaction.replies.some((r) => r.includes("An error occurred")),
		"error surfaced to user, not thrown",
	);
});
