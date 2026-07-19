const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require("discord.js");
const { replyEphemeral } = require("../utils/replies");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("confirm")
		.setDescription("Confirm a marketplace transaction (use inside your forum post)")
		.addUserOption((option) =>
			option.setName("user").setDescription("The other user in the transaction").setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription("Type of transaction")
				.setRequired(true)
				.addChoices(
					{ name: "Purchase / Sale", value: "purchase" },
					{ name: "Trade", value: "trade" },
					{ name: "Trade + Money", value: "money+trade" }
				)
		),
	async execute(interaction, { Listing, Transaction, client }) {
		if (!interaction.channel.isThread()) {
			return await replyEphemeral(
				interaction,
				"This command must be run inside a forum post (thread)."
			);
		}

		const otherUser = interaction.options.getUser("user");
		const type = interaction.options.getString("type");

		// Prevent selecting yourself
		if (otherUser.id === interaction.user.id) {
			return await replyEphemeral(interaction, "You cannot confirm a transaction with yourself.");
		}

		// Prevent selecting a bot
		if (otherUser.bot) {
			return await replyEphemeral(interaction, "You cannot confirm a transaction with a bot.");
		}

		try {
			const listing = await Listing.findOne({ where: { threadId: interaction.channel.id } });
			if (!listing) {
				return await replyEphemeral(interaction, "No listing found for this forum post.");
			}

			// Determine if initiator is the seller
			const isInitiatorSeller = interaction.user.id === listing.userId;

			let sellerId, buyerId, recipient;

			if (isInitiatorSeller) {
				sellerId = interaction.user.id;
				buyerId = otherUser.id;
				recipient = otherUser; // Send confirmation to buyer
			} else {
				buyerId = interaction.user.id;
				sellerId = otherUser.id;
				if (sellerId !== listing.userId) {
					return await replyEphemeral(
						interaction,
						"The specified user is not the seller of this listing."
					);
				}
				recipient = otherUser; // Send confirmation to seller
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

			let confirmationMessage = "";
			if (type === "purchase") {
				if (isInitiatorSeller) {
					// Seller is asking buyer to confirm purchase
					confirmationMessage = `<@${buyerId}>, please confirm your purchase from <@${sellerId}>.`;
				} else {
					// Buyer is asking seller to confirm sale
					confirmationMessage = `<@${sellerId}>, please confirm your sale to <@${buyerId}>.`;
				}
			} else if (type === "trade" || type === "money+trade") {
				confirmationMessage = `<@${recipient.id}>, please confirm your trade with <@${
					recipient.id === buyerId ? sellerId : buyerId
				}>.`;
			}

			await recipient.send({
				content: `Listing: https://discord.com/channels/${interaction.guildId}/${interaction.channel.id}\n\n${confirmationMessage}`,
				components: [
					new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId(
								`confirm_transaction_${transaction.id}_${interaction.user.id}_${recipient.id}_confirm`
							)
							.setLabel("Confirm Transaction")
							.setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId(
								`confirm_transaction_${transaction.id}_${interaction.user.id}_${recipient.id}_deny`
							)
							.setLabel("Cancel")
							.setStyle(ButtonStyle.Danger)
					),
				],
			});

			await replyEphemeral(interaction, "Transaction confirmation sent.");
		} catch (error) {
			console.error("Error initiating transaction:", error);
			await replyEphemeral(interaction, "An error occurred while initiating the transaction.");
		}
	},
};
