module.exports = {
	name: "history",
	description: "View your listing history",
	async execute(interaction, { Listing, User }) {
		try {
			const listings = await Listing.findAll({
				where: { userId: interaction.user.id },
				include: [{ model: User, attributes: ["username"] }],
			});

			let response = `**Your Listing History**\n\n`;
			if (listings.length === 0) {
				response += "No listings found.";
			} else {
				listings.forEach((listing) => {
					response += `• **${listing.type}** ${listing.item} for ${listing.offer} in ${listing.region}\n`;
				});
			}

			await interaction.reply({ content: response, flags: 64 });
		} catch (error) {
			console.error("Error fetching listings:", error);
			await interaction.reply({
				content: "An error occurred while fetching your history.",
				flags: 64,
			});
		}
	},
};
