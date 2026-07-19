const { test } = require("node:test");
const assert = require("node:assert");
const close = require("../commands/close");

function makeInteraction(overrides = {}) {
	const replies = [];
	const interaction = {
		replies,
		user: { id: "poster123" },
		channel: {
			id: "thread123",
			name: "[EU] [H] Item [W] Offer",
			isThread: () => true,
			parent: { type: 15, availableTags: [{ id: "tag-closed", name: "Closed" }] },
			setName: async (name) => {
				interaction.channel.name = name;
			},
			setAppliedTags: async (tags) => {
				interaction.appliedTags = tags;
			},
		},
		options: { getString: () => "sold" },
		reply: async (opts) => {
			replies.push(opts.content);
		},
		...overrides,
	};
	return interaction;
}

function makeListing(overrides = {}) {
	return {
		id: 1,
		userId: "poster123",
		type: "SELL",
		closed: false,
		update: async function (data) {
			Object.assign(this, data);
		},
		...overrides,
	};
}

test("close: SELL listing closed with [SOLD] prefix", async () => {
	const listing = makeListing();
	const interaction = makeInteraction();
	await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
	assert.strictEqual(listing.closed, true, "listing marked closed");
	assert.ok(interaction.channel.name.startsWith("[SOLD]"), "SELL uses [SOLD] prefix");
	assert.deepStrictEqual(interaction.appliedTags, ["tag-closed"], "closed tag applied");
	assert.ok(
		interaction.replies.some((r) => r.includes("Listing closed")),
		"confirmation sent",
	);
});

test("close: withdrawn reason uses [WITHDRAWN] prefix", async () => {
	const listing = makeListing();
	const interaction = makeInteraction({ options: { getString: () => "withdrawn" } });
	await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
	assert.ok(interaction.channel.name.startsWith("[WITHDRAWN]"), "withdrawn prefix applied");
});

test("close: BUY listing uses [FOUND] prefix", async () => {
	const listing = makeListing({ type: "BUY" });
	const interaction = makeInteraction();
	await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
	assert.ok(interaction.channel.name.startsWith("[FOUND]"), "BUY uses [FOUND] prefix");
});

test("close: non-thread channel is rejected", async () => {
	const interaction = makeInteraction({ channel: { isThread: () => false } });
	await close.execute(interaction, {
		Listing: { findOne: async () => makeListing() },
		client: {},
	});
	assert.ok(interaction.replies[0].includes("must be run inside a forum post"), "thread error");
});

test("close: missing listing handled", async () => {
	const interaction = makeInteraction();
	await close.execute(interaction, { Listing: { findOne: async () => null }, client: {} });
	assert.ok(interaction.replies[0].includes("No listing found"), "no listing error");
});

test("close: non-owner cannot close", async () => {
	const interaction = makeInteraction({ user: { id: "someoneelse" } });
	await close.execute(interaction, {
		Listing: { findOne: async () => makeListing() },
		client: {},
	});
	assert.ok(interaction.replies[0].includes("Only the listing poster"), "owner check");
});

test("close: already-closed listing handled", async () => {
	const interaction = makeInteraction();
	await close.execute(interaction, {
		Listing: { findOne: async () => makeListing({ closed: true }) },
		client: {},
	});
	assert.ok(interaction.replies[0].includes("already closed"), "already closed error");
});

test("close: database error handled", async () => {
	const interaction = makeInteraction();
	await close.execute(interaction, {
		Listing: {
			findOne: async () => {
				throw new Error("db error");
			},
		},
		client: {},
	});
	assert.ok(interaction.replies[0].includes("An error occurred"), "generic error reply");
});
