const { test } = require("node:test");
const assert = require("node:assert");
const { getUserReputation } = require("../utils/reputation");

const userId = "123456789";

test("reputation: full reputation computed correctly", async () => {
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
	const response = await getUserReputation(userId, models);
	assert.ok(response.includes(`<@${userId}>`), "mentions the user");
	assert.ok(response.includes("Listings: `3` total"), "counts listings");
	assert.ok(response.includes("`1` buys, `1` sells, `2` trades"), "counts transactions");
	assert.ok(response.includes("`75%` positive based on `4` ratings"), "computes reputation");
});

test("reputation: no-ratings message displayed", async () => {
	const models = {
		Listing: { findAll: async () => [] },
		Transaction: { findAll: async () => [] },
		Rating: { findAll: async () => [] },
	};
	const response = await getUserReputation(userId, models);
	assert.ok(response.includes("Listings: `0` total"), "zero listings");
	assert.ok(response.includes("`0` buys, `0` sells, `0` trades"), "zero transactions");
	assert.ok(response.includes("doesn't have any ratings yet"), "no ratings message");
});

test("reputation: 100% reputation computed", async () => {
	const models = {
		Listing: { findAll: async () => [{}] },
		Transaction: { findAll: async () => [] },
		Rating: { findAll: async () => [{ rating: "positive" }, { rating: "positive" }] },
	};
	const response = await getUserReputation(userId, models);
	assert.ok(response.includes("`100%` positive based on `2` ratings"), "100 percent");
});

test("reputation: per-query failures fall back to empty arrays", async () => {
	const models = {
		Listing: { findAll: async () => Promise.reject(new Error("db down")) },
		Transaction: { findAll: async () => Promise.reject(new Error("db down")) },
		Rating: { findAll: async () => Promise.reject(new Error("db down")) },
	};
	const response = await getUserReputation(userId, models);
	assert.ok(response.includes("Listings: `0` total"), "listings default to 0");
	assert.ok(response.includes("doesn't have any ratings yet"), "ratings default to none");
});

test("reputation: fatal error returns error message", async () => {
	const response = await getUserReputation(userId, {});
	assert.ok(response.includes("Error loading reputation data"), "error message returned");
});

test("reputation: only confirmed listings are counted", async () => {
	let listingWhere = null;
	const models = {
		Listing: {
			findAll: async ({ where }) => {
				listingWhere = where;
				return [];
			},
		},
		Transaction: { findAll: async () => [] },
		Rating: { findAll: async () => [] },
	};
	await getUserReputation(userId, models);
	assert.deepStrictEqual(listingWhere, { userId, status: "confirmed" }, "filters to confirmed");
});
