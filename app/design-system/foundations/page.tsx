import Link from 'next/link';

export const metadata = {
  title: 'Foundations — Pictronic Design System',
};

export default function FoundationsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '2rem', fontFamily: "'Montserrat', sans-serif" }}>
      <header style={{ textAlign: 'center', padding: '3rem 0', borderBottom: '1px solid #333333', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
          Foundations
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.1rem' }}>
          Design Tokens — Colors, Typography, Spacing
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '3rem', flexWrap: 'wrap' }}>
        <Link href="/design-system" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Overview
        </Link>
        <Link href="/design-system/foundations" style={{ padding: '0.5rem 1rem', color: '#ffffff', background: '#333333', borderRadius: '12px', textDecoration: 'none' }}>
          Foundations
        </Link>
        <Link href="/design-system/components" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Components
        </Link>
        <Link href="/design-system/governance" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Governance
        </Link>
      </nav>

      <main style={{ maxWidth: '900px', margin: '0 auto' }}>
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Color Palette</h2>
          <p style={{ marginBottom: '1rem' }}>Monochrome palette — pure black background with white accents.</p>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '1.5rem 0 1rem', color: 'rgba(255, 255, 255, 0.9)' }}>Core Colors</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1.5rem', background: '#000000', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Background</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>--background</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>#000000</div>
            </div>
            <div style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#000000' }}>Foreground</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem', color: '#000000' }}>--foreground</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem', color: '#000000' }}>#ffffff</div>
            </div>
            <div style={{ padding: '1.5rem', background: '#0a0a0a', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Surface/Panel</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>--card</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>#0a0a0a</div>
            </div>
            <div style={{ padding: '1.5rem', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Alt Panel</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>--panel-alt</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>#1a1a1a</div>
            </div>
            <div style={{ padding: '1.5rem', background: '#333333', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Border</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>--border</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>#333333</div>
            </div>
            <div style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #333333' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#000000' }}>Brand/Primary</span>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem', color: '#000000' }}>--primary</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem', color: '#000000' }}>#ffffff</div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Typography</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Font Family:</strong> Montserrat (primary), System Sans (fallback).</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Headers:</strong> font-semibold, tracking-tight.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>UI Text:</strong> Text-sm (14px) for general interface components.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Metadata (KPI):</strong> Text-xs (12px), rgba(255,255,255,0.5).</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Status/Labels:</strong> Text-[0.76rem] (12px), font-700, Uppercase, letter-spacing: 0.02em.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Layout Specs</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Dashboard Grid:</strong> 2-column layout (360px sidebar + flexible gallery).</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Masonry Grid:</strong> column-count: 3 (Desktop), 2 (Tablet), 1 (Mobile).</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Sidebar (Creation Console):</strong> Sticky, width: 360px.</li>
          </ul>
        </section>
      </main>

      <footer style={{ textAlign: 'center', padding: '3rem 0', marginTop: '3rem', borderTop: '1px solid #333333', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
        <p>Last updated: 2026-04-14 | Version 1.1</p>
      </footer>
    </div>
  );
}