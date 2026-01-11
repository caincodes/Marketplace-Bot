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
		console.log("[threadUpdate] Event triggered");

		if (oldThread.name === newThread.name) {
			console.log("[threadUpdate] Thread name did not change, exiting");
			return;
		}
		console.log(
			`[threadUpdate] Thread name changed from "${oldThread.name}" to "${newThread.name}"`
		);

		const { User, Listing, Transaction, Rating } = models;

		if (!User || !Listing) {
			console.warn(
				"[threadUpdate] Warning: Database models not provided. Listings will not be updated."
			);
			return;
		}

		try {
			const existingListing = await Listing.findOne({ where: { threadId: newThread.id } });
			console.log("[threadUpdate] Fetched existing listing:", existingListing?.toJSON());

			if (!existingListing) {
				console.log("[threadUpdate] No existing listing found, checking if title is now properly formatted");
				
				// Check if the new title is properly formatted
				const parsed = parseThreadName(newThread.name);
				console.log("[threadUpdate] Parsed thread name for new listing:", parsed);
				
				if (!parsed || parsed.mismatched) {
					console.log("[threadUpdate] Title still not properly formatted, ignoring");
					return;
				}
				
				// Title is now properly formatted, create a new listing
				console.log("[threadUpdate] Creating new listing from thread update");
				
				let firstMessage;
				try {
					const messages = await newThread.messages.fetch({ limit: 1 });
					firstMessage = messages.first();
					console.log("[threadUpdate] Fetched first message:", firstMessage?.id);
				} catch (err) {
					console.error("[threadUpdate] Error fetching first message:", err);
					return;
				}

				if (!firstMessage) {
					console.log("[threadUpdate] No first message found, exiting");
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
						if (forumChannel && forumChannel.type === 15) { // Forum channel type
							const pendingTag = forumChannel.availableTags.find(tag => tag.name.toLowerCase() === 'pending');
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

				console.log("[threadUpdate] Sending confirmation message for new listing");
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
				console.log("[threadUpdate] Confirmation message sent:", confirmationMessage.id);

				const filter = (interaction) => {
					return (
						interaction.user &&
						interaction.customId &&
						["confirm", "trade", "deny"].includes(interaction.customId) &&
						interaction.user.id === firstMessage?.author?.id
					);
				};

				const collector = confirmationMessage.createMessageComponentCollector({ filter });
				console.log("[threadUpdate] Collector created for new listing");

				collector.on("collect", async (interaction) => {
					console.log("[threadUpdate] Collector received interaction for new listing:", interaction.customId);
					if (!interaction.isButton()) return;

					if (interaction.user.id !== firstMessage?.author?.id) {
						console.log("[threadUpdate] Interaction by non-author:", interaction.user.id);
						await interaction.reply({
							content: "Only the listing author can respond to this confirmation.",
							flags: 64,
						});
						return;
					}

					if (!firstMessage?.author) {
						console.log("[threadUpdate] No author found for first message");
						await interaction.update({
							content: "Error: could not identify the user who created this thread.",
							components: [],
						});
						return;
					}

					try {
						const currentListing = await Listing.findOne({ where: { threadId: newThread.id } });
						console.log("[threadUpdate] Reloaded listing for interaction:", currentListing?.toJSON());

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
							console.log("[threadUpdate] New listing confirmed by user");
							
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
							console.log("[threadUpdate] New listing changed to trade by user");
							
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
							console.log("[threadUpdate] New listing denied by user");
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
					console.log(`[threadUpdate] Collector ended for new listing. Collected ${collected.size} interactions.`);
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
				console.log("[threadUpdate] Listing already confirmed, updating silently if parsed");
				const parsed = parseThreadName(newThread.name);
				console.log("[threadUpdate] Parsed thread name:", parsed);
				if (parsed && !parsed.mismatched) {
					await existingListing.update({
						region: parsed.region,
						type: parsed.type,
						item: parsed.item,
						offer: parsed.offer,
					});
					console.log("[threadUpdate] Existing listing updated silently");
				}
				return;
			}

			const parsed = parseThreadName(newThread.name);
			console.log("[threadUpdate] Parsed thread name for pending listing:", parsed);

			if (!parsed) {
				console.log("[threadUpdate] Parsing failed, exiting");
				return;
			}

			if (parsed.mismatched) {
				console.log("[threadUpdate] Parsed thread mismatched, sending warning");
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
			console.log("[threadUpdate] Listing updated with parsed data");

			let firstMessage;
			try {
				const messages = await newThread.messages.fetch({ limit: 1 });
				firstMessage = messages.first();
				console.log("[threadUpdate] Fetched first message:", firstMessage?.id);
			} catch (err) {
				console.error("[threadUpdate] Error fetching first message:", err);
				return;
			}

			if (!firstMessage) {
				console.log("[threadUpdate] No first message found, exiting");
				return;
			}

			const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
			const confirmation = `<@${firstMessage.author.id}> **Thread updated!** It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this still correct?`;

			console.log("[threadUpdate] Sending confirmation message");
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
			console.log("[threadUpdate] Confirmation message sent:", confirmationMessage.id);

			const filter = (interaction) => {
				return (
					interaction.user &&
					interaction.customId &&
					["confirm", "trade", "deny"].includes(interaction.customId) &&
					interaction.user.id === firstMessage?.author?.id
				);
			};

			const collector = confirmationMessage.createMessageComponentCollector({ filter });
			console.log("[threadUpdate] Collector created");

			collector.on("collect", async (interaction) => {
				console.log("[threadUpdate] Collector received interaction:", interaction.customId);
				if (!interaction.isButton()) return;

				if (interaction.user.id !== firstMessage?.author?.id) {
					console.log("[threadUpdate] Interaction by non-author:", interaction.user.id);
					await interaction.reply({
						content: "Only the listing author can respond to this confirmation.",
						flags: 64,
					});
					return;
				}

				if (!firstMessage?.author) {
					console.log("[threadUpdate] No author found for first message");
					await interaction.update({
						content: "Error: could not identify the user who created this thread.",
						components: [],
					});
					return;
				}

				try {
					const currentListing = await Listing.findOne({ where: { threadId: newThread.id } });
					console.log("[threadUpdate] Reloaded listing for interaction:", currentListing?.toJSON());

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
						console.log("[threadUpdate] Listing confirmed by user");

						// Update forum tag based on type
						await updateForumTag(newThread, currentListing.type);

						await interaction.update({
							content: `✅ **Listing confirmed!** Your updated listing is now active.`,
							components: [],
						});
					} else if (interaction.customId === "trade") {
						await currentListing.update({ type: "TRADE", status: "confirmed" });
						console.log("[threadUpdate] Listing changed to trade by user");

						// Update forum tag to "want to trade"
						await updateForumTag(newThread, "TRADE");

						await interaction.update({
							content: `✅ **Trade listing confirmed!** Your updated trade listing is now active.`,
							components: [],
						});
					} else {
						await currentListing.update({ status: "pending" });
						console.log("[threadUpdate] Listing denied by user");
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
				console.log(`[threadUpdate] Collector ended. Collected ${collected.size} interactions.`);
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
