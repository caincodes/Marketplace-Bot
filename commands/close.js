const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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
			return await interaction.reply({
				content: "This command must be run inside a forum post (thread).",
				flags: 64,
			});
		}

		try {
			const listing = await Listing.findOne({ where: { threadId: interaction.channel.id } });
			if (!listing) {
				return await interaction.reply({
					content: "No listing found for this forum post.",
					flags: 64,
				});
			}

			if (listing.userId !== interaction.user.id) {
				return await interaction.reply({
					content: "Only the listing poster can close this listing.",
					flags: 64,
				});
			}

			if (listing.closed) {
				return await interaction.reply({
					content: "This listing is already closed.",
					flags: 64,
				});
			}

			const reason = interaction.options.getString("reason");

			// Determine prefix based on listing type and reason
			let prefix;
			if (reason === "withdrawn") {
				prefix = "[WITHDRAWN]";
			} else {
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
			}

			// Update thread name
			const newName = `${prefix} ${interaction.channel.name}`;
			await interaction.channel.setName(newName);

			// Mark listing as closed in database
			await listing.update({ closed: true });

			// Update tags - remove all and add "closed"
			try {
				const forumChannel = interaction.channel.parent;
				if (forumChannel && forumChannel.type === 15) {
					const closedTag = forumChannel.availableTags.find(
						(tag) => tag.name.toLowerCase() === "closed"
					);
					if (closedTag) {
						await interaction.channel.setAppliedTags([closedTag.id]);
					}
				}
			} catch (error) {
				console.error("Error updating forum tags:", error);
			}

			await interaction.reply({
				content: `✅ Listing closed!`,
				flags: 64,
			});
		} catch (error) {
			console.error("Error closing listing:", error);
			await interaction.reply({
				content: "An error occurred while closing the listing.",
				flags: 64,
			});
		}
	},
};
