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

// Sync database safely: add missing columns but don't drop tables
(async () => {
	try {
		await sequelize.sync(); // Safe sync - adds missing columns/tables without dropping existing data
		console.log("Database synced successfully.");
	} catch (err) {
		console.error("Error syncing database:", err);
	}
})();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
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

client.login(token);
