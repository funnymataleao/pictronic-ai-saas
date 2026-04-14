import Link from 'next/link';

export const metadata = {
  title: 'Components — Pictronic Design System',
};

export default function ComponentsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '2rem', fontFamily: "'Montserrat', sans-serif" }}>
      <header style={{ textAlign: 'center', padding: '3rem 0', borderBottom: '1px solid #333333', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
          Components
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.1rem' }}>
          Reusable UI Components and Patterns
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '3rem', flexWrap: 'wrap' }}>
        <Link href="/design-system" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Overview
        </Link>
        <Link href="/design-system/foundations" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Foundations
        </Link>
        <Link href="/design-system/components" style={{ padding: '0.5rem 1rem', color: '#ffffff', background: '#333333', borderRadius: '12px', textDecoration: 'none' }}>
          Components
        </Link>
        <Link href="/design-system/governance" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Governance
        </Link>
      </nav>

      <main style={{ maxWidth: '900px', margin: '0 auto' }}>
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Panels & Cards</h2>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '1.5rem 0 1rem', color: 'rgba(255, 255, 255, 0.9)' }}>Generic Panel</h3>
          <div style={{ padding: '1.5rem', background: '#0a0a0a', backdropFilter: 'blur(10px)', border: '1px solid #333333', borderRadius: '18px', margin: '1rem 0' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Panel Title</h4>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>This is a generic panel with glassmorphism effect.</p>
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '2rem 0 1rem', color: 'rgba(255, 255, 255, 0.9)' }}>Masonry Card</h3>
          <div style={{ background: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 18px 38px rgba(0, 0, 0, 0.3)', margin: '1rem 0', maxWidth: '300px' }}>
            <div style={{ height: '160px', background: '#ffffff' }}></div>
            <div style={{ padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Card Title</h4>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', margin: 0 }}>Card description goes here.</p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Buttons</h2>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '1.5rem 0 1rem', color: 'rgba(255, 255, 255, 0.9)' }}>Brand Button</h3>
          <div style={{ padding: '1.5rem', background: '#0a0a0a', borderRadius: '12px', margin: '1rem 0' }}>
            <button style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '9999px', fontWeight: 500, cursor: 'pointer' }}>
              Generate
            </button>
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '1.5rem 0 1rem', color: 'rgba(255, 255, 255, 0.9)' }}>Quiet Button</h3>
          <div style={{ padding: '1.5rem', background: '#0a0a0a', borderRadius: '12px', margin: '1rem 0' }}>
            <button style={{ background: '#1a1a1a', color: '#ffffff', border: '1px solid #333333', padding: '0.5rem 1.5rem', borderRadius: '12px', fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Autonomy Panel</h2>
          <p style={{ marginBottom: '1rem' }}>Specialized components for system health and automated recovery monitoring.</p>
          
          <div style={{ padding: '1.5rem', background: '#0a0a0a', borderRadius: '18px', border: '1px solid #333333', margin: '1rem 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>System Status</span>
                <span style={{ fontSize: '1.25rem', color: '#ffffff', fontFamily: 'monospace' }}>Operational</span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '0.25rem' }}>Active Jobs</span>
                <span style={{ fontSize: '1.25rem', color: '#ffffff', fontFamily: 'monospace' }}>42</span>
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Status Pills</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '1rem 0' }}>
            <span style={{ padding: '0.25rem 1rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#a0a0a0', background: '#1a1a1a', border: '1px solid #333333' }}>
              Generating
            </span>
            <span style={{ padding: '0.25rem 1rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#ffffff', background: '#1a1a1a', border: '1px solid #404040' }}>
              Ready
            </span>
            <span style={{ padding: '0.25rem 1rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#ff8080', background: '#1a1a1a', border: '1px solid #4a2020' }}>
              Failed
            </span>
            <span style={{ padding: '0.25rem 1rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#c0c0c0', background: '#1a1a1a', border: '1px solid #333333' }}>
              Idle
            </span>
          </div>
        </section>
      </main>

      <footer style={{ textAlign: 'center', padding: '3rem 0', marginTop: '3rem', borderTop: '1px solid #333333', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
        <p>Last updated: 2026-04-14 | Version 1.1</p>
      </footer>
    </div>
  );
}
