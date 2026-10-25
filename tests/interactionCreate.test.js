const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { createInteraction } = require("./helpers/interaction");

// Replace each operation module with a stub that records which method was
// called, so the tests assert routing precisely rather than "didn't throw".
const calls = [];
let failWith = null;

function stubOperation(file, methods) {
	const modulePath = require.resolve(path.join(__dirname, "../events/operations", file));
	const exports = {};
	for (const method of methods) {
		exports[method] = async (interaction, models) => {
			calls.push({ handler: `${file}.${method}`, interaction, models });
			if (failWith) await failWith(interaction);
		};
	}
	require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}

stubOperation("confirmListing", ["execute"]);
stubOperation("confirmTransaction", ["execute"]);
stubOperation("rateUser", ["execute"]);
stubOperation("writeReview", ["execute", "skipRating", "skipReview", "submitReview"]);
stubOperation("commandInteraction", ["execute"]);

const interactionCreate = require("../events/interactionCreate");

const models = { marker: "models" };

beforeEach(() => {
	calls.length = 0;
	failWith = null;
});

function button(customId) {
	return createInteraction({ isButton: () => true, customId });
}

const buttonRoutes = [
	["confirm", "confirmListing.execute"],
	["trade", "confirmListing.execute"],
	["deny", "confirmListing.execute"],
	["confirm_transaction_1_u1_u2_confirm", "confirmTransaction.execute"],
	["confirm_transaction_1_u1_u2_deny", "confirmTransaction.execute"],
	["rate_user_1_u1_positive", "rateUser.execute"],
	["skip_rating_1_u1", "writeReview.skipRating"],
	["write_review_5_u1", "writeReview.execute"],
	["skip_review_5_u1", "writeReview.skipReview"],
];

for (const [customId, handler] of buttonRoutes) {
	test(`interactionCreate: button ${customId} routes to ${handler}`, async () => {
		const interaction = button(customId);
		await interactionCreate.execute(interaction, models);
		assert.deepStrictEqual(
			calls.map((c) => c.handler),
			[handler],
			"routed to exactly one handler",
		);
		assert.strictEqual(calls[0].interaction, interaction, "interaction passed through");
		assert.strictEqual(calls[0].models, models, "models passed through");
	});
}

test("interactionCreate: review modal submit routes to writeReview.submitReview", async () => {
	const interaction = createInteraction({
		isModalSubmit: () => true,
		customId: "review_modal_5_u1",
	});
	await interactionCreate.execute(interaction, models);
	assert.deepStrictEqual(
		calls.map((c) => c.handler),
		["writeReview.submitReview"],
	);
});

test("interactionCreate: slash command routes to commandInteraction", async () => {
	const interaction = createInteraction({ isCommand: () => true, commandName: "history" });
	await interactionCreate.execute(interaction, models);
	assert.deepStrictEqual(
		calls.map((c) => c.handler),
		["commandInteraction.execute"],
	);
});

test("interactionCreate: unknown button is ignored", async () => {
	const interaction = button("something_else");
	await interactionCreate.execute(interaction, models);
	assert.strictEqual(calls.length, 0, "no handler called");
	assert.strictEqual(interaction.state.messages.length, 0, "no response sent");
});

test("interactionCreate: handler error before acknowledging gets an ephemeral reply", async (t) => {
	t.mock.method(console, "error", () => {});
	failWith = async () => {
		throw new Error("boom");
	};
	const interaction = button("rate_user_1_u1_positive");
	await interactionCreate.execute(interaction, models);
	assert.deepStrictEqual(interaction.state.ephemeral, ["An unexpected error occurred."]);
	assert.strictEqual(interaction.state.replies.length, 1, "sent via reply()");
});

test("interactionCreate: handler error after deferring gets an ephemeral follow-up", async (t) => {
	t.mock.method(console, "error", () => {});
	failWith = async (interaction) => {
		await interaction.deferUpdate();
		throw new Error("boom");
	};
	const interaction = button("rate_user_1_u1_positive");
	await interactionCreate.execute(interaction, models);
	assert.deepStrictEqual(interaction.state.followUps, ["An unexpected error occurred."]);
	assert.deepStrictEqual(interaction.state.ephemeral, ["An unexpected error occurred."]);
});

test("interactionCreate: a failing error reply is logged, not thrown", async (t) => {
	const errors = t.mock.method(console, "error", () => {});
	failWith = async () => {
		throw new Error("boom");
	};
	const interaction = button("rate_user_1_u1_positive");
	interaction.reply = async () => {
		throw new Error("Unknown interaction");
	};
	await interactionCreate.execute(interaction, models);
	assert.ok(
		errors.mock.calls.some((c) => String(c.arguments[0]).includes("Error sending error reply")),
		"reply failure logged",
	);
});
