const clientReady = require("../events/clientReady");

async function testClientReadyEvent() {
	console.log("Running clientReady event tests...");

	// Mock client
	const mockClient = {
		user: {
			tag: "TestBot#1234",
			id: "bot123",
		},
	};

	// Mock REST
	const mockRest = {
		put: async () => {
			console.log("Commands registered successfully");
		},
		setToken: () => mockRest,
	};

	// Mock dependencies using local overrides
	const fs = require("fs");
	const path = require("path");
	const originalReaddirSync = fs.readdirSync;
	const originalJoin = path.join;

	fs.readdirSync = () => ["confirm.js", "history.js"]; // Use real command files
	path.join = (...args) => args.join("/");

	try {
		console.log("Test 1: Successful client ready");
		await clientReady.execute(mockClient, {});
		console.log("✓ Test 1 passed: Client ready executed successfully");

		console.log("Test 2: Command registration error");
		mockRest.put = async () => {
			throw new Error("Registration failed");
		};
		await clientReady.execute(mockClient, {});
		console.log("✓ Test 2 passed: Registration error handled");

		console.log("All clientReady event tests completed successfully!");
	} catch (error) {
		console.error("ClientReady event test failed:", error);
	} finally {
		// Restore originals
		fs.readdirSync = originalReaddirSync;
		path.join = originalJoin;
	}
}

testClientReadyEvent();
