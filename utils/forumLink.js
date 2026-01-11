/**
 * Get the Discord forum post link from transaction data
 * @param {Object} transaction - Transaction record
 * @param {Object} listing - Listing record
 * @param {Object} client - Discord client
 * @returns {string} Forum post link or empty string
 */
async function getForumLink(transaction, listing, client) {
	const forumChannelId = listing?.threadId || transaction.forumPostId;
	if (!forumChannelId) return "";

	try {
		const channel = await client.channels.fetch(forumChannelId);
		const guildId = channel?.guild?.id;
		if (guildId) {
			return `https://discord.com/channels/${guildId}/${forumChannelId}`;
		}
	} catch (error) {
		console.error("Error fetching forum link:", error);
	}
	return "";
}

/**
 * Fetch transaction and listing data together
 * @param {number} transactionId - Transaction ID
 * @param {Object} models - Database models
 * @returns {Promise<Object>} { transaction, listing } or null if not found
 */
async function fetchTransactionAndListing(transactionId, { Transaction, Listing }) {
	const transaction = await Transaction.findByPk(transactionId);
	if (!transaction) return null;

	const listing = await Listing.findByPk(transaction.listingId);
	return { transaction, listing };
}

/**
 * Format forum link with prefix and newline
 * @param {string} forumLink - The forum link URL
 * @returns {string} Formatted link with "Forum Post: " prefix or empty string
 */
function formatForumLink(forumLink) {
	return forumLink ? `Forum Post: ${forumLink}\n` : "";
}

module.exports = { getForumLink, fetchTransactionAndListing, formatForumLink };
