const { SlashCommandBuilder } = require("@discordjs/builders");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("history")
		.setDescription("View your listing history or another user's history")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to view history for").setRequired(false)
		),
	async execute(interaction, { Listing, User, Rating }) {
		try {
			await interaction.deferReply({ ephemeral: true });
			const targetUser = interaction.options.getUser("user") || interaction.user;

			const listings = await Listing.findAll({
				where: { userId: targetUser.id },
				include: [{ model: User, attributes: ["username"] }],
			}).catch(() => []);

			let response = `**Marketplace History for <@${targetUser.id}>**\n\n`;

			if (!listings || listings.length === 0) {
				response += "No listings found.\n\n";
			} else {
				listings.forEach((listing) => {
					response += `• **${listing.type}** ${listing.item} for ${listing.offer} in ${listing.region}\n`;
				});
				response += "\n";

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
			}
			await interaction.editReply({ content: response, ephemeral: true });
		} catch (error) {
			console.error("Error fetching listings or reviews:", error);
			await interaction.editReply({
				content: "An error occurred while fetching the history.",
				ephemeral: true,
			});
		}
	},
};
