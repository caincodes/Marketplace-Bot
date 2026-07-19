const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { applyForumTag, getClosePrefix } = require("../utils/forumTags");
const { replyEphemeral } = require("../utils/replies");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("close")
		.setDescription("Close marketplace listing (use inside your forum post)")
		.addStringOption((option) =>
			option
				.setName("reason")
				.setDescription("Reason for closing the listing")
				.setRequired(true)
				.addChoices(
					{ name: "Sold/Found Item", value: "sold" },
					{ name: "No Longer Needed", value: "withdrawn" }
				)
		),
	async execute(interaction, { Listing, client }) {
		if (!interaction.channel.isThread()) {
			return await replyEphemeral(
				interaction,
				"This command must be run inside a forum post (thread)."
			);
		}

		try {
			const listing = await Listing.findOne({ where: { threadId: interaction.channel.id } });
			if (!listing) {
				return await replyEphemeral(interaction, "No listing found for this forum post.");
			}

			if (listing.userId !== interaction.user.id) {
				return await replyEphemeral(interaction, "Only the listing poster can close this listing.");
			}

			if (listing.closed) {
				return await replyEphemeral(interaction, "This listing is already closed.");
			}

			const reason = interaction.options.getString("reason");

			// Determine prefix based on listing type and reason
			const prefix = reason === "withdrawn" ? "[WITHDRAWN]" : getClosePrefix(listing.type);

			// Update thread name
			const newName = `${prefix} ${interaction.channel.name}`;
			await interaction.channel.setName(newName);

			// Mark listing as closed in database
			await listing.update({ closed: true });

			// Update tags - remove all and add "closed"
			try {
				await applyForumTag(interaction.channel, "closed");
			} catch (error) {
				console.error("Error updating forum tags:", error);
			}

			await replyEphemeral(interaction, `✅ Listing closed!`);
		} catch (error) {
			console.error("Error closing listing:", error);
			await replyEphemeral(interaction, "An error occurred while closing the listing.");
		}
	},
};
