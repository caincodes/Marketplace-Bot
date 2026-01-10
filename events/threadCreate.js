const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const parseThreadName = require("../utils/parseThreadName");
const WaitStarterMessage = require("../utils/WaitStarterMessage");

module.exports = {
	name: "threadCreate",
	async execute(thread, { User, Listing }) {
		let firstMessage;
		do {
			firstMessage = await WaitStarterMessage(thread);
		} while (!firstMessage);

		const parsed = parseThreadName(thread.name);
		console.log(parsed);

		if (!parsed) return;

		if (parsed.mismatched) {
			thread.send(
				"⚠️ Your thread title seems mismatched or incomplete. Please edit, matching format: `[Region] [H/W] Item [H/W] Offer`"
			);
			return;
		}

		const typeText = parsed.type === "SELL" ? "are SELLING" : "WANT TO BUY";
		const confirmation = `It looks like you ${typeText} \`${parsed.item}\` in exchange for \`${parsed.offer}\`. Is this correct?`;

		const confirmationMessage = await thread.send({
			content: confirmation,
			components: [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder()
						.setCustomId("confirm")
						.setLabel("Confirm")
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
				),
			],
		});

		const filter = (interaction) => {
			return (
				interaction.user &&
				interaction.customId &&
				["confirm", "deny"].includes(interaction.customId) &&
				interaction.user.id === firstMessage?.author?.id // ✅ safe check
			);
		};

		const collector = confirmationMessage.createMessageComponentCollector({
			filter,
		});

		collector.on("collect", async (interaction) => {
			if (!interaction.isButton()) return;

			if (interaction.customId === "confirm") {
				// Create seller reputation embed
				const username = firstMessage?.author?.username;
				const userId = firstMessage?.author?.id;

				// Save to database
				try {
					const [user, created] = await User.findOrCreate({
						where: { id: userId },
						defaults: { username: username },
					});
					await Listing.create({
						userId: userId,
						region: parsed.region,
						type: parsed.type,
						item: parsed.item,
						offer: parsed.offer,
						threadId: thread.id,
					});
					console.log("Listing saved to database");
				} catch (error) {
					console.error("Error saving to database:", error);
				}

				const reputationText = `**Seller Reputation** for ${username}\n\n**Confirmed Purchases:** 0\n**Confirmed Sales:** 0\n**Confirmed Trades:** 0`;

				// Update original confirmation message: remove buttons and add embed
				await interaction.update({
					content: reputationText,
					components: [], // removes buttons
				});
			} else {
				// Denied: remove buttons and ask user to fix
				await interaction.update({
					content:
						"Please edit your forum title to match the following format:\n```[Region] [H/W] Item [H/W] Offer```",
					components: [],
				});
			}

			collector.stop();
		});

		collector.on("end", (collected) => {
			if (collected.size === 0) {
				thread.send("No response received.");
			}
		});

		collector.on("error", (error) => {
			console.error("Collector error:", error);
			thread.send("An error occurred while processing your response.");
		});
	},
};
