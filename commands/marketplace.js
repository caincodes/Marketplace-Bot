const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
	name: "marketplace",
	description: "Marketplace commands",
	options: [
		{
			name: "history",
			description: "View your listing history",
			type: 1, // SUB_COMMAND
		},
		{
			name: "confirm",
			description: "Confirm a transaction",
			type: 1, // SUB_COMMAND
			options: [
				{
					name: "post_id",
					description: "The forum post ID",
					type: 3, // STRING
					required: true,
				},
				{
					name: "buyer",
					description: "The buyer (if you are the seller)",
					type: 6, // USER
					required: false,
				},
			],
		},
	],
	async execute(interaction, { Listing, User, client }) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "history") {
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

				await interaction.reply({ content: response, ephemeral: true });
			} catch (error) {
				console.error("Error fetching listings:", error);
				await interaction.reply({
					content: "An error occurred while fetching your history.",
					ephemeral: true,
				});
			}
		} else if (subcommand === "confirm") {
			const postId = interaction.options.getString("post_id");
			const buyer = interaction.options.getUser("buyer");

			try {
				const listing = await Listing.findOne({ where: { threadId: postId } });
				if (!listing) {
					return await interaction.reply({
						content: "Listing not found for the given post ID.",
						ephemeral: true,
					});
				}

				const isSeller = interaction.user.id === listing.userId;
				let otherUserId;

				if (isSeller) {
					if (!buyer) {
						return await interaction.reply({
							content: "As the seller, you must specify the buyer.",
							ephemeral: true,
						});
					}
					otherUserId = buyer.id;
				} else {
					if (buyer) {
						return await interaction.reply({
							content: "As the buyer, you do not need to specify the buyer.",
							ephemeral: true,
						});
					}
					otherUserId = listing.userId;
				}

				// Fetch the thread
				const thread = await client.channels.fetch(postId);
				if (!thread || !thread.isThread()) {
					return await interaction.reply({
						content: "Invalid post ID.",
						ephemeral: true,
					});
				}

				// Send confirmation message in the thread
				const confirmMessage = await thread.send({
					content: `<@${otherUserId}>, please confirm the transaction for **${listing.type}** ${listing.item} for ${listing.offer}.`,
					components: [
						new ActionRowBuilder().addComponents(
							new ButtonBuilder()
								.setCustomId(
									`confirm_transaction_${listing.id}_${interaction.user.id}_${otherUserId}_confirm`
								)
								.setLabel("Confirm Transaction")
								.setStyle(ButtonStyle.Success),
							new ButtonBuilder()
								.setCustomId(
									`confirm_transaction_${listing.id}_${interaction.user.id}_${otherUserId}_deny`
								)
								.setLabel("Cancel")
								.setStyle(ButtonStyle.Danger)
						),
					],
				});

				await interaction.reply({
					content: "Transaction confirmation sent to the forum post.",
					ephemeral: true,
				});
			} catch (error) {
				console.error("Error confirming transaction:", error);
				await interaction.reply({
					content: "An error occurred while confirming the transaction.",
					ephemeral: true,
				});
			}
		}
	},
};
