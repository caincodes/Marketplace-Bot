const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require("discord.js");
const {
	getForumLink,
	fetchTransactionAndListing,
	formatForumLink,
} = require("../../utils/forumLink");

// Helper to get rating emoji
function getRatingEmoji(rating) {
	return rating === "positive" ? "👍" : "👎";
}

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

	// Handle the skip rating action
	async skipRating(interaction, { User, Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.followUp({
				content: "You are not authorized to complete this action.",
				flags: 64,
			});
		}

		try {
			const transactionData = await fetchTransactionAndListing(transactionId, {
				Transaction,
				Listing,
			});
			if (!transactionData) {
				return await interaction.followUp({
					content: "Transaction not found.",
					flags: 64,
				});
			}

			const { transaction, listing } = transactionData;
			const forumLink = await getForumLink(transaction, listing, client);
			const forumLinkText = formatForumLink(forumLink);
			const rateeId = raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

			// Update DM to show rating skipped
			await interaction.editReply({
				content: `✅ **Transaction confirmed with <@${rateeId}>!**\n${forumLinkText}\n✅ **Rating skipped**`,
				components: [],
			});
		} catch (error) {
			console.error("Error skipping rating:", error);
			await interaction.followUp({
				content: "An error occurred while skipping the rating.",
				flags: 64,
			});
		}
	},

	// Handle the skip review action
	async skipReview(interaction, { User, Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const ratingId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.followUp({
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

			// Get transaction and listing for forum link
			const transactionData = await fetchTransactionAndListing(ratingRecord.transactionId, {
				Transaction,
				Listing,
			});
			if (!transactionData) return;

			const { transaction, listing } = transactionData;
			const forumLink = await getForumLink(transaction, listing, client);
			const forumLinkText = formatForumLink(forumLink);
			const rateeId = raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

			// Update DM to show rating submitted with review skipped
			await interaction.editReply({
				content: `✅ **Transaction confirmed with <@${rateeId}>!**\n${forumLinkText}\n✅ **Rating submitted**\n✅ **Review skipped**`,
				components: [],
			});
		} catch (error) {
			console.error("Error skipping review:", error);
			await interaction.editReply({
				content: "An error occurred while skipping the review.",
				flags: 64,
			});
		}
	},

	// Handle the modal submission
	async submitReview(interaction, { User, Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const ratingId = parts[2];
		const raterId = parts[3];

		if (interaction.user.id !== raterId) {
			return await interaction.followUp({
				content: "You are not authorized to submit this review.",
				flags: 64,
			});
		}

		try {
			const reviewText = interaction.fields.getTextInputValue("review")?.trim();
			const review = reviewText || null;

			const ratingRecord = await Rating.findByPk(ratingId);
			if (!ratingRecord) {
				return await interaction.followUp({
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
			await interaction.followUp({
				content: "An error occurred while submitting your review.",
				flags: 64,
			});
		}
	},

	// Helper method to check if transaction is complete and update the message
	async checkTransactionCompletion(interaction, transactionId, client, models) {
		try {
			const { Listing, Transaction, Rating } = models;
			const transactionData = await fetchTransactionAndListing(transactionId, {
				Transaction,
				Listing,
			});
			if (!transactionData) return;

			const { transaction, listing } = transactionData;
			const forumLink = await getForumLink(transaction, listing, client);
			const forumLinkText = formatForumLink(forumLink);

			// Get the rating for this user to show the emoji
			const userRating = await Rating.findOne({
				where: {
					transactionId,
					raterId: interaction.user.id,
				},
			});

			const reviewStatus = userRating.review ? "✅ **Review submitted**" : "✅ **Review skipped**";

			// Update DM with final confirmation
			const rateeId = userRating.rateeId;
			const completionMessage = `✅ **Transaction confirmed with <@${rateeId}>!**\n${forumLinkText}\n✅ **Rating submitted**\n${reviewStatus}`;

			await interaction.editReply({
				content: completionMessage,
				components: [],
			});
		} catch (error) {
			console.error("Error completing transaction:", error);
			await interaction.editReply({
				content: "An error occurred while completing the transaction.",
				flags: 64,
			});
		}
	},
};
