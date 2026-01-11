const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
	name: "rateUser",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const raterId = parts[3];
		const ratingValue = parts[4];

		if (interaction.user.id !== raterId) {
			return await interaction.reply({
				content: "You are not authorized to rate for this transaction.",
				flags: 64,
			});
		}

		try {
			const transaction = await Transaction.findByPk(transactionId);
			if (!transaction) {
				return await interaction.reply({
					content: "Transaction not found.",
					flags: 64,
				});
			}

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

			const listing = await Listing.findByPk(transaction.listingId);
			const currentListingRatingIds = listing.ratingIds || [];
			await listing.update({ ratingIds: [...currentListingRatingIds, ratingRecord.id] });

			// Update the message with rating confirmation and review options
			const ratingEmoji = ratingValue === "positive" ? "👍" : "👎";
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

			await interaction.update({
				content: `${ratingEmoji} **Rating submitted!**\n\nWould you like to write an optional anonymous review of <@${rateeId}>?`,
				components: [reviewButtons],
			});
		} catch (error) {
			console.error("Error handling user rating:", error);
			await interaction.reply({
				content: "An error occurred while submitting your rating.",
				flags: 64,
			});
		}
	},
};
