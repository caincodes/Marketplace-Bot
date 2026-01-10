require("dotenv").config();
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

// Define associations
User.hasMany(Listing, { foreignKey: "userId" });
Listing.belongsTo(User, { foreignKey: "userId" });

// Sync database
sequelize.sync();

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
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args, { User, Listing, client }));
	} else {
		client.on(event.name, (...args) => event.execute(...args, { User, Listing, client }));
	}
}

client.login(token);
