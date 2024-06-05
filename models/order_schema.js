
const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs'); 

const order_Schema = mongoose.Schema(
  {
    writer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    orders: [{
      food: { type: String },
      name: { type: String },
      price: { type: Number },
      count: { type: Number },
    }],
    to: {
      type: String, require: true
    },
    totalCount: {
      type: Number, require: true
    }
  },
  {
    timestamps: true
  }
);


const Order = mongoose.model('Order', order_Schema)

module.exports = Order;