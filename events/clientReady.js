const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const fs = require("fs");
const path = require("path");

module.exports = {
	name: "clientReady",
	once: true,
	async execute(client, models = {}) {
		console.log(`Logged in as ${client.user.tag}`);

		// Load commands
		const commands = [];
		const commandsPath = path.join(__dirname, "../commands");
		const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);
			const command = require(filePath);

			// Handle both old and new command formats
			let commandData;
			if (command.data) {
				// New format with SlashCommandBuilder
				commandData = command.data.toJSON();
			} else {
				// Old format with direct properties
				commandData = {
					name: command.name,
					description: command.description,
					options: command.options,
				};
			}

			commands.push(commandData);
		}

		const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

		try {
			await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
			console.log("Successfully reloaded application (/) commands.");
		} catch (error) {
			console.error(error);
		}
	},
};
