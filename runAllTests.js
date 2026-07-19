// runAllTests.js
console.log("Running all tests sequentially...");

const testFiles = [
	"./tests/clientReady.test.js",
	"./tests/interactionCreate.test.js",
	"./tests/waitStarterMessage.test.js",
	"./tests/confirm.test.js",
	"./tests/parseThreadName.test.js",
	"./tests/history.test.js",
	"./tests/threadCreate.test.js",
	"./tests/threadUpdate.test.js",
	"./tests/close.test.js",
	"./tests/closeListing.test.js",
	"./tests/commandInteraction.test.js",
	"./tests/confirmTransaction.test.js",
	"./tests/rateUser.test.js",
	"./tests/writeReview.test.js",
	"./tests/forumLink.test.js",
	"./tests/reputation.test.js",
];

async function runTestsSequentially() {
	for (const file of testFiles) {
		console.log(`\n--- Executing ${file} ---`);
		try {
			// Require the test file
			const testModule = require(file);

			// If it exports a function, call it and await
			if (typeof testModule === "function") {
				await testModule();
			} else if (typeof testModule.default === "function") {
				await testModule.default();
			}
			// Otherwise, assume it runs immediately
		} catch (err) {
			console.error(`Error running ${file}:`, err);
		}
	}
	console.log("\nAll test files executed.");
}

runTestsSequentially();
