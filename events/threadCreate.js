const parseThreadName = require("../utils/parseThreadName");
const { getUserReputation } = require("../utils/reputation");
const { updateForumTag } = require("../utils/forumTags");
const {
	createPendingListing,
	fetchFirstMessage,
	isMarketplaceThread,
} = require("../utils/listings");
const { buildConfirmationRow, createAuthorFilter } = require("../utils/components");
const { replyEphemeral } = require("../utils/replies");

module.exports = {
	name: "threadCreate",
	async execute(thread, newlyCreated, models = {}) {
		// threadCreate also fires when the bot is added to an existing thread
		if (!newlyCreated || !isMarketplaceThread(thread)) return;

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
			firstMessage = await fetchFirstMessage(thread);
		} catch (err) {
			console.error("Error fetching first message:", err);
			return;
		}

		if (!firstMessage) {
			console.warn(`[threadCreate] Starter message never became available for ${thread.id}`);
			return;
		}

		if (Listing && (await Listing.findOne({ where: { threadId: thread.id } }))) return;

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
			listing = await createPendingListing(thread, parsed, firstMessage.author, { User, Listing });
		} catch (error) {
			console.error("Error creating initial Listing:", error);
			await thread.send("An error occurred while creating your listing. Please try again.");
			return;
		}

		const confirmationMessage = await thread.send({
			content: confirmation,
			components: [buildConfirmationRow()],
		});

		const filter = createAuthorFilter(firstMessage?.author?.id);

		const collector = confirmationMessage.createMessageComponentCollector({
			filter,
		});

		collector.on("collect", async (interaction) => {
			if (!interaction.isButton()) return;

			// Check if the user is the thread starter
			if (interaction.user.id !== firstMessage?.author?.id) {
				await replyEphemeral(
					interaction,
					"Only the listing author can respond to this confirmation."
				);
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

				if (interaction.customId === "confirm" || interaction.customId === "trade") {
					// Determine if trade button was clicked
					const isTradeButton = interaction.customId === "trade";

					// Prepare update data
					const updateData = { status: "confirmed" };
					if (isTradeButton) {
						updateData.type = "TRADE";
					}

					// Update listing
					await listing.update(updateData);

					// Update forum tag
					const tagType = isTradeButton ? "TRADE" : listing.type;
					await updateForumTag(thread, tagType);

					// Get reputation
					const reputationText = await getUserReputation(firstMessage.author.id, {
						Listing,
						Transaction,
						Rating,
					});

					// Prepare message content
					const messageContent = isTradeButton
						? `Trade listing confirmed!\n${reputationText}`
						: reputationText;

					// Update interaction
					await interaction.update({
						content: messageContent,
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
