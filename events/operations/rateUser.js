const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
	getForumLink,
	fetchTransactionAndListing,
	formatForumLink,
} = require("../../utils/forumLink");

module.exports = {
	name: "rateUser",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const raterId = parts[3];
		const ratingValue = parts[4];

		if (interaction.user.id !== raterId) {
			return await interaction.followUp({
				content: "You are not authorized to rate for this transaction.",
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
			const rateeId = raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

			// Create rating record
			const ratingRecord = await Rating.create({
				transactionId,
				raterId,
				rateeId,
				rating: ratingValue,
				review: null,
			});

			// Update transaction and listing with new rating ID
			const currentRatingIds = transaction.ratingIds || [];
			await transaction.update({ ratingIds: [...currentRatingIds, ratingRecord.id] });

			const currentListingRatingIds = listing.ratingIds || [];
			await listing.update({ ratingIds: [...currentListingRatingIds, ratingRecord.id] });

			// Update the message with rating confirmation and review options
			const forumLink = await getForumLink(transaction, listing, client);
			const forumLinkText = formatForumLink(forumLink);
			const reviewButtons = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`write_review_${ratingRecord.id}_${raterId}`)
					.setLabel("Write a Review")
					.setStyle(ButtonStyle.Primary)
					.setEmoji("📝"),
				new ButtonBuilder()
					.setCustomId(`skip_review_${ratingRecord.id}_${raterId}`)
					.setLabel("Skip Review")
					.setStyle(ButtonStyle.Secondary)
					.setEmoji("⏭️")
			);

			await interaction.editReply({
				content: `✅ **Transaction confirmed with <@${rateeId}>!**\n${forumLinkText}\n✅ **Rating submitted!**\n\nWould you like to write an optional, anonymous review of <@${rateeId}>?`,
				components: [reviewButtons],
			});
		} catch (error) {
			console.error("Error handling user rating:", error);
			await interaction.followUp({
				content: "An error occurred while submitting your rating.",
				flags: 64,
			});
		}
	},
};
