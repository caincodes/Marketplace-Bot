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

test("writeReview: skipReview reports a missing transaction instead of going silent", async () => {
	const interaction = makeInteraction({ customId: "skip_review_50_rater123" });
	await writeReview.skipReview(interaction, {
		Rating: { findByPk: async () => ({ id: 50, transactionId: 1, update: async () => {} }) },
		Transaction: { findByPk: async () => null },
		Listing: { findByPk: async () => null },
		client,
	});
	assert.deepStrictEqual(interaction.state.followUps, ["Transaction not found."]);
});

test("writeReview: submitReview reports a missing transaction instead of going silent", async () => {
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "ok" },
	});
	await writeReview.submitReview(interaction, {
		Rating: { findByPk: async () => ({ id: 50, transactionId: 1, update: async () => {} }) },
		Transaction: { findByPk: async () => null },
		Listing: { findByPk: async () => null },
		client,
	});
	assert.deepStrictEqual(interaction.state.followUps, ["Transaction not found."]);
});

const tx = { id: 1, sellerId: "rater123", buyerId: "ratee456" };
const reviewModels = (overrides = {}) => ({
	Rating: {
		findByPk: async () => ({ id: 50, transactionId: 1, update: async () => {} }),
		findOne: async () => ({ review: null, rateeId: "ratee456" }),
	},
	Transaction: { findByPk: async () => tx },
	Listing: { findByPk: async () => ({ id: 9, threadId: "t1" }) },
	client,
	...overrides,
});
const throwing = async () => {
	throw new Error("db error");
};

test("writeReview: execute reports an error opening the modal", async (t) => {
	t.mock.method(console, "error", () => {});
	const interaction = makeInteraction({ customId: "write_review_50_rater123" });
	await writeReview.execute(interaction, { Rating: { findByPk: throwing } });
	assert.deepStrictEqual(interaction.state.ephemeral, [
		"An error occurred while opening the review form.",
	]);
});

test("writeReview: skipRating rejects unauthorized user", async () => {
	const interaction = makeInteraction({ customId: "skip_rating_1_rater123", user: { id: "x" } });
	await writeReview.skipRating(interaction, reviewModels());
	assert.deepStrictEqual(interaction.state.followUps, [
		"You are not authorized to complete this action.",
	]);
	assert.strictEqual(interaction.state.edits.length, 0, "DM untouched");
});

test("writeReview: skipRating reports a missing transaction", async () => {
	const interaction = makeInteraction({ customId: "skip_rating_1_rater123" });
	await writeReview.skipRating(
		interaction,
		reviewModels({ Transaction: { findByPk: async () => null } }),
	);
	assert.deepStrictEqual(interaction.state.followUps, ["Transaction not found."]);
});

test("writeReview: skipRating errors are reported without overwriting the DM", async (t) => {
	t.mock.method(console, "error", () => {});
	const interaction = makeInteraction({ customId: "skip_rating_1_rater123" });
	await writeReview.skipRating(interaction, reviewModels({ Transaction: { findByPk: throwing } }));
	assert.strictEqual(interaction.state.edits.length, 0, "DM untouched");
	assert.deepStrictEqual(interaction.state.followUps, [
		"An error occurred while skipping the rating.",
	]);
});

test("writeReview: skipReview rejects unauthorized user", async () => {
	let updated = false;
	const interaction = makeInteraction({ customId: "skip_review_50_rater123", user: { id: "x" } });
	await writeReview.skipReview(
		interaction,
		reviewModels({ Rating: { findByPk: async () => ({ update: async () => (updated = true) }) } }),
	);
	assert.strictEqual(updated, false, "rating untouched");
	assert.deepStrictEqual(interaction.state.followUps, [
		"You are not authorized to complete this action.",
	]);
});

test("writeReview: submitReview with blank text stores null and shows review skipped", async () => {
	let saved;
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "   " },
	});
	await writeReview.submitReview(
		interaction,
		reviewModels({
			Rating: {
				findByPk: async () => ({ id: 50, transactionId: 1, update: async (d) => (saved = d) }),
				findOne: async () => ({ review: null, rateeId: "ratee456" }),
			},
		}),
	);
	assert.deepStrictEqual(saved, { review: null }, "blank review stored as null");
	assert.ok(interaction.state.edits.some((e) => e.includes("Review skipped")));
});

test("writeReview: submitReview reports a missing rating record", async () => {
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "ok" },
	});
	await writeReview.submitReview(
		interaction,
		reviewModels({ Rating: { findByPk: async () => null } }),
	);
	assert.deepStrictEqual(interaction.state.followUps, ["Rating record not found."]);
});

test("writeReview: submitReview errors are reported as a follow-up", async (t) => {
	t.mock.method(console, "error", () => {});
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "ok" },
	});
	await writeReview.submitReview(interaction, reviewModels({ Rating: { findByPk: throwing } }));
	assert.deepStrictEqual(interaction.state.followUps, [
		"An error occurred while submitting your review.",
	]);
});

test("writeReview: completion reports an error when the user's rating is missing", async (t) => {
	t.mock.method(console, "error", () => {});
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "ok" },
	});
	await writeReview.submitReview(
		interaction,
		reviewModels({
			Rating: {
				findByPk: async () => ({ id: 50, transactionId: 1, update: async () => {} }),
				findOne: async () => null,
			},
		}),
	);
	assert.strictEqual(interaction.state.edits.length, 0, "DM untouched");
	assert.deepStrictEqual(interaction.state.ephemeral, [
		"An error occurred while completing the transaction.",
	]);
});

test("writeReview: completion errors are reported as a follow-up", async (t) => {
	t.mock.method(console, "error", () => {});
	const interaction = makeInteraction({
		customId: "review_modal_50_rater123",
		fields: { getTextInputValue: () => "ok" },
	});
	await writeReview.submitReview(
		interaction,
		reviewModels({
			Rating: {
				findByPk: async () => ({ id: 50, transactionId: 1, update: async () => {} }),
				findOne: throwing,
			},
		}),
	);
	assert.deepStrictEqual(interaction.state.followUps, [
		"An error occurred while completing the transaction.",
	]);
});
