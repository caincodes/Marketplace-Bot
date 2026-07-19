const fs = require("fs");
const path = require("path");
const { replyEphemeral } = require("../../utils/replies");

module.exports = {
	name: "commandInteraction",
	async execute(interaction, { User, Listing, Transaction, Rating, client }) {
		const commandsPath = path.join(__dirname, "../../commands");
		const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

		for (const file of commandFiles) {
			try {
				const command = require(path.join(commandsPath, file));

				// Handle both old and new command formats
				const commandName = command.data ? command.data.name : command.name;

				if (interaction.commandName === commandName) {
					try {
						await command.execute(interaction, { User, Listing, Transaction, Rating, client });
					} catch (error) {
						console.error(`Error executing command ${commandName}:`, error);
						await replyEphemeral(interaction, "There was an error while executing this command!");
					}
					return;
				}
			} catch (requireError) {
				console.error(`Error loading command file ${file}:`, requireError);
				// Continue to next command file
			}
		}
	},
};
