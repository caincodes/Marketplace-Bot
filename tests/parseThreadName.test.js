const { test } = require("node:test");
const assert = require("node:assert");
const parseThreadName = require("../utils/parseThreadName");

test("parseThreadName: valid sell thread parsed correctly", () => {
	const result = parseThreadName("[EU-BE] [H] Test Item [W] €€€");
	assert.strictEqual(result.type, "SELL");
	assert.strictEqual(result.region, "EU-BE");
	assert.strictEqual(result.item, "Test Item");
	assert.strictEqual(result.offer, "€€€");
	assert.ok(!result.mismatched);
});

test("parseThreadName: valid buy thread parsed correctly", () => {
	const result = parseThreadName("[US] [W] Magic Item [H] 100g");
	assert.strictEqual(result.type, "BUY");
	assert.strictEqual(result.item, "Magic Item");
	assert.strictEqual(result.offer, "100g");
	assert.ok(!result.mismatched);
});

test("parseThreadName: name without brackets is mismatched", () => {
	assert.ok(parseThreadName("Just a random thread name").mismatched);
});

test("parseThreadName: name missing H/W is mismatched", () => {
	assert.ok(parseThreadName("[EU] Test Item for 50g").mismatched);
});

test("parseThreadName: incomplete format is mismatched", () => {
	assert.ok(parseThreadName("[EU] [H] Test Item").mismatched);
});

test("parseThreadName: complex region parsed correctly", () => {
	const result = parseThreadName("[US-Nor-Cal] [H] Rare Item [W] $$$");
	assert.strictEqual(result.region, "US-Nor-Cal");
	assert.ok(!result.mismatched);
});

test("parseThreadName: parentheses format supported", () => {
	const result = parseThreadName("(EU) (H) Test Item (W) 100 gold");
	assert.strictEqual(result.type, "SELL");
	assert.strictEqual(result.item, "Test Item");
	assert.strictEqual(result.offer, "100 gold");
	assert.ok(!result.mismatched);
});

test("parseThreadName: extra content allowed in offer", () => {
	assert.ok(!parseThreadName("[EU] [H] Test Item [W] 50g [extra stuff]").mismatched);
});
