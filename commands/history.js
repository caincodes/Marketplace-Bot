process.env.ORT_LOG_SEVERITY_LEVEL = "3"; // suppress ONNXRuntime unused initializer warnings
const { SlashCommandBuilder } = require("@discordjs/builders");
const { getUserReputation } = require("../utils/reputation");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("history")
		.setDescription("View your listing history or another user's history")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to view history for").setRequired(false)
		),
	async execute(interaction, models) {
		try {
			await interaction.deferReply({ flags: 64 });
			const targetUser = interaction.options.getUser("user") || interaction.user;

			const response = await getUserReputation(targetUser.id, models);

			await interaction.editReply({ content: response, flags: 64 });
		} catch (error) {
			console.error("Error fetching history:", error);
			await interaction.editReply({
				content: "An error occurred while fetching the history.",
				flags: 64,
			});
		}
	},
};
