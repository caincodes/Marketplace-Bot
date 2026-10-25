const parseThreadName = require("../utils/parseThreadName");
const {
	createPendingListing,
	fetchFirstMessage,
	isMarketplaceThread,
	buildPromptText,
	sendListingPrompt,
} = require("../utils/listings");

module.exports = {
	name: "threadUpdate",
	async execute(oldThread, newThread, models = {}) {
		if (oldThread.name === newThread.name || !isMarketplaceThread(newThread)) {
			return;
		}

		const { User, Listing } = models;

		if (!User || !Listing) {
			return;
		}

		try {
			const parsed = parseThreadName(newThread.name);
			const existingListing = await Listing.findOne({ where: { threadId: newThread.id } });

			if (!existingListing) {
				// Title is now properly formatted, create a new listing
				if (parsed.mismatched) {
					return;
				}

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

				try {
					await createPendingListing(newThread, parsed, firstMessage.author, { User, Listing });
				} catch (error) {
					console.error("Error creating initial Listing from update:", error);
					await newThread.send("An error occurred while creating your listing. Please try again.");
					return;
				}

				await sendListingPrompt(newThread, buildPromptText(firstMessage.author.id, parsed, true));
				return;
			}

			if (existingListing.status === "confirmed") {
				if (!parsed.mismatched) {
					await existingListing.update({
						region: parsed.region,
						type: parsed.type,
						item: parsed.item,
						offer: parsed.offer,
					});
				}
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

			await sendListingPrompt(newThread, buildPromptText(existingListing.userId, parsed, true));
		} catch (error) {
			console.error("[threadUpdate] Error in execute:", error);
		}
	},
};
