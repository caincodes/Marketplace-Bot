const fs = require("fs");
const path = require("path");
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require("discord.js");

module.exports = {
	name: "interactionCreate",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		if (interaction.isCommand()) {
			const commandsPath = path.join(__dirname, "../commands");
			const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

			for (const file of commandFiles) {
				const command = require(path.join(commandsPath, file));

				// Handle both old and new command formats
				const commandName = command.data ? command.data.name : command.name;

				if (interaction.commandName === commandName) {
					try {
						await command.execute(interaction, { User, Listing, Transaction, Rating, client });
					} catch (error) {
						console.error(error);
						await interaction.reply({
							content: "There was an error while executing this command!",
							flags: 64,
						});
					}
					return;
				}
			}
		} else if (interaction.isButton()) {
			// Handle transaction confirmation/denial
			if (interaction.customId.startsWith("confirm_transaction_")) {
				const parts = interaction.customId.split("_");
				const transactionId = parts[2];
				const initiatorId = parts[3];
				const otherId = parts[4];
				const intendedUserId = parts[5];
				const action = parts[6];

				if (interaction.user.id !== intendedUserId) {
					return await interaction.reply({
						content: "Only the other party can confirm this transaction.",
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
						await transaction.update({ status: "confirmed" });
						await interaction.update({
							content: `Transaction confirmed between <@${initiatorId}> and <@${otherId}>.`,
							components: [],
						});

						// Send rating buttons via DM
						const users = [transaction.sellerId, transaction.buyerId];
						for (const userId of users) {
							const otherUserId =
								userId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;
							try {
								const user = await client.users.fetch(userId);
								await user.send({
									content: `Thank you for confirming your transaction! Please rate <@${otherUserId}>:`,
									components: [
										new ActionRowBuilder().addComponents(
											new ButtonBuilder()
												.setCustomId(`rate_positive_${transaction.id}_${userId}`)
												.setLabel("Positive")
												.setStyle(ButtonStyle.Success)
												.setEmoji("👍"),
											new ButtonBuilder()
												.setCustomId(`rate_negative_${transaction.id}_${userId}`)
												.setLabel("Negative")
												.setStyle(ButtonStyle.Danger)
												.setEmoji("👎")
										),
									],
								});
							} catch (error) {
								console.error(`Error sending rating buttons to ${userId}:`, error);
							}
						}
					} else if (action === "deny") {
						await Transaction.destroy({ where: { id: transactionId } });
						await interaction.update({
							content: "Transaction cancelled.",
							components: [],
						});
					}
				} catch (error) {
					console.error("Error handling transaction confirmation:", error);
					await interaction.reply({
						content: "An error occurred.",
						flags: 64,
					});
				}
			}
			// Handle rating buttons (positive/negative)
			else if (interaction.customId.startsWith("rate_")) {
				const parts = interaction.customId.split("_");
				const ratingValue = parts[1]; // "positive" or "negative"
				const transactionId = parts[2];
				const raterId = parts[3];

				if (interaction.user.id !== raterId) {
					return await interaction.reply({
						content: "You are not authorized to rate for this transaction.",
						flags: 64,
					});
				}

				const transaction = await Transaction.findByPk(transactionId);
				if (!transaction) {
					return await interaction.reply({
						content: "Transaction not found.",
						flags: 64,
					});
				}

				const rateeId =
					raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

				// Store rating immediately
				const ratingRecord = await Rating.create({
					transactionId,
					raterId,
					rateeId,
					rating: ratingValue,
					review: null,
				});

				// Update transaction and listing rating IDs
				const currentRatingIds = transaction.ratingIds || [];
				await transaction.update({ ratingIds: [...currentRatingIds, ratingRecord.id] });

				const listing = await Listing.findByPk(transaction.listingId);
				const currentListingRatingIds = listing.ratingIds || [];
				await listing.update({ ratingIds: [...currentListingRatingIds, ratingRecord.id] });

				// Edit the original DM message to remove buttons and update content
				try {
					await interaction.update({
						content: `Transaction confirmed! Thank you for rating <@${rateeId}>.`,
						components: [],
					});
				} catch (error) {
					console.error("Error updating the rating message:", error);
				}

				// Prompt optional anonymous review via modal
				const modal = new ModalBuilder()
					.setCustomId(`review_modal_${ratingRecord.id}_${raterId}`)
					.setTitle("Write a Review");

				const reviewInput = new TextInputBuilder()
					.setCustomId("review")
					.setLabel("Write a brief review (optional, anonymous)")
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(false);

				const actionRow = new ActionRowBuilder().addComponents(reviewInput);
				modal.addComponents(actionRow);

				await interaction.showModal(modal);
			}
		}
		// Handle modal submission for optional anonymous review
		else if (interaction.isModalSubmit()) {
			if (interaction.customId.startsWith("review_modal_")) {
				const parts = interaction.customId.split("_");
				const ratingId = parts[2];
				const raterId = parts[3];

				const review = interaction.fields.getTextInputValue("review") || null;

				const ratingRecord = await Rating.findByPk(ratingId);
				if (ratingRecord && ratingRecord.raterId === raterId) {
					await ratingRecord.update({ review });
				}

				await interaction.reply({
					content: "Thank you for your anonymous review! Transaction complete.",
					flags: 64,
				});
			}
		}
	},
};
