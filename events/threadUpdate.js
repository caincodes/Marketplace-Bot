const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const parseThreadName = require("../utils/parseThreadName");
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
					const messages = await newThread.messages.fetch({ limit: 1 });
					firstMessage = messages.first();
				} catch (err) {
					console.error("[threadUpdate] Error fetching first message:", err);
					return;
				}

				if (!firstMessage) {
					return;
				}

				// Create a Listing with status 'pending'
				let newListing;
				try {
					if (!User || !Listing) throw new Error("Database models not provided.");

					// Ensure the User exists
					const [user] = await User.findOrCreate({
						where: { id: firstMessage.author.id },
						defaults: { username: firstMessage.author.username },
					});

					newListing = await Listing.create({
						userId: firstMessage.author.id,
						region: parsed.region,
						type: parsed.type,
						item: parsed.item,
						offer: parsed.offer,
						threadId: newThread.id,
						status: "pending", // initial status
					});

					// Apply "pending" tag to the forum thread
					try {
						const forumChannel = newThread.parent;
						if (forumChannel && forumChannel.type === 15) {
							// Forum channel type
							const pendingTag = forumChannel.availableTags.find(
								(tag) => tag.name.toLowerCase() === "pending"
							);
							if (pendingTag) {
								await newThread.setAppliedTags([pendingTag.id]);
							}
						}
					} catch (error) {
						console.error("Error applying pending tag:", error);
					}
				} catch (error) {
					console.error("Error creating initial Listing from update:", error);
					newThread.send("An error occurred while creating your listing. Please try again.");
					return;
				}

				const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
				const confirmation = `<@${firstMessage.author.id}> **Thread updated!** It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this correct?`;
				const confirmationMessage = await newThread.send({
					content: confirmation,
					components: [
						new ActionRowBuilder().addComponents(
							new ButtonBuilder()
								.setCustomId("confirm")
								.setLabel("Confirm")
								.setStyle(ButtonStyle.Success),
							new ButtonBuilder()
								.setCustomId("trade")
								.setLabel("Trade")
								.setStyle(ButtonStyle.Primary),
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

				const collector = confirmationMessage.createMessageComponentCollector({ filter });

				collector.on("collect", async (interaction) => {
					if (!interaction.isButton()) return;

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
				const messages = await newThread.messages.fetch({ limit: 1 });
				firstMessage = messages.first();
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
				components: [
					new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId("confirm")
							.setLabel("Confirm")
							.setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId("trade")
							.setLabel("Trade")
							.setStyle(ButtonStyle.Primary),
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

			const collector = confirmationMessage.createMessageComponentCollector({ filter });

			collector.on("collect", async (interaction) => {
				if (!interaction.isButton()) return;

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
