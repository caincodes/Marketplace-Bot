const assert = require("assert");
const { getForumLink, fetchTransactionAndListing, formatForumLink } = require("../utils/forumLink");

async function testForumLink() {
	console.log("Running forumLink tests...");

	try {
		console.log("Test 1: getForumLink builds URL from listing.threadId");
		const client1 = {
			channels: {
				fetch: async (id) => {
					assert.strictEqual(id, "thread123");
					return { guild: { id: "guild123" } };
				},
			},
		};
		let link = await getForumLink({ forumPostId: null }, { threadId: "thread123" }, client1);
		assert.strictEqual(link, "https://discord.com/channels/guild123/thread123");
		console.log("✓ Test 1 passed: URL built from listing.threadId");

		console.log("Test 2: getForumLink falls back to transaction.forumPostId");
		const client2 = {
			channels: {
				fetch: async (id) => {
					assert.strictEqual(id, "fallback456");
					return { guild: { id: "guild456" } };
				},
			},
		};
		link = await getForumLink({ forumPostId: "fallback456" }, null, client2);
		assert.strictEqual(link, "https://discord.com/channels/guild456/fallback456");
		console.log("✓ Test 2 passed: Fallback to transaction.forumPostId");

		console.log("Test 3: getForumLink returns empty string when no channel id");
		link = await getForumLink({ forumPostId: null }, null, {});
		assert.strictEqual(link, "");
		console.log("✓ Test 3 passed: Empty string when no channel id");

		console.log("Test 4: getForumLink returns empty string when guild missing");
		const client4 = { channels: { fetch: async () => ({ guild: null }) } };
		link = await getForumLink({}, { threadId: "thread123" }, client4);
		assert.strictEqual(link, "");
		console.log("✓ Test 4 passed: Empty string when guild missing");

		console.log("Test 5: getForumLink handles fetch error gracefully");
		const client5 = {
			channels: {
				fetch: async () => {
					throw new Error("Unknown channel");
				},
			},
		};
		link = await getForumLink({}, { threadId: "thread123" }, client5);
		assert.strictEqual(link, "");
		console.log("✓ Test 5 passed: Fetch error handled gracefully");

		console.log("Test 6: fetchTransactionAndListing returns both records");
		const models = {
			Transaction: { findByPk: async (id) => ({ id: Number(id), listingId: 7 }) },
			Listing: { findByPk: async (id) => ({ id: Number(id) }) },
		};
		const data = await fetchTransactionAndListing("5", models);
		assert.deepStrictEqual(data.transaction, { id: 5, listingId: 7 });
		assert.deepStrictEqual(data.listing, { id: 7 });
		console.log("✓ Test 6 passed: Transaction and listing returned together");

		console.log("Test 7: fetchTransactionAndListing returns null for missing transaction");
		const missingModels = {
			Transaction: { findByPk: async () => null },
			Listing: { findByPk: async () => ({ id: 1 }) },
		};
		const missing = await fetchTransactionAndListing("999", missingModels);
		assert.strictEqual(missing, null);
		console.log("✓ Test 7 passed: Null when transaction not found");

		console.log("Test 8: formatForumLink adds prefix and newline when link present");
		assert.strictEqual(
			formatForumLink("https://discord.com/channels/1/2"),
			"Forum Post: https://discord.com/channels/1/2\n",
		);
		console.log("✓ Test 8 passed: Prefix and newline added");

		console.log("Test 9: formatForumLink returns empty string for empty link");
		assert.strictEqual(formatForumLink(""), "");
		console.log("✓ Test 9 passed: Empty string for empty link");

		console.log("All forumLink tests completed successfully!");
	} catch (error) {
		console.error("ForumLink test failed:", error);
		process.exitCode = 1;
	}
}

testForumLink();
