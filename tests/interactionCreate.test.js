const { test } = require("node:test");
const assert = require("node:assert");
const interactionCreate = require("../events/interactionCreate");

function makeModels() {
	return {
		Transaction: {
			findByPk: async (id) => ({
				id: parseInt(id),
				sellerId: "user1",
				buyerId: "user2",
				listingId: 1,
				ratingIds: [],
				update: async () => {},
			}),
			destroy: async () => {},
		},
		Rating: { create: async (data) => ({ id: 1, ...data }) },
		Listing: {
			findByPk: async (id) => ({ id: parseInt(id), ratingIds: [], update: async () => {} }),
		},
		client: {
			channels: { fetch: async () => ({ guild: { id: "g1" } }) },
			users: { fetch: async () => ({ send: async () => {} }) },
		},
	};
}

function captureButton(customId, userId) {
	const out = { edits: [], followUps: [] };
	return {
		out,
		interaction: {
			isCommand: () => false,
			isButton: () => true,
			isModalSubmit: () => false,
			customId,
			user: { id: userId },
			deferUpdate: async () => {},
			editReply: async (opts) => out.edits.push(opts.content),
			followUp: async (opts) => out.followUps.push(opts.content),
			showModal: async () => {},
		},
	};
}

test("interactionCreate: routes a slash command", async () => {
	const replies = [];
	const interaction = {
		isCommand: () => true,
		isButton: () => false,
		isModalSubmit: () => false,
		commandName: "confirm",
		channel: { isThread: () => false },
		reply: async (opts) => replies.push(opts.content),
	};
	await interactionCreate.execute(interaction, makeModels());
	assert.ok(replies.length > 0, "command produced a reply");
});

test("interactionCreate: handles a transaction confirm button", async () => {
	const { interaction } = captureButton("confirm_transaction_1_user1_user2_confirm", "user2");
	await assert.doesNotReject(interactionCreate.execute(interaction, makeModels()));
});

test("interactionCreate: handles a transaction deny button", async () => {
	const { interaction } = captureButton("confirm_transaction_1_user1_user2_deny", "user2");
	await assert.doesNotReject(interactionCreate.execute(interaction, makeModels()));
});

test("interactionCreate: handles a rate button", async () => {
	const { interaction } = captureButton("rate_positive_1_user1", "user1");
	await assert.doesNotReject(interactionCreate.execute(interaction, makeModels()));
});

test("interactionCreate: unauthorized user is rejected on confirm", async () => {
	const { out, interaction } = captureButton(
		"confirm_transaction_1_user1_user2_confirm",
		"intruder",
	);
	await interactionCreate.execute(interaction, makeModels());
	assert.ok(
		out.followUps.some((f) => f.includes("can confirm")),
		"unauthorized confirm blocked",
	);
});
