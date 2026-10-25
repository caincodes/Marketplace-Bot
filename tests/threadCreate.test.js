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
			findOne: async () => null,
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
			findOne: async () => null,
			create: async () => {
				throw new Error("Database error");
			},
			update: async () => {},
		},
	});
	await assert.doesNotReject(threadCreate.execute(makeThread(), true, models));
});

test("threadCreate: ignores threads the bot was merely added to", async () => {
	const models = makeModels();
	await threadCreate.execute(makeThread(), false, models);
	assert.strictEqual(models.Listing.created, 0, "no listing for existing thread");
});

test("threadCreate: ignores threads outside forum channels", async () => {
	const models = makeModels();
	const thread = makeThread();
	thread.parent = { type: 0, availableTags: [] };
	await threadCreate.execute(thread, true, models);
	assert.strictEqual(models.Listing.created, 0, "no listing for non-forum thread");
});

test("threadCreate: ignores forums other than MARKETPLACE_FORUM_ID when set", async () => {
	const models = makeModels();
	const thread = makeThread();
	thread.parentId = "other-forum";
	process.env.MARKETPLACE_FORUM_ID = "market-forum";
	try {
		await threadCreate.execute(thread, true, models);
	} finally {
		delete process.env.MARKETPLACE_FORUM_ID;
	}
	assert.strictEqual(models.Listing.created, 0, "no listing for other forum");
});

test("threadCreate: does not duplicate an existing listing", async () => {
	const models = makeModels();
	models.Listing.findOne = async () => ({ id: 1 });
	await threadCreate.execute(makeThread(), true, models);
	assert.strictEqual(models.Listing.created, 0, "existing listing not duplicated");
});
