const assert = require("assert");
const commandInteraction = require("../events/operations/commandInteraction");

async function testCommandInteraction() {
	console.log("Running commandInteraction operation tests...");

	try {
		console.log("Test 1: Routes to a matching command's execute");
		let executedWith = null;
		const interaction1 = {
			commandName: "history",
			options: { getUser: () => null },
			user: { id: "u1" },
			deferReply: async () => {},
			editReply: async () => {},
		};
		// history is a real command file; stub its models so execute resolves
		const models = {
			User: {},
			Listing: { findAll: async () => [] },
			Transaction: { findAll: async () => [] },
			Rating: { findAll: async () => [] },
			client: {},
		};
		// Confirm no throw and that history path executes (editReply called)
		let edited = false;
		interaction1.editReply = async () => {
			edited = true;
		};
		await commandInteraction.execute(interaction1, models);
		assert.strictEqual(edited, true, "matched command executed");
		console.log("✓ Test 1 passed: Matching command routed and executed");

		console.log("Test 2: Unknown command name is a no-op");
		const interaction2 = {
			commandName: "does-not-exist",
			reply: async () => {
				throw new Error("should not reply for unknown command");
			},
		};
		await commandInteraction.execute(interaction2, models);
		console.log("✓ Test 2 passed: Unknown command handled without error");

		console.log("Test 3: Errors thrown by a command are caught and reported");
		// close command throws when channel is undefined; verify it replies with error text
		const replies = [];
		const interaction3 = {
			commandName: "close",
			user: { id: "u1" },
			channel: undefined,
			options: { getString: () => "sold" },
			reply: async (opts) => replies.push(opts.content),
		};
		await commandInteraction.execute(interaction3, models);
		assert.ok(
			replies.some((r) => r.includes("There was an error while executing this command")),
			"command error surfaced to user",
		);
		console.log("✓ Test 3 passed: Command execution error caught and reported");

		console.log("All commandInteraction operation tests completed successfully!");
	} catch (error) {
		console.error("CommandInteraction operation test failed:", error);
		process.exitCode = 1;
	}
}

testCommandInteraction();
