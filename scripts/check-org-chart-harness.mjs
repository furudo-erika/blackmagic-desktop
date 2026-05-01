import { readFileSync } from 'node:fs';

const companyPage = readFileSync('apps/web/src/app/company/page.tsx', 'utf8');
const sidebar = readFileSync('apps/web/src/components/sidebar.tsx', 'utf8');

const required = [
  ['layoutTeamColumn', 'Team column layout is missing'],
  ['layoutEmployeeStack', 'Vertical employee stack layout is missing'],
  ['collectEdges', 'SVG edge collection is missing'],
  ["addEventListener('wheel'", 'Zoom/pan viewport wheel handler is missing'],
  ['onTouchStart=', 'Touch pan/pinch handler is missing'],
  ['touchDistance', 'Paperclip-style pinch zoom helper is missing'],
  ['zoomTowardPoint', 'Zoom must track the pointer/gesture origin'],
  ['suppressNextCardClick', 'Dragged chart gestures must not select org cards'],
  ['data-org-node', 'Absolute org node marker is missing'],
  ['reportsToEmployeeSlug', 'Paperclip employee reports_to parser is missing'],
  ['wouldCreateReportsCycle', 'Reports-to cycle guard is missing'],
  ['reportsTo: `employee:', 'Drag-to-manager reports_to write is missing'],
  ['reportsTo ?? `team:', 'Team reports_to fallback is missing'],
];

const failures = [];
for (const [needle, message] of required) {
  if (!companyPage.includes(needle)) failures.push(message);
}

if (sidebar.includes('href="/chart"') || sidebar.includes("href: '/chart'")) {
  failures.push('Sidebar or command palette still exposes /chart as a separate org surface');
}

if (failures.length > 0) {
  console.error('Org chart harness failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Org chart harness passed');
