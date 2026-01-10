const fs = require("fs");
const path = require("path");
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require("discord.js");

module.exports = {
	name: "interactionCreate",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		if (interaction.isCommand()) {
			const commandsPath = path.join(__dirname, "../commands");
			const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

			for (const file of commandFiles) {
				const command = require(path.join(commandsPath, file));
				if (interaction.commandName === command.name) {
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
							content: "Transaction confirmed!",
							components: [],
						});

						// Send rating prompts via DM
						const users = [transaction.sellerId, transaction.buyerId];
						for (const userId of users) {
							const otherUserId =
								userId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;
							try {
								const user = await client.users.fetch(userId);
								await user.send({
									content: `Transaction confirmed! Would you like to rate <@${otherUserId}>? Your name will not be displayed with your rating.`,
									components: [
										new ActionRowBuilder().addComponents(
											new ButtonBuilder()
												.setCustomId(`rate_${transaction.id}_${userId}`)
												.setLabel("Rate the other user")
												.setStyle(ButtonStyle.Primary)
										),
									],
								});
							} catch (error) {
								console.error(`Error sending rating prompt to ${userId}:`, error);
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
			} else if (interaction.customId.startsWith("rate_")) {
				const parts = interaction.customId.split("_");
				const transactionId = parts[1];
				const raterId = parts[2];

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

				const modal = new ModalBuilder()
					.setCustomId(`rating_modal_${transactionId}_${raterId}`)
					.setTitle("Rate the other user");

				const ratingSelect = new StringSelectMenuBuilder()
					.setCustomId("rating")
					.setPlaceholder("Select your rating!")
					.setRequired(true)
					.addOptions(
						new StringSelectMenuOptionBuilder()
							.setLabel("Positive")
							.setDescription("Good experience with this user")
							.setValue("positive")
							.setEmoji("👍"),
						new StringSelectMenuOptionBuilder()
							.setLabel("Negative")
							.setDescription("Bad experience with this user")
							.setValue("negative")
							.setEmoji("👎")
					);

				const reviewInput = new TextInputBuilder()
					.setCustomId("review")
					.setLabel("Brief review (optional)")
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(false);

				const firstActionRow = new ActionRowBuilder().addComponents(ratingSelect);
				const secondActionRow = new ActionRowBuilder().addComponents(reviewInput);

				modal.addComponents(firstActionRow, secondActionRow);

				await interaction.showModal(modal);
			}
		} else if (interaction.isModalSubmit()) {
			if (interaction.customId.startsWith("rating_modal_")) {
				const parts = interaction.customId.split("_");
				const transactionId = parts[2];
				const raterId = parts[3];

				const rating = interaction.fields.getTextInputValue("rating");
				const review = interaction.fields.getTextInputValue("review") || null;

				const transaction = await Transaction.findByPk(transactionId);
				const rateeId =
					raterId === transaction.sellerId ? transaction.buyerId : transaction.sellerId;

				const ratingRecord = await Rating.create({
					transactionId,
					raterId,
					rateeId,
					rating,
					review,
				});

				// Add rating ID to transaction
				const currentRatingIds = transaction.ratingIds || [];
				await transaction.update({ ratingIds: [...currentRatingIds, ratingRecord.id] });

				// Add rating ID to listing
				const listing = await Listing.findByPk(transaction.listingId);
				const currentListingRatingIds = listing.ratingIds || [];
				await listing.update({ ratingIds: [...currentListingRatingIds, ratingRecord.id] });

				await interaction.reply({
					content: "Thank you for your rating! Transaction complete.",
					flags: 64,
				});
			}
		}
	},
};
