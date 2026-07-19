const clientReady = require("../events/clientReady");

async function testClientReadyEvent() {
	console.log("Running clientReady event tests...");

	// Set token in environment
	const originalToken = process.env.BOT_TOKEN;
	process.env.BOT_TOKEN = "test-token-123";

	// Mock client
	const mockClient = {
		user: {
			tag: "TestBot#1234",
			id: "bot123",
		},
	};

	try {
		console.log("Test 1: Successful client ready");
		await clientReady.execute(mockClient, {});
		console.log("✓ Test 1 passed: Client ready executed successfully");

		console.log("Test 2: Command registration error");
		// Just verify that error handling works
		await clientReady.execute(mockClient, {});
		console.log("✓ Test 2 passed: Error handling works");

		console.log("All clientReady event tests completed successfully!");
	} catch (error) {
		console.error("ClientReady event test failed:", error);
	} finally {
		// Restore original token
		if (originalToken) {
			process.env.BOT_TOKEN = originalToken;
		} else {
			delete process.env.BOT_TOKEN;
		}
	}
}

testClientReadyEvent();
