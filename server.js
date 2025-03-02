const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());
app.use(cors());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/image-processor')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define schemas and models
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

// API to upload CSV
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const requestId = uuidv4();
    const csvPath = req.file.path;
    const webhookUrl = req.body.webhookUrl;

    // Create a new request record
    const request = new Request({
      requestId,
      status: 'pending',
      csvPath,
      webhookUrl
    });

    await request.save();

    // Start validation in background
    setTimeout(() => {
      validateCsv(requestId, csvPath);
    }, 0);

    return res.status(202).json({ 
      message: 'CSV file received and queued for processing',
      requestId 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API to check processing status
app.get('/api/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findOne({ requestId });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const response = {
      requestId: request.requestId,
      status: request.status,
      progress: request.totalItems > 0 
        ? Math.round((request.processedItems / request.totalItems) * 100)
        : 0,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };

    if (request.status === 'completed' && request.outputCsvPath) {
      response.outputCsvUrl = `/api/download/${requestId}`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API to download the processed CSV
app.get('/api/download/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findOne({ requestId });

    if (!request || !request.outputCsvPath || request.status !== 'completed') {
      return res.status(404).json({ error: 'Output file not available' });
    }

    res.download(request.outputCsvPath);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files from the processed directory
app.use('/processed', express.static('processed'));

// Function to validate CSV and queue processing
async function validateCsv(requestId, csvPath) {
  try {
    const request = await Request.findOne({ requestId });
    if (!request) {
      console.error(`Request not found: ${requestId}`);
      return;
    }

    const rows = [];
    let isValid = true;
    let errorMessage = '';
    
    // Read and validate the CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on('data', (row) => {
          // Check if required columns exist
          if (!row['S. No.'] || !row['Product Name'] || !row['Input Image Urls']) {
            isValid = false;
            errorMessage = 'CSV is missing required columns';
          }
          rows.push(row);
        })
        .on('end', resolve)
        .on('error', (error) => {
          isValid = false;
          errorMessage = `CSV parsing error: ${error.message}`;
          reject(error);
        });
    });

    if (!isValid) {
      request.status = 'failed';
      request.updatedAt = new Date();
      await request.save();
      console.error(`CSV validation failed: ${errorMessage}`);
      return;
    }

    // Update request with total items
    request.totalItems = rows.length;
    request.status = 'processing';
    request.updatedAt = new Date();
    await request.save();

    // Store product information
    for (const row of rows) {
      const serialNumber = parseInt(row['S. No.']);
      const productName = row['Product Name'];
      const inputImageUrls = row['Input Image Urls'].split(',').map(url => url.trim());

      await Product.create({
        requestId,
        serialNumber,
        productName,
        inputImageUrls,
        status: 'pending'
      });
    }

    // Start processing in background
    startImageProcessing(requestId);
  } catch (error) {
    console.error(`CSV validation error: ${error}`);
    const request = await Request.findOne({ requestId });
    if (request) {
      request.status = 'failed';
      request.updatedAt = new Date();
      await request.save();
    }
  }
}

// Function to start image processing using worker threads
function startImageProcessing(requestId) {
  const worker = new Worker(`${__dirname}/worker.js`, {
    workerData: { requestId }
  });

  worker.on('message', async (message) => {
    console.log(`Worker message: ${JSON.stringify(message)}`);
    
    if (message.type === 'complete') {
      const request = await Request.findOne({ requestId });
      if (request) {
        request.status = 'completed';
        request.outputCsvPath = message.outputCsvPath;
        request.updatedAt = new Date();
        await request.save();
        
        // Call webhook if provided
        if (request.webhookUrl) {
          try {
            await axios.post(request.webhookUrl, {
              requestId,
              status: 'completed',
              outputCsvUrl: `/api/download/${requestId}`
            });
            console.log(`Webhook sent for request: ${requestId}`);
          } catch (error) {
            console.error(`Webhook error: ${error}`);
          }
        }
      }
    } else if (message.type === 'progress') {
      const request = await Request.findOne({ requestId });
      if (request) {
        request.processedItems = message.processedItems;
        request.updatedAt = new Date();
        await request.save();
      }
    } else if (message.type === 'error') {
      const request = await Request.findOne({ requestId });
      if (request) {
        request.status = 'failed';
        request.updatedAt = new Date();
        await request.save();
      }
    }
  });

  worker.on('error', async (error) => {
    console.error(`Worker error: ${error}`);
    const request = await Request.findOne({ requestId });
    if (request) {
      request.status = 'failed';
      request.updatedAt = new Date();
      await request.save();
    }
  });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});