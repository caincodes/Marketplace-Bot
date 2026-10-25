// Stand-in for a discord.js interaction that enforces Discord's response rules:
// an interaction can be acknowledged once (reply / update / defer / showModal),
// and editReply / followUp are only valid after that. discord.js throws on
// violations, so the mock does too.

function contentOf(options) {
	return typeof options === "string" ? options : options?.content;
}

/**
 * @param {Object} [overrides] - Properties merged onto the interaction
 * @returns {Object} Interaction mock. `state` records responses by method, plus
 *   `messages` with every response's content in order.
 */
function createInteraction(overrides = {}) {
	const state = {
		replies: [],
		updates: [],
		edits: [],
		followUps: [],
		messages: [],
		ephemeral: [],
		modal: null,
	};

	function acknowledge(interaction, method) {
		if (interaction.deferred || interaction.replied) {
			throw new Error(
				`InteractionAlreadyReplied: ${method}() after the interaction was acknowledged`,
			);
		}
	}

	function requireAcknowledged(interaction, method) {
		if (!interaction.deferred && !interaction.replied) {
			throw new Error(`InteractionNotReplied: ${method}() before the interaction was acknowledged`);
		}
	}

	function record(list, options) {
		const content = contentOf(options);
		list.push(content);
		state.messages.push(content);
		if (options?.flags === 64) state.ephemeral.push(content);
	}

	return {
		state,
		deferred: false,
		replied: false,
		user: { id: "user1" },
		isButton: () => false,
		isModalSubmit: () => false,
		isCommand: () => false,
		async deferUpdate() {
			acknowledge(this, "deferUpdate");
			this.deferred = true;
		},
		async deferReply() {
			acknowledge(this, "deferReply");
			this.deferred = true;
		},
		async reply(options) {
			acknowledge(this, "reply");
			this.replied = true;
			record(state.replies, options);
		},
		async update(options) {
			acknowledge(this, "update");
			this.replied = true;
			record(state.updates, options);
		},
		async showModal(modal) {
			acknowledge(this, "showModal");
			this.replied = true;
			state.modal = modal;
		},
		async editReply(options) {
			requireAcknowledged(this, "editReply");
			record(state.edits, options);
		},
		async followUp(options) {
			requireAcknowledged(this, "followUp");
			record(state.followUps, options);
		},
		...overrides,
	};
}

module.exports = { createInteraction };
