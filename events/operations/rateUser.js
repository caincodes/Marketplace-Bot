const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { UniqueConstraintError } = require("sequelize");
const {
	getForumLink,
	fetchTransactionAndListing,
	formatForumLink,
} = require("../../utils/forumLink");
const { followUpEphemeral } = require("../../utils/replies");

module.exports = {
	name: "rateUser",
	async execute(interaction, { Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const raterId = parts[3];
		const ratingValue = parts[4];

		if (interaction.user.id !== raterId) {
			return await followUpEphemeral(
				interaction,
				"You are not authorized to rate for this transaction."
			);
		}

		try {
			const transactionData = await fetchTransactionAndListing(transactionId, {
				Transaction,
				Listing,
			});
			if (!transactionData) {
				return await followUpEphemeral(interaction, "Transaction not found.");
			}

			const { transaction, listing } = transactionData;
			const isParty = raterId === transaction.sellerId || raterId === transaction.buyerId;
			if (transaction.status !== "confirmed" || !isParty) {
				return await followUpEphemeral(interaction, "This transaction can't be rated.");
			}
			const rateeId = raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

			// Create rating record; the unique (transactionId, raterId) index rejects
			// a second rating from the same user, e.g. on a double-click.
			let ratingRecord;
			try {
				ratingRecord = await Rating.create({
					transactionId,
					raterId,
					rateeId,
					rating: ratingValue,
					review: null,
				});
			} catch (error) {
				if (error instanceof UniqueConstraintError) {
					return await followUpEphemeral(interaction, "You have already rated this transaction.");
				}
				throw error;
			}

			// Update transaction and listing with new rating ID
			const currentRatingIds = transaction.ratingIds || [];
			await transaction.update({ ratingIds: [...currentRatingIds, ratingRecord.id] });

			if (listing) {
				const currentListingRatingIds = listing.ratingIds || [];
				await listing.update({ ratingIds: [...currentListingRatingIds, ratingRecord.id] });
			}

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
			await followUpEphemeral(interaction, "An error occurred while submitting your rating.");
		}
	},
};
