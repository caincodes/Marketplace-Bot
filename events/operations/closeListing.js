const { applyForumTag, getClosePrefix } = require("../../utils/forumTags");
const { followUpEphemeral, editReplyEphemeral } = require("../../utils/replies");

module.exports = {
	name: "closeListing",
	async execute(interaction, { Listing, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const listingId = parts[2];
		const posterId = parts[3];

		if (interaction.user.id !== posterId) {
			return await followUpEphemeral(
				interaction,
				"Only the listing poster can close this listing."
			);
		}

		try {
			const listing = await Listing.findByPk(listingId);
			if (!listing) {
				return await followUpEphemeral(interaction, "Listing not found.");
			}

			if (listing.userId !== posterId) {
				return await followUpEphemeral(
					interaction,
					"You are not authorized to close this listing."
				);
			}

			if (listing.closed) {
				return await followUpEphemeral(interaction, "This listing is already closed.");
			}

			// Get the thread channel
			const thread = await client.channels.fetch(listing.threadId);
			if (!thread) {
				return await interaction.followUp({
					content: "Forum post not found.",
					flags: 64,
				});
			}

			// Determine prefix based on listing type
			const prefix = getClosePrefix(listing.type);

			// Update thread name
			const newName = `${prefix} ${thread.name}`;
			await thread.setName(newName);

			// Mark listing as closed in database
			await listing.update({ closed: true });

			// Update tags - remove all and add "closed"
			try {
				await applyForumTag(thread, "closed");
			} catch (error) {
				console.error("Error updating forum tags:", error);
			}

			await interaction.editReply({
				content: `✅ Listing closed!`,
				components: [],
			});
		} catch (error) {
			console.error("Error closing listing:", error);
			await editReplyEphemeral(interaction, "An error occurred while closing the listing.");
		}
	},
};
