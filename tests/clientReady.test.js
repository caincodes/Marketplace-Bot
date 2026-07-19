// Install a stub for @discordjs/rest BEFORE clientReady is loaded so the tests
// exercise command registration without making real calls to the Discord API.
const restModulePath = require.resolve("@discordjs/rest");
const originalRestModule = require.cache[restModulePath];

let putCalls = 0;
let putShouldThrow = false;

require.cache[restModulePath] = {
	id: restModulePath,
	filename: restModulePath,
	loaded: true,
	exports: {
		REST: class {
			setToken() {
				return this;
			}
			async put() {
				putCalls++;
				if (putShouldThrow) {
					throw new Error("Registration failed");
				}
				return [];
			}
		},
	},
};

// Load clientReady fresh so it binds to the stubbed REST.
delete require.cache[require.resolve("../events/clientReady")];
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
		putCalls = 0;
		putShouldThrow = false;
		await clientReady.execute(mockClient, {});
		if (putCalls === 1) {
			console.log("✓ Test 1 passed: Commands registered successfully");
		} else {
			console.log("✗ Test 1 failed: Expected commands to be registered once, got", putCalls);
		}

		console.log("Test 2: Command registration error");
		putShouldThrow = true;
		let threw = false;
		try {
			await clientReady.execute(mockClient, {});
		} catch (error) {
			threw = true;
		}
		if (!threw) {
			console.log("✓ Test 2 passed: Registration error handled without crashing");
		} else {
			console.log("✗ Test 2 failed: Registration error should be caught inside the event");
		}

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

		// Restore the real @discordjs/rest module.
		if (originalRestModule) {
			require.cache[restModulePath] = originalRestModule;
		} else {
			delete require.cache[restModulePath];
		}
	}
}

testClientReadyEvent();
