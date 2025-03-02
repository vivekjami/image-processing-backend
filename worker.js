const { workerData, parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createObjectCsvWriter } = require('csv-writer');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/image-processor')
  .then(() => console.log('Worker connected to MongoDB'))
  .catch(err => console.error('Worker MongoDB connection error:', err));

// Define schemas and models (duplicated for worker context)
const RequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  totalItems: { type: Number, default: 0 },
  processedItems: { type: Number, default: 0 },
  csvPath: { type: String, required: true },
  outputCsvPath: { type: String },
  webhookUrl: { type: String }
});

const ProductSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  serialNumber: { type: Number, required: true },
  productName: { type: String, required: true },
  inputImageUrls: [{ type: String }],
  outputImageUrls: [{ type: String }],
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  }
});

const Request = mongoose.model('Request', RequestSchema);
const Product = mongoose.model('Product', ProductSchema);

async function main() {
  try {
    const { requestId } = workerData;
    parentPort.postMessage({ type: 'info', message: `Starting processing for request: ${requestId}` });

    // Get all products for this request
    const products = await Product.find({ requestId }).sort({ serialNumber: 1 });
    let processedItems = 0;

    // Process each product
    for (const product of products) {
      try {
        product.status = 'processing';
        await product.save();

        const outputImageUrls = [];

        // Process each image
        for (const imageUrl of product.inputImageUrls) {
          try {
            // Create output directory if it doesn't exist
            const outputDir = './processed';
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir);
            }

            // Download the image
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data);

            // Process the image - compress by 50%
            const outputBuffer = await sharp(imageBuffer)
              .jpeg({ quality: 50 }) // 50% quality compression
              .toBuffer();

            // Generate output filename
            const originalFilename = path.basename(imageUrl);
            const outputFilename = `${Date.now()}-processed-${originalFilename}`;
            const outputPath = path.join(outputDir, outputFilename);

            // Save the processed image
            fs.writeFileSync(outputPath, outputBuffer);

            // In a real system, you would upload this to a cloud storage
            // For this example, we'll just use a local URL
            const outputUrl = `http://localhost:3000/processed/${outputFilename}`;
            outputImageUrls.push(outputUrl);
          } catch (error) {
            console.error(`Error processing image ${imageUrl}: ${error}`);
            // Add a placeholder for failed image
            outputImageUrls.push('processing_failed');
          }
        }

        // Update product with processed images
        product.outputImageUrls = outputImageUrls;
        product.status = 'completed';
        await product.save();

        // Update progress
        processedItems++;
        parentPort.postMessage({ 
          type: 'progress', 
          processedItems 
        });
      } catch (error) {
        console.error(`Error processing product ${product.productName}: ${error}`);
        product.status = 'failed';
        await product.save();
      }
    }

    // Generate output CSV
    const request = await Request.findOne({ requestId });
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    const outputCsvPath = path.join(outputDir, `${requestId}-output.csv`);
    
    const csvWriter = createObjectCsvWriter({
      path: outputCsvPath,
      header: [
        { id: 'serialNumber', title: 'S. No.' },
        { id: 'productName', title: 'Product Name' },
        { id: 'inputImageUrls', title: 'Input Image Urls' },
        { id: 'outputImageUrls', title: 'Output Image Urls' }
      ]
    });
    
    const csvData = products.map(product => ({
      serialNumber: product.serialNumber,
      productName: product.productName,
      inputImageUrls: product.inputImageUrls.join(', '),
      outputImageUrls: product.outputImageUrls.join(', ')
    }));
    
    await csvWriter.writeRecords(csvData);
    
    // Notify completion
    parentPort.postMessage({ 
      type: 'complete', 
      outputCsvPath 
    });
  } catch (error) {
    console.error(`Worker main error: ${error}`);
    parentPort.postMessage({ 
      type: 'error', 
      error: error.message 
    });
  } finally {
    // Close the mongoose connection
    await mongoose.connection.close();
  }
}

main();