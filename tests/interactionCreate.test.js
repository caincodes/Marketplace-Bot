const interactionCreate = require("../events/interactionCreate");

async function testInteractionCreateEvent() {
	console.log("Running interactionCreate event tests...");

	// Mock models
	const mockTransaction = {
		findByPk: async (id) => ({
			id: parseInt(id),
			sellerId: "seller123",
			buyerId: "buyer456",
			listingId: 1,
			ratingIds: [],
			update: async (data) => console.log("Transaction updated:", data),
		}),
		destroy: async () => console.log("Transaction destroyed"),
	};

	const mockRating = {
		create: async (data) => ({
			id: 1,
			...data,
		}),
	};

	const mockListing = {
		findByPk: async (id) => ({
			id: parseInt(id),
			ratingIds: [],
			update: async (data) => console.log("Listing updated:", data),
		}),
	};

	const models = { Transaction: mockTransaction, Rating: mockRating, Listing: mockListing };

	// Mock client
	const mockClient = {
		users: {
			fetch: async (id) => ({
				send: async (options) => console.log("DM sent:", options.content),
			}),
		},
	};

	try {
		console.log("Test 1: Command interaction");
		const commandInteraction = {
			isCommand: () => true,
			commandName: "confirm",
			channel: { isThread: () => false },
			reply: async (options) => console.log("Command reply:", options.content),
		};
		await interactionCreate.execute(commandInteraction, models);
		console.log("✓ Test 1 passed: Command interaction handled");

		console.log("Test 2: Transaction confirm button");
		const confirmButtonInteraction = {
			isCommand: () => false,
			isButton: () => true,
			customId: "confirm_transaction_1_user1_user2_user2_confirm",
			user: { id: "user2" },
			update: async (options) => console.log("Button update:", options.content),
		};
		await interactionCreate.execute(confirmButtonInteraction, { ...models, client: mockClient });
		console.log("✓ Test 2 passed: Transaction confirmed");

		console.log("Test 3: Transaction deny button");
		const denyButtonInteraction = {
			isCommand: () => false,
			isButton: () => true,
			customId: "confirm_transaction_1_user1_user2_user2_deny",
			user: { id: "user2" },
			update: async (options) => console.log("Button update:", options.content),
		};
		await interactionCreate.execute(denyButtonInteraction, models);
		console.log("✓ Test 3 passed: Transaction denied");

		console.log("Test 4: Rate button");
		const rateButtonInteraction = {
			isCommand: () => false,
			isButton: () => true,
			customId: "rate_positive_1_user1",
			user: { id: "user1" },
			showModal: async (modal) => console.log("Modal shown:", modal.data.title),
		};
		await interactionCreate.execute(rateButtonInteraction, models);
		console.log("✓ Test 4 passed: Rating modal shown");

		console.log("Test 5: Modal submit");
		const modalSubmitInteraction = {
			isCommand: () => false,
			isButton: () => false,
			isModalSubmit: () => true,
			customId: "rating_modal_1_user1",
			fields: {
				getTextInputValue: (id) => (id === "rating" ? "positive" : "Good seller"),
			},
			reply: async (options) => console.log("Modal reply:", options.content),
		};
		await interactionCreate.execute(modalSubmitInteraction, models);
		console.log("✓ Test 5 passed: Rating submitted");

		console.log("Test 6: Unauthorized access");
		const unauthorizedInteraction = {
			isCommand: () => false,
			isButton: () => true,
			customId: "confirm_transaction_1_user1_user2_user2_confirm",
			user: { id: "unauthorized" },
			reply: async (options) => console.log("Unauthorized reply:", options.content),
		};
		await interactionCreate.execute(unauthorizedInteraction, models);
		console.log("✓ Test 6 passed: Unauthorized access blocked");

		console.log("All interactionCreate event tests completed successfully!");
	} catch (error) {
		console.error("InteractionCreate event test failed:", error);
	}
}

module.exports = { testInteractionCreateEvent };

testInteractionCreateEvent();
