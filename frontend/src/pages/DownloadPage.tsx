import { Link } from 'react-router-dom';

export default function DownloadPage() {
  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>
        &larr; Back to Home
      </Link>
      <h1>Fast Downloader</h1>
      <p>Download raw videos without AI processing here.</p>
    </div>
  );
}
