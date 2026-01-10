const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
	name: "confirm",
	description: "Confirm a transaction in this forum post",
	options: [
		{
			name: "other_user",
			description: "The other user in the transaction",
			type: 6, // USER
			required: true,
		},
		{
			name: "type",
			description: "Type of transaction",
			type: 3, // STRING
			required: true,
			choices: [
				{ name: "Purchase", value: "purchase" },
				{ name: "Trade", value: "trade" },
				{ name: "Money + Trade", value: "money+trade" },
			],
		},
	],
	async execute(interaction, { Listing, Transaction, client }) {
		if (!interaction.channel.isThread()) {
			return await interaction.reply({
				content: "This command must be run inside a forum post (thread).",
				flags: 64,
			});
		}

		const otherUser = interaction.options.getUser("other_user");
		const type = interaction.options.getString("type");

		try {
			const listing = await Listing.findOne({ where: { threadId: interaction.channel.id } });
			if (!listing) {
				return await interaction.reply({
					content: "No listing found for this forum post.",
					flags: 64,
				});
			}

			const isSeller = interaction.user.id === listing.userId;
			let sellerId, buyerId;

			if (isSeller) {
				sellerId = interaction.user.id;
				buyerId = otherUser.id;
			} else {
				buyerId = interaction.user.id;
				sellerId = otherUser.id;
				if (sellerId !== listing.userId) {
					return await interaction.reply({
						content: "The specified user is not the seller of this listing.",
						flags: 64,
					});
				}
			}

			const transaction = await Transaction.create({
				listingId: listing.id,
				sellerId,
				buyerId,
				type,
				status: "pending",
			});

			// Add transaction ID to listing
			const currentTransactionIds = listing.transactionIds || [];
			await listing.update({ transactionIds: [...currentTransactionIds, transaction.id] });

			const confirmMessage = await interaction.channel.send({
				content: `<@${otherUser.id}>, please confirm the **${type}** transaction for **${listing.type}** ${listing.item} for ${listing.offer}.`,
				components: [
					new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId(
								`confirm_transaction_${transaction.id}_${interaction.user.id}_${otherUser.id}_confirm`
							)
							.setLabel("Confirm Transaction")
							.setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId(
								`confirm_transaction_${transaction.id}_${interaction.user.id}_${otherUser.id}_deny`
							)
							.setLabel("Cancel")
							.setStyle(ButtonStyle.Danger)
					),
				],
			});

			await interaction.reply({
				content: "Transaction confirmation sent.",
				flags: 64,
			});
		} catch (error) {
			console.error("Error initiating transaction:", error);
			await interaction.reply({
				content: "An error occurred while initiating the transaction.",
				flags: 64,
			});
		}
	},
};
