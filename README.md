## Image-processing-backend Documentation

### 1. Upload API

**Endpoint:** `POST /api/upload`

**Description:** Accepts a CSV file, validates its format, and returns a unique request ID.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file`: CSV file (required)
  - `webhookUrl`: URL to notify upon completion (optional)

**Response:**
- Status: 202 Accepted
- Body:
```json
{
  "message": "CSV file received and queued for processing",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Status API

**Endpoint:** `GET /api/status/:requestId`

**Description:** Checks the processing status of a specific request.

**Response:**
- Status: 200 OK
- Body:
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 75,
  "createdAt": "2025-03-01T10:15:30Z",
  "updatedAt": "2025-03-01T10:20:45Z"
}
```

### 3. Download API

**Endpoint:** `GET /api/download/:requestId`

**Description:** Downloads the processed output CSV file.

**Response:**
- Status: 200 OK
- Content-Type: `text/csv`
- Body: CSV file with processed image data

## System-Architecture
![System-Architecture-diagram](/system-architecture-diagram.png)
## ER-diagram
![ER-Diagram](/er-diagram.png)


## Worker Service Documentation

The worker service handles asynchronous processing of images from the CSV file. It performs the following tasks:

1. **Image Processing:**
   - Downloads images from provided URLs
   - Compresses images to 50% of original quality using Sharp
   - Saves processed images to storage
   - Updates product records with output image URLs

2. **Progress Tracking:**
   - Updates request status and progress in real-time
   - Communicates progress back to the main server process

3. **Output Generation:**
   - Creates output CSV file with original and processed image URLs
   - Updates request record with the path to the output file

4. **Webhook Notification:**
   - Sends a POST request to the webhook URL if provided
   - Includes request ID and link to download the processed data

## Setup and Installation

1. **Prerequisites:**
   - Node.js (v14+)
   - MongoDB
   - npm or yarn

2. **Install dependencies:**
   ```bash
   npm install express mongoose multer csv-parser uuid axios sharp cors dotenv csv-writer
   ```

3. **Configure environment variables:**
   Create a `.env` file with:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/image-processor
   ```

4. **Start the server:**
   ```bash
   node server.js
   ```

## How to Test

1. Create a CSV file following the specified format
2. Use the Postman collection to:
   - Upload the CSV file
   - Check the processing status
   - Download the result when processing is complete

## Additional Considerations

1. **Scalability:**
   - The worker thread model can be extended to handle multiple workers
   - For production environments, consider using a proper task queue like RabbitMQ or Redis

2. **Error Handling:**
   - The system handles errors at various levels
   - Failed image processing doesn't stop the entire batch

3. **Security:**
   - Implement proper authentication for the APIs in production
   - Validate image URLs before processing

4. **Storage:**
   - In a production environment, use cloud storage instead of local storage
   - Implement file cleanup for temporary files
