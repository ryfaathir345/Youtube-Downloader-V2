import { useState } from 'react';
import { Link } from 'react-router-dom';
import UrlInputForm from '../components/downloader/UrlInputForm';
import QualitySelector, { VideoInfo } from '../components/downloader/QualitySelector';

export default function DownloadPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');

  const fetchVideoInfo = async (url: string) => {
    setIsLoading(true);
    setError(null);
    setVideoInfo(null);
    setCurrentUrl(url);

    try {
      const response = await fetch(`/api/v1/download/info?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch video info');
      }

      const data = await response.json();
      setVideoInfo(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', minHeight: '100vh' }}>
      <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
        &larr; Back to Home
      </Link>
      
      <div className="text-center mt-4">
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>Fast Downloader</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Download raw, high-quality videos from social platforms directly to your device without any processing wait times.
        </p>

        <UrlInputForm onSubmit={fetchVideoInfo} isLoading={isLoading} />

        {error && (
          <div className="mt-8 p-4 animate-fade-in-up" style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', maxWidth: '600px', margin: '2rem auto' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {videoInfo && !isLoading && (
          <QualitySelector info={videoInfo} url={currentUrl} />
        )}
      </div>
    </div>
  );
}
