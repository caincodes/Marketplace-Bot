const { test } = require("node:test");
const assert = require("node:assert");
const threadUpdate = require("../events/threadUpdate");

const VALID_NAME = "[EU-BE] [H] Test Item [W] 100g";
const OTHER_VALID_NAME = "[US] [W] Magic Item [H] 50g";
const MISMATCHED_NAME = "[EU] [H] Test Item";

function makeThread(name) {
	return {
		id: "thread123",
		name,
		parent: { type: 15, availableTags: [{ id: "tag-pending", name: "pending" }] },
		setAppliedTags: async () => {},
		send: async () => ({
			// minimal collector stub so collector paths don't crash
			createMessageComponentCollector: () => ({ on: () => {} }),
		}),
		fetchStarterMessage: async () => ({ author: { id: "u1", username: "poster" } }),
	};
}

function baseModels(overrides = {}) {
	return {
		User: { findOrCreate: async () => [{ id: "u1" }, false] },
		Listing: {
			findOne: async () => null,
			create: async () => ({ id: 1 }),
		},
		Transaction: {},
		Rating: {},
		...overrides,
	};
}

test("threadUpdate: unchanged name is a no-op", async () => {
	let findOneCalled = false;
	await threadUpdate.execute(
		{ name: VALID_NAME },
		{ name: VALID_NAME },
		baseModels({ Listing: { findOne: async () => (findOneCalled = true) } }),
	);
	assert.strictEqual(findOneCalled, false, "no DB work when name unchanged");
});

test("threadUpdate: returns early when models are missing", async () => {
	await threadUpdate.execute({ name: "old" }, { name: VALID_NAME }, {});
});

test("threadUpdate: confirmed listing updates its fields on a valid rename", async () => {
	let updatedData = null;
	const confirmedListing = {
		status: "confirmed",
		update: async (data) => {
			updatedData = data;
		},
	};
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(OTHER_VALID_NAME),
		baseModels({ Listing: { findOne: async () => confirmedListing } }),
	);
	assert.strictEqual(updatedData.type, "BUY", "type parsed from new name");
	assert.strictEqual(updatedData.item, "Magic Item", "item parsed from new name");
	assert.strictEqual(updatedData.offer, "50g", "offer parsed from new name");
});

test("threadUpdate: confirmed listing untouched when new name is mismatched", async () => {
	let confirmedUpdated = false;
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(MISMATCHED_NAME),
		baseModels({
			Listing: {
				findOne: async () => ({
					status: "confirmed",
					update: async () => (confirmedUpdated = true),
				}),
			},
		}),
	);
	assert.strictEqual(confirmedUpdated, false, "no update for mismatched confirmed rename");
});

test("threadUpdate: pending listing with mismatched new name sends a warning", async () => {
	const warnings = [];
	const warnThread = makeThread(MISMATCHED_NAME);
	warnThread.send = async (m) => {
		warnings.push(typeof m === "string" ? m : m.content);
		return { createMessageComponentCollector: () => ({ on: () => {} }) };
	};
	await threadUpdate.execute(
		{ name: "old" },
		warnThread,
		baseModels({
			Listing: { findOne: async () => ({ status: "pending", update: async () => {} }) },
		}),
	);
	assert.ok(
		warnings.some((w) => w.includes("mismatched or incomplete")),
		"warning sent for mismatched pending rename",
	);
});

test("threadUpdate: pending listing with valid new name updates fields and re-prompts", async () => {
	let pendingUpdated = null;
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(OTHER_VALID_NAME),
		baseModels({
			Listing: {
				findOne: async () => ({
					status: "pending",
					update: async (data) => {
						pendingUpdated = data;
					},
				}),
			},
		}),
	);
	assert.strictEqual(pendingUpdated.item, "Magic Item", "pending listing fields updated");
});

test("threadUpdate: no existing listing + valid name creates a new listing", async () => {
	let createdData = null;
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(VALID_NAME),
		baseModels({
			Listing: {
				findOne: async () => null,
				create: async (data) => {
					createdData = data;
					return { id: 1, update: async () => {} };
				},
			},
		}),
	);
	assert.ok(createdData, "listing created");
	assert.strictEqual(createdData.type, "SELL", "created with parsed type");
	assert.strictEqual(createdData.status, "pending", "created as pending");
});

test("threadUpdate: new listing is attributed to the thread starter, not the latest message", async () => {
	let createdData = null;
	const thread = makeThread(VALID_NAME);
	thread.messages = {
		fetch: async () => {
			throw new Error("latest message must not be used to identify the author");
		},
	};
	await threadUpdate.execute(
		{ name: "old" },
		thread,
		baseModels({
			Listing: {
				findOne: async () => null,
				create: async (data) => {
					createdData = data;
					return { id: 1 };
				},
			},
		}),
	);
	assert.strictEqual(createdData.userId, "u1", "author taken from starter message");
});

test("threadUpdate: no existing listing + invalid name does nothing", async () => {
	let created = false;
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(MISMATCHED_NAME),
		baseModels({
			Listing: {
				findOne: async () => null,
				create: async () => (created = true),
			},
		}),
	);
	assert.strictEqual(created, false, "no listing created for invalid rename");
});

test("threadUpdate: errors in execute are caught", async () => {
	await threadUpdate.execute(
		{ name: "old" },
		makeThread(VALID_NAME),
		baseModels({
			Listing: {
				findOne: async () => {
					throw new Error("db error");
				},
			},
		}),
	);
});
