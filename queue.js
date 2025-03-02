const { Queue } = require("bullmq");
const Redis = require("ioredis");
require("dotenv").config();

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

const imageQueue = new Queue("imageQueue", { connection });

module.exports = imageQueue;
