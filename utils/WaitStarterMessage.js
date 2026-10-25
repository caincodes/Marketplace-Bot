async function WaitStarterMessage(thread) {
	try {
		const message = await thread.fetchStarterMessage();
		return message;
	} catch (error) {
		// 10008 (Unknown Message) means the starter message isn't available yet
		// or the thread was deleted; treat as "no message" so the caller can retry.
		if (error.name === "DiscordAPIError[10008]") {
			return null;
		}
		// Propagate any other error to the caller instead of killing the whole
		// process, which previously exited with a success code and took the bot down.
		throw error;
	}
}

/**
 * Retry WaitStarterMessage with a linear backoff, giving up after `attempts`
 * tries so a deleted starter message can't spin forever against the API.
 * @param {Object} thread - Discord thread
 * @param {Object} [options]
 * @param {number} [options.attempts=5] - Maximum number of fetches
 * @param {number} [options.delayMs=1000] - Base delay between fetches
 * @returns {Promise<Object|null>} The starter message, or null if it never appeared
 */
async function waitForStarterMessage(thread, { attempts = 5, delayMs = 1000 } = {}) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const message = await WaitStarterMessage(thread);
		if (message) return message;
		if (attempt < attempts) {
			await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
		}
	}
	return null;
}

module.exports = WaitStarterMessage;
module.exports.waitForStarterMessage = waitForStarterMessage;
