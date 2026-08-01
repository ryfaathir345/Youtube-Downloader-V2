import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface UrlInputFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export default function UrlInputForm({ onSubmit, isLoading }: UrlInputFormProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="url-form flex gap-4 mt-8 w-full max-w-2xl mx-auto">
      <div className="input-group" style={{ flexGrow: 1, position: 'relative' }}>
        <Search size={20} className="input-icon" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste YouTube, TikTok, or Instagram link here..."
          required
          style={{
            width: '100%',
            padding: '1rem 1rem 1rem 3rem',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid var(--border-color)',
            fontSize: '1.1rem',
            outline: 'none',
            transition: 'border-color 0.3s'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
          disabled={isLoading}
        />
      </div>
      <button type="submit" className="btn btn-primary" style={{ padding: '0 2rem', fontSize: '1.1rem', borderRadius: 'var(--radius-lg)' }} disabled={isLoading}>
        {isLoading ? <Loader2 className="spin" size={24} /> : 'Fetch'}
      </button>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </form>
  );
}
