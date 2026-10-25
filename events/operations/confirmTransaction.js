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
						initiatorId, // The user who ran /confirm (not the one confirming)
					},
					{ where: { id: transaction.id, status: "pending" } }
				);
				if (updatedCount === 0) {
					return await interaction.editReply({
						content: "This transaction has already been confirmed.",
						components: [],
					});
				}

				// Announce the completed transaction in the forum post
				try {
					if (listing?.threadId) {
						const channel = await client.channels.fetch(listing.threadId);
						if (channel) {
							const content =
								transaction.type === "purchase"
									? `🎉 <@${transaction.buyerId}> purchased an item from <@${transaction.sellerId}>!`
									: `🤝 <@${transaction.sellerId}> and <@${transaction.buyerId}> completed a trade!`;
							await channel.send({ content });
						}
					}
				} catch (error) {
					console.error("Error sending transaction message to forum post:", error);
				}

				const forumLinkText = formatForumLink(await getForumLink(transaction, listing, client));

				// Send rating prompt to the initiator (the other party) as a new DM
				const otherUserId =
					interaction.user.id === transaction.sellerId ? transaction.buyerId : transaction.sellerId;
				try {
					const otherUser = await client.users.fetch(otherUserId);
					await otherUser.send({
						content: `✅ **Transaction confirmed with <@${interaction.user.id}>!**\n${forumLinkText}\nHow was your experience with <@${interaction.user.id}>?`,
						components: [buildRatingButtons(transaction.id, otherUserId)],
					});
				} catch (error) {
					console.error(`Error sending rating prompt to ${otherUserId}:`, error);
				}

				// For the confirming user: turn their confirmation DM into a rating prompt
				try {
					await interaction.editReply({
						content: `✅ **Transaction confirmed with <@${otherUserId}>!**\n${forumLinkText}\nHow was your experience with <@${otherUserId}>?`,
						components: [buildRatingButtons(transaction.id, interaction.user.id)],
					});
				} catch (error) {
					console.error(`Error updating confirming user's DM:`, error);
				}
			} else if (action === "deny") {
				// Cancel the transaction and unlink it from its listing
				await Transaction.destroy({ where: { id: transaction.id, status: "pending" } });
				const listing = await Listing.findByPk(transaction.listingId);
				if (listing) {
					await listing.update({
						transactionIds: (listing.transactionIds || []).filter((id) => id !== transaction.id),
					});
				}
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
