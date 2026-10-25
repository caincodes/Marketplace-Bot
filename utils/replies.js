// Discord MessageFlags.Ephemeral (only the invoking user can see the reply)
const EPHEMERAL = 64;

/**
 * Reply to an interaction with an ephemeral text message.
 */
function replyEphemeral(interaction, content) {
	return interaction.reply({ content, flags: EPHEMERAL });
}

/**
 * Follow up on an interaction with an ephemeral text message.
 */
function followUpEphemeral(interaction, content) {
	return interaction.followUp({ content, flags: EPHEMERAL });
}

module.exports = { EPHEMERAL, replyEphemeral, followUpEphemeral };
