const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const parseThreadName = require("../utils/parseThreadName");
const WaitStarterMessage = require("../utils/WaitStarterMessage");
const { Op } = require("sequelize");

module.exports = {
	name: "threadCreate",
	async execute(thread, models = {}) {
		// Destructure User, Listing, and Transaction from models
		const { User, Listing, Transaction } = models;

		// Log warning if models are missing but do not crash
		if (!User || !Listing) {
			console.warn(
				"Warning: Database models not provided to threadCreate event. Listings will not be created."
			);
		}

		// Wait for the first message in the thread
		let firstMessage;
		try {
			do {
				firstMessage = await WaitStarterMessage(thread);
			} while (!firstMessage);
		} catch (err) {
			console.error("Error fetching first message:", err);
			return;
		}

		const parsed = parseThreadName(thread.name);
		console.log(parsed);

		if (!parsed) return;

		if (parsed.mismatched) {
			thread.send(
				"⚠️ Your thread title seems mismatched or incomplete. Please edit, matching format: `[Region] [H/W] Item [H/W] Offer`"
			);
			return;
		}

		const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
		const confirmation = `<@${firstMessage.author.id}> It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this correct?`;

		// Create a Listing immediately with status 'pending'
		let listing;
		try {
			if (!User || !Listing) throw new Error("Database models not provided.");

			// Ensure the User exists
			const [user] = await User.findOrCreate({
				where: { id: firstMessage.author.id },
				defaults: { username: firstMessage.author.username },
			});

			listing = await Listing.create({
				userId: firstMessage.author.id,
				region: parsed.region,
				type: parsed.type,
				item: parsed.item,
				offer: parsed.offer,
				threadId: thread.id,
				status: "pending", // initial status
			});

			console.log("Listing created immediately with status 'pending'");
		} catch (error) {
			console.error("Error creating initial Listing:", error);
			thread.send("An error occurred while creating your listing. Please try again.");
			return;
		}

		const confirmationMessage = await thread.send({
			content: confirmation,
			components: [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder()
						.setCustomId("confirm")
						.setLabel("Confirm")
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
				),
			],
		});

		const filter = (interaction) => {
			return (
				interaction.user &&
				interaction.customId &&
				["confirm", "deny"].includes(interaction.customId) &&
				interaction.user.id === firstMessage?.author?.id
			);
		};

		const collector = confirmationMessage.createMessageComponentCollector({
			filter,
		});

		collector.on("collect", async (interaction) => {
			if (!interaction.isButton()) return;

			// Check if the user is the thread starter
			if (interaction.user.id !== firstMessage?.author?.id) {
				await interaction.reply({
					content: "Only the listing author can respond to this confirmation.",
					flags: 64,
				});
				return;
			}

			if (!firstMessage?.author) {
				await interaction.update({
					content: "Error: could not identify the user who created this thread.",
					components: [],
				});
				return;
			}

			try {
				if (!listing && Listing) {
					// Attempt to reload the listing from the database in case of bot restart
					listing = await Listing.findOne({ where: { threadId: thread.id } });
				}

				if (!listing) {
					await interaction.update({
						content:
							"No listing found for this forum post. It may have been lost due to a bot restart or database issue.",
						components: [],
					});
					return;
				}

				if (interaction.customId === "confirm") {
					// Calculate reputation
					let purchasesCount = 0;
					let salesCount = 0;
					let tradesCount = 0;
					if (Transaction) {
						try {
							purchasesCount = await Transaction.count({
								where: { buyerId: firstMessage.author.id, status: "confirmed" },
							});
							salesCount = await Transaction.count({
								where: { sellerId: firstMessage.author.id, status: "confirmed" },
							});
							tradesCount = await Transaction.count({
								where: {
									[Op.or]: [
										{ sellerId: firstMessage.author.id },
										{ buyerId: firstMessage.author.id },
									],
									type: { [Op.in]: ["trade", "money+trade"] },
									status: "confirmed",
								},
							});
						} catch (error) {
							console.error("Error fetching reputation:", error);
						}
					}

					// Update status to confirmed
					await listing.update({ status: "confirmed" });

					const reputationText = `**Seller Reputation** for <@${firstMessage.author.id}>\n\n**Confirmed Purchases:** ${purchasesCount}\n**Confirmed Sales:** ${salesCount}\n**Confirmed Trades:** ${tradesCount}`;

					await interaction.update({
						content: reputationText,
						components: [],
					});
				} else {
					// Denied: update status to denied
					await listing.update({ status: "denied" });

					await interaction.update({
						content:
							"Please edit your forum title to match the following format:\n```[Region] [H/W] Item [H/W] Offer```",
						components: [],
					});
				}
			} catch (error) {
				console.error("Error updating Listing:", error);
				await interaction.update({
					content: "An error occurred while updating your listing. Please try again.",
					components: [],
				});
			}

			collector.stop();
		});

		collector.on("end", (collected) => {
			if (collected.size === 0) {
				thread.send("No response received.");
			}
		});

		collector.on("error", (error) => {
			console.error("Collector error:", error);
			thread.send("An error occurred while processing your response.");
		});
	},
};
