const fs = require("fs");
const path = require("path");

const commandsPath = path.join(__dirname, "../commands");
let commands;

/**
 * Load every slash command module once, keyed by command name. A file that
 * fails to load is logged and skipped so one broken command can't take down
 * the rest.
 * @returns {Map<string, Object>} Command name -> command module
 */
function getCommands() {
	if (commands) return commands;

	commands = new Map();
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
	for (const file of commandFiles) {
		try {
			const command = require(path.join(commandsPath, file));
			commands.set(command.data.name, command);
		} catch (error) {
			console.error(`Error loading command file ${file}:`, error);
		}
	}
	return commands;
}

module.exports = { getCommands };
