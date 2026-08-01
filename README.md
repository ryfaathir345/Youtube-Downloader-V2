<div align="center">
  <h1>✨ ClipForge AI (v4 MVP) ✨</h1>
  <p><strong>Transform Your Long Videos into Viral Shorts Automatically!</strong></p>
  
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
  [![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](#)
  [![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
</div>

<br />

Welcome to **ClipForge AI**! 🚀 This is a powerful, dual-purpose web application designed for content creators, podcasters, and social media managers. We simplify the content repurposing workflow into a single click!

---

## 🌟 Features at a Glance

### 📥 1. Fast Video Downloader
A standalone tool to download raw, high-quality videos from popular social platforms (YouTube, TikTok, Instagram, X, etc.) without any AI processing. 
* ⚡ **Lightning Fast Download**
* 🎯 **Direct Streaming**
* 🔒 **No Watermark**

### 🤖 2. AI Auto-Clipper
A zero-touch pipeline that transforms long-form videos into viral, short-form clips (9:16 aspect ratio).
* 🎯 **Auto-Highlight**: AI automatically detects the best, most engaging moments from the video using **Gemini AI**.
* 💬 **Auto-Subtitle**: High-accuracy transcription and subtitle burn-in using **Groq Whisper**.
* 👤 **Dynamic Face Focus**: Automatically crops the video and keeps the primary speaker in the center of the frame.
* ✍️ **Viral Titles & Metadata**: Automatically generates 3 title options, descriptions, and hashtags for each clip.

---

## 🛠️ Tech Stack

**Frontend 💻**
* React + Vite
* TypeScript
* CSS3 (Modern UI)

**Backend ⚙️ (Work in Progress)**
* Node.js / Express
* BullMQ (Redis Job Queue)
* PostgreSQL

**AI & Processing 🧠**
* **Groq (Whisper)** for Speech-to-Text
* **Google Gemini AI** for Highlights & Metadata
* **MediaPipe** for Face Tracking
* **FFmpeg** & **yt-dlp** for Video Processing

---

## 🚀 How to Use & Installation Guide

Do you want to run this project on your local machine? Follow these easy steps to get started!

### 1️⃣ Clone the Repository
Open your terminal and run the following command to clone this repository:
```bash
git clone https://github.com/ryfaathir345/Youtube-Downloader-V2.git
cd Youtube-Downloader-V2
```

### 2️⃣ Frontend Setup
Navigate to the `frontend` directory and install the necessary dependencies:
```bash
cd frontend
npm install
```

### 3️⃣ Run the Application
Start the Vite development server:
```bash
npm run dev
```
Open your browser and visit `http://localhost:5173` to see the magic happen! ✨

---

## 💡 How the AI Pipeline Works
1. **Paste URL**: Input any supported video link (YouTube, TikTok, etc).
2. **AI Processing**: Our backend downloads the video, Groq creates a full transcript, and Gemini finds the most viral moments.
3. **Rendering**: FFmpeg crops the video dynamically focusing on the face, burns the subtitles, and prepares it for download.
4. **Download**: You get ready-to-upload MP4 files! 🎉

---

## 📝 License
Created with ❤️ by **Shadown**. All rights reserved.

<div align="center">
  <br/>
  <i>"Stop editing manually. Let AI do the heavy lifting."</i>
</div>
