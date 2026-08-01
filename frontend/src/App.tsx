import { useState } from 'react';
import { Scissors, Loader2, AlertCircle, Video, X, Flame } from 'lucide-react';
import { ClipCard } from './components/ClipCard';
import type { Clip } from './components/ClipCard';
import './index.css';

const extractYouTubeId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

function App() {
  const [url, setUrl] = useState('');
  const [numClips, setNumClips] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);
    setClips([]);
    setMeta(null);

    try {
      const response = await fetch('http://localhost:3000/api/v1/clipper/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, numClips }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Terjadi kesalahan pada server');
      }

      setClips(data.clips || []);
      setMeta(data.meta || null);
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server backend');
    } finally {
      setLoading(false);
    }
  };

  const videoId = extractYouTubeId(url);

  return (
    <div className="container">
      <header className="flex flex-col items-center justify-center gap-4" style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '1rem', borderRadius: '50%', display: 'inline-flex' }}>
          <Scissors size={48} color="var(--accent-primary)" />
        </div>
        <h1 className="text-gradient" style={{ fontSize: '3rem', margin: 0 }}>ClipForge AI</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>
          Ubah video YouTube panjang Anda menjadi klip short-form viral secara otomatis menggunakan kekuatan Groq & Gemini.
        </p>
      </header>

      <main>
        <div className="glass-panel" style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>URL YouTube</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}>
                  <Video size={20} color="var(--text-muted)" />
                </div>
                <input 
                  type="url" 
                  placeholder="https://www.youtube.com/watch?v=..." 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  style={{ paddingLeft: '48px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Target Jumlah Klip</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={numClips}
                onChange={(e) => setNumClips(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading || !url}>
              {loading ? (
                <>
                  <Loader2 className="spinner" size={20} /> Memproses Video... (Bisa memakan waktu lama)
                </>
              ) : (
                <>
                  <Scissors size={20} /> Generate Clips
                </>
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginTop: '2rem', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <div className="flex items-center gap-4" style={{ color: 'var(--error)' }}>
              <AlertCircle size={24} />
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {!loading && clips.length > 0 && (
          <div style={{ marginTop: '4rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
              <h2>Hasil Klip Viral ({clips.length})</h2>
              {meta && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span className="badge badge-source">Groq: {meta.groq_clip_count}</span>
                  <span className="badge badge-source">Gemini: {meta.gemini_clip_count}</span>
                </div>
              )}
            </div>
            
            <div className="clips-grid">
              {clips.map((clip, index) => (
                <ClipCard 
                  key={index} 
                  clip={clip} 
                  index={index} 
                  onPreview={(c) => setPreviewClip(c)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Video Preview Modal */}
      {previewClip && (
        <div className="modal-overlay" onClick={() => setPreviewClip(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{previewClip.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{previewClip.viral_potential || '🔥 High Viral Potential'}</span>
                  <span>•</span>
                  <span>Skor Viral: <strong style={{ color: '#ef4444' }}>{previewClip.virality_score ?? 90}/100</strong></span>
                </div>
              </div>
              <button 
                onClick={() => setPreviewClip(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>

            <div className="video-container">
              {videoId ? (
                <iframe 
                  src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(previewClip.start_time)}&end=${Math.ceil(previewClip.end_time)}&autoplay=1`}
                  title={previewClip.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <AlertCircle size={40} style={{ marginBottom: '1rem' }} />
                  <p>Tidak dapat memutar iframe karena URL video YouTube tidak valid.</p>
                </div>
              )}
            </div>

            <div style={{ padding: '1.25rem 1.5rem', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid var(--glass-border)' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>Hook:</strong> "{previewClip.hook}"
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {previewClip.reason}
              </p>
            </div>
          </div>
        </div>
      )}

      <footer style={{ marginTop: '5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <p>Built with ❤️ by Antigravity IDE</p>
      </footer>
    </div>
  );
}

export default App;
