import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>
        &larr; Back to Home
      </Link>
      <h1>AI Auto-Clipper</h1>
      <p>Paste URL and generate clips automatically here.</p>
    </div>
  );
}
