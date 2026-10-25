const { test } = require("node:test");
const assert = require("node:assert");
const threadCreate = require("../events/threadCreate");

const VALID_NAME = "[EU-BE] [H] Test Item [W] €€€";
const firstMessage = { author: { id: "123456789", username: "testuser" } };

function makeModels(overrides = {}) {
	return {
		User: { findOrCreate: async () => [{}, false] },
		Listing: {
			created: 0,
			create: async function () {
				this.created++;
				return { update: async () => {} };
			},
			update: async () => {},
		},
		Transaction: { count: async () => 0 },
		...overrides,
	};
}

function makeThread(name = VALID_NAME) {
	return {
		name,
		id: "thread123",
		parent: {
			type: 15,
			availableTags: [
				{ id: "tag1", name: "pending" },
				{ id: "tag2", name: "for sale" },
				{ id: "tag3", name: "want to buy" },
				{ id: "tag4", name: "want to trade" },
			],
		},
		setAppliedTags: async () => {},
		send: async () => ({
			createMessageComponentCollector: () => ({
				on: (event, handler) => {
					if (event === "end") handler(new Map());
				},
				stop: () => {},
			}),
		}),
		fetchStarterMessage: async () => firstMessage,
	};
}

test("threadCreate: valid thread name creates a listing", async () => {
	const models = makeModels();
	await threadCreate.execute(makeThread(), true, models);
	assert.strictEqual(models.Listing.created, 1, "listing created for valid name");
});

test("threadCreate: invalid thread name does not create a listing", async () => {
	const models = makeModels();
	await threadCreate.execute(makeThread("Invalid thread name"), true, models);
	assert.strictEqual(models.Listing.created, 0, "no listing for unparsable name");
});

test("threadCreate: mismatched thread name warns and creates no listing", async () => {
	const models = makeModels();
	const thread = makeThread("[EU] [H] Test Item");
	const sends = [];
	thread.send = async (m) => {
		sends.push(typeof m === "string" ? m : m.content);
		return { createMessageComponentCollector: () => ({ on: () => {} }) };
	};
	await threadCreate.execute(thread, true, models);
	assert.strictEqual(models.Listing.created, 0, "no listing for mismatched name");
	assert.ok(
		sends.some((s) => s.includes("mismatched or incomplete")),
		"mismatch warning sent",
	);
});

test("threadCreate: missing models warns and recovers", async () => {
	const originalWarn = console.warn;
	let warned = false;
	console.warn = (...args) => {
		if (args.join(" ").includes("Database models not provided")) warned = true;
	};
	try {
		await assert.doesNotReject(threadCreate.execute(makeThread(), true, {}));
	} finally {
		console.warn = originalWarn;
	}
	assert.ok(warned, "missing-models warning emitted");
});

test("threadCreate: WaitStarterMessage error is handled gracefully", async () => {
	const thread = makeThread();
	thread.fetchStarterMessage = async () => {
		throw new Error("Failed to fetch message");
	};
	await assert.doesNotReject(threadCreate.execute(thread, true, makeModels()));
});

test("threadCreate: database error on listing creation is handled", async () => {
	const models = makeModels({
		Listing: {
			create: async () => {
				throw new Error("Database error");
			},
			update: async () => {},
		},
	});
	await assert.doesNotReject(threadCreate.execute(makeThread(), true, models));
});
