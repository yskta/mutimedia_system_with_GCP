const express = require('express');
const { Storage } = require('@google-cloud/storage');
const path = require('path'); // 追加

const app = express();

const PORT = process.env.PORT || 8080;

const storage = new Storage({
  projectId: 'cse4265-2025-103550949'
});

const bucketName = 'cse4265-2025-103550949.appspot.com';

// CORS setting
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  next();
});

// enable to access such as "http://localhost:8080/dash_player.html"
app.use(express.static('public'));

// enable to access such as "http://localhost:8080/dash_player"
app.get('/dash-player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dash_player.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// Google Cloud Storageからファイルを取得してHTTPレスポンスで配信
app.get('/video/:foldername/:filename', async (req, res, next) => {
  try {
    const { foldername, filename } = req.params;
    const filePath = `${foldername}/${filename}`;
    const file = storage.bucket(bucketName).file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('File not found');
    }
    
    // ファイル形式に応じたContent-Type
    if (filename.endsWith('.mpd')) {
      res.setHeader('Content-Type', 'application/dash+xml');
    } else if (filename.endsWith('.m4s') || filename.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    
    const stream = file.createReadStream();
    stream.pipe(res);
    
  } catch (error) {
    console.error('Error:', error);
    next(error);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
  console.log(`Main page: http://localhost:${PORT}/`);
  console.log(`DASH player: http://localhost:${PORT}/dash-player`);
  console.log(`Direct dash_player HTML: http://localhost:${PORT}/dash_player.html`);
});