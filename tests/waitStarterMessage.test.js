const { test } = require("node:test");
const assert = require("node:assert");
const WaitStarterMessage = require("../utils/WaitStarterMessage");

test("waitStarterMessage: returns the fetched starter message", async () => {
	const mockMessage = { content: "Test message", author: { id: "123" } };
	const result = await WaitStarterMessage({ fetchStarterMessage: async () => mockMessage });
	assert.strictEqual(result, mockMessage, "starter message returned");
});

test("waitStarterMessage: DiscordAPIError[10008] resolves to null", async () => {
	const thread = {
		fetchStarterMessage: async () => {
			const error = new Error("Unknown message");
			error.name = "DiscordAPIError[10008]";
			throw error;
		},
	};
	const result = await WaitStarterMessage(thread);
	assert.strictEqual(result, null, "missing starter message treated as null");
});

test("waitStarterMessage: other errors propagate to the caller", async () => {
	const thread = {
		fetchStarterMessage: async () => {
			throw new Error("Network error");
		},
	};
	await assert.rejects(
		() => WaitStarterMessage(thread),
		/Network error/,
		"non-10008 errors are re-thrown",
	);
});
