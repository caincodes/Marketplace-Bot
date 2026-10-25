const { test } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { createEventHandler, registerEvents } = require("../utils/events");

test("events: handler passes the Discord event arguments, then the models", async () => {
	let received = null;
	const models = { marker: "models" };
	const handler = createEventHandler(
		{ name: "threadUpdate", execute: async (...args) => (received = args) },
		models,
	);
	await handler("old", "new");
	assert.deepStrictEqual(received, ["old", "new", models]);
});

test("events: async rejections are logged, not propagated", async (t) => {
	const errors = t.mock.method(console, "error", () => {});
	const handler = createEventHandler(
		{
			name: "threadCreate",
			execute: async () => {
				throw new Error("boom");
			},
		},
		{},
	);
	await assert.doesNotReject(handler());
	assert.ok(
		errors.mock.calls.some((c) =>
			String(c.arguments[0]).includes("Unhandled error in threadCreate"),
		),
		"error logged with event name",
	);
});

test("events: synchronous throws are logged, not propagated", async (t) => {
	t.mock.method(console, "error", () => {});
	const handler = createEventHandler(
		{
			name: "interactionCreate",
			execute: () => {
				throw new Error("sync boom");
			},
		},
		{},
	);
	await assert.doesNotReject(handler());
});

test("events: registerEvents wires every event module with the right listener type", () => {
	const client = new EventEmitter();
	const registered = [];
	client.on = (name) => registered.push(["on", name]);
	client.once = (name) => registered.push(["once", name]);
	registerEvents(client, {});
	assert.deepStrictEqual(registered.sort(), [
		["on", "interactionCreate"],
		["on", "threadCreate"],
		["on", "threadUpdate"],
		["once", "clientReady"],
	]);
});

test("events: registered handlers deliver emitted events to the module", async () => {
	const client = new EventEmitter();
	const models = { marker: "models" };
	let received = null;
	// threadUpdate exits immediately when the name is unchanged; spy on that call
	const threadUpdate = require("../events/threadUpdate");
	const original = threadUpdate.execute;
	threadUpdate.execute = async (...args) => (received = args);
	try {
		registerEvents(client, models);
		client.emit("threadUpdate", { name: "a" }, { name: "b" });
		await new Promise((resolve) => setImmediate(resolve));
	} finally {
		threadUpdate.execute = original;
	}
	assert.deepStrictEqual(received, [{ name: "a" }, { name: "b" }, models]);
});
