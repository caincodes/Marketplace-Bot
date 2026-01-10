const Sequelize = require("sequelize");

module.exports = (sequelize) => {
	return sequelize.define("User", {
		id: {
			type: Sequelize.STRING,
			primaryKey: true,
		},
		username: {
			type: Sequelize.STRING,
			allowNull: false,
		},
	});
};
