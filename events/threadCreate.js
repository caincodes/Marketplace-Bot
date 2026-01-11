const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const parseThreadName = require("../utils/parseThreadName");
const WaitStarterMessage = require("../utils/WaitStarterMessage");
const { getUserReputation } = require("../utils/reputation");

// Helper function to update forum tags based on listing type
async function updateForumTag(thread, type) {
	try {
		const forumChannel = thread.parent;
		if (!forumChannel || forumChannel.type !== 15) return; // Not a forum channel

		let tagName;
		switch (type) {
			case "SELL":
				tagName = "for sale";
				break;
			case "BUY":
				tagName = "want to buy";
				break;
			case "TRADE":
				tagName = "want to trade";
				break;
			default:
				return;
		}

		const tag = forumChannel.availableTags.find(
			(t) => t.name.toLowerCase() === tagName.toLowerCase()
		);
		if (tag) {
			await thread.setAppliedTags([tag.id]);
		}
	} catch (error) {
		console.error("Error updating forum tag:", error);
	}
}

module.exports = {
	name: "threadCreate",
	async execute(thread, models = {}) {
		// Destructure User, Listing, Transaction, and Rating from models
		const { User, Listing, Transaction, Rating } = models;

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

			// Apply "pending" tag to the forum thread
			try {
				const forumChannel = thread.parent;
				if (forumChannel && forumChannel.type === 15) {
					// Forum channel type
					const pendingTag = forumChannel.availableTags.find(
						(tag) => tag.name.toLowerCase() === "pending"
					);
					if (pendingTag) {
						await thread.setAppliedTags([pendingTag.id]);
					}
				}
			} catch (error) {
				console.error("Error applying pending tag:", error);
			}
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
					new ButtonBuilder().setCustomId("trade").setLabel("Trade").setStyle(ButtonStyle.Primary),
					new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
				),
			],
		});

		const filter = (interaction) => {
			return (
				interaction.user &&
				interaction.customId &&
				["confirm", "trade", "deny"].includes(interaction.customId) &&
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
					// Update status to confirmed
					await listing.update({ status: "confirmed" });

					// Update forum tag based on type
					await updateForumTag(thread, listing.type);

					// Get comprehensive reputation using shared utility
					const reputationText = await getUserReputation(firstMessage.author.id, {
						Listing,
						Transaction,
						Rating,
					});

					await interaction.update({
						content: reputationText,
						components: [],
					});
				} else if (interaction.customId === "trade") {
					// Update type to TRADE and status to confirmed
					await listing.update({ type: "TRADE", status: "confirmed" });

					// Update forum tag to "want to trade"
					await updateForumTag(thread, "TRADE");

					// Get comprehensive reputation using shared utility
					const reputationText = await getUserReputation(firstMessage.author.id, {
						Listing,
						Transaction,
						Rating,
					});

					await interaction.update({
						content: `Trade listing confirmed!\n${reputationText}`,
						components: [],
					});
				} else {
					// Denied: keep status as pending so user can edit and get re-prompted
					await listing.update({ status: "pending" });

					await interaction.update({
						content:
							":warning: Your listing will remain pending. Please edit your forum title to match the format:\n```[Region] [H/W] Item [H/W] Offer```",
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
