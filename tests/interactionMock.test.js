const { test } = require("node:test");
const assert = require("node:assert");
const { createInteraction } = require("./helpers/interaction");

test("interaction mock: rejects a second acknowledgement", async () => {
	const interaction = createInteraction();
	await interaction.deferUpdate();
	await assert.rejects(interaction.reply({ content: "x" }), /InteractionAlreadyReplied/);
	await assert.rejects(interaction.update({ content: "x" }), /InteractionAlreadyReplied/);
	await assert.rejects(interaction.showModal({}), /InteractionAlreadyReplied/);
});

test("interaction mock: rejects editReply and followUp before acknowledgement", async () => {
	const interaction = createInteraction();
	await assert.rejects(interaction.editReply({ content: "x" }), /InteractionNotReplied/);
	await assert.rejects(interaction.followUp({ content: "x" }), /InteractionNotReplied/);
});

test("interaction mock: records responses in order and tracks ephemeral ones", async () => {
	const interaction = createInteraction();
	await interaction.reply({ content: "first", flags: 64 });
	await interaction.followUp("second");
	assert.deepStrictEqual(interaction.state.messages, ["first", "second"]);
	assert.deepStrictEqual(interaction.state.ephemeral, ["first"]);
});
