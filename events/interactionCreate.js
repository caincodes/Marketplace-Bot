const fs = require("fs");
const path = require("path");

module.exports = {
	name: "interactionCreate",
	async execute(interaction, models) {
		try {
			if (interaction.isCommand()) {
				const commandHandler = require("./interactions/commandInteraction");
				await commandHandler.execute(interaction, models);
			} else if (interaction.isButton()) {
				const buttonHandler = require("./interactions/buttonInteraction");
				await buttonHandler.execute(interaction, models);
			} else if (interaction.isModalSubmit()) {
				const modalHandler = require("./interactions/modalInteraction");
				await modalHandler.execute(interaction, models);
			}
		} catch (error) {
			console.error("Error in interactionCreate:", error);
			// Only reply if we haven't already
			if (!interaction.replied && !interaction.deferred) {
				try {
					await interaction.reply({
						content: "An unexpected error occurred.",
						flags: 64,
					});
				} catch (replyError) {
					console.error("Error sending error reply:", replyError);
				}
			}
		}
	},
};
