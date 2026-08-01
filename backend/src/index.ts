import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import downloaderRoutes from './modules/downloader/downloader.routes';
import clipperRoutes from './modules/clipper/clipper.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Path to the directory where Python saves cut clips
const clipsDir = path.resolve(__dirname, '../clips');

app.use(cors());
app.use(express.json());

// Serve cut clip MP4 files
app.use('/clips', express.static(clipsDir));

// Routes
app.use('/api/v1/download', downloaderRoutes);
app.use('/api/v1/clipper', clipperRoutes);

app.get('/', (req, res) => {
  res.send('ClipForge AI Backend API MVP v4 is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Clip files served at: http://localhost:${PORT}/clips`);
});

