const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require("discord.js");

module.exports = {
	name: "writeReview",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		const parts = interaction.customId.split("_");
		const ratingId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.reply({
				content: "You are not authorized to write a review for this transaction.",
				flags: 64,
			});
		}

		try {
			const ratingRecord = await Rating.findByPk(ratingId);
			if (!ratingRecord) {
				return await interaction.reply({
					content: "Rating record not found.",
					flags: 64,
				});
			}

			// Create and show the review modal
			const modal = new ModalBuilder()
				.setCustomId(`review_modal_${ratingId}_${raterId}`)
				.setTitle("Write a Review");

			const reviewInput = new TextInputBuilder()
				.setCustomId("review")
				.setLabel("Share your experience (optional, anonymous)")
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(false)
				.setPlaceholder("Tell others about your experience...");

			modal.addComponents(new ActionRowBuilder().addComponents(reviewInput));

			await interaction.showModal(modal);
		} catch (error) {
			console.error("Error showing review modal:", error);
			await interaction.reply({
				content: "An error occurred while opening the review form.",
				flags: 64,
			});
		}
	},

	// Handle the skip review action
	async skipReview(interaction, { User, Listing, Transaction, Rating, client }) {
		const parts = interaction.customId.split("_");
		const ratingId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.reply({
				content: "You are not authorized to complete this action.",
				flags: 64,
			});
		}

		try {
			const ratingRecord = await Rating.findByPk(ratingId);
			if (!ratingRecord) {
				return await interaction.reply({
					content: "Rating record not found.",
					flags: 64,
				});
			}

			// Mark review as completed (null means no review written)
			await ratingRecord.update({ review: null });

			await this.checkTransactionCompletion(interaction, ratingRecord.transactionId, client, {
				User,
				Listing,
				Transaction,
				Rating,
			});
		} catch (error) {
			console.error("Error skipping review:", error);
			await interaction.reply({
				content: "An error occurred while skipping the review.",
				flags: 64,
			});
		}
	},

	// Handle the modal submission
	async submitReview(interaction, { User, Listing, Transaction, Rating, client }) {
		const parts = interaction.customId.split("_");
		const ratingId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.reply({
				content: "You are not authorized to submit this review.",
				flags: 64,
			});
		}

		try {
			const reviewText = interaction.fields.getTextInputValue("review")?.trim();
			const review = reviewText || null;

			const ratingRecord = await Rating.findByPk(ratingId);
			if (!ratingRecord) {
				return await interaction.reply({
					content: "Rating record not found.",
					flags: 64,
				});
			}

			await ratingRecord.update({ review });

			await this.checkTransactionCompletion(interaction, ratingRecord.transactionId, client, {
				User,
				Listing,
				Transaction,
				Rating,
			});
		} catch (error) {
			console.error("Error submitting review:", error);
			await interaction.reply({
				content: "An error occurred while submitting your review.",
				flags: 64,
			});
		}
	},

	// Helper method to check if transaction is complete and update the message
	async checkTransactionCompletion(interaction, transactionId, client, models) {
		try {
			const { Listing, Transaction, Rating } = models;
			const transaction = await Transaction.findByPk(transactionId);
			if (!transaction) return;

			// For now, complete the transaction immediately when a review action is taken
			// In a more sophisticated system, we'd wait for all parties to complete their reviews
			let completionMessage = interaction.isModalSubmit()
				? "✅ Review Submitted!\n✅ **Transaction Complete!**"
				: "✅ Review Skipped!\n✅ **Transaction Complete!**";

			// Add link to forum post
			const listing = await Listing.findByPk(transaction.listingId);
			const forumChannelId = transaction.forumPostId || listing?.threadId;

			if (forumChannelId) {
				try {
					const channel = await client.channels.fetch(forumChannelId);
					const guildId = channel?.guild?.id;
					if (guildId) {
						completionMessage += `\n\n[View Forum Post](https://discord.com/channels/${guildId}/${forumChannelId})`;
					}
				} catch (error) {
					console.error("Error fetching forum channel:", error);
				}
			}

			await interaction.update({
				content: completionMessage,
				components: [],
			});
		} catch (error) {
			console.error("Error completing transaction:", error);
			await interaction.reply({
				content: "An error occurred while completing the transaction.",
				flags: 64,
			});
		}
	},
};
