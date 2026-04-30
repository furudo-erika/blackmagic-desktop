# Changelog

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
