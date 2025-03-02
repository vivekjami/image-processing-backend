const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { v4: uuidv4 } = require("uuid");
const Request = require("../models/Request");
const Product = require("../models/Product");
const Image = require("../models/Image");
const imageQueue = require("../queue");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), async (req, res) => {
  const request_id = uuidv4();
  await Request.create({ request_id });

  const filePath = req.file.path;
  const rows = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", async (row) => {
      const product = await Product.create({
        request_id,
        product_name: row["Product Name"],
      });

      const urls = row["Input Image Urls"].split(",");
      for (const url of urls) {
        await Image.create({ product_id: product._id, input_url: url });
        await imageQueue.add("processImage", { request_id, product_id: product._id, url });
      }
    })
    .on("end", () => {
      fs.unlinkSync(filePath);
      res.json({ request_id });
    });
});

module.exports = router;
