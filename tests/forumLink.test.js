const { test } = require("node:test");
const assert = require("node:assert");
const { getForumLink, fetchTransactionAndListing, formatForumLink } = require("../utils/forumLink");

test("forumLink: getForumLink builds URL from listing.threadId", async () => {
	const client = {
		channels: {
			fetch: async (id) => {
				assert.strictEqual(id, "thread123");
				return { guild: { id: "guild123" } };
			},
		},
	};
	const link = await getForumLink({ forumPostId: null }, { threadId: "thread123" }, client);
	assert.strictEqual(link, "https://discord.com/channels/guild123/thread123");
});

test("forumLink: getForumLink falls back to transaction.forumPostId", async () => {
	const client = {
		channels: {
			fetch: async (id) => {
				assert.strictEqual(id, "fallback456");
				return { guild: { id: "guild456" } };
			},
		},
	};
	const link = await getForumLink({ forumPostId: "fallback456" }, null, client);
	assert.strictEqual(link, "https://discord.com/channels/guild456/fallback456");
});

test("forumLink: getForumLink returns empty string when no channel id", async () => {
	const link = await getForumLink({ forumPostId: null }, null, {});
	assert.strictEqual(link, "");
});

test("forumLink: getForumLink returns empty string when guild missing", async () => {
	const client = { channels: { fetch: async () => ({ guild: null }) } };
	const link = await getForumLink({}, { threadId: "thread123" }, client);
	assert.strictEqual(link, "");
});

test("forumLink: getForumLink handles fetch error gracefully", async (t) => {
	t.mock.method(console, "error", () => {}); // error path is expected
	const client = {
		channels: {
			fetch: async () => {
				throw new Error("Unknown channel");
			},
		},
	};
	const link = await getForumLink({}, { threadId: "thread123" }, client);
	assert.strictEqual(link, "");
});

test("forumLink: fetchTransactionAndListing returns both records", async () => {
	const models = {
		Transaction: { findByPk: async (id) => ({ id: Number(id), listingId: 7 }) },
		Listing: { findByPk: async (id) => ({ id: Number(id) }) },
	};
	const data = await fetchTransactionAndListing("5", models);
	assert.deepStrictEqual(data.transaction, { id: 5, listingId: 7 });
	assert.deepStrictEqual(data.listing, { id: 7 });
});

test("forumLink: fetchTransactionAndListing returns null for missing transaction", async () => {
	const models = {
		Transaction: { findByPk: async () => null },
		Listing: { findByPk: async () => ({ id: 1 }) },
	};
	const missing = await fetchTransactionAndListing("999", models);
	assert.strictEqual(missing, null);
});

test("forumLink: formatForumLink adds prefix and newline when link present", () => {
	assert.strictEqual(
		formatForumLink("https://discord.com/channels/1/2"),
		"Forum Post: https://discord.com/channels/1/2\n",
	);
});

test("forumLink: formatForumLink returns empty string for empty link", () => {
	assert.strictEqual(formatForumLink(""), "");
});
