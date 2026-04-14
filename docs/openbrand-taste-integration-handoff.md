# OpenBrand Taste Integration Handoff for Pictronic Landing

Owner task: [JUP-144](/JUP/issues/JUP-144)  
Parent: [JUP-143](/JUP/issues/JUP-143)  
Date: 2026-04-11

## 1) Goal and Translation Boundary

This handoff translates OpenBrand's visual taste (clean, neutral, low-noise, utility-first hierarchy) into Pictronic's landing without cloning OpenBrand and without violating Pictronic's "production machine" character.

Non-negotiables from `Overview.md`:
- Keep guest-only landing on `/` and auth wall semantics unchanged.
- Keep runtime/control-plane split unchanged (`:3000` vs `:3100`).
- Keep messaging practical and operator-oriented, not decorative marketing fluff.

## 2) OpenBrand Style Signals to Borrow

Observed from `openbrand` UI (`/tmp/openbrand`):
- Neutral-first color system (`neutral-50` surface, `neutral-900` text, restrained accents).
- Clear typography hierarchy with strong heading contrast and compact body copy.
- Radius system around `12px-16px` (`rounded-lg`/`rounded-xl`) for a modern but restrained look.
- Border-led structure (`neutral-200` class usage) instead of heavy glow or blur.
- CTA priority by contrast (dark solid button on light/neutral context) and simple motion.

Pictronic translation: retain noir base and premium feel, but reduce chroma noise and make information hierarchy more utilitarian.

## 3) Design Token Matrix (Implementation Targets)

Add/normalize these landing tokens in `app/globals.css` under `:root` and use across landing selectors.

| Domain | Token | Target value | Usage rule |
| --- | --- | --- | --- |
| Typography | `--landing-font-display` | `var(--font-sans), "IBM Plex Sans", "Segoe UI", sans-serif` | Hero title + section titles only |
| Typography | `--landing-title-weight` | `800` | For `h1/h2` on landing |
| Typography | `--landing-body-weight` | `500` | Supporting copy/body |
| Typography | `--landing-tracking-tight` | `0.02em` | Nav labels, chips, micro labels |
| Spacing | `--landing-space-1` | `0.5rem` | Tight inline spacing |
| Spacing | `--landing-space-2` | `0.75rem` | Card internal row gap |
| Spacing | `--landing-space-3` | `1rem` | Card padding base |
| Spacing | `--landing-space-4` | `1.25rem` | Section inner padding |
| Spacing | `--landing-space-5` | `1.5rem` | Section vertical rhythm |
| Surface | `--landing-surface-0` | `#000000` | Page/hero base |
| Surface | `--landing-surface-1` | `rgba(10, 19, 32, 0.82)` | Primary card surface |
| Surface | `--landing-surface-2` | `rgba(9, 18, 31, 0.92)` | Elevated cards (pricing/proof) |
| Border | `--landing-border-soft` | `rgba(148, 163, 184, 0.24)` | Default card/nav border |
| Border | `--landing-border-strong` | `rgba(148, 163, 184, 0.36)` | Focus/interactive states |
| Text | `--landing-text-strong` | `#eef4fb` | Headings and critical copy |
| Text | `--landing-text-body` | `rgba(214, 226, 241, 0.86)` | Paragraphs |
| Text | `--landing-text-muted` | `rgba(171, 189, 210, 0.82)` | Supportive details |
| Accent | `--landing-accent-primary` | `#8fc0f3` | Numeric highlights, chips |
| Accent | `--landing-accent-secondary` | `#7eadff` | CTA/interactive accent |
| Blur | `--landing-blur-nav` | `8px` | Nav only |
| Blur | `--landing-blur-card` | `0px` | Cards should not use blur |
| Radius | `--landing-radius-card` | `16px` | Value/FAQ/docs cards |
| Radius | `--landing-radius-elevated` | `20px` | Pricing/proof cards |
| Radius | `--landing-radius-control` | `12px` | Buttons/mobile menu links |

## 4) Component-Level Mapping (Current Selector -> Target Behavior)

### 4.1 Navigation

- `.landing-nav-body`
  - Keep blur but cap at `8px`.
  - Replace bright blue border with `--landing-border-soft`.
  - Keep compact horizontal rhythm and high legibility.
- `.landing-brand`, `.landing-nav-items a`
  - Keep uppercase/label behavior.
  - Standardize tracking to `--landing-tracking-tight`.

### 4.2 Hero

- `.landing-hero-sparkles-stage`
  - Keep black base and strong center focus.
  - Reduce decorative dominance: beam/sparkle is supporting, not the headline.
- `.landing-hero-sparkles-title`
  - Keep uppercase + high contrast.
  - Track at `0.04em` max (current 0.07em is visually loud).
- `.landing-subtitle`
  - Limit to 56-60ch, maintain one concise value statement.
- `.landing-hero-gradient-line*`
  - Keep maximum two visible lines; remove redundant blur layers if readability suffers.

### 4.3 Value Cards (`#features`)

- `.landing-value-card`
  - Move from glow-heavy treatment to border-led card architecture.
  - Keep one subtle radial tint only; avoid multiple luminous overlays.
- `.landing-chip`
  - Use neutral capsule with one accent border; no multicolor gradient chips.

### 4.4 Workflow Block (`#workflow`)

- `.landing-workflow`
  - Keep as a practical process container, not marketing hero.
- `.landing-workflow-step`
  - Numbers should use accent color, body text should be denser and operational.

### 4.5 Pricing / FAQ / Proof

- `.landing-pricing-card`, `.landing-faq-item`, `.landing-proof-card`
  - Unify border and typography scale so blocks read as one system.
  - Use elevated surface contrast for pricing/proof only.

### 4.6 Docs / Terms / Footer

- `.landing-docs`, `.landing-terms`, `.landing-footer`
  - Keep visually quieter than hero/features.
  - Footer links should rely on underline + contrast, not glow.

## 5) Responsive Rules for Hero and Top-Level Landing Blocks

Breakpoints already used in Pictronic must remain canonical:
- Desktop: `>1024px`
- Tablet: `721px-1024px`
- Mobile: `<=720px`

### Desktop (>1024px)
- Hero min-height: `76-82vh`, title max `6.2rem`.
- Features/pricing/faq: 3-column grid.
- Workflow steps: 2-column step row (`index + content`).

### Tablet (721-1024px)
- Hero min-height: `72-76vh`, title max `4.2rem`.
- Features/pricing/faq collapse to single-column.
- Keep workflow index + content two-column for scan speed.

### Mobile (<=720px)
- Hero min-height: `68-72vh`; title clamp around `1.9rem-3rem`.
- Subtitle max width reduced and line-height tightened for density.
- Workflow steps stack vertically; index becomes inline preface.
- Footer shifts to column and left alignment.

## 6) Blur/Glass Usage Boundaries (Strict)

Allowed:
- Navbar shell and mobile nav only (`8px` max).

Not allowed:
- Value/pricing/faq/proof/docs/terms cards using blur.
- Multiple stacked blur layers in hero beam treatment.

Reason: matches OpenBrand's cleaner utility style and keeps Pictronic in a production-first visual mode.

## 7) CTA Prominence Rules

Primary CTA (`Log in`):
- Must remain visually strongest element after hero headline.
- One dominant style only (no competing accent buttons in same viewport).

Secondary actions (nav links/footer links):
- Border/underline emphasis only.
- Must not share primary gradient treatment.

## 8) Do / Don't Implementation Examples

Do:
- Use one accent family (`--landing-accent-primary/secondary`) across chips, numbers, and highlights.
- Keep cards readable first: clear border, modest gradient tint, strong text contrast.
- Keep motion limited to entry/fade/offset and avoid continuous decorative motion outside hero.

Don't:
- Introduce additional neon colors beyond defined accent pair.
- Add blur to all surfaces to simulate "premium" feel.
- Add multiple competing CTAs per section.
- Use decorative copy that obscures operator value proposition.

## 9) Annotated Before/After References by Section

Reference set A (baseline to noir shift):
- Before desktop: `docs/e2e/jup87-before-desktop.png`
- After desktop: `docs/e2e/jup104-after-desktop-20260409T200118Z.png`
- Before mobile: `docs/e2e/jup87-before-mobile.png`
- After mobile: `docs/e2e/jup104-after-mobile-20260409T200125Z.png`

Section annotations:
- Hero: compare title emphasis and atmospheric treatment (before vs after desktop).
- Features/value cards: compare panel hierarchy and chip usage (after desktop).
- Mobile nav + hero compression: compare readability under small viewport (before vs after mobile).

Reference set B (latest structure guardrail):
- `docs/e2e/jup139-hero-v3-verification-20260411T092113Z.md`

Section annotations:
- Hero source order contract: title -> subtitle -> animation.
- Runtime/auth boundary remained intact while visual iteration continued.

## 10) Frontend Execution Checklist

1. Normalize/introduce landing tokens from section 3.
2. Apply component mapping in section 4 to existing selectors in `app/globals.css`.
3. Verify blur boundaries (section 6) by selector audit.
4. Validate breakpoints and layout behavior per section 5.
5. Re-capture desktop/mobile evidence and append under `docs/e2e/` for implementation proof.

