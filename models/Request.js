const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  request_id: { type: String, unique: true, required: true },
  status: { type: String, default: "processing" },
});

module.exports = mongoose.model("Request", RequestSchema);
