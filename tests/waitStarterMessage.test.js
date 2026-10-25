const { test } = require("node:test");
const assert = require("node:assert");
const WaitStarterMessage = require("../utils/WaitStarterMessage");
const { waitForStarterMessage } = WaitStarterMessage;

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

function unknownMessageError() {
	const error = new Error("Unknown message");
	error.name = "DiscordAPIError[10008]";
	return error;
}

test("waitForStarterMessage: retries until the starter message appears", async () => {
	let calls = 0;
	const mockMessage = { author: { id: "123" } };
	const thread = {
		fetchStarterMessage: async () => {
			calls++;
			if (calls < 3) throw unknownMessageError();
			return mockMessage;
		},
	};
	const result = await waitForStarterMessage(thread, { delayMs: 0 });
	assert.strictEqual(result, mockMessage, "message returned once available");
	assert.strictEqual(calls, 3, "retried until found");
});

test("waitForStarterMessage: gives up after the attempt limit", async () => {
	let calls = 0;
	const thread = {
		fetchStarterMessage: async () => {
			calls++;
			throw unknownMessageError();
		},
	};
	const result = await waitForStarterMessage(thread, { attempts: 4, delayMs: 0 });
	assert.strictEqual(result, null, "null after exhausting attempts");
	assert.strictEqual(calls, 4, "stopped at the attempt limit");
});
