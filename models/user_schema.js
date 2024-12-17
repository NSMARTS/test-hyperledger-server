const mongoose = require("mongoose");
// const bcrypt = require('bcryptjs');

const user_Schema = mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
        },
        org: {
            // naver, delivery,restaurant
            type: String,
        },
        auth: {
            type: String,
            enum: ["admin", "user"],
        },
        wallet: {
            type: String,
            ref: "Wallet",
        },
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model("User", user_Schema);

module.exports = User;
