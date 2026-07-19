const assert = require("assert");
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
		messages: {
			fetch: async () => new Map([["m1", { author: { id: "u1", username: "poster" } }]]),
		},
	};
}

// Map.first() shim used by discord.js Collections; the code calls messages.fetch(...).first()
function withFirst(thread) {
	const originalFetch = thread.messages.fetch;
	thread.messages.fetch = async () => {
		const map = await originalFetch();
		map.first = () => map.values().next().value;
		return map;
	};
	return thread;
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

async function testThreadUpdate() {
	console.log("Running threadUpdate event tests...");

	try {
		console.log("Test 1: No-op when the thread name is unchanged");
		let findOneCalled = false;
		await threadUpdate.execute(
			{ name: VALID_NAME },
			{ name: VALID_NAME },
			baseModels({ Listing: { findOne: async () => (findOneCalled = true) } }),
		);
		assert.strictEqual(findOneCalled, false, "no DB work when name unchanged");
		console.log("✓ Test 1 passed: Unchanged name is a no-op");

		console.log("Test 2: Returns early when models are missing");
		await threadUpdate.execute({ name: "old" }, { name: VALID_NAME }, {});
		console.log("✓ Test 2 passed: Missing models handled without error");

		console.log("Test 3: Confirmed listing updates its fields on a valid rename");
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
		console.log("✓ Test 3 passed: Confirmed listing fields updated");

		console.log("Test 4: Confirmed listing is not updated when new name is mismatched");
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
		console.log("✓ Test 4 passed: Confirmed listing untouched on mismatch");

		console.log("Test 5: Pending listing with mismatched new name sends a warning");
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
		console.log("✓ Test 5 passed: Mismatched pending rename warns the user");

		console.log("Test 6: Pending listing with valid new name updates fields and re-prompts");
		let pendingUpdated = null;
		await threadUpdate.execute(
			{ name: "old" },
			withFirst(makeThread(OTHER_VALID_NAME)),
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
		console.log("✓ Test 6 passed: Pending listing updated and re-prompted");

		console.log("Test 7: No existing listing + valid name creates a new listing");
		let createdData = null;
		await threadUpdate.execute(
			{ name: "old" },
			withFirst(makeThread(VALID_NAME)),
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
		console.log("✓ Test 7 passed: New listing created from valid rename");

		console.log("Test 8: No existing listing + invalid name does nothing");
		let created8 = false;
		await threadUpdate.execute(
			{ name: "old" },
			makeThread(MISMATCHED_NAME),
			baseModels({
				Listing: {
					findOne: async () => null,
					create: async () => (created8 = true),
				},
			}),
		);
		assert.strictEqual(created8, false, "no listing created for invalid rename");
		console.log("✓ Test 8 passed: Invalid rename with no listing is a no-op");

		console.log("Test 9: Errors in execute are caught");
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
		console.log("✓ Test 9 passed: Execute error handled gracefully");

		console.log("All threadUpdate event tests completed successfully!");
	} catch (error) {
		console.error("ThreadUpdate event test failed:", error);
		process.exitCode = 1;
	}
}

testThreadUpdate();
