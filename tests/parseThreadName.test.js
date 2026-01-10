const parseThreadName = require("../utils/parseThreadName");

function testParseThreadName() {
	console.log("Running parseThreadName tests...");

	try {
		console.log("Test 1: Valid sell thread");
		let result = parseThreadName("[EU-BE] [H] Test Item [W] €€€");
		console.log("Result:", result);
		if (
			result.type === "SELL" &&
			result.region === "EU-BE" &&
			result.item === "Test Item" &&
			result.offer === "€€€" &&
			!result.mismatched
		) {
			console.log("✓ Test 1 passed: Valid sell thread parsed correctly");
		} else {
			console.log("✗ Test 1 failed: Incorrect parsing");
		}

		console.log("Test 2: Valid buy thread");
		result = parseThreadName("[US] [W] Magic Item [H] 100g");
		console.log("Result:", result);
		if (
			result.type === "BUY" &&
			result.item === "Magic Item" &&
			result.offer === "100g" &&
			!result.mismatched
		) {
			console.log("✓ Test 2 passed: Valid buy thread parsed correctly");
		} else {
			console.log("✗ Test 2 failed: Incorrect parsing");
		}

		console.log("Test 3: Invalid thread - no brackets");
		result = parseThreadName("Just a random thread name");
		console.log("Result:", result);
		if (result.mismatched) {
			console.log("✓ Test 3 passed: Invalid thread detected");
		} else {
			console.log("✗ Test 3 failed: Should have detected mismatch");
		}

		console.log("Test 4: Invalid thread - missing H/W");
		result = parseThreadName("[EU] Test Item for 50g");
		console.log("Result:", result);
		if (result.mismatched) {
			console.log("✓ Test 4 passed: Missing H/W detected");
		} else {
			console.log("✗ Test 4 failed: Should have detected mismatch");
		}

		console.log("Test 5: Invalid thread - incomplete format");
		result = parseThreadName("[EU] [H] Test Item");
		console.log("Result:", result);
		if (result.mismatched) {
			console.log("✓ Test 5 passed: Incomplete format detected");
		} else {
			console.log("✗ Test 5 failed: Should have detected mismatch");
		}

		console.log("Test 6: Complex region");
		result = parseThreadName("[US-Nor-Cal] [H] Rare Item [W] $$$");
		console.log("Result:", result);
		if (result.region === "US-Nor-Cal" && !result.mismatched) {
			console.log("✓ Test 6 passed: Complex region parsed correctly");
		} else {
			console.log("✗ Test 6 failed: Complex region not handled");
		}

		console.log("Test 7: Parentheses instead of brackets");
		result = parseThreadName("(EU) (H) Test Item (W) 100 gold");
		console.log("Result:", result);
		if (
			result.type === "SELL" &&
			result.item === "Test Item" &&
			result.offer === "100 gold" &&
			!result.mismatched
		) {
			console.log("✓ Test 7 passed: Parentheses format supported");
		} else {
			console.log("✗ Test 7 failed: Parentheses not supported");
		}

		console.log("Test 8: Extra content");
		result = parseThreadName("[EU] [H] Test Item [W] 50g [extra stuff]");
		console.log("Result:", result);
		if (!result.mismatched) {
			console.log("✓ Test 8 passed: Extra content allowed in offer");
		} else {
			console.log("✗ Test 8 failed: Should allow extra content");
		}

		console.log("All parseThreadName tests completed successfully!");
	} catch (error) {
		console.error("ParseThreadName test failed:", error);
	}
}

testParseThreadName();
