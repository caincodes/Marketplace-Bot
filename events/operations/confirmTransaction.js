const { getForumLink, formatForumLink } = require("../../utils/forumLink");
const { buildRatingButtons } = require("../../utils/components");
const { followUpEphemeral } = require("../../utils/replies");

module.exports = {
	name: "confirmTransaction",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();

		const parts = interaction.customId.split("_");
		const transactionId = parts[2];
		const initiatorId = parts[3];
		const intendedUserId = parts[4];
		const action = parts[5];

		if (interaction.user.id !== intendedUserId) {
			return await followUpEphemeral(
				interaction,
				`Only <@${intendedUserId}> can confirm this transaction.`
			);
		}

		try {
			const transaction = await Transaction.findByPk(transactionId);
			if (!transaction) {
				return await followUpEphemeral(interaction, "Transaction not found.");
			}

			if (transaction.status !== "pending") {
				return await interaction.editReply({
					content: "This transaction has already been confirmed.",
					components: [],
				});
			}

			if (action === "confirm") {
				const listing = await Listing.findByPk(transaction.listingId);
				// Conditional update so a double-click can't confirm twice and send
				// duplicate rating prompts.
				const [updatedCount] = await Transaction.update(
					{
						status: "confirmed",
						confirmations: [interaction.user.id],
						forumPostId: listing?.threadId || transaction.forumPostId,
						initiatorId: interaction.user.id, // Track who initiated
					},
					{ where: { id: transaction.id, status: "pending" } }
				);
				if (updatedCount === 0) {
					return await interaction.editReply({
						content: "This transaction has already been confirmed.",
						components: [],
					});
				}

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

					const ratingMessage = `✅ **Transaction confirmed with <@${interaction.user.id}>!**\n${forumLinkText}\nHow was your experience with <@${interaction.user.id}>?`;

					// Send NEW DM to the non-initiator with rating buttons
					await otherUser.send({
						content: ratingMessage,
						components: [buildRatingButtons(transaction.id, otherUserId)],
					});
				} catch (error) {
					console.error(`Error sending rating prompt to ${otherUserId}:`, error);
				}

				// For initiator: update their DM with rating prompt
				try {
					const forumLink = await getForumLink(transaction, listing, client);
					const forumLinkText = formatForumLink(forumLink);
					const ratingMessage = `✅ **Transaction confirmed with <@${otherUserId}>!**\n${forumLinkText}\nHow was your experience with <@${otherUserId}>?`;

					await interaction.editReply({
						content: ratingMessage,
						components: [buildRatingButtons(transaction.id, interaction.user.id)],
					});
				} catch (error) {
					console.error(`Error updating initiator's DM:`, error);
				}
			} else if (action === "deny") {
				// Cancel the transaction
				await Transaction.destroy({ where: { id: transaction.id, status: "pending" } });
				await interaction.editReply({
					content: "❌ Transaction cancelled.",
					components: [],
				});
			}
		} catch (error) {
			console.error("Error handling transaction confirmation:", error);
			await followUpEphemeral(interaction, "An error occurred while processing your confirmation.");
		}
	},
};
