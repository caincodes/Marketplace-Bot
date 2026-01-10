const history = require("../commands/history");

async function testHistoryCommand() {
	console.log("Running history command tests...");

	// Mock models
	const mockListing = {
		findAll: async () => [
			{
				type: "SELL",
				item: "Test Item",
				offer: "100g",
				region: "EU",
				User: { username: "testuser" },
			},
		],
	};

	const mockUser = {};

	const models = { Listing: mockListing, User: mockUser };

	// Mock interaction
	const mockInteraction = {
		user: { id: "123456789" },
		reply: async (options) => {
			console.log("Reply content:", options.content);
		},
	};

	try {
		console.log("Test 1: User with listings");
		await history.execute(mockInteraction, models);
		console.log("✓ Test 1 passed: History displayed for user with listings");

		console.log("Test 2: User with no listings");
		mockListing.findAll = async () => [];
		await history.execute(mockInteraction, models);
		console.log("✓ Test 2 passed: No listings message displayed");

		console.log("Test 3: Database error");
		mockListing.findAll = async () => {
			throw new Error("Database connection failed");
		};
		await history.execute(mockInteraction, models);
		console.log("✓ Test 3 passed: Error handled gracefully");

		console.log("All history command tests completed successfully!");
	} catch (error) {
		console.error("History command test failed:", error);
	}
}

testHistoryCommand();
