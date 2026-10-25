const { SlashCommandBuilder } = require("discord.js");
const { getUserReputation } = require("../utils/reputation");
const { EPHEMERAL } = require("../utils/replies");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("history")
		.setDescription("View your (or another user's) marketplace history")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to view history for").setRequired(false),
		),
	async execute(interaction, models) {
		try {
			await interaction.deferReply({ flags: EPHEMERAL });
			const targetUser = interaction.options.getUser("user") || interaction.user;

			const response = await getUserReputation(targetUser.id, models);

			await interaction.editReply({ content: response });
		} catch (error) {
			console.error("Error fetching history:", error);
			await interaction.editReply({ content: "An error occurred while fetching the history." });
		}
	},
};
