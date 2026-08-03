import React from 'react';
import { Clock, PlayCircle, Tag, TrendingUp, Flame } from 'lucide-react';

export interface Clip {
  title: string;
  hook: string;
  content_type: string;
  reason: string;
  start_time: number;
  end_time: number;
  duration_seconds: number;
  source: string;
  virality_score?: number;
  viral_potential?: string;
  clip_url?: string | null;
  has_subtitle?: boolean;
  subtitle_error?: string | null;
}

interface ClipCardProps {
  clip: Clip;
  index: number;
  onPreview?: (clip: Clip) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPreview }) => {
  const viralityScore = clip.virality_score ?? 88;
  const viralLabel = clip.viral_potential || (viralityScore >= 90 ? '🔥 High Views Potential' : '⚡ Momen Viral Tinggi');
  const isUltraViral = viralityScore >= 90;

  return (
    <div 
      className="glass-panel animate-fade-in clip-card"
      style={{ animationDelay: `${index * 150}ms`, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}
    >
      {/* Virality Score Badge Banner */}
      <div 
        className={`virality-badge ${isUltraViral ? 'ultra-viral' : 'high-viral'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.85rem',
          borderRadius: '8px',
          background: isUltraViral 
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(249, 115, 22, 0.25))' 
            : 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(6, 182, 212, 0.25))',
          border: isUltraViral 
            ? '1px solid rgba(239, 68, 68, 0.5)' 
            : '1px solid rgba(139, 92, 246, 0.4)',
          boxShadow: isUltraViral ? '0 0 12px rgba(239, 68, 68, 0.2)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem', color: isUltraViral ? '#fca5a5' : '#c4b5fd' }}>
          {isUltraViral ? <Flame size={16} className="flame-icon" /> : <TrendingUp size={16} />}
          <span>{viralLabel}</span>
        </div>
        <div 
          style={{
            fontWeight: 800,
            fontSize: '0.95rem',
            padding: '2px 8px',
            borderRadius: '6px',
            background: isUltraViral ? 'var(--error)' : 'var(--accent-primary)',
            color: '#fff'
          }}
        >
          {viralityScore}/100
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="badge badge-source">{clip.source} AI</span>
        <span className="badge badge-time">
          <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
          {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
        </span>
      </div>

      {clip.subtitle_error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-xs text-amber-300 flex items-center gap-2">
          <span>⚠️ Subtitle gagal: {clip.subtitle_error}</span>
        </div>
      )}
      
      <div>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{clip.title}</h3>
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.95rem' }}>
          "{clip.hook}"
        </p>
      </div>

      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--accent-primary)' }}>
          <Tag size={14} /> <strong>{clip.content_type.toUpperCase()}</strong>
        </div>
        <p style={{ color: 'var(--text-muted)' }}>{clip.reason}</p>
      </div>

      <div className="flex justify-between items-center mt-8" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Duration: <strong>{clip.duration_seconds}s</strong>
        </span>
        <button 
          className="btn btn-primary" 
          style={{ padding: '6px 14px', fontSize: '0.85rem', cursor: 'pointer' }}
          onClick={() => onPreview && onPreview(clip)}
        >
          <PlayCircle size={16} /> Preview Clip
        </button>
      </div>
    </div>
  );
};
