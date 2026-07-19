const { test } = require("node:test");
const assert = require("node:assert");
const closeListing = require("../events/operations/closeListing");

function makeInteraction(overrides = {}) {
	const state = { followUps: [], edits: [], deferred: false };
	const interaction = {
		state,
		customId: "close_listing_5_poster123",
		user: { id: "poster123" },
		deferUpdate: async () => {
			state.deferred = true;
		},
		followUp: async (opts) => {
			state.followUps.push(opts.content);
		},
		editReply: async (opts) => {
			state.edits.push(opts.content);
		},
		reply: async (opts) => {
			state.followUps.push(opts.content);
		},
		...overrides,
	};
	return interaction;
}

function makeThread() {
	return {
		name: "[EU] [H] Item [W] Offer",
		parent: { type: 15, availableTags: [{ id: "tag-closed", name: "closed" }] },
		setName: async function (name) {
			this.name = name;
		},
		setAppliedTags: async function (tags) {
			this.appliedTags = tags;
		},
	};
}

function makeSuccessModels() {
	const thread = makeThread();
	const listing = {
		id: 5,
		userId: "poster123",
		type: "SELL",
		threadId: "thread123",
		closed: false,
		update: async function (data) {
			Object.assign(this, data);
		},
	};
	const models = {
		Listing: { findByPk: async () => listing },
		client: { channels: { fetch: async () => thread } },
	};
	return { thread, listing, models };
}

test("closeListing: listing closed via button", async () => {
	const { thread, listing, models } = makeSuccessModels();
	const interaction = makeInteraction();
	await closeListing.execute(interaction, models);
	assert.strictEqual(interaction.state.deferred, true, "interaction deferred");
	assert.strictEqual(listing.closed, true, "listing marked closed");
	assert.ok(thread.name.startsWith("[SOLD]"), "SELL uses [SOLD] prefix");
	assert.deepStrictEqual(thread.appliedTags, ["tag-closed"], "closed tag applied");
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Listing closed")),
		"success edit",
	);
});

test("closeListing: non-poster is rejected", async () => {
	const { models } = makeSuccessModels();
	const interaction = makeInteraction({ user: { id: "intruder" } });
	await closeListing.execute(interaction, models);
	assert.ok(
		interaction.state.followUps[0].includes("Only the listing poster"),
		"poster check enforced",
	);
});

test("closeListing: missing listing handled", async () => {
	const interaction = makeInteraction();
	await closeListing.execute(interaction, {
		Listing: { findByPk: async () => null },
		client: {},
	});
	assert.ok(interaction.state.followUps[0].includes("Listing not found"), "not found message");
});

test("closeListing: already-closed listing handled", async () => {
	const interaction = makeInteraction();
	await closeListing.execute(interaction, {
		Listing: { findByPk: async () => ({ id: 5, userId: "poster123", closed: true }) },
		client: {},
	});
	assert.ok(interaction.state.followUps[0].includes("already closed"), "already closed message");
});

test("closeListing: database error handled", async () => {
	const interaction = makeInteraction();
	await closeListing.execute(interaction, {
		Listing: {
			findByPk: async () => {
				throw new Error("db error");
			},
		},
		client: {},
	});
	assert.ok(interaction.state.edits[0].includes("An error occurred"), "error edit sent");
});
