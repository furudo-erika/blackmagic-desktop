# Changelog

## 0.5.58 - 2026-05-01

- App icon redrawn full-bleed so macOS Tahoe stops nesting it inside the
  system squircle. The bullseye now sits on a cream square that fills the
  whole canvas; Tahoe applies its own rounded mask, no more "icon inside
  a gray frame" double-squircle look in the Dock and Finder.

## 0.5.57 - 2026-05-01

- Org chart zoom controls work again. Fixed a feedback loop where the
  ResizeObserver kept refitting the chart after every render, immediately
  overwriting the user's wheel/button/pinch zoom.
- Wheel zoom now uses a non-passive native listener so `preventDefault()`
  actually stops the page from scrolling while zooming.
- Auto-fit only re-runs when the viewport actually resizes and the user
  hasn't already zoomed/panned themselves.
- Double-click empty chart space to refit. Header zoom in/out buttons
  now zoom around the viewport center instead of jumping pan.

## 0.5.56 - 2026-05-01

- Company org chart switches to a compact grid layout: teams flow into rows
  that auto-fit the viewport width, employees stack vertically under each team
  with file-tree style indentation for `reports_to` chains.
- Auto-fit now floors at a readable zoom and the new layout fits even large
  orgs (27+ employees) without shrinking cards into an unreadable strip.
- Edge routing redrawn as left-spine connectors so vertical employee stacks
  read like an org tree instead of overlapping vertical lines.

## 0.5.55 - 2026-04-30

- Company org chart now supports Paperclip-style employee reporting lines via
  `reports_to: employee:<slug>`.
- Dragging an employee onto another employee assigns that employee as the
  manager, with a cycle guard to prevent invalid org hierarchies.
- Dragging an employee onto a team still preserves the compatibility
  `reports_to: team:<TeamName>` bridge.
- Org chart harness now checks real reports-to parsing, manager assignment, and
  team fallback invariants.

## 0.5.54 - 2026-04-30

- Merged Company and Chart into a single editable org chart at `/company`.
- Kept `/chart` as a redirect for compatibility.
- Added Paperclip-style pan, zoom, touch gestures, SVG connector edges, and
  viewport fit behavior.
- Documented Paperclip migration status and first-party credit API policy.
