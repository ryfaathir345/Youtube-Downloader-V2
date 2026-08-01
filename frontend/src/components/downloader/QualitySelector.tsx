import { useState } from 'react';
import { Download, Clock, Image as ImageIcon } from 'lucide-react';

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  quality: string;
  filesize: number;
  vcodec: string;
  acodec: string;
}

export interface VideoInfo {
  title: string;
  duration_seconds: number;
  thumbnail_url: string;
  platform: string;
  formats: VideoFormat[];
}

interface QualitySelectorProps {
  info: VideoInfo;
  url: string;
}

export default function QualitySelector({ info, url }: QualitySelectorProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>('best');

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    // Initiate direct download from backend
    window.location.href = `/api/v1/download?url=${encodeURIComponent(url)}&quality=${selectedFormat}`;
  };

  // Filter out formats that are just weird or don't have good descriptions
  const validFormats = info.formats.filter(f => f.resolution !== 'audio only' || f.acodec !== 'none');

  return (
    <div className="card mt-8 animate-fade-in-up" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div className="flex flex-col md:flex-row gap-6">
        {/* Thumbnail */}
        <div style={{ flex: '0 0 300px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#e5e5e5', position: 'relative' }}>
          {info.thumbnail_url ? (
             <img src={info.thumbnail_url} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '16/9' }} />
          ) : (
             <div className="flex items-center justify-center h-full" style={{ aspectRatio: '16/9' }}>
               <ImageIcon size={48} color="#999" />
             </div>
          )}
          <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <Clock size={14} /> {formatDuration(info.duration_seconds)}
          </div>
        </div>

        {/* Details & Action */}
        <div className="flex flex-col flex-grow">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {info.title}
          </h2>
          <div className="badge mb-4" style={{ alignSelf: 'flex-start' }}>{info.platform}</div>

          <div style={{ marginTop: 'auto' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Select Quality / Format</label>
            <div className="flex gap-4">
              <select 
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                style={{
                  flexGrow: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '1rem',
                  outline: 'none',
                  backgroundColor: 'var(--bg-color)'
                }}
              >
                <option value="best">Best Quality (Auto)</option>
                {validFormats.map(f => (
                  <option key={f.format_id} value={f.format_id}>
                    {f.resolution} {f.ext ? `(.${f.ext})` : ''} {f.vcodec !== 'none' ? '(Video)' : '(Audio)'}
                  </option>
                ))}
              </select>
              <button onClick={handleDownload} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                <Download size={20} /> Download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
