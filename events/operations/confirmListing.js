const { getUserReputation } = require("../../utils/reputation");
const { updateForumTag } = require("../../utils/forumTags");
const { forgetListingPrompt } = require("../../utils/listings");
const { followUpEphemeral } = require("../../utils/replies");

const PENDING_MESSAGE =
	":warning: Your listing will remain pending. Please edit your forum title to match the format:\n```[Region] [H/W] Item [H/W] Offer```";

// Handles the Confirm / Trade / Deny buttons on a listing prompt. Stateless (the
// listing is looked up from the thread), so prompts keep working across restarts.
module.exports = {
	name: "confirmListing",
	async execute(interaction, { Listing, Transaction, Rating }) {
		await interaction.deferUpdate();

		const listing = await Listing.findOne({ where: { threadId: interaction.channelId } });
		if (!listing) {
			return await interaction.editReply({
				content: "No listing found for this forum post.",
				components: [],
			});
		}

		if (interaction.user.id !== listing.userId) {
			return await followUpEphemeral(
				interaction,
				"Only the listing author can respond to this confirmation."
			);
		}

		if (listing.status !== "pending") {
			return await interaction.editReply({
				content: "This listing has already been confirmed.",
				components: [],
			});
		}

		if (interaction.customId === "deny") {
			forgetListingPrompt(interaction.channelId);
			return await interaction.editReply({ content: PENDING_MESSAGE, components: [] });
		}

		const isTradeButton = interaction.customId === "trade";
		const type = isTradeButton ? "TRADE" : listing.type;

		// Conditional update so a double-click can't confirm twice
		const [updatedCount] = await Listing.update(
			{ status: "confirmed", type },
			{ where: { id: listing.id, status: "pending" } }
		);
		if (updatedCount === 0) {
			return await interaction.editReply({
				content: "This listing has already been confirmed.",
				components: [],
			});
		}
		forgetListingPrompt(interaction.channelId);

		await updateForumTag(interaction.channel, type);

		const reputationText = await getUserReputation(listing.userId, {
			Listing,
			Transaction,
			Rating,
		});

		await interaction.editReply({
			content: isTradeButton ? `Trade listing confirmed!\n${reputationText}` : reputationText,
			components: [],
		});
	},
};
