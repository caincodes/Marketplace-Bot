const assert = require("assert");
const { getUserReputation } = require("../utils/reputation");

async function testReputation() {
	console.log("Running reputation tests...");

	const userId = "123456789";

	try {
		console.log("Test 1: Reputation with transactions and ratings");
		const models = {
			Listing: { findAll: async () => [{}, {}, {}] },
			Transaction: {
				findAll: async () => [
					{ buyerId: userId, type: "purchase" },
					{ sellerId: userId, type: "purchase" },
					{ buyerId: userId, sellerId: "other", type: "trade" },
					{ sellerId: userId, type: "money+trade" },
				],
			},
			Rating: {
				findAll: async () => [
					{ rating: "positive" },
					{ rating: "positive" },
					{ rating: "positive" },
					{ rating: "negative" },
				],
			},
		};
		let response = await getUserReputation(userId, models);
		assert.ok(response.includes(`<@${userId}>`), "mentions the user");
		assert.ok(response.includes("Listings: `3` total"), "counts listings");
		assert.ok(response.includes("`1` buys, `1` sells, `2` trades"), "counts transactions");
		assert.ok(response.includes("`75%` positive based on `4` ratings"), "computes reputation");
		console.log("✓ Test 1 passed: Full reputation computed correctly");

		console.log("Test 2: Reputation with no ratings");
		const noRatings = {
			Listing: { findAll: async () => [] },
			Transaction: { findAll: async () => [] },
			Rating: { findAll: async () => [] },
		};
		response = await getUserReputation(userId, noRatings);
		assert.ok(response.includes("Listings: `0` total"), "zero listings");
		assert.ok(response.includes("`0` buys, `0` sells, `0` trades"), "zero transactions");
		assert.ok(response.includes("doesn't have any ratings yet"), "no ratings message");
		console.log("✓ Test 2 passed: No-ratings message displayed");

		console.log("Test 3: 100% reputation");
		const allPositive = {
			Listing: { findAll: async () => [{}] },
			Transaction: { findAll: async () => [] },
			Rating: { findAll: async () => [{ rating: "positive" }, { rating: "positive" }] },
		};
		response = await getUserReputation(userId, allPositive);
		assert.ok(response.includes("`100%` positive based on `2` ratings"), "100 percent");
		console.log("✓ Test 3 passed: 100% reputation computed");

		console.log("Test 4: Query failures fall back to empty arrays");
		const failing = {
			Listing: { findAll: async () => Promise.reject(new Error("db down")) },
			Transaction: { findAll: async () => Promise.reject(new Error("db down")) },
			Rating: { findAll: async () => Promise.reject(new Error("db down")) },
		};
		response = await getUserReputation(userId, failing);
		assert.ok(response.includes("Listings: `0` total"), "listings default to 0");
		assert.ok(response.includes("doesn't have any ratings yet"), "ratings default to none");
		console.log("✓ Test 4 passed: Per-query failures handled gracefully");

		console.log("Test 5: Fatal error returns error message");
		response = await getUserReputation(userId, {});
		assert.ok(response.includes("Error loading reputation data"), "error message returned");
		console.log("✓ Test 5 passed: Fatal error handled gracefully");

		console.log("All reputation tests completed successfully!");
	} catch (error) {
		console.error("Reputation test failed:", error);
		process.exitCode = 1;
	}
}

testReputation();
