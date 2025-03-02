const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  serial_no: { type: Number, required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: "ProductName" },
  input_url: { type: String, required: true },
  output_url: { type: String },
});

module.exports = mongoose.model("Image", ImageSchema);
