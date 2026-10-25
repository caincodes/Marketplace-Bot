const { test } = require("node:test");
const assert = require("node:assert");
const confirmListing = require("../events/operations/confirmListing");

function makeInteraction(customId, userId = "author1") {
	const state = { edits: [], followUps: [], deferred: false };
	return {
		state,
		customId,
		channelId: "thread1",
		channel: { parent: { type: 15, availableTags: [] }, setAppliedTags: async () => {} },
		user: { id: userId },
		deferUpdate: async () => {
			state.deferred = true;
		},
		editReply: async (opts) => state.edits.push(opts.content),
		followUp: async (opts) => state.followUps.push(opts.content),
	};
}

function makeModels(listingOverrides = {}, updateResult = [1]) {
	const listing = {
		id: 1,
		userId: "author1",
		type: "SELL",
		status: "pending",
		...listingOverrides,
	};
	const updates = [];
	return {
		updates,
		Listing: {
			findOne: async () => listing,
			findAll: async () => [],
			update: async (data, opts) => {
				updates.push({ data, where: opts.where });
				return updateResult;
			},
		},
		Transaction: { findAll: async () => [] },
		Rating: { findAll: async () => [] },
	};
}

test("confirmListing: confirm marks the listing confirmed and shows reputation", async () => {
	const models = makeModels();
	const interaction = makeInteraction("confirm");
	await confirmListing.execute(interaction, models);
	assert.strictEqual(interaction.state.deferred, true, "deferred");
	assert.deepStrictEqual(models.updates[0], {
		data: { status: "confirmed", type: "SELL" },
		where: { id: 1, status: "pending" },
	});
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Marketplace History")),
		"reputation shown",
	);
});

test("confirmListing: trade confirms as a TRADE listing", async () => {
	const models = makeModels();
	const interaction = makeInteraction("trade");
	await confirmListing.execute(interaction, models);
	assert.strictEqual(models.updates[0].data.type, "TRADE", "type set to TRADE");
	assert.ok(interaction.state.edits.some((e) => e.includes("Trade listing confirmed")));
});

test("confirmListing: deny leaves the listing pending", async () => {
	const models = makeModels();
	const interaction = makeInteraction("deny");
	await confirmListing.execute(interaction, models);
	assert.strictEqual(models.updates.length, 0, "listing not updated");
	assert.ok(interaction.state.edits.some((e) => e.includes("remain pending")));
});

test("confirmListing: non-author gets an ephemeral rejection", async () => {
	const models = makeModels();
	const interaction = makeInteraction("confirm", "someone-else");
	await confirmListing.execute(interaction, models);
	assert.strictEqual(models.updates.length, 0, "listing not updated");
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("Only the listing author")),
		"rejection shown",
	);
	assert.strictEqual(interaction.state.edits.length, 0, "prompt left intact");
});

test("confirmListing: already-confirmed listing is not confirmed again", async () => {
	const models = makeModels({ status: "confirmed" });
	const interaction = makeInteraction("confirm");
	await confirmListing.execute(interaction, models);
	assert.strictEqual(models.updates.length, 0, "no update");
	assert.ok(interaction.state.edits.some((e) => e.includes("already been confirmed")));
});

test("confirmListing: losing a double-click race reports already confirmed", async () => {
	const models = makeModels({}, [0]);
	const interaction = makeInteraction("confirm");
	await confirmListing.execute(interaction, models);
	assert.ok(interaction.state.edits.some((e) => e.includes("already been confirmed")));
});

test("confirmListing: missing listing is reported", async () => {
	const models = makeModels();
	models.Listing.findOne = async () => null;
	const interaction = makeInteraction("confirm");
	await confirmListing.execute(interaction, models);
	assert.ok(interaction.state.edits.some((e) => e.includes("No listing found")));
});
