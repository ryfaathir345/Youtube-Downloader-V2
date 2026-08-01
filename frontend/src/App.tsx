import { useState } from 'react';
import { Scissors, Loader2, AlertCircle, Video } from 'lucide-react';
import { ClipCard } from './components/ClipCard';
import type { Clip } from './components/ClipCard';
import './index.css';

function App() {
  const [url, setUrl] = useState('');
  const [numClips, setNumClips] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [meta, setMeta] = useState<any>(null);

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
              <h2>Hasil Klip ({clips.length})</h2>
              {meta && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span className="badge badge-source">Groq: {meta.groq_clip_count}</span>
                  <span className="badge badge-source">Gemini: {meta.gemini_clip_count}</span>
                </div>
              )}
            </div>
            
            <div className="clips-grid">
              {clips.map((clip, index) => (
                <ClipCard key={index} clip={clip} index={index} />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer style={{ marginTop: '5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <p>Built with ❤️ by Antigravity IDE</p>
      </footer>
    </div>
  );
}

export default App;
