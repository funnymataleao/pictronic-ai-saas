# Pictronic Design System (UI Kit) v1.1

## 1. Visual Identity & Brand
Pictronic is a high-performance production workstation for stock content creators. The design system prioritizes content density, speed of workflow, and a premium "pro" feel.

### Core Principles
- **Content-First**: Large, high-quality image previews in a masonry grid.
- **Dark Mode by Default**: Optimized for long creative sessions (Zinc-950 base).
- **Information Density**: Minimal whitespace where possible, focus on data and controls.
- **Tactile Feedback**: Subtle animations (Framer Motion) for hover and status transitions.
- **Neon Accents**: Subtle glow effects (Cyan/Indigo) to highlight active generation and system health.

## 2. Design Tokens

### Color Palette (HSL & Hex)
Base colors are defined in HSL for compatibility with shadcn/ui and Tailwind.

| Role | Token | HSL Value | Hex (Approx) |
| --- | --- | --- | --- |
| Background | `--background` | `240 5.9% 10%` | `#18181b` |
| Foreground | `--foreground` | `0 0% 98%` | `#fafafa` |
| Surface/Panel | `--card` | `240 5.9% 12%` | `#1c1c1f` |
| Alternative Panel | `--panel-alt` | `240 4% 18%` | `#2a2a2e` |
| Border | `--border` | `240 3.7% 21.9%` | `#34343a` |
| Primary/Brand | `--primary` | `217.2 91.2% 59.8%` | `#3b82f6` (Blue-500) |
| Accent/Neon | `accent` | `rgba(34, 211, 238, 1)` | `#22d3ee` (Cyan-400) |

### Functional Semantic Colors
| Role | Token | Hex Value | Hex |
| --- | --- | --- | --- |
| Success | `--ok` | `#12b76a` | Emerald-like |
| Warning | `--warn` | `#f79009` | Amber-like |
| Error | `--bad` | `#f04438` | Rose-like |

### Status Pill Mappings
| Status | Text Color | Background | Border |
| --- | --- | --- | --- |
| Generating/Processing | `#67b5ff` | `#0b233d` | `#164a77` |
| Recovering | `#9dd4ff` | `#102946` | `#2b5e92` |
| Ready/Approved/Uploaded| `#6ce9ab` | `#072a1c` | `#1f6f4c` |
| Failed/Timeout | `#ff9e99` | `#3b1212` | `#7a271a` |
| Empty/Idle | `#ffce7a` | `#3b2609` | `#7a4c0b` |

## 3. Infrastructure & Autonomy UI
Specialized components for system health and automated recovery monitoring.

### Autonomy Panel
- **Container**: `.panel.autonomy-panel` - Additional radial gradients for "active" feel.
- **Grid**: `.autonomy-grid` - 2-column small cards for high-density metrics.
- **Sub-items**: `.autonomy-sub-item` - Glass background (`rgba(255, 255, 255, 0.03)`), monospace fonts for system values.
- **Visual Cues**: Uses Lucide icons (Activity, ShieldAlert, Cpu) for quick recognition.

## 4. Typography
- **Sans-serif**: Inter (primary), IBM Plex Sans (fallback), System Sans.
- **Headers**: `font-semibold`, `tracking-tight`.
- **UI Text**: `Text-sm` (14px) for general interface components.
- **Metadata (KPI)**: `Text-xs` (12px), `hsl(var(--muted-foreground))`.
- **Status/Labels**: `Text-[0.76rem]` (approx 12px), `font-700`, Uppercase, `letter-spacing: 0.02em`.

## 4. Components & Layout Patterns

### Panels & Cards
- **Generic Panel**: `.panel` - `color-mix(in srgb, var(--panel) 88%, transparent)`, `backdrop-filter: blur(10px)`, `border-radius: 18px`.
- **Masonry Card**: `.masonry-card` - `border-radius: 16px`, `box-shadow: 0 18px 38px rgba(2, 6, 23, 0.2)`.
- **Hover State**: `TranslateY(-4px)`, `box-shadow` enhancement, border-color highlight.

### Buttons
- **Brand**: `.btn-brand` - Background: `--brand`, Color: `#fff`, rounded-full.
- **Quiet**: `.btn-quiet` - Background: `--panel-alt`, border-color transition to brand-mix.

### Layout Specs
- **Dashboard Grid**: 2-column layout (360px sidebar + flexible gallery).
- **Masonry Grid**: `column-count: 3` (Desktop), `2` (Tablet), `1` (Mobile).
- **Sidebar (Creation Console)**: Sticky, `width: 360px`.

## 5. Animations & Interaction
- **Neon Pulse**: `animation: neon-pulse 2s infinite alternate` - Used during generation states to pulse border colors between Cyan and Indigo.
- **Framer Motion**:
  - Entry: `opacity: 0, y: 12` -> `opacity: 1, y: 0` (400ms, easeOut).
  - Hover: `Scale(1.02)` (conceptual, implemented via CSS translateY in masonry).
- **Transitions**: `all 0.2s ease` for buttons and interactive borders.

## 6. Glassmorphism & Gradients
- **Background**: Multi-layer radial gradient.
  - Cyan (12% opacity) at top-left.
  - Slate (18% opacity) at bottom-right.
- **Glass Header**: `.glass-header` - Radial gradients mixed with panel background (90% opacity).
