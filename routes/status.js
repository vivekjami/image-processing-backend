const express = require("express");
const Request = require("../models/Request");

const router = express.Router();

router.get("/:request_id", async (req, res) => {
  const request = await Request.findOne({ request_id: req.params.request_id });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  res.json({ status: request.status });
});

module.exports = router;
