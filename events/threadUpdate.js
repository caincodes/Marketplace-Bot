const parseThreadName = require("../utils/parseThreadName");
const { getUserReputation } = require("../utils/reputation");
const { updateForumTag } = require("../utils/forumTags");
const { createPendingListing, fetchFirstMessage } = require("../utils/listings");
const { buildConfirmationRow, createAuthorFilter } = require("../utils/components");
const { replyEphemeral } = require("../utils/replies");

module.exports = {
	name: "threadUpdate",
	async execute(oldThread, newThread, models = {}) {
		if (oldThread.name === newThread.name) {
			return;
		}

		const { User, Listing, Transaction, Rating } = models;

		if (!User || !Listing) {
			return;
		}

		try {
			const existingListing = await Listing.findOne({ where: { threadId: newThread.id } });

			if (!existingListing) {
				// Check if the new title is properly formatted
				const parsed = parseThreadName(newThread.name);
				if (!parsed || parsed.mismatched) {
					return;
				}

				// Title is now properly formatted, create a new listing
				let firstMessage;
				try {
					firstMessage = await fetchFirstMessage(newThread);
				} catch (err) {
					console.error("[threadUpdate] Error fetching first message:", err);
					return;
				}

				if (!firstMessage) {
					return;
				}

				// Create a Listing with status 'pending'
				try {
					await createPendingListing(newThread, parsed, firstMessage.author, { User, Listing });
				} catch (error) {
					console.error("Error creating initial Listing from update:", error);
					newThread.send("An error occurred while creating your listing. Please try again.");
					return;
				}

				const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
				const confirmation = `<@${firstMessage.author.id}> **Thread updated!** It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this correct?`;
				const confirmationMessage = await newThread.send({
					content: confirmation,
					components: [buildConfirmationRow()],
				});

				const filter = createAuthorFilter(firstMessage?.author?.id);

				const collector = confirmationMessage.createMessageComponentCollector({ filter });

				collector.on("collect", async (interaction) => {
					if (!interaction.isButton()) return;

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
						const currentListing = await Listing.findOne({ where: { threadId: newThread.id } });

						if (!currentListing) {
							await interaction.update({
								content:
									"No listing found for this forum post. It may have been lost due to a database issue.",
								components: [],
							});
							return;
						}

						if (interaction.customId === "confirm") {
							await currentListing.update({ status: "confirmed" });

							// Update forum tag based on type
							await updateForumTag(newThread, currentListing.type);

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
							await currentListing.update({ type: "TRADE", status: "confirmed" });

							// Update forum tag to "want to trade"
							await updateForumTag(newThread, "TRADE");

							// Get comprehensive reputation using shared utility
							const reputationText = await getUserReputation(firstMessage.author.id, {
								Listing,
								Transaction,
								Rating,
							});

							await interaction.update({
								content: `Trade listing confirmed! ${reputationText}`,
								components: [],
							});
						} else {
							await currentListing.update({ status: "pending" });
							await interaction.update({
								content:
									"Please edit your forum title to match the following format:\n```[Region] [H/W] Item [H/W] Offer```",
								components: [],
							});
						}
					} catch (error) {
						console.error("[threadUpdate] Error updating new listing in collector:", error);
						await interaction.update({
							content: "An error occurred while updating your listing. Please try again.",
							components: [],
						});
					}

					collector.stop();
				});

				collector.on("end", (collected) => {
					if (collected.size === 0) {
						newThread.send("No response received. Your listing remains pending.");
					}
				});

				collector.on("error", (error) => {
					console.error("[threadUpdate] Collector error for new listing:", error);
					newThread.send("An error occurred while processing your response.");
				});

				return;
			}

			if (existingListing.status === "confirmed") {
				const parsed = parseThreadName(newThread.name);
				if (parsed && !parsed.mismatched) {
					await existingListing.update({
						region: parsed.region,
						type: parsed.type,
						item: parsed.item,
						offer: parsed.offer,
					});
				}
				return;
			}

			const parsed = parseThreadName(newThread.name);

			if (!parsed) {
				return;
			}

			if (parsed.mismatched) {
				await newThread.send(
					"⚠️ Your updated thread title seems mismatched or incomplete. Please edit, matching format: `[Region] [H/W] Item [H/W] Offer`"
				);
				return;
			}

			await existingListing.update({
				region: parsed.region,
				type: parsed.type,
				item: parsed.item,
				offer: parsed.offer,
			});

			let firstMessage;
			try {
				firstMessage = await fetchFirstMessage(newThread);
			} catch (err) {
				console.error("[threadUpdate] Error fetching first message:", err);
				return;
			}

			if (!firstMessage) {
				return;
			}

			const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
			const confirmation = `<@${firstMessage.author.id}> **Thread updated!** It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this still correct?`;
			const confirmationMessage = await newThread.send({
				content: confirmation,
				components: [buildConfirmationRow()],
			});

			const filter = createAuthorFilter(firstMessage?.author?.id);

			const collector = confirmationMessage.createMessageComponentCollector({ filter });

			collector.on("collect", async (interaction) => {
				if (!interaction.isButton()) return;

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
					const currentListing = await Listing.findOne({ where: { threadId: newThread.id } });

					if (!currentListing) {
						await interaction.update({
							content:
								"No listing found for this forum post. It may have been lost due to a database issue.",
							components: [],
						});
						return;
					}

					if (interaction.customId === "confirm") {
						await currentListing.update({ status: "confirmed" });

						// Update forum tag based on type
						await updateForumTag(newThread, currentListing.type);

						await interaction.update({
							content: `✅ **Listing confirmed!** Your updated listing is now active.`,
							components: [],
						});
					} else if (interaction.customId === "trade") {
						await currentListing.update({ type: "TRADE", status: "confirmed" });

						// Update forum tag to "want to trade"
						await updateForumTag(newThread, "TRADE");

						await interaction.update({
							content: `✅ **Trade listing confirmed!** Your updated trade listing is now active.`,
							components: [],
						});
					} else {
						await currentListing.update({ status: "pending" });
						await interaction.update({
							content:
								"Please edit your forum title to match the following format:\n```[Region] [H/W] Item [H/W] Offer```",
							components: [],
						});
					}
				} catch (error) {
					console.error("[threadUpdate] Error updating listing in collector:", error);
					await interaction.update({
						content: "An error occurred while updating your listing. Please try again.",
						components: [],
					});
				}

				collector.stop();
			});

			collector.on("end", (collected) => {
				if (collected.size === 0) {
					newThread.send("No response received. Your listing remains pending.");
				}
			});

			collector.on("error", (error) => {
				console.error("[threadUpdate] Collector error:", error);
				newThread.send("An error occurred while processing your response.");
			});
		} catch (error) {
			console.error("[threadUpdate] Error in execute:", error);
		}
	},
};
