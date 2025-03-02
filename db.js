const mongoose = require("mongoose");
require("dotenv").config(); 

async function connectDB() {
  const mongoURI = process.env.MONGO_URI;
  
  if (!mongoURI) {
    console.error("MongoDB connection string is missing in .env file.");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Connection Failed", err);
    process.exit(1);
  }
}

module.exports = connectDB;
