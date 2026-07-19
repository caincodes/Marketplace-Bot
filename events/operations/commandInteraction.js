const fs = require("fs");
const path = require("path");

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
						// The command may have already replied or deferred before throwing,
						// in which case interaction.reply() would itself throw. Pick the right
						// method and guard it so the error response never fails silently.
						const errorMessage = {
							content: "There was an error while executing this command!",
							flags: 64,
						};
						try {
							if (interaction.replied || interaction.deferred) {
								await interaction.followUp(errorMessage);
							} else {
								await interaction.reply(errorMessage);
							}
						} catch (replyError) {
							console.error(`Error sending error reply for ${commandName}:`, replyError);
						}
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
