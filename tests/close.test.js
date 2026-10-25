const { test } = require("node:test");
const assert = require("node:assert");
const close = require("../commands/close");
const { createInteraction } = require("./helpers/interaction");

function makeInteraction(overrides = {}) {
	const interaction = createInteraction({
		isCommand: () => true,
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
		...overrides,
	});
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
		interaction.state.messages.some((r) => r.includes("Listing closed")),
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
	assert.ok(
		interaction.state.messages[0].includes("must be run inside a forum post"),
		"thread error",
	);
});

test("close: missing listing handled", async () => {
	const interaction = makeInteraction();
	await close.execute(interaction, { Listing: { findOne: async () => null }, client: {} });
	assert.ok(interaction.state.messages[0].includes("No listing found"), "no listing error");
});

test("close: non-owner cannot close", async () => {
	const interaction = makeInteraction({ user: { id: "someoneelse" } });
	await close.execute(interaction, {
		Listing: { findOne: async () => makeListing() },
		client: {},
	});
	assert.ok(interaction.state.messages[0].includes("Only the listing poster"), "owner check");
});

test("close: already-closed listing handled", async () => {
	const interaction = makeInteraction();
	await close.execute(interaction, {
		Listing: { findOne: async () => makeListing({ closed: true }) },
		client: {},
	});
	assert.ok(interaction.state.messages[0].includes("already closed"), "already closed error");
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
	assert.ok(interaction.state.messages[0].includes("An error occurred"), "generic error reply");
});

test("close: long thread names are truncated to Discord's 100-character limit", async () => {
	const listing = makeListing();
	const interaction = makeInteraction();
	interaction.channel.name = `[EU] [H] ${"x".repeat(95)} [W] Offer`;
	await close.execute(interaction, { Listing: { findOne: async () => listing } });
	assert.strictEqual(interaction.channel.name.length, 100, "name truncated to 100");
	assert.ok(interaction.channel.name.startsWith("[SOLD]"), "prefix kept");
});

test("close: listing is marked closed before the thread is renamed", async () => {
	const listing = makeListing();
	const interaction = makeInteraction();
	let closedAtRename = null;
	interaction.channel.setName = async () => (closedAtRename = listing.closed);
	await close.execute(interaction, { Listing: { findOne: async () => listing } });
	assert.strictEqual(closedAtRename, true, "closed before rename");
});

test("close: failed rename reverts the closed flag", async () => {
	const listing = makeListing();
	const interaction = makeInteraction();
	interaction.channel.setName = async () => {
		throw new Error("Missing permissions");
	};
	await close.execute(interaction, { Listing: { findOne: async () => listing } });
	assert.strictEqual(listing.closed, false, "listing reopened");
	assert.ok(
		interaction.state.messages.some((r) => r.includes("An error occurred")),
		"error reported",
	);
});
