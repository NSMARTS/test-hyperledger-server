const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const mongApp = {};
mongApp.appSetObjectId = function (app) {
    app.set("ObjectId", mongoose.Types.ObjectId);
};

main().catch((err) => console.log(err));

async function main() {
    // test-potatocs , potatocs
    await mongoose.connect(process.env.MONGODB_URI).then(() => {
        createSchema();
    });
}

function createSchema() {
    const dbModels = {};
    dbModels.User = require("../models/user_schema");
    dbModels.Wallet = require("../models/wallet_schema");
    dbModels.Order = require("../models/order_schema");
    dbModels.Contract = require("../models/contract_schema");

    global.DB_MODELS = dbModels;
}

module.exports = mongApp;
