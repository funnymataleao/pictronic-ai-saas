# Pictronic Main Dashboard UI Specification (v1.0)

This document defines the wireframe, UI-kit, and interaction states for the Main Dashboard (Workspace Surface), following the Midjourney/Pinterest aesthetic.

## 1. Layout Wireframe

### A. Surface Shell (Container)
- **Top Header**: Sticky, height `64px`. Contains Logo, Project Title, and Global Status (Health/Recovery).
- **Secondary Header**: Project-specific actions (Settings, Back to Projects).
- **Two-Column Dashboard**:
  - **Left Sidebar (360px)**: Creation Console (Prompt, Model, Aspect, Batch). Sticky on desktop.
  - **Right Main Area (Flexible)**: Masonry Gallery + Upload Queue.

## 2. UI-Kit & Design Tokens (Dashboard Specific)

### Creation Console (Magic UI Style)
- **Input**: Dark Zinc background (`#18181b`), `1px solid #27272a`.
- **Focus State**: `ring-cyan-500/50`.
- **Generating State**: `.is-generating` class adds `neon-pulse` animation (pulsing border between Cyan and Indigo).
- **Actions**: Primary "Generate" button (Blue-500), secondary "Reliability run" (Outline).

### Masonry Gallery (Pinterest Style)
- **Grid**: `column-count: 3` (Desktop). `column-gap: 1rem`.
- **Gallery Card**:
  - `border-radius: 16px`.
  - Background: Zinc-900 (93% opacity).
  - Shadow: `0 18px 38px rgba(2, 6, 23, 0.2)`.

## 3. Interaction States

### A. Empty State
- **Trigger**: `assets.length === 0`.
- **Visual**: Large "Sparkles" icon (Lucide), centered text.
- **Message**: "No assets yet. Your creative journey starts here."
- **Layout**: Full-width inside the gallery area.

### B. Loading & Processing States
- **Console**: Pulsing border animation (`neon-pulse`).
- **Gallery**: Currently uses simple "Loading assets..." text (to be enhanced with Skeletons if needed).
- **Status Pills**:
  - Generating: Blue/Indigo theme (`#0b233d` background).
  - Processing: Same as generating.

### C. Hover States (Gallery Card)
- **Transform**: `translateY(-4px)` + `box-shadow` enhancement.
- **Overlay**: Appears on hover (`opacity: 1`).
  - Contains: Asset Title, Status Pills (Status, Metadata Status), and Prompt snippet (truncated).
- **Floating Actions**: Reveal on hover (top-right).
  - Buttons: Approve (Check), Retry Metadata (Rotate), Download.
  - Style: `h-8 w-8`, rounded-full, `bg-black/60`, `backdrop-blur-sm`.

## 4. Accessibility & Responsive Breakpoints
- **Desktop (>1024px)**: 2-column layout (360px sidebar + flexible gallery).
- **Tablet (720px - 1024px)**: 2-column layout, masonry `column-count: 2`.
- **Mobile (<720px)**: 1-column layout (Console on top, Gallery below), masonry `column-count: 1`.
- **Labels**: All inputs have `aria-label` or explicit labels for screen readers.
