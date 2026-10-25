const parseThreadName = require("../utils/parseThreadName");
const {
	createPendingListing,
	fetchFirstMessage,
	isMarketplaceThread,
	buildPromptText,
	sendListingPrompt,
} = require("../utils/listings");

module.exports = {
	name: "threadCreate",
	async execute(thread, newlyCreated, models = {}) {
		// threadCreate also fires when the bot is added to an existing thread
		if (!newlyCreated || !isMarketplaceThread(thread)) return;

		const { User, Listing } = models;

		if (!User || !Listing) {
			console.warn(
				"Warning: Database models not provided to threadCreate event. Listings will not be created.",
			);
			return;
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

		if (await Listing.findOne({ where: { threadId: thread.id } })) return;

		const parsed = parseThreadName(thread.name);

		if (parsed.mismatched) {
			await thread.send(
				"⚠️ Your thread title seems mismatched or incomplete. Please edit, matching format: `[Region] [H/W] Item [H/W] Offer`",
			);
			return;
		}

		let listing;
		try {
			listing = await createPendingListing(thread, parsed, firstMessage.author, { User, Listing });
		} catch (error) {
			console.error("Error creating initial Listing:", error);
			await thread.send("An error occurred while creating your listing. Please try again.");
			return;
		}
		if (!listing) return;

		await sendListingPrompt(thread, buildPromptText(firstMessage.author.id, parsed));
	},
};
