function parseThreadName(threadName) {
	const bracketRegex = /[\[(]([^\]\)]+)[\])]/g;
	const matches = [...threadName.matchAll(bracketRegex)];

	let region = null;
	let firstBracket = null;
	let secondBracket = null;

	const regionRegex = /^[A-Z]+(?:-[A-Z]+)+$/i; // handles US-NM, US-Nor-Cal, etc.

	for (const m of matches) {
		const val = m[1].trim();

		// Detect region: remove spaces for matching
		if (!region && regionRegex.test(val.replace(/\s+/g, ""))) {
			region = val;
		} else if ((val === "H" || val === "W") && !firstBracket) {
			firstBracket = val;
		} else if ((val === "H" || val === "W") && !secondBracket) {
			secondBracket = val;
		}
	}

	// If no H/W brackets, mark as mismatched
	if (!firstBracket || !secondBracket) {
		return {
			name: threadName,
			region,
			typeRaw: null,
			type: null,
			item: threadName.replace(`[${region}]`, "").trim() || null,
			ask: null,
			offer: null,
			mismatched: true,
			error: "No H/W bracket found. Please use `[H/W]` to indicate what you have or want.",
		};
	}

	// Determine type
	let type = firstBracket === "H" ? "SELL" : "BUY";
	let typeRaw = firstBracket;
	let ask = secondBracket || null;

	// Find positions
	const firstIndex =
		threadName.indexOf(`[${firstBracket}]`) !== -1
			? threadName.indexOf(`[${firstBracket}]`)
			: threadName.indexOf(`(${firstBracket})`);

	const secondIndex = ask
		? threadName.indexOf(`[${ask}]`) !== -1
			? threadName.indexOf(`[${ask}]`)
			: threadName.indexOf(`(${ask})`)
		: null;

	// Extract item/offer
	let item = "";
	let offer = "";

	if (secondIndex !== null && secondIndex > firstIndex) {
		item = threadName.slice(firstIndex + 3, secondIndex).trim();
		offer = threadName.slice(secondIndex + 3).trim();
	} else {
		item = threadName.slice(firstIndex + 3).trim();
	}

	let mismatched = !item || (ask && !offer);

	return {
		name: threadName,
		region,
		typeRaw,
		type,
		item: item || null,
		ask,
		offer: offer || null,
		mismatched,
		error: mismatched ? "Could not parse item/offer correctly." : null,
	};
}

module.exports = parseThreadName;
