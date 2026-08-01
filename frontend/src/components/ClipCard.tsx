import React from 'react';
import { Clock, PlayCircle, Tag } from 'lucide-react';

export interface Clip {
  title: string;
  hook: string;
  content_type: string;
  reason: string;
  start_time: number;
  end_time: number;
  duration_seconds: number;
  source: string;
}

interface ClipCardProps {
  clip: Clip;
  index: number;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ClipCard: React.FC<ClipCardProps> = ({ clip, index }) => {
  return (
    <div 
      className="glass-panel animate-fade-in"
      style={{ animationDelay: `${index * 150}ms`, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div className="flex justify-between items-center">
        <span className="badge badge-source">{clip.source} AI</span>
        <span className="badge badge-time">
          <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
          {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
        </span>
      </div>
      
      <div>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>{clip.title}</h3>
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
        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
          <PlayCircle size={16} /> Preview
        </button>
      </div>
    </div>
  );
};
