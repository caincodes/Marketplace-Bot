const { test } = require("node:test");
const assert = require("node:assert");
const commandInteraction = require("../events/operations/commandInteraction");

const models = {
	User: {},
	Listing: { findAll: async () => [] },
	Transaction: { findAll: async () => [] },
	Rating: { findAll: async () => [] },
	client: {},
};

test("commandInteraction: routes to a matching command's execute", async () => {
	let edited = false;
	const interaction = {
		commandName: "history",
		options: { getUser: () => null },
		user: { id: "u1" },
		deferReply: async () => {},
		editReply: async () => {
			edited = true;
		},
	};
	await commandInteraction.execute(interaction, models);
	assert.strictEqual(edited, true, "matched command executed");
});

test("commandInteraction: unknown command name is a no-op", async () => {
	const interaction = {
		commandName: "does-not-exist",
		reply: async () => {
			throw new Error("should not reply for unknown command");
		},
	};
	await commandInteraction.execute(interaction, models);
});

test("commandInteraction: errors thrown by a command are caught and reported", async (t) => {
	t.mock.method(console, "error", () => {}); // error path is expected
	const replies = [];
	const interaction = {
		commandName: "close",
		user: { id: "u1" },
		channel: undefined,
		options: { getString: () => "sold" },
		reply: async (opts) => replies.push(opts.content),
	};
	await commandInteraction.execute(interaction, models);
	assert.ok(
		replies.some((r) => r.includes("There was an error while executing this command")),
		"command error surfaced to user",
	);
});
