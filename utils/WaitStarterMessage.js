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

module.exports = WaitStarterMessage;
