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

	// Mock dependencies
	const originalRest = require("@discordjs/rest").REST;
	const originalRoutes = require("discord-api-types/v9").Routes;
	const originalFs = require("fs");
	const originalPath = require("path");

	require("@discordjs/rest").REST = function () {
		return mockRest;
	};
	require("discord-api-types/v9").Routes = {
		applicationCommands: () => "test-route",
	};
	require("fs").readdirSync = () => ["test-command.js"];
	require("path").join = (...args) => args.join("/");
	require.cache[require.resolve("../commands/test-command")] = {
		exports: {
			name: "test",
			description: "Test command",
			options: [],
		},
	};

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
		require("@discordjs/rest").REST = originalRest;
		require("discord-api-types/v9").Routes = originalRoutes;
		require("fs").readdirSync = originalFs.readdirSync;
		require("path").join = originalPath.join;
		delete require.cache[require.resolve("../commands/test-command")];
	}
}

testClientReadyEvent();
