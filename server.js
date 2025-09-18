const express = require('express');
const { Storage } = require('@google-cloud/storage');

const app = express();

const PORT = process.env.PORT || 8080;

const storage = new Storage({
  projectId: 'cse4265-2025-103550949'
});

const bucketName = 'cse4265-2025-103550949.appspot.com';


app.get('/', (req, res) => {
  res.send(`
    <h1>Hello from App Engine!</h1>
    <h2>Video Streaming Test</h2>
    <body>
            <video width="800" height="600" controls preload="metadata">
                <source src="/video/demo_h264.mp4" type="video/mp4">
                Your browser does not support the video tag.
            </video>
      
            <br><br>
      
            <video width="800" height="600" controls preload="metadata">
                <source src="/video/demo_h265.mp4" type="video/mp4">
                Your browser does not support the video tag.
            </video>
    </body>
  `);
});

app.get('/video/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const file = storage.bucket(bucketName).file(filename);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('Video not found');
    }
    
    res.setHeader('Content-Type', 'video/mp4');
    
    const stream = file.createReadStream();
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Streaming error:', err);
      next(err);
    });

  } catch (error) {
    console.error('Error:', error);
    next(error);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});