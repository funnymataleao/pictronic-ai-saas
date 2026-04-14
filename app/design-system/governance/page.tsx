import Link from 'next/link';

export const metadata = {
  title: 'Governance — Pictronic Design System',
};

export default function GovernancePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '2rem', fontFamily: "'Montserrat', sans-serif" }}>
      <header style={{ textAlign: 'center', padding: '3rem 0', borderBottom: '1px solid #333333', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
          Governance
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.1rem' }}>
          Guidelines for Maintaining Design System Consistency
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '3rem', flexWrap: 'wrap' }}>
        <Link href="/design-system" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Overview
        </Link>
        <Link href="/design-system/foundations" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Foundations
        </Link>
        <Link href="/design-system/components" style={{ padding: '0.5rem 1rem', color: 'rgba(255, 255, 255, 0.7)', background: '#1a1a1a', borderRadius: '12px', textDecoration: 'none' }}>
          Components
        </Link>
        <Link href="/design-system/governance" style={{ padding: '0.5rem 1rem', color: '#ffffff', background: '#333333', borderRadius: '12px', textDecoration: 'none' }}>
          Governance
        </Link>
      </nav>

      <main style={{ maxWidth: '900px', margin: '0 auto' }}>
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Overview</h2>
          <p>This document outlines guidelines for maintaining consistency in the Pictronic design system. Following these guidelines ensures a unified user experience across all surfaces of the product.</p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Core Rules</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Use Design Tokens:</strong> Always use CSS custom properties (tokens) defined in this system instead of hardcoded values.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Black Mode Default:</strong> Design primarily for pure black (#000000) background.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Monochrome:</strong> Use only white on black. No colors.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Content-First:</strong> Prioritize content density and information display over decorative elements.</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Consistent Spacing:</strong> Use the defined spacing scale (4px base unit).</li>
            <li style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(51, 51, 51, 0.5)' }}><strong>Accessibility:</strong> Ensure all components meet WCAG 2.1 AA standards.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Version History</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', borderBottom: '1px solid #333333', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Version</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', borderBottom: '1px solid #333333', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Date</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', borderBottom: '1px solid #333333', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Changes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>1.2</td>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>2026-04-14</td>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>Updated to monochrome theme (black background, white accents, Montserrat font)</td>
              </tr>
              <tr>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>1.1</td>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>2026-04-14</td>
                <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333333' }}>Initial design system documentation</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <footer style={{ textAlign: 'center', padding: '3rem 0', marginTop: '3rem', borderTop: '1px solid #333333', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
        <p>Last updated: 2026-04-14 | Version 1.2</p>
      </footer>
    </div>
  );
}