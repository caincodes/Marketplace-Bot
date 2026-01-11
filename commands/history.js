const { SlashCommandBuilder } = require("@discordjs/builders");
const { Op } = require("sequelize");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("history")
		.setDescription("View your listing history or another user's history")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to view history for").setRequired(false)
		),
	async execute(interaction, { Listing, User, Rating, Transaction }) {
		try {
			await interaction.deferReply({ flags: 64 });
			const targetUser = interaction.options.getUser("user") || interaction.user;

			const listings = await Listing.findAll({
				where: { userId: targetUser.id },
			}).catch(() => []);

			const transactions = await Transaction.findAll({
				where: {
					[Op.or]: [{ sellerId: targetUser.id }, { buyerId: targetUser.id }],
					status: "confirmed",
				},
			}).catch(() => []);

			let response = `**Marketplace History for <@${targetUser.id}>**\n\n`;

			const totalListings = listings.length;

			const buys = transactions.filter(
				(t) => t.buyerId === targetUser.id && t.type === "purchase"
			).length;

			const sells = transactions.filter(
				(t) => t.sellerId === targetUser.id && t.type === "purchase"
			).length;

			const trades = transactions.filter(
				(t) => t.type === "trade" || t.type === "money+trade"
			).length;

			response += `**Listings Summary**\n`;
			response += `- Total listings: ${totalListings}\n`;
			response += `- Transactions: ${buys} buys, ${sells} sells, ${trades} trades\n\n`;

			// Fetch ratings for the target user (ratings they've received)
			const reviews = await Rating.findAll({
				where: { rateeId: targetUser.id },
			}).catch(() => []);

			// Calculate reputation if more than 3 reviews
			if (reviews && reviews.length > 3) {
				const positiveReviews = reviews.filter((r) => r.rating === "positive").length;
				const negativeReviews = reviews.filter((r) => r.rating === "negative").length;
				const totalReviews = positiveReviews + negativeReviews;

				let reputationPercent = 0;
				if (totalReviews > 0) {
					reputationPercent = Math.round((positiveReviews / totalReviews) * 100);
				}

				response += `**Reputation:** ${reputationPercent}% positive based on ${totalReviews} reviews.`;
			} else {
				response += "User doesn't have enough reviews to display reputation.";
			}

			await interaction.editReply({ content: response, flags: 64 });
		} catch (error) {
			console.error("Error fetching listings or reviews:", error);
			await interaction.editReply({
				content: "An error occurred while fetching the history.",
				flags: 64,
			});
		}
	},
};
