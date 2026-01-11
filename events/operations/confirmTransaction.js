const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
	name: "confirmTransaction",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const intendedUserId = parts[4];
		const action = parts[5];

		if (interaction.user.id !== intendedUserId) {
			return await interaction.reply({
				content: `Only <@${intendedUserId}> can confirm this transaction.`,
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

			if (action === "confirm") {
				// Immediately confirm the transaction
				await transaction.update({
					status: "confirmed",
					confirmations: [interaction.user.id],
					forumPostId: interaction.channel?.id || transaction.forumPostId,
				});

				// Send message to forum post
				try {
					const listing = await Listing.findByPk(transaction.listingId);
					if (listing?.threadId) {
						const channel = await client.channels.fetch(listing.threadId);
						if (channel) {
							await channel.send({
								content: `🎉 <@${transaction.buyerId}> purchased an item from <@${transaction.sellerId}>!`,
								components: [
									new ActionRowBuilder().addComponents(
										new ButtonBuilder()
											.setCustomId(`close_listing_${listing.id}_${listing.userId}`)
											.setLabel("Close Listing")
											.setStyle(ButtonStyle.Secondary)
									),
								],
							});
						}
					}
				} catch (error) {
					console.error("Error sending purchase message to forum post:", error);
				}

				// Update the confirmation message
				await interaction.update({
					content: `✅ Transaction confirmed between <@${transaction.sellerId}> and <@${transaction.buyerId}>!`,
					components: [],
				});

				// Send rating prompts to both users
				const listing = await Listing.findByPk(transaction.listingId);
				const forumChannelId = transaction.forumPostId || listing?.threadId;
				const guildId =
					interaction.guildId ||
					(forumChannelId ? (await client.channels.fetch(forumChannelId))?.guild?.id : null) ||
					null;

				for (const userId of [transaction.sellerId, transaction.buyerId]) {
					const otherUserId =
						userId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;
					try {
						const user = await client.users.fetch(userId);
						// Only include transaction confirmed + forum link for the other user
						const confirmationMessage =
							interaction.user.id !== userId && guildId && forumChannelId
								? `✅ **Transaction Confirmed!**\n\nhttps://discord.com/channels/${guildId}/${forumChannelId}\n\n`
								: "";

						await user.send({
							content: `${confirmationMessage}How was your experience with <@${otherUserId}>?`,
							components: [
								new ActionRowBuilder().addComponents(
									new ButtonBuilder()
										.setCustomId(`rate_user_${transaction.id}_${userId}_positive`)
										.setLabel("Positive")
										.setStyle(ButtonStyle.Success)
										.setEmoji("👍"),
									new ButtonBuilder()
										.setCustomId(`rate_user_${transaction.id}_${userId}_negative`)
										.setLabel("Negative")
										.setStyle(ButtonStyle.Danger)
										.setEmoji("👎")
								),
							],
						});
					} catch (error) {
						console.error(`Error sending rating prompt to ${userId}:`, error);
					}
				}
			} else if (action === "deny") {
				// Cancel the transaction
				await Transaction.destroy({ where: { id: transactionId } });
				await interaction.update({
					content: "❌ Transaction cancelled.",
					components: [],
				});
			}
		} catch (error) {
			console.error("Error handling transaction confirmation:", error);
			await interaction.reply({
				content: "An error occurred while processing your confirmation.",
				flags: 64,
			});
		}
	},
};
