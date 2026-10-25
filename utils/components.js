const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const CONFIRMATION_BUTTON_IDS = ["confirm", "trade", "deny"];

/**
 * Build the Confirm / Trade / Deny button row shown on new/updated listings.
 * @returns {ActionRowBuilder}
 */
function buildConfirmationRow() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("trade").setLabel("Trade").setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
	);
}

/**
 * Build the Positive / Negative / Skip rating button row for a transaction.
 * @param {string|number} transactionId - Transaction ID
 * @param {string} userId - The user allowed to rate
 * @returns {ActionRowBuilder}
 */
function buildRatingButtons(transactionId, userId) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rate_user_${transactionId}_${userId}_positive`)
			.setLabel("Positive")
			.setStyle(ButtonStyle.Success)
			.setEmoji("👍"),
		new ButtonBuilder()
			.setCustomId(`rate_user_${transactionId}_${userId}_negative`)
			.setLabel("Negative")
			.setStyle(ButtonStyle.Danger)
			.setEmoji("👎"),
		new ButtonBuilder()
			.setCustomId(`skip_rating_${transactionId}_${userId}`)
			.setLabel("Skip")
			.setStyle(ButtonStyle.Secondary)
			.setEmoji("⏭️")
	);
}

module.exports = {
	CONFIRMATION_BUTTON_IDS,
	buildConfirmationRow,
	buildRatingButtons,
};
