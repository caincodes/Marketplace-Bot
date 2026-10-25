const { test } = require("node:test");
const assert = require("node:assert");
const clientReady = require("../events/clientReady");

function makeClient({ shouldThrow = false } = {}) {
	const registered = [];
	return {
		registered,
		user: { tag: "TestBot#1234", id: "bot123" },
		application: {
			commands: {
				set: async (commands) => {
					if (shouldThrow) throw new Error("Registration failed");
					registered.push(commands);
					return commands;
				},
			},
		},
	};
}

test("clientReady: registers commands once on ready", async () => {
	const client = makeClient();
	await clientReady.execute(client, {});
	assert.strictEqual(client.registered.length, 1, "commands registered exactly once");
	const names = client.registered[0].map((c) => c.name).sort();
	assert.deepStrictEqual(names, ["close", "confirm", "history"], "all commands registered");
});

test("clientReady: registration error is caught inside the event", async () => {
	await assert.doesNotReject(
		clientReady.execute(makeClient({ shouldThrow: true }), {}),
		"registration error handled without crashing",
	);
});
