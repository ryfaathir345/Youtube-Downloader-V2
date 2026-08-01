# ClipForge AI (v4 MVP)

ClipForge AI is a powerful, dual-purpose web application designed for content creators, podcasters, and social media managers. It simplifies the content repurposing workflow into a single click.

## Features

### 1. Fast Video Downloader
A standalone tool to download raw, high-quality videos from popular social platforms (YouTube, TikTok, Instagram, etc.) without any AI processing. Quick, simple, and reliable.

### 2. AI Auto-Clipper
A zero-touch pipeline that transforms long-form videos into viral, short-form clips (9:16).
- **Auto-Highlight**: AI automatically detects the best, most engaging moments from the video using Gemini.
- **Auto-Subtitle**: High-accuracy transcription and subtitle burn-in using Groq Whisper.
- **Dynamic Face Focus**: Automatically crops the video and keeps the primary speaker in the center of the frame.
- **Viral Titles & Metadata**: Automatically generates 3 title options, descriptions, and hashtags for each clip.

## Tech Stack
- **Frontend**: React, Vite, TypeScript
- **Backend**: Node.js, Express/Fastify (planned)
- **AI & ML**: Groq (Whisper), Gemini AI, MediaPipe (Face Detection)
- **Processing Engine**: FFmpeg, yt-dlp
- **Infrastructure**: BullMQ (Redis), Object Storage

## Getting Started (Frontend)

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## License
Created by **Shadown**.
