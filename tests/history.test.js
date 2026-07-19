const { test } = require("node:test");
const assert = require("node:assert");
const history = require("../commands/history");

function makeModels(overrides = {}) {
	return {
		Listing: {
			findAll: async () => [
				{ type: "SELL", item: "Test Item", offer: "100g", region: "EU", User: { username: "u" } },
			],
		},
		User: {},
		Rating: {
			findAll: async () => [
				{ rating: "positive" },
				{ rating: "positive" },
				{ rating: "negative" },
				{ rating: "positive" },
				{ rating: "positive" },
			],
		},
		Transaction: {
			findAll: async () => [
				{ buyerId: "123456789", type: "purchase" },
				{ sellerId: "123456789", type: "purchase" },
				{ buyerId: "123456789", sellerId: "other", type: "trade" },
			],
		},
		...overrides,
	};
}

function makeInteraction(overrides = {}) {
	const edits = [];
	const interaction = {
		edits,
		user: { id: "123456789" },
		options: { getUser: () => null },
		deferReply: async () => {},
		editReply: async (opts) => edits.push(opts.content),
		...overrides,
	};
	return interaction;
}

test("history: displays reputation for a user with listings", async () => {
	const interaction = makeInteraction();
	await history.execute(interaction, makeModels());
	assert.ok(
		interaction.edits.some((e) => e.includes("Listings: `1` total")),
		"listing count rendered",
	);
});

test("history: shows zero listings for a user with none", async () => {
	const interaction = makeInteraction();
	await history.execute(interaction, makeModels({ Listing: { findAll: async () => [] } }));
	assert.ok(
		interaction.edits.some((e) => e.includes("Listings: `0` total")),
		"zero listings rendered",
	);
});

test("history: handles errors gracefully", async () => {
	const interaction = makeInteraction({
		options: {
			getUser: () => {
				throw new Error("boom");
			},
		},
	});
	await history.execute(interaction, makeModels());
	assert.ok(
		interaction.edits.some((e) => e.includes("An error occurred while fetching the history")),
		"error surfaced to user",
	);
});
