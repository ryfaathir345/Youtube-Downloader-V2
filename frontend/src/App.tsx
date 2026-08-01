import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink } from 'react-router-dom';
import { Download, ChevronRight, Video, Sparkles, Link, Cpu, CheckCircle, ChevronDown } from 'lucide-react';
import './index.css';

import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import ProcessingPage from './pages/ProcessingPage';
import ResultsPage from './pages/ResultsPage';

function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    { 
      question: "Apakah aplikasi ini gratis digunakan?", 
      answer: "Ya! Versi MVP ClipForge AI saat ini gratis sepenuhnya untuk Anda coba dan gunakan." 
    },
    { 
      question: "Dari platform mana saja saya bisa mengunduh video?", 
      answer: "Anda dapat memproses video dari YouTube, TikTok, X (Twitter), Instagram, dan berbagai platform lainnya yang didukung oleh engine kami." 
    },
    { 
      question: "Berapa lama proses pembuatan klip AI?", 
      answer: "Tergantung pada durasi video asli Anda. Rata-rata proses membutuhkan waktu 2 hingga 5 menit dari awal hingga klip siap diunduh." 
    },
    { 
      question: "Apakah video asli saya disimpan di server Anda?", 
      answer: "Tidak secara permanen. Semua video sumber dan klip yang dihasilkan akan dihapus otomatis dari server kami dalam kurun waktu 24 jam demi menjaga privasi Anda." 
    }
  ];

  return (
    <div className="animate-fade-in-up flex-col-container">
      {/* Decorative Background Elements */}
      <div className="bg-blob blob-1"></div>
      <div className="bg-blob blob-2"></div>

      {/* Navbar */}
      <nav className="navbar">
        <div className="container flex justify-between items-center">
          <RouterLink to="/" className="logo">
            <Video size={28} color="var(--accent-primary)" />
            Clip<span>Forge</span> AI
          </RouterLink>
          <div className="flex gap-4">
            <RouterLink to="/download" className="btn btn-outline">Downloader</RouterLink>
            <RouterLink to="/clipper" className="btn btn-primary">Try AI Clipper</RouterLink>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="container text-center hero flex-grow">
        <div className="hero-content">
          <div className="badge mb-4">✨ v4 Now Live with AI Magic</div>
          <h1 className="hero-title">
            Repurpose Content <br />
            <span className="gradient-text">Zero-Touch Pipeline</span>
          </h1>
          <p className="hero-subtitle">
            From full videos to ready-to-upload viral clips. No editing required. 
            Just paste a link, and our AI does the transcribing, cropping, and titling.
          </p>

          {/* Before & After Interactive Showcase */}
          <div className="before-after-showcase mt-4 mb-12">
            <div className="showcase-card before-card">
              <div className="video-placeholder landscape">
                <div className="speaker-avatar"></div>
                <div className="speaker-avatar small"></div>
              </div>
              <p className="showcase-label">Before (16:9 Podcast)</p>
            </div>
            
            <div className="showcase-arrow">
              <Sparkles size={32} color="var(--accent-primary)" className="bounce-anim" />
              <span>AI Magic</span>
              <ChevronRight size={24} color="var(--text-secondary)" />
            </div>

            <div className="showcase-card after-card">
              <div className="video-placeholder portrait">
                <div className="speaker-avatar focus"></div>
                <div className="subtitle-mock">this is a viral highlight...</div>
              </div>
              <p className="showcase-label gradient-text" style={{fontWeight: 700}}>After (9:16 Viral Clip)</p>
            </div>
          </div>

          {/* Two main features */}
          <div className="dashboard-grid mb-12">
            {/* Feature 1: Downloader */}
            <RouterLink to="/download" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-icon-wrapper">
                <Download size={32} />
              </div>
              <h2 className="feature-title">Fast Downloader</h2>
              <p className="feature-desc">
                Download raw, high-quality videos from social platforms without any AI processing. Quick and simple.
              </p>
              <div className="flex items-center gap-2" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                Use Downloader <ChevronRight size={18} />
              </div>
            </RouterLink>

            {/* Feature 2: AI Clipper */}
            <RouterLink to="/clipper" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-icon-wrapper" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#EC4899' }}>
                <Sparkles size={32} />
              </div>
              <h2 className="feature-title">AI Auto-Clipper</h2>
              <p className="feature-desc">
                Let AI find the best highlights, burn subtitles, apply dynamic face tracking, and generate viral titles.
              </p>
              <div className="flex items-center gap-2" style={{ color: '#EC4899', fontWeight: 600 }}>
                Start AI Clipper <ChevronRight size={18} />
              </div>
            </RouterLink>
          </div>

          {/* How It Works Section */}
          <div className="how-it-works mt-8 mb-12">
            <h3 className="section-subtitle">How it works</h3>
            <div className="steps-grid">
              <div className="step-item">
                <div className="step-icon"><Link size={24} /></div>
                <h4>1. Paste Link</h4>
                <p>Input any supported video URL.</p>
              </div>
              <div className="step-item">
                <div className="step-icon"><Cpu size={24} /></div>
                <h4>2. AI Processing</h4>
                <p>We analyze, crop, and caption.</p>
              </div>
              <div className="step-item">
                <div className="step-icon"><CheckCircle size={24} /></div>
                <h4>3. Download</h4>
                <p>Get viral-ready clips instantly.</p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="faq-section mt-8 mb-12 text-left">
            <h3 className="section-subtitle text-center mb-6">Frequently Asked Questions</h3>
            <div className="faq-list">
              {faqs.map((faq, index) => (
                <div 
                  key={index} 
                  className={`faq-item ${openFaq === index ? 'active' : ''}`}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <div className="faq-question">
                    {faq.question}
                    <ChevronDown className="faq-icon" size={20} />
                  </div>
                  <div className="faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* Footer with Watermark */}
      <footer className="footer">
        <div className="container flex justify-between items-center">
          <p className="copyright">&copy; {new Date().getFullYear()} ClipForge AI. All rights reserved.</p>
          <div className="watermark">
            <span style={{ opacity: 0.5, fontSize: '0.85rem' }}>Created by</span>
            <span className="watermark-text">Shadown</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/clipper" element={<HomePage />} />
        <Route path="/processing" element={<ProcessingPage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </Router>
  );
}

export default App;
