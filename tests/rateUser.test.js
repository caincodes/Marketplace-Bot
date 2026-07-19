const assert = require("assert");
const rateUser = require("../events/operations/rateUser");

function makeInteraction(overrides = {}) {
	const state = { followUps: [], edits: [], deferred: false };
	const interaction = {
		state,
		customId: "rate_user_1_rater123_positive",
		user: { id: "rater123" },
		deferUpdate: async () => {
			state.deferred = true;
		},
		followUp: async (opts) => state.followUps.push(opts.content),
		editReply: async (opts) => state.edits.push(opts.content),
		...overrides,
	};
	return interaction;
}

async function testRateUser() {
	console.log("Running rateUser operation tests...");

	try {
		console.log("Test 1: Creates rating and offers review options");
		let created = null;
		const transaction = {
			id: 1,
			sellerId: "rater123",
			buyerId: "ratee456",
			ratingIds: [],
			update: async function (data) {
				Object.assign(this, data);
			},
		};
		const listing = {
			id: 9,
			threadId: "thread1",
			ratingIds: [],
			update: async function (data) {
				Object.assign(this, data);
			},
		};
		const models = {
			Transaction: { findByPk: async () => transaction },
			Listing: { findByPk: async () => listing },
			Rating: {
				create: async (data) => {
					created = data;
					return { id: 77, ...data };
				},
			},
			client: { channels: { fetch: async () => ({ guild: { id: "g1" } }) } },
		};
		const interaction = makeInteraction();
		await rateUser.execute(interaction, models);
		assert.strictEqual(interaction.state.deferred, true, "deferred");
		assert.strictEqual(created.raterId, "rater123", "rater recorded");
		assert.strictEqual(created.rateeId, "ratee456", "ratee derived from transaction");
		assert.strictEqual(created.rating, "positive", "rating value from customId");
		assert.deepStrictEqual(transaction.ratingIds, [77], "rating id added to transaction");
		assert.deepStrictEqual(listing.ratingIds, [77], "rating id added to listing");
		assert.ok(
			interaction.state.edits.some((e) => e.includes("Rating submitted")),
			"review prompt shown",
		);
		console.log("✓ Test 1 passed: Rating created and review offered");

		console.log("Test 2: Unauthorized rater rejected");
		const interaction2 = makeInteraction({ user: { id: "intruder" } });
		await rateUser.execute(interaction2, {
			Transaction: { findByPk: async () => ({}) },
			Listing: { findByPk: async () => ({}) },
			Rating: { create: async () => ({}) },
			client: {},
		});
		assert.ok(
			interaction2.state.followUps.some((f) => f.includes("not authorized to rate")),
			"rater check enforced",
		);
		console.log("✓ Test 2 passed: Unauthorized rater rejected");

		console.log("Test 3: Transaction not found");
		const interaction3 = makeInteraction();
		await rateUser.execute(interaction3, {
			Transaction: { findByPk: async () => null },
			Listing: { findByPk: async () => null },
			Rating: { create: async () => ({}) },
			client: {},
		});
		assert.ok(
			interaction3.state.followUps.some((f) => f.includes("Transaction not found")),
			"missing transaction handled",
		);
		console.log("✓ Test 3 passed: Missing transaction handled");

		console.log("Test 4: Database error handled");
		const interaction4 = makeInteraction();
		await rateUser.execute(interaction4, {
			Transaction: {
				findByPk: async () => {
					throw new Error("db error");
				},
			},
			Listing: { findByPk: async () => ({}) },
			Rating: { create: async () => ({}) },
			client: {},
		});
		assert.ok(
			interaction4.state.followUps.some((f) => f.includes("An error occurred")),
			"error surfaced",
		);
		console.log("✓ Test 4 passed: Database error handled");

		console.log("All rateUser operation tests completed successfully!");
	} catch (error) {
		console.error("RateUser operation test failed:", error);
		process.exitCode = 1;
	}
}

testRateUser();
