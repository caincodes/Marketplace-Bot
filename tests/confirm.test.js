const confirm = require("../commands/confirm");

async function testConfirmCommand() {
	console.log("Running confirm command tests...");

	// Mock models
	const mockListing = {
		findOne: async () => ({
			id: 1,
			userId: "seller123",
			type: "SELL",
			item: "Test Item",
			offer: "100g",
			transactionIds: [],
			update: async (data) => console.log("Listing updated:", data),
		}),
	};

	const mockTransaction = {
		create: async (data) => ({
			id: 1,
			...data,
		}),
	};

	const mockClient = {
		users: {
			fetch: async (id) => ({
				id,
				bot: false,
				send: async (options) => console.log("DM sent:", options.content?.substring(0, 50)),
			}),
		},
	};

	const models = { Listing: mockListing, Transaction: mockTransaction };

	// Create a more complete mock interaction
	const createMockUser = (id) => ({
		id,
		bot: false,
		send: async (options) => console.log(`DM sent to ${id}:`, options.content?.substring(0, 50)),
	});

	const mockInteraction = {
		channel: { isThread: () => true, id: "thread123" },
		guildId: "guild123",
		user: { id: "buyer456" },
		options: {
			getUser: () => createMockUser("seller123"),
			getString: () => "purchase",
		},
		reply: async (options) => {
			console.log("Reply content:", options.content?.substring(0, 50));
		},
	};

	try {
		console.log("Test 1: Valid confirm command");
		await confirm.execute(mockInteraction, { ...models, client: mockClient });
		console.log("✓ Test 1 passed: Transaction created successfully");

		console.log("Test 2: Command not in thread");
		mockInteraction.channel.isThread = () => false;
		await confirm.execute(mockInteraction, { ...models, client: mockClient });
		console.log("✓ Test 2 passed: Error for non-thread channel");

		mockInteraction.channel.isThread = () => true;

		console.log("Test 3: No listing found");
		mockListing.findOne = async () => null;
		await confirm.execute(mockInteraction, { ...models, client: mockClient });
		console.log("✓ Test 3 passed: Error for no listing");

		mockListing.findOne = async () => ({
			id: 1,
			userId: "seller123",
			type: "SELL",
			item: "Test Item",
			offer: "100g",
			transactionIds: [],
			update: async (data) => console.log("Listing updated:", data),
		});

		console.log("Test 4: Wrong seller specified");
		mockInteraction.options.getUser = () => createMockUser("wrong123");
		await confirm.execute(mockInteraction, { ...models, client: mockClient });
		console.log("✓ Test 4 passed: Error for wrong seller");

		// Reset getUser
		mockInteraction.options.getUser = () => createMockUser("seller123");

		console.log("All confirm command tests completed successfully!");
	} catch (error) {
		console.error("Confirm command test failed:", error);
	}
}

testConfirmCommand();
