const fs = require("fs");
const path = require("path");

const eventsPath = path.join(__dirname, "../events");

/**
 * Wrap an event module's execute so the Discord event's arguments are passed
 * through, followed by the models, and any rejection is logged.
 * @param {Object} event - Event module ({ name, execute })
 * @param {Object} models - Database models and client
 * @returns {(...args: any[]) => Promise<void>}
 */
function createEventHandler(event, models) {
	// Event handlers are async; EventEmitter ignores the returned promise, so a
	// rejection would otherwise surface as an unhandled rejection.
	return (...args) =>
		Promise.resolve()
			.then(() => event.execute(...args, models))
			.catch((err) => console.error(`[Error] Unhandled error in ${event.name}:`, err));
}

/**
 * Register every module in events/ on the client.
 * @param {Object} client - Discord client
 * @param {Object} models - Database models and client
 */
function registerEvents(client, models) {
	const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));
	for (const file of eventFiles) {
		const event = require(path.join(eventsPath, file));
		const handler = createEventHandler(event, models);
		if (event.once) {
			client.once(event.name, handler);
		} else {
			client.on(event.name, handler);
		}
	}
}

module.exports = { createEventHandler, registerEvents };
