const { Op } = require("sequelize");

/**
 * Calculate and format marketplace reputation for a user
 * @param {string} userId - The Discord user ID
 * @param {Object} models - Database models (Listing, Transaction, Rating)
 * @returns {string} Formatted reputation text
 */
async function getUserReputation(userId, { Listing, Transaction, Rating }) {
	try {
		const listings = await Listing.findAll({
			where: { userId },
		});

		const transactions = await Transaction.findAll({
			where: {
				[Op.or]: [{ sellerId: userId }, { buyerId: userId }],
				status: "confirmed",
			},
		});

		const now = Math.floor(Date.now() / 1000);
		let response = `**Marketplace History for <@${userId}>** (as of <t:${now}:R>)\n\n`;

		const totalListings = listings.length;

		const buys = transactions.filter((t) => t.buyerId === userId && t.type === "purchase").length;

		const sells = transactions.filter((t) => t.sellerId === userId && t.type === "purchase").length;

		const trades = transactions.filter(
			(t) => t.type === "trade" || t.type === "money+trade"
		).length;

		response += `**Listings Summary**\n`;
		response += `- Listings: \`${totalListings}\` total\n`;
		response += `- Transactions: \`${buys}\` buys, \`${sells}\` sells, \`${trades}\` trades\n\n`;

		// Fetch ratings for the target user (ratings they've received)
		const ratings = await Rating.findAll({
			where: {
				rateeId: userId,
			},
		});

		// Calculate reputation based on positive/negative ratings
		if (ratings && ratings.length > 0) {
			const positiveRatings = ratings.filter((r) => r.rating === "positive").length;
			const negativeRatings = ratings.filter((r) => r.rating === "negative").length;
			const totalRatings = positiveRatings + negativeRatings;

			let reputationPercent = 0;
			if (totalRatings > 0) {
				reputationPercent = Math.round((positiveRatings / totalRatings) * 100);
			}

			response += `**Reputation:** \`${reputationPercent}%\` positive based on \`${totalRatings}\` ratings.`;
		} else {
			response += "User doesn't have any ratings yet.";
		}

		return response;
	} catch (error) {
		console.error("Error calculating user reputation:", error);
		return `**Marketplace History for <@${userId}>**\n\nError loading reputation data.`;
	}
}

module.exports = { getUserReputation };
