/**
 * Define all models and their associations on a Sequelize instance.
 * @param {Object} sequelize - Sequelize instance
 * @returns {{ User, Listing, Transaction, Rating }} The defined models
 */
function initModels(sequelize) {
	const User = require("./User")(sequelize);
	const Listing = require("./Listing")(sequelize);
	const Transaction = require("./Transaction")(sequelize);
	const Rating = require("./Rating")(sequelize);

	User.hasMany(Listing, { foreignKey: "userId" });
	Listing.belongsTo(User, { foreignKey: "userId" });
	Listing.hasMany(Transaction, { foreignKey: "listingId" });
	Transaction.belongsTo(Listing, { foreignKey: "listingId" });
	Transaction.hasMany(Rating, { foreignKey: "transactionId" });
	Rating.belongsTo(Transaction, { foreignKey: "transactionId" });

	return { User, Listing, Transaction, Rating };
}

module.exports = { initModels };
