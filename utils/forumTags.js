const FORUM_CHANNEL_TYPE = 15;

// Forum tag names to apply for each listing type
const LISTING_TYPE_TAGS = {
	SELL: "for sale",
	BUY: "want to buy",
	TRADE: "want to trade",
};

// Thread name prefixes applied when a listing is closed
const CLOSE_PREFIXES = {
	SELL: "[SOLD]",
	BUY: "[FOUND]",
	TRADE: "[TRADED]",
};

/**
 * Apply a single forum tag (by name, case-insensitive) to a thread.
 * @param {Object} thread - Discord thread
 * @param {string} tagName - The tag name to look up and apply
 * @returns {Promise<boolean>} true if the tag was found and applied
 */
async function applyForumTag(thread, tagName) {
	const forumChannel = thread.parent;
	if (!forumChannel || forumChannel.type !== FORUM_CHANNEL_TYPE) return false;

	const tag = forumChannel.availableTags.find(
		(t) => t.name.toLowerCase() === tagName.toLowerCase(),
	);
	if (!tag) return false;

	await thread.setAppliedTags([tag.id]);
	return true;
}

/**
 * Update a thread's forum tag based on the listing type.
 * @param {Object} thread - Discord thread
 * @param {string} type - Listing type (SELL, BUY, TRADE)
 */
async function updateForumTag(thread, type) {
	const tagName = LISTING_TYPE_TAGS[type];
	if (!tagName) return;

	try {
		await applyForumTag(thread, tagName);
	} catch (error) {
		console.error("Error updating forum tag:", error);
	}
}

/**
 * Get the thread name prefix for a closed listing.
 * @param {string} type - Listing type (SELL, BUY, TRADE)
 * @returns {string} The prefix, defaulting to "[CLOSED]"
 */
function getClosePrefix(type) {
	return CLOSE_PREFIXES[type] || "[CLOSED]";
}

module.exports = { FORUM_CHANNEL_TYPE, applyForumTag, updateForumTag, getClosePrefix };
