const express = require('express');
const { Storage } = require('@google-cloud/storage');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

const storage = new Storage({
  projectId: 'cse4265-2025-103550949'
});

const bucketName = 'cse4265-2025-103550949.appspot.com';
const VIDEO_DIR = 'hfr'; // Desktop用はHFR

// CORS setting
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  next();
});

// ルートパス
app.get('/', (req, res) => {
  res.send('Desktop Video Service (HFR)');
});

app.get('/video/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filePath = `hfr/${filename}`;
    
    console.log(`Desktop service: Streaming ${filePath}`);
    
    const file = storage.bucket(bucketName).file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`File not found: ${filePath}`);
      return res.status(404).send('File not found');
    }
    
    if (filename.endsWith('.mpd')) {
      res.setHeader('Content-Type', 'application/dash+xml');
    } else if (filename.endsWith('.m4s') || filename.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const stream = file.createReadStream();
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Streaming error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error streaming file');
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

// /video/:foldername/:filename エンドポイント
app.get('/video/:foldername/:filename', async (req, res, next) => {
  try {
    const { foldername, filename } = req.params;
    console.log(`folder name: ${foldername}$`)
    console.log(`folder name: ${filename}$`)
    const filePath = `${foldername}/${filename}`;
    
    console.log(`Desktop service: Streaming ${filePath}`);
    
    const file = storage.bucket(bucketName).file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('File not found');
    }
    
    if (filename.endsWith('.mpd')) {
      res.setHeader('Content-Type', 'application/dash+xml');
    } else if (filename.endsWith('.m4s') || filename.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
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
  console.log(`Desktop service listening on port ${PORT}...`);
});