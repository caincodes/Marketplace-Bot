const Sequelize = require("sequelize");

module.exports = (sequelize) => {
	return sequelize.define("Transaction", {
		id: {
			type: Sequelize.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		listingId: {
			type: Sequelize.INTEGER,
			allowNull: false,
		},
		sellerId: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		buyerId: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		type: {
			type: Sequelize.ENUM("purchase", "trade", "money+trade"),
			allowNull: false,
		},
		status: {
			type: Sequelize.ENUM("pending", "confirmed"),
			defaultValue: "pending",
		},
		ratingIds: {
			type: Sequelize.JSON,
			defaultValue: [],
		},
	});
};
