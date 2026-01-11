module.exports = {
	name: "modalInteraction",
	async execute(interaction, { Rating }) {
		if (interaction.customId.startsWith("review_modal_")) {
			const parts = interaction.customId.split("_");
			const ratingId = parts[2];
			const raterId = parts[3];

			const review = interaction.fields.getTextInputValue("review") || null;

			const ratingRecord = await Rating.findByPk(ratingId);
			if (ratingRecord && ratingRecord.raterId === raterId) {
				await ratingRecord.update({ review });
			}

			await interaction.reply({
				content: "Thank you for your anonymous review! Transaction complete.",
				flags: 64,
			});
		}
	},
};
