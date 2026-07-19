const { applyForumTag } = require("./forumTags");

/**
 * Fetch the first (starter) message of a thread.
 * @param {Object} thread - Discord thread
 * @returns {Promise<Object|undefined>} The first message, or undefined
 */
async function fetchFirstMessage(thread) {
	const messages = await thread.messages.fetch({ limit: 1 });
	return messages.first();
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

module.exports = { fetchFirstMessage, createPendingListing };
