import Link from 'next/link';

export const metadata = {
  title: 'Design System — Pictronic',
};

export default function DesignSystemPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '2rem', fontFamily: "'Montserrat', sans-serif" }}>
      <header style={{ textAlign: 'center', padding: '3rem 0', borderBottom: '1px solid #333333', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
          Pictronic Design System
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.1rem' }}>
          UI Kit v1.1 — Production Workflow Tool for Stock Content Creators
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '3rem', flexWrap: 'wrap' }}>
        <Link href="/design-system" style={{ padding: '0.5rem 1rem', color: '#ffffff', background: '#333333', borderRadius: '12px', textDecoration: 'none' }}>
          Overview
        </Link>
        <Link href="/design-system/foundations" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
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
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>About This System</h2>
          <p>Pictronic is a high-performance production workstation for stock content creators. The design system prioritizes content density, speed of workflow, and a premium "pro" feel.</p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Core Principles</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Content-First:</strong> Large, high-quality image previews in a masonry grid.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Black Mode:</strong> Pure black (#000000) background for maximum contrast.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Information Density:</strong> Minimal whitespace where possible, focus on data and controls.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Tactile Feedback:</strong> Subtle animations for hover and status transitions.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Monochrome:</strong> Clean white accents on black, no colors.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Quick Links</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <Link href="/design-system/foundations" style={{ display: 'block', padding: '1.5rem', background: '#0a0a0a', border: '1px solid #333333', borderRadius: '16px', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s ease' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: '#ffffff' }}>Foundations</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', margin: 0 }}>Colors, typography, spacing, and visual tokens</p>
            </Link>
            <Link href="/design-system/components" style={{ display: 'block', padding: '1.5rem', background: '#0a0a0a', border: '1px solid #333333', borderRadius: '16px', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s ease' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: '#ffffff' }}>Components</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', margin: 0 }}>Reusable UI components and patterns</p>
            </Link>
            <Link href="/design-system/governance" style={{ display: 'block', padding: '1.5rem', background: '#0a0a0a', border: '1px solid #333333', borderRadius: '16px', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s ease' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: '#ffffff' }}>Governance</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', margin: 0 }}>Guidelines for maintaining consistency</p>
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ textAlign: 'center', padding: '3rem 0', marginTop: '3rem', borderTop: '1px solid #333333', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
        <p>Last updated: 2026-04-14 | Version 1.1</p>
      </footer>
    </div>
  );
}
