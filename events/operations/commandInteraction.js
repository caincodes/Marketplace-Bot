const { getCommands } = require("../../utils/commands");

module.exports = {
	name: "commandInteraction",
	async execute(interaction, models) {
		const command = getCommands().get(interaction.commandName);
		if (!command) return;

		try {
			await command.execute(interaction, models);
		} catch (error) {
			console.error(`Error executing command ${interaction.commandName}:`, error);
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
				console.error(`Error sending error reply for ${interaction.commandName}:`, replyError);
			}
		}
	},
};
