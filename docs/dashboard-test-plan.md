# Dashboard UI/UX Test Plan (JUP-71)

## 1. Responsiveness Testing

| Breakpoint | Target Screen Width | Layout Expectations | Masonry Columns |
|------------|---------------------|---------------------|-----------------|
| Desktop    | > 1024px            | 2-column (360px side, 1fr main) | 3 |
| Tablet     | 720px - 1024px      | 1-column (full width) | 2 |
| Mobile     | < 720px             | 1-column, vertical headers | 1 |

### 1.1 Responsive Checks
- [ ] **Home Page (ProjectsSurface):**
  - Verify layout changes from 2 columns to 1 column at 1024px.
  - Check project cards grid at different widths.
- [ ] **Workspace Page (WorkspaceSurface):**
  - Verify "Creation Console" and "Masonry Gallery" stack vertically below 1024px.
  - Verify "Creation Console" loses `sticky` positioning at 1024px.
  - Ensure "Masonry Gallery" columns reduce appropriately (3 -> 2 -> 1).
  - Verify `SheetContent` (Settings & Ops) occupies `w-full` on screens < 640px.

## 2. Component Verification: Sheet

### 2.1 Scroll & Blocking
- [ ] **Body Scroll Lock:** When the Sheet (Settings & Ops) is open, scrolling the background page must be disabled.
- [ ] **Sheet Content Scroll:** If settings sections (Autonomy, Readiness, Node Bridge, Ops) exceed viewport height, the Sheet must be scrollable.
- [ ] **Overlay Dismissal:** Clicking the backdrop/overlay should close the Sheet.
- [ ] **Keyboard Dismissal:** Pressing `Esc` should close the Sheet.
- [ ] **Button Dismissal:** Clicking the `X` button should close the Sheet.

## 3. UI/UX Interactions

### 3.1 Animations
- [ ] **Gallery Cards:** Hover state should trigger `translateY(-4px)`, shadow enhancement, and overlay fade-in.
- [ ] **Creation Console:** Pulse animation (`neon-pulse`) must be active during generation (`working` state).
- [ ] **Transitions:** Framer Motion initial/animate transitions should feel smooth on page load.

### 3.2 Form Controls
- [ ] **Prompt Auto-height:** Textarea should resize automatically based on content (max 220px).
- [ ] **Custom Batch Input:** Should only appear when "Custom" is selected.
- [ ] **Button States:** Verify `disabled` states during active operations or when critical actions are blocked.

## 4. Visual Integrity
- [ ] **Glassmorphism:** Check that background gradients and `backdrop-blur` are consistent across panels.
- [ ] **Theming:** Verify colors align with the Design System (`--brand`, `--bg`, etc.).
- [ ] **Empty States:** Ensure "No projects yet" and "No assets yet" are centered and visually pleasing.
