import fs from 'node:fs';
import path from 'node:path';

// Tell Node the compiled output is ESM when the daemon is spawned standalone
// (the parent daemon/package.json isn't bundled into the packaged app).
fs.writeFileSync(
  path.join('dist', 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
  'utf-8',
);

fs.chmodSync(path.join('dist', 'index.js'), 0o755);
