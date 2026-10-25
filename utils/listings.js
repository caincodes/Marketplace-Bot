const { applyForumTag, FORUM_CHANNEL_TYPE } = require("./forumTags");
const { waitForStarterMessage } = require("./WaitStarterMessage");
const { buildConfirmationRow } = require("./components");

// Latest confirmation prompt message ID per thread, so a re-prompt can retire the
// previous prompt's buttons. In-memory only: after a restart older prompts stay
// clickable, which is harmless because the button handler always acts on the
// listing's current state.
const latestPromptIds = new Map();

/**
 * Fetch the first (starter) message of a thread. Uses the starter message
 * rather than messages.fetch(), which returns the most recent message (often
 * the bot's own reply).
 * @param {Object} thread - Discord thread
 * @returns {Promise<Object|null>} The first message, or null
 */
async function fetchFirstMessage(thread) {
	return waitForStarterMessage(thread);
}

/**
 * Whether a thread is a post in the marketplace forum. Any forum qualifies
 * unless MARKETPLACE_FORUM_ID restricts the bot to a single forum channel.
 * @param {Object} thread - Discord thread
 * @returns {boolean}
 */
function isMarketplaceThread(thread) {
	if (thread.parent?.type !== FORUM_CHANNEL_TYPE) return false;
	const forumId = process.env.MARKETPLACE_FORUM_ID;
	return !forumId || thread.parentId === forumId;
}

/**
 * Create a pending Listing from a parsed thread name, ensuring the author
 * exists as a User and applying the "pending" forum tag.
 * @param {Object} thread - Discord thread
 * @param {Object} parsed - Parsed thread name (region, type, item, offer)
 * @param {Object} author - Message author ({ id, username })
 * @param {Object} models - Database models ({ User, Listing })
 * @returns {Promise<Object>} The created listing
 */
async function createPendingListing(thread, parsed, author, { User, Listing }) {
	if (!User || !Listing) throw new Error("Database models not provided.");

	// Ensure the User exists
	await User.findOrCreate({
		where: { id: author.id },
		defaults: { username: author.username },
	});

	const listing = await Listing.create({
		userId: author.id,
		region: parsed.region,
		type: parsed.type,
		item: parsed.item,
		offer: parsed.offer,
		threadId: thread.id,
		status: "pending", // initial status
	});

	// Apply "pending" tag to the forum thread
	try {
		await applyForumTag(thread, "pending");
	} catch (error) {
		console.error("Error applying pending tag:", error);
	}

	return listing;
}

/**
 * Build the "is this correct?" prompt text for a parsed listing.
 * @param {string} authorId - The listing author's user ID
 * @param {Object} parsed - Parsed thread name (type, item, offer)
 * @param {boolean} [updated=false] - Whether the prompt follows a title edit
 * @returns {string}
 */
function buildPromptText(authorId, parsed, updated = false) {
	const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
	const prefix = updated ? "**Thread updated!** " : "";
	return `<@${authorId}> ${prefix}It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this correct?`;
}

/**
 * Post a Confirm / Trade / Deny prompt in a thread, removing the buttons from
 * the thread's previous prompt so only the latest one can be answered.
 * @param {Object} thread - Discord thread
 * @param {string} content - Prompt text
 * @returns {Promise<Object>} The sent message
 */
async function sendListingPrompt(thread, content) {
	const previousId = latestPromptIds.get(thread.id);
	const message = await thread.send({ content, components: [buildConfirmationRow()] });
	latestPromptIds.set(thread.id, message.id);

	if (previousId) {
		try {
			await thread.messages.edit(previousId, { components: [] });
		} catch (error) {
			console.error("Error retiring previous listing prompt:", error);
		}
	}
	return message;
}

/**
 * Stop tracking a thread's prompt once it has been answered.
 * @param {string} threadId - Thread ID
 */
function forgetListingPrompt(threadId) {
	latestPromptIds.delete(threadId);
}

module.exports = {
	fetchFirstMessage,
	isMarketplaceThread,
	createPendingListing,
	buildPromptText,
	sendListingPrompt,
	forgetListingPrompt,
};
