const fs = require("fs");
const path = require("path");

module.exports = {
	name: "interactionCreate",
	async execute(interaction, { User, Listing, client }) {
		if (interaction.isCommand()) {
			const commandsPath = path.join(__dirname, "../commands");
			const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

			for (const file of commandFiles) {
				const command = require(path.join(commandsPath, file));
				if (interaction.commandName === command.name) {
					try {
						await command.execute(interaction, { User, Listing, client });
					} catch (error) {
						console.error(error);
						await interaction.reply({
							content: "There was an error while executing this command!",
							ephemeral: true,
						});
					}
					return;
				}
			}
		} else if (interaction.isButton()) {
			if (interaction.customId.startsWith("confirm_transaction_")) {
				const parts = interaction.customId.split("_");
				const listingId = parts[2];
				const initiatorId = parts[3];
				const otherId = parts[4];
				const action = parts[5];

				if (interaction.user.id !== initiatorId && interaction.user.id !== otherId) {
					return await interaction.reply({
						content: "You are not authorized to respond to this confirmation.",
						ephemeral: true,
					});
				}

				try {
					if (action === "confirm") {
						await interaction.update({
							content: "Transaction confirmed!",
							components: [],
						});
						// Optionally update listing status here
					} else if (action === "deny") {
						await interaction.update({
							content: "Transaction cancelled.",
							components: [],
						});
					}
				} catch (error) {
					console.error("Error handling transaction confirmation:", error);
					await interaction.reply({
						content: "An error occurred.",
						ephemeral: true,
					});
				}
			}
		}
	},
};
