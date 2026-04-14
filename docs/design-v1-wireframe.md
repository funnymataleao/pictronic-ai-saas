# JUP-61: Main Dashboard Wireframe & UI-kit

## 1. Visual Style (Midjourney/Pinterest Inspiration)
- **Theme**: Premium Dark Mode (Pure black/Deep grey backgrounds).
- **Accents**: Neon Cyan/Blue (#22d3ee) and Purple (#a855f7) for interactive elements.
- **Surfaces**: Glassmorphism (backdrop-blur), thin borders (1px solid rgba(255,255,255,0.1)).
- **Typography**: Sans-serif, clean, high contrast for headings, muted for secondary info.

## 2. Layout Structure
### A. Global Header (Sticky)
- Left: Logo (Pictronic) + Project Name.
- Center: Generation Status (Bridge: Online/Offline) - simplified.
- Right: User Profile + Settings Toggle (Sheet).

### B. Creation Area (Fixed or Top-centered)
- Prompt input: Large, auto-resize, minimalist.
- "Magic" glow when active or generating.
- Hidden/Collapsed advanced settings (Model, Aspect Ratio).

### C. Gallery Area (Scrollable)
- Masonry Grid (dynamic columns: 1-mobile, 2-tablet, 3/4-desktop).
- Card: Edge-to-edge image, subtle rounded corners.
- Hover: Overlay with "Download", "Retry", "Approve" buttons and "Metadata" summary.

## 3. UI States
### Empty State
- Centered illustration or icon (Sparkles).
- Text: "Start your first generation"
- Action: Big "Generate" button or focus on prompt input.

### Loading State (Generating)
- Pulse animation on the prompt input (Neon glow).
- Skeleton cards in the gallery at the top/beginning.
- Status indicator in the header: "Generating 10 assets..."

### Hover States
- Card: Scale up slightly (1.02x), reveal overlay.
- Buttons: Background glow or color shift.

## 4. Components UI-kit (shadcn base)
- **Button**: Rounded-full, high-gloss or ghost styles.
- **Card**: Minimalist, no padding for image-first feel.
- **Input**: Dark background, neon ring focus.
- **Sheet**: Right-side slide-out for "Ops" and "Settings".
