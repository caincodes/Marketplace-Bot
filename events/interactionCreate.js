const { CONFIRMATION_BUTTON_IDS } = require("../utils/components");

module.exports = {
	name: "interactionCreate",
	async execute(interaction, models) {
		try {
			// Route based on operation type from customId
			if (interaction.isButton()) {
				if (CONFIRMATION_BUTTON_IDS.includes(interaction.customId)) {
					const listingHandler = require("./operations/confirmListing");
					await listingHandler.execute(interaction, models);
				} else if (interaction.customId.startsWith("confirm_transaction_")) {
					const confirmHandler = require("./operations/confirmTransaction");
					await confirmHandler.execute(interaction, models);
				} else if (interaction.customId.startsWith("close_listing_")) {
					const closeHandler = require("./operations/closeListing");
					await closeHandler.execute(interaction, models);
				} else if (interaction.customId.startsWith("rate_user_")) {
					const rateHandler = require("./operations/rateUser");
					await rateHandler.execute(interaction, models);
				} else if (interaction.customId.startsWith("skip_rating_")) {
					console.log(`[Button] Routing to skipRating`);
					const reviewHandler = require("./operations/writeReview");
					await reviewHandler.skipRating(interaction, models);
				} else if (interaction.customId.startsWith("write_review_")) {
					console.log(`[Button] Routing to writeReview execute`);
					const reviewHandler = require("./operations/writeReview");
					await reviewHandler.execute(interaction, models);
				} else if (interaction.customId.startsWith("skip_review_")) {
					const reviewHandler = require("./operations/writeReview");
					await reviewHandler.skipReview(interaction, models);
				}
			} else if (interaction.isModalSubmit()) {
				if (interaction.customId.startsWith("review_modal_")) {
					const reviewHandler = require("./operations/writeReview");
					await reviewHandler.submitReview(interaction, models);
				}
			} else if (interaction.isCommand()) {
				const commandHandler = require("./operations/commandInteraction");
				await commandHandler.execute(interaction, models);
			}
		} catch (error) {
			console.error("[Error] Error in interactionCreate:", error);
			// Always try to give the user feedback. If the interaction was already
			// deferred or replied, reply() would throw, so follow up instead.
			const errorMessage = {
				content: "An unexpected error occurred.",
				flags: 64,
			};
			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(errorMessage);
				} else {
					await interaction.reply(errorMessage);
				}
			} catch (replyError) {
				console.error("[Error] Error sending error reply:", replyError);
			}
		}
	},
};
