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
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
	],
});

// Load events
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	const models = { User, Listing, Transaction, Rating, client };
	if (event.once) {
		client.once(event.name, () => event.execute(client, models));
	} else if (event.name === "threadCreate") {
		client.on(event.name, (thread) => event.execute(thread, models));
	} else if (event.name === "threadUpdate") {
		client.on(event.name, (oldThread, newThread) => event.execute(oldThread, newThread, models));
	} else if (event.name === "interactionCreate") {
		client.on(event.name, (interaction) => event.execute(interaction, models));
	}
}

// Sync database, then log in. Both steps are fatal on failure: a broken
// database or a failed login leaves the bot unusable, so surface the error
// and exit rather than continuing in a half-initialized state.
(async () => {
	try {
		await sequelize.sync(); // Safe sync - adds missing columns/tables without dropping existing data
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
