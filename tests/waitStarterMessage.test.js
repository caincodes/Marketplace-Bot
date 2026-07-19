const WaitStarterMessage = require("../utils/WaitStarterMessage");

async function testWaitStarterMessage() {
	console.log("Running WaitStarterMessage tests...");

	// Mock thread
	const mockMessage = { content: "Test message", author: { id: "123" } };

	const mockThread = {
		fetchStarterMessage: async () => mockMessage,
	};

	try {
		console.log("Test 1: Successful message fetch");
		const result = await WaitStarterMessage(mockThread);
		if (result === mockMessage) {
			console.log("✓ Test 1 passed: Message fetched successfully");
		} else {
			console.log("✗ Test 1 failed: Wrong message returned");
		}

		console.log("Test 2: API error handling");
		const mockThreadError = {
			fetchStarterMessage: async () => {
				const error = new Error("Unknown message");
				error.name = "DiscordAPIError[10008]";
				throw error;
			},
		};
		const result2 = await WaitStarterMessage(mockThreadError);
		if (result2 === null) {
			console.log("✓ Test 2 passed: API error handled correctly");
		} else {
			console.log("✗ Test 2 failed: Should have returned null");
		}

		console.log("Test 3: Other errors propagate to the caller");
		// Non-10008 errors must be re-thrown (previously this killed the process).
		const mockThreadOther = {
			fetchStarterMessage: async () => {
				throw new Error("Network error");
			},
		};
		let propagated = false;
		try {
			await WaitStarterMessage(mockThreadOther);
		} catch (error) {
			propagated = error.message === "Network error";
		}
		if (propagated) {
			console.log("✓ Test 3 passed: Other errors propagate to the caller");
		} else {
			console.log("✗ Test 3 failed: Non-10008 errors should be re-thrown");
		}

		console.log("All WaitStarterMessage tests completed successfully!");
	} catch (error) {
		console.error("WaitStarterMessage test failed:", error);
	}
}

testWaitStarterMessage();
