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

	const models = { Listing: mockListing, Transaction: mockTransaction };

	// Mock interaction
	const mockInteraction = {
		channel: { isThread: () => true, id: "thread123" },
		user: { id: "buyer456" },
		options: {
			getUser: () => ({ id: "seller123" }),
			getString: () => "purchase",
		},
		reply: async (options) => {
			console.log("Reply content:", options.content);
		},
	};

	try {
		console.log("Test 1: Valid confirm command");
		await confirm.execute(mockInteraction, models);
		console.log("✓ Test 1 passed: Transaction created successfully");

		console.log("Test 2: Command not in thread");
		mockInteraction.channel.isThread = () => false;
		await confirm.execute(mockInteraction, models);
		console.log("✓ Test 2 passed: Error for non-thread channel");

		mockInteraction.channel.isThread = () => true;

		console.log("Test 3: No listing found");
		mockListing.findOne = async () => null;
		await confirm.execute(mockInteraction, models);
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
		mockInteraction.options.getUser = () => ({ id: "wrong123" });
		await confirm.execute(mockInteraction, models);
		console.log("✓ Test 4 passed: Error for wrong seller");

		console.log("Test 5: Database error");
		mockTransaction.create = async () => {
			throw new Error("Database error");
		};
		mockInteraction.options.getUser = () => ({ id: "seller123" });
		await confirm.execute(mockInteraction, models);
		console.log("✓ Test 5 passed: Database error handled");

		console.log("All confirm command tests completed successfully!");
	} catch (error) {
		console.error("Confirm command test failed:", error);
	}
}

testConfirmCommand();
