const assert = require("assert");
const writeReview = require("../events/operations/writeReview");

function makeInteraction(overrides = {}) {
	const state = { followUps: [], edits: [], replies: [], deferred: false, modal: null };
	const interaction = {
		state,
		user: { id: "rater123" },
		deferUpdate: async () => {
			state.deferred = true;
		},
		showModal: async (modal) => {
			state.modal = modal;
		},
		followUp: async (opts) => state.followUps.push(opts.content),
		editReply: async (opts) => state.edits.push(opts.content),
		reply: async (opts) => state.replies.push(opts.content),
		...overrides,
	};
	return interaction;
}

const client = { channels: { fetch: async () => ({ guild: { id: "g1" } }) } };

async function testWriteReview() {
	console.log("Running writeReview operation tests...");

	try {
		console.log("Test 1: execute shows the review modal");
		let interaction = makeInteraction({ customId: "write_review_50_rater123" });
		await writeReview.execute(interaction, {
			Rating: { findByPk: async () => ({ id: 50 }) },
			client,
		});
		assert.ok(interaction.state.modal, "modal shown");
		assert.strictEqual(
			interaction.state.modal.data.custom_id,
			"review_modal_50_rater123",
			"modal custom id",
		);
		console.log("✓ Test 1 passed: Review modal shown");

		console.log("Test 2: execute rejects unauthorized user");
		interaction = makeInteraction({ customId: "write_review_50_rater123", user: { id: "x" } });
		await writeReview.execute(interaction, { Rating: { findByPk: async () => ({}) }, client });
		assert.ok(
			interaction.state.replies.some((r) => r.includes("not authorized to write a review")),
			"authorization enforced",
		);
		console.log("✓ Test 2 passed: Unauthorized user rejected");

		console.log("Test 3: execute handles missing rating record");
		interaction = makeInteraction({ customId: "write_review_50_rater123" });
		await writeReview.execute(interaction, { Rating: { findByPk: async () => null }, client });
		assert.ok(
			interaction.state.replies.some((r) => r.includes("Rating record not found")),
			"missing rating handled",
		);
		console.log("✓ Test 3 passed: Missing rating handled");

		console.log("Test 4: skipRating updates the DM");
		interaction = makeInteraction({ customId: "skip_rating_1_rater123" });
		await writeReview.skipRating(interaction, {
			Transaction: { findByPk: async () => ({ id: 1, sellerId: "rater123", buyerId: "ratee456" }) },
			Listing: { findByPk: async () => ({ id: 9, threadId: "t1" }) },
			client,
		});
		assert.strictEqual(interaction.state.deferred, true, "deferred");
		assert.ok(
			interaction.state.edits.some((e) => e.includes("Rating skipped")),
			"rating skipped message",
		);
		console.log("✓ Test 4 passed: skipRating updates DM");

		console.log("Test 5: skipReview marks review null and updates DM");
		let updatedWith;
		const ratingRecord = {
			id: 50,
			transactionId: 1,
			update: async (data) => {
				updatedWith = data;
			},
		};
		interaction = makeInteraction({ customId: "skip_review_50_rater123" });
		await writeReview.skipReview(interaction, {
			Rating: { findByPk: async () => ratingRecord },
			Transaction: { findByPk: async () => ({ id: 1, sellerId: "rater123", buyerId: "ratee456" }) },
			Listing: { findByPk: async () => ({ id: 9, threadId: "t1" }) },
			client,
		});
		assert.deepStrictEqual(updatedWith, { review: null }, "review cleared");
		assert.ok(
			interaction.state.edits.some((e) => e.includes("Review skipped")),
			"review skipped message",
		);
		console.log("✓ Test 5 passed: skipReview updates DM");

		console.log("Test 6: submitReview saves review text and completes transaction");
		let savedReview;
		const submitRating = {
			id: 50,
			transactionId: 1,
			review: null,
			rateeId: "ratee456",
			update: async (data) => {
				savedReview = data;
			},
		};
		interaction = makeInteraction({
			customId: "review_modal_50_rater123",
			fields: { getTextInputValue: () => "  Great trader!  " },
		});
		await writeReview.submitReview(interaction, {
			Rating: {
				findByPk: async () => submitRating,
				findOne: async () => ({ review: "Great trader!", rateeId: "ratee456" }),
			},
			Transaction: { findByPk: async () => ({ id: 1, sellerId: "rater123", buyerId: "ratee456" }) },
			Listing: { findByPk: async () => ({ id: 9, threadId: "t1" }) },
			client,
		});
		assert.deepStrictEqual(savedReview, { review: "Great trader!" }, "review trimmed and saved");
		assert.ok(
			interaction.state.edits.some((e) => e.includes("Review submitted")),
			"completion shows review submitted",
		);
		console.log("✓ Test 6 passed: submitReview saves and completes");

		console.log("Test 7: submitReview rejects unauthorized user");
		interaction = makeInteraction({
			customId: "review_modal_50_rater123",
			user: { id: "x" },
			fields: { getTextInputValue: () => "" },
		});
		await writeReview.submitReview(interaction, {
			Rating: { findByPk: async () => ({}) },
			Transaction: { findByPk: async () => ({}) },
			Listing: { findByPk: async () => ({}) },
			client,
		});
		assert.ok(
			interaction.state.followUps.some((f) => f.includes("not authorized to submit this review")),
			"authorization enforced",
		);
		console.log("✓ Test 7 passed: Unauthorized submit rejected");

		console.log("All writeReview operation tests completed successfully!");
	} catch (error) {
		console.error("WriteReview operation test failed:", error);
		process.exitCode = 1;
	}
}

testWriteReview();
