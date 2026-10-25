const { test } = require("node:test");
const assert = require("node:assert");
const writeReview = require("../events/operations/writeReview");
const { createInteraction } = require("./helpers/interaction");

function makeInteraction(overrides = {}) {
	return createInteraction({ user: { id: "rater123" }, ...overrides });
}

const client = { channels: { fetch: async () => ({ guild: { id: "g1" } }) } };

test("writeReview: execute shows the review modal", async () => {
	const interaction = makeInteraction({ customId: "write_review_50_rater123" });
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
});

test("writeReview: execute rejects unauthorized user", async () => {
	const interaction = makeInteraction({ customId: "write_review_50_rater123", user: { id: "x" } });
	await writeReview.execute(interaction, { Rating: { findByPk: async () => ({}) }, client });
	assert.ok(
		interaction.state.replies.some((r) => r.includes("not authorized to write a review")),
		"authorization enforced",
	);
});

test("writeReview: execute handles missing rating record", async () => {
	const interaction = makeInteraction({ customId: "write_review_50_rater123" });
	await writeReview.execute(interaction, { Rating: { findByPk: async () => null }, client });
	assert.ok(
		interaction.state.replies.some((r) => r.includes("Rating record not found")),
		"missing rating handled",
	);
});

test("writeReview: skipRating updates the DM", async () => {
	const interaction = makeInteraction({ customId: "skip_rating_1_rater123" });
	await writeReview.skipRating(interaction, {
		Transaction: { findByPk: async () => ({ id: 1, sellerId: "rater123", buyerId: "ratee456" }) },
		Listing: { findByPk: async () => ({ id: 9, threadId: "t1" }) },
		client,
	});
	assert.strictEqual(interaction.deferred, true, "deferred");
	assert.ok(
		interaction.state.edits.some((e) => e.includes("Rating skipped")),
		"rating skipped message",
	);
});

test("writeReview: skipReview marks review null and updates the DM", async () => {
	let updatedWith;
	const ratingRecord = {
		id: 50,
		transactionId: 1,
		update: async (data) => {
			updatedWith = data;
		},
	};
	const interaction = makeInteraction({ customId: "skip_review_50_rater123" });
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
});

test("writeReview: skipReview reports a missing rating via follow-up after deferring", async () => {
	const interaction = makeInteraction({ customId: "skip_review_50_rater123" });
	await writeReview.skipReview(interaction, {
		Rating: { findByPk: async () => null },
		client,
	});
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("Rating record not found")),
		"missing rating reported",
	);
});

test("writeReview: submitReview saves review text and completes transaction", async () => {
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
	const interaction = makeInteraction({
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
});

test("writeReview: submitReview rejects unauthorized user", async () => {
	const interaction = makeInteraction({
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
});

test("writeReview: skipReview errors are reported without overwriting the DM", async () => {
	const interaction = makeInteraction({ customId: "skip_review_50_rater123" });
	await writeReview.skipReview(interaction, {
		Rating: {
			findByPk: async () => {
				throw new Error("db error");
			},
		},
		client,
	});
	assert.strictEqual(interaction.state.edits.length, 0, "DM content left intact");
	assert.ok(
		interaction.state.followUps.some((f) => f.includes("An error occurred")),
		"error sent as follow-up",
	);
});
