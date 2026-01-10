async function WaitStarterMessage(thread) {
	try {
		const message = await thread.fetchStarterMessage();
		return message;
	} catch (error) {
		if (error.name !== "DiscordAPIError[10008]") {
			console.log(error);
			process.exit();
		}
		return null;
	}
}

module.exports = WaitStarterMessage;
