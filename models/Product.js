const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  request_id: { type: String, required: true },
  product_name: { type: String, required: true },
});

module.exports = mongoose.model("Product", ProductSchema);
