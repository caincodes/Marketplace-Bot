const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
	name: "closeListing",
	async execute(interaction, { Listing, client }) {
		// Defer the interaction immediately to avoid timeout
		await interaction.deferUpdate();
		const parts = interaction.customId.split("_");
		const listingId = parts[2];
		const posterId = parts[3];

		if (interaction.user.id !== posterId) {
			return await interaction.followUp({
				content: "Only the listing poster can close this listing.",
				flags: 64,
			});
		}

		try {
			const listing = await Listing.findByPk(listingId);
			if (!listing) {
				return await interaction.followUp({
					content: "Listing not found.",
					flags: 64,
				});
			}

			if (listing.userId !== posterId) {
				return await interaction.followUp({
					content: "You are not authorized to close this listing.",
					flags: 64,
				});
			}

			if (listing.closed) {
				return await interaction.followUp({
					content: "This listing is already closed.",
					flags: 64,
				});
			}

			// Get the thread channel
			const thread = await client.channels.fetch(listing.threadId);
			if (!thread) {
				return await interaction.reply({
					content: "Forum post not found.",
					flags: 64,
				});
			}

			// Determine prefix based on listing type
			let prefix;
			switch (listing.type) {
				case "SELL":
					prefix = "[SOLD]";
					break;
				case "BUY":
					prefix = "[FOUND]";
					break;
				case "TRADE":
					prefix = "[TRADED]";
					break;
				default:
					prefix = "[CLOSED]";
			}

			// Update thread name
			const newName = `${prefix} ${thread.name}`;
			await thread.setName(newName);

			// Mark listing as closed in database
			await listing.update({ closed: true });

			// Update tags - remove all and add "closed"
			try {
				const forumChannel = thread.parent;
				if (forumChannel && forumChannel.type === 15) {
					const closedTag = forumChannel.availableTags.find(
						(tag) => tag.name.toLowerCase() === "closed"
					);
					if (closedTag) {
						await thread.setAppliedTags([closedTag.id]);
					}
				}
			} catch (error) {
				console.error("Error updating forum tags:", error);
			}

			await interaction.editReply({
				content: `✅ Listing closed!`,
				components: [],
			});
		} catch (error) {
			console.error("Error closing listing:", error);
			await interaction.editReply({
				content: "An error occurred while closing the listing.",
				flags: 64,
			});
		}
	},
};
