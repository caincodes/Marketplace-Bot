const Sequelize = require("sequelize");

module.exports = (sequelize) => {
	return sequelize.define("Rating", {
		id: {
			type: Sequelize.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		transactionId: {
			type: Sequelize.INTEGER,
			allowNull: false,
		},
		raterId: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		rateeId: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		rating: {
			type: Sequelize.ENUM("positive", "negative"),
			allowNull: false,
		},
		review: {
			type: Sequelize.TEXT,
			allowNull: true,
		},
	}, {
		// One rating per user per transaction
		indexes: [{ unique: true, fields: ["transactionId", "raterId"] }],
	});
};
