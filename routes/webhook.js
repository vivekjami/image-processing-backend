const express = require("express");
const Image = require("../models/Image");

const router = express.Router();

router.post("/", async (req, res) => {
  const { request_id } = req.body;
  const images = await Image.find({ request_id }).select("input_url output_url");
  res.json({ request_id, images });
});

module.exports = router;
