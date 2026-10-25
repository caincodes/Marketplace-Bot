require("dotenv").config({ quiet: true });
const token = process.env.BOT_TOKEN;
const Sequelize = require("sequelize");
const fs = require("fs");
const path = require("path");

const sequelize = new Sequelize({
	dialect: "sqlite",
	storage: "db.sqlite",
	logging: false,
});

// Load models
const User = require("./models/User")(sequelize);
const Listing = require("./models/Listing")(sequelize);
const Transaction = require("./models/Transaction")(sequelize);
const Rating = require("./models/Rating")(sequelize);

// Define associations
User.hasMany(Listing, { foreignKey: "userId" });
Listing.belongsTo(User, { foreignKey: "userId" });
Listing.hasMany(Transaction, { foreignKey: "listingId" });
Transaction.belongsTo(Listing, { foreignKey: "listingId" });
Transaction.hasMany(Rating, { foreignKey: "transactionId" });
Rating.belongsTo(Transaction, { foreignKey: "transactionId" });

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
	],
});

// Load events
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

const models = { User, Listing, Transaction, Rating, client };

for (const file of eventFiles) {
	const event = require(path.join(eventsPath, file));
	// Event handlers are async; EventEmitter ignores the returned promise, so a
	// rejection would otherwise surface as an unhandled rejection.
	const handler = (...args) =>
		Promise.resolve()
			.then(() => event.execute(...args, models))
			.catch((err) => console.error(`[Error] Unhandled error in ${event.name}:`, err));
	if (event.once) {
		client.once(event.name, handler);
	} else {
		client.on(event.name, handler);
	}
}

// Last line of defense: log stray rejections (e.g. a fire-and-forget send to a
// deleted thread) instead of letting Node terminate the process.
process.on("unhandledRejection", (reason) => {
	console.error("[Error] Unhandled promise rejection:", reason);
});

// Sync database, then log in. Both steps are fatal on failure: a broken
// database or a failed login leaves the bot unusable, so surface the error
// and exit rather than continuing in a half-initialized state.
(async () => {
	try {
		await sequelize.sync(); // Creates missing tables and indexes; never alters existing columns
		console.log("Database synced successfully.");
	} catch (err) {
		console.error("Fatal: failed to sync database:", err);
		process.exit(1);
	}

	try {
		await client.login(token);
	} catch (err) {
		console.error("Fatal: failed to log in to Discord:", err);
		process.exit(1);
	}
})();
