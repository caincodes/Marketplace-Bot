const { getCommands } = require("../utils/commands");

module.exports = {
	name: "clientReady",
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);

		const commands = [...getCommands().values()].map((command) => command.data.toJSON());

		try {
			await client.application.commands.set(commands);
			console.log("Successfully reloaded application (/) commands.");
		} catch (error) {
			console.error(error);
		}
	},
};
