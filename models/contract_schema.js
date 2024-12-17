const mongoose = require("mongoose");
// const bcrypt = require('bcryptjs');

const contract_Schema = mongoose.Schema(
    {
        title: {
            type: String,
        },
        writer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        originalname: {
            type: String,
        },
        key: {
            type: String,
        },
        location: {
            type: String,
        },
        pdfHash: {
            type: String,
        },
        receiverA: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        signA: {
            // pdf hash + certificate crypto
            type: String,
        },
        signPointerA: [
            {
                _id: false,
                pageNum: { type: Object },
                drawingEvent: {
                    type: Object,
                },
                signedTime: {
                    type: String,
                },
            },
        ],
        statusA: {
            // pending, read,sign
            type: String,
            enum: ["pending", "read", "signed"],
            default: "pending",
        },
        receiverB: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        signB: {
            // pdf hash + certificate crypto
            type: String,
        },
        signPointerB: [
            {
                _id: false,
                pageNum: { type: Object },
                drawingEvent: {
                    type: Object,
                },
                signedTime: {
                    type: String,
                },
            },
        ],
        statusB: {
            // pending, read,sign
            type: String,
            enum: ["pending", "read", "signed"],
            default: "pending",
        },
    },
    {
        timestamps: true,
    }
);

const Contract = mongoose.model("Contract", contract_Schema);

module.exports = Contract;
