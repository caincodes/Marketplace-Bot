const assert = require("assert");
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

async function testClose() {
	console.log("Running close command tests...");

	try {
		console.log("Test 1: Successful close of a SELL listing");
		let listing = makeListing();
		let interaction = makeInteraction();
		await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
		assert.strictEqual(listing.closed, true, "listing marked closed");
		assert.ok(interaction.channel.name.startsWith("[SOLD]"), "SELL uses [SOLD] prefix");
		assert.deepStrictEqual(interaction.appliedTags, ["tag-closed"], "closed tag applied");
		assert.ok(
			interaction.replies.some((r) => r.includes("Listing closed")),
			"confirmation sent",
		);
		console.log("✓ Test 1 passed: SELL listing closed with [SOLD] prefix");

		console.log("Test 2: Withdrawn reason uses [WITHDRAWN] prefix");
		listing = makeListing();
		interaction = makeInteraction({ options: { getString: () => "withdrawn" } });
		await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
		assert.ok(interaction.channel.name.startsWith("[WITHDRAWN]"), "withdrawn prefix applied");
		console.log("✓ Test 2 passed: Withdrawn reason handled");

		console.log("Test 3: BUY listing uses [FOUND] prefix");
		listing = makeListing({ type: "BUY" });
		interaction = makeInteraction();
		await close.execute(interaction, { Listing: { findOne: async () => listing }, client: {} });
		assert.ok(interaction.channel.name.startsWith("[FOUND]"), "BUY uses [FOUND] prefix");
		console.log("✓ Test 3 passed: BUY listing closed with [FOUND] prefix");

		console.log("Test 4: Not a thread");
		interaction = makeInteraction({ channel: { isThread: () => false } });
		await close.execute(interaction, {
			Listing: { findOne: async () => makeListing() },
			client: {},
		});
		assert.ok(interaction.replies[0].includes("must be run inside a forum post"), "thread error");
		console.log("✓ Test 4 passed: Non-thread rejected");

		console.log("Test 5: No listing found");
		interaction = makeInteraction();
		await close.execute(interaction, { Listing: { findOne: async () => null }, client: {} });
		assert.ok(interaction.replies[0].includes("No listing found"), "no listing error");
		console.log("✓ Test 5 passed: Missing listing handled");

		console.log("Test 6: Non-owner cannot close");
		interaction = makeInteraction({ user: { id: "someoneelse" } });
		await close.execute(interaction, {
			Listing: { findOne: async () => makeListing() },
			client: {},
		});
		assert.ok(interaction.replies[0].includes("Only the listing poster"), "owner check");
		console.log("✓ Test 6 passed: Non-owner rejected");

		console.log("Test 7: Already closed listing");
		interaction = makeInteraction();
		await close.execute(interaction, {
			Listing: { findOne: async () => makeListing({ closed: true }) },
			client: {},
		});
		assert.ok(interaction.replies[0].includes("already closed"), "already closed error");
		console.log("✓ Test 7 passed: Already-closed handled");

		console.log("Test 8: Database error handled");
		interaction = makeInteraction();
		await close.execute(interaction, {
			Listing: {
				findOne: async () => {
					throw new Error("db error");
				},
			},
			client: {},
		});
		assert.ok(interaction.replies[0].includes("An error occurred"), "generic error reply");
		console.log("✓ Test 8 passed: Database error handled");

		console.log("All close command tests completed successfully!");
	} catch (error) {
		console.error("Close command test failed:", error);
		process.exitCode = 1;
	}
}

testClose();
