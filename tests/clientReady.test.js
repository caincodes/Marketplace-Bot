const { test, before, after } = require("node:test");
const assert = require("node:assert");

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

const mockClient = {
	user: {
		tag: "TestBot#1234",
		id: "bot123",
	},
};

const originalToken = process.env.BOT_TOKEN;

before(() => {
	process.env.BOT_TOKEN = "test-token-123";
});

after(() => {
	if (originalToken) {
		process.env.BOT_TOKEN = originalToken;
	} else {
		delete process.env.BOT_TOKEN;
	}
	if (originalRestModule) {
		require.cache[restModulePath] = originalRestModule;
	} else {
		delete require.cache[restModulePath];
	}
});

test("clientReady: registers commands once on ready", async () => {
	putCalls = 0;
	putShouldThrow = false;
	await clientReady.execute(mockClient, {});
	assert.strictEqual(putCalls, 1, "commands registered exactly once");
});

test("clientReady: registration error is caught inside the event", async () => {
	putShouldThrow = true;
	await assert.doesNotReject(
		clientReady.execute(mockClient, {}),
		"registration error handled without crashing",
	);
});
