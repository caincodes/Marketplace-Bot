const { SlashCommandBuilder } = require("discord.js");
const { applyForumTag, getClosePrefix } = require("../utils/forumTags");
const { EPHEMERAL, replyEphemeral } = require("../utils/replies");

// Discord's maximum thread name length
const MAX_THREAD_NAME_LENGTH = 100;

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
					{ name: "No Longer Needed", value: "withdrawn" },
				),
		),
	async execute(interaction, { Listing }) {
		if (!interaction.channel.isThread()) {
			return await replyEphemeral(
				interaction,
				"This command must be run inside a forum post (thread).",
			);
		}

		// Renames are rate limited (2 per 10 minutes per thread), so setName can
		// take longer than the 3s interaction window; defer first.
		await interaction.deferReply({ flags: EPHEMERAL });
		const respond = (content) => interaction.editReply({ content });

		try {
			const listing = await Listing.findOne({ where: { threadId: interaction.channel.id } });
			if (!listing) {
				return await respond("No listing found for this forum post.");
			}

			if (listing.userId !== interaction.user.id) {
				return await respond("Only the listing poster can close this listing.");
			}

			if (listing.closed) {
				return await respond("This listing is already closed.");
			}

			const reason = interaction.options.getString("reason");

			// Determine prefix based on listing type and reason
			const prefix = reason === "withdrawn" ? "[WITHDRAWN]" : getClosePrefix(listing.type);

			// Mark closed before renaming so the rename's threadUpdate event sees a
			// closed listing and doesn't re-prompt for confirmation.
			await listing.update({ closed: true });

			const newName = `${prefix} ${interaction.channel.name}`.slice(0, MAX_THREAD_NAME_LENGTH);
			try {
				await interaction.channel.setName(newName);
			} catch (error) {
				await listing.update({ closed: false });
				throw error;
			}

			// Update tags - remove all and add "closed"
			try {
				await applyForumTag(interaction.channel, "closed");
			} catch (error) {
				console.error("Error updating forum tags:", error);
			}

			await respond(`✅ Listing closed!`);
		} catch (error) {
			console.error("Error closing listing:", error);
			await respond("An error occurred while closing the listing.");
		}
	},
};
