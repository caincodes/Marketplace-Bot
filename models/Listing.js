const Sequelize = require("sequelize");

module.exports = (sequelize) => {
	return sequelize.define("Listing", {
		id: {
			type: Sequelize.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		userId: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		region: Sequelize.STRING,
		type: Sequelize.STRING,
		item: Sequelize.TEXT,
		offer: Sequelize.TEXT,
		threadId: Sequelize.STRING,
		transactionIds: {
			type: Sequelize.JSON,
			defaultValue: [],
		},
		ratingIds: {
			type: Sequelize.JSON,
			defaultValue: [],
		},
	});
};
