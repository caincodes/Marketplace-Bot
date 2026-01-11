const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getForumLink, formatForumLink } = require("../../utils/forumLink");

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
				const listing = await Listing.findByPk(transaction.listingId);
				await transaction.update({
					status: "confirmed",
					confirmations: [interaction.user.id],
					forumPostId: listing?.threadId || transaction.forumPostId,
					initiatorId: interaction.user.id, // Track who initiated
				});

				// Send message to forum post
				try {
					const listing = await Listing.findByPk(transaction.listingId);
					if (listing?.threadId) {
						const channel = await client.channels.fetch(listing.threadId);
						if (channel) {
							await channel.send({
								content: `🎉 <@${transaction.buyerId}> purchased an item from <@${transaction.sellerId}>!`,
							});
						}
					}
				} catch (error) {
					console.error("Error sending purchase message to forum post:", error);
				}

				// Send rating prompt to the other user (non-initiator)
				const otherUserId =
					interaction.user.id === transaction.sellerId ? transaction.buyerId : transaction.sellerId;
				try {
					const otherUser = await client.users.fetch(otherUserId);
					const forumLink = await getForumLink(transaction, listing, client);
					const forumLinkText = formatForumLink(forumLink);

					const ratingMessage = `✅ **Transaction Confirmed!**\n${forumLinkText}\nHow was your experience with <@${interaction.user.id}>?`;

					// Send NEW DM to the non-initiator with rating buttons
					await otherUser.send({
						content: ratingMessage,
						components: [
							new ActionRowBuilder().addComponents(
								new ButtonBuilder()
									.setCustomId(`rate_user_${transaction.id}_${otherUserId}_positive`)
									.setLabel("Positive")
									.setStyle(ButtonStyle.Success)
									.setEmoji("👍"),
								new ButtonBuilder()
									.setCustomId(`rate_user_${transaction.id}_${otherUserId}_negative`)
									.setLabel("Negative")
									.setStyle(ButtonStyle.Danger)
									.setEmoji("👎"),
								new ButtonBuilder()
									.setCustomId(`skip_rating_${transaction.id}_${otherUserId}`)
									.setLabel("Skip")
									.setStyle(ButtonStyle.Secondary)
									.setEmoji("⏭️")
							),
						],
					});
				} catch (error) {
					console.error(`Error sending rating prompt to ${otherUserId}:`, error);
				}

				// For initiator: update their DM with rating prompt
				try {
					const forumLink = await getForumLink(transaction, listing, client);
					const forumLinkText = formatForumLink(forumLink);
					const ratingMessage = `✅ **Transaction Confirmed!**\n${forumLinkText}\nHow was your experience with <@${otherUserId}>?`;

					await interaction.update({
						content: ratingMessage,
						components: [
							new ActionRowBuilder().addComponents(
								new ButtonBuilder()
									.setCustomId(`rate_user_${transaction.id}_${interaction.user.id}_positive`)
									.setLabel("Positive")
									.setStyle(ButtonStyle.Success)
									.setEmoji("👍"),
								new ButtonBuilder()
									.setCustomId(`rate_user_${transaction.id}_${interaction.user.id}_negative`)
									.setLabel("Negative")
									.setStyle(ButtonStyle.Danger)
									.setEmoji("👎"),
								new ButtonBuilder()
									.setCustomId(`skip_rating_${transaction.id}_${interaction.user.id}`)
									.setLabel("Skip")
									.setStyle(ButtonStyle.Secondary)
									.setEmoji("⏭️")
							),
						],
					});
				} catch (error) {
					console.error(`Error updating initiator's DM:`, error);
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
