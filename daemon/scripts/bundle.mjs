import esbuild from 'esbuild';
import fs from 'node:fs';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  // Use a small banner so ESM dynamic `require` used by some CJS deps resolves.
  // Shim CommonJS globals inside the ESM bundle — some deps (node-cron)
  // reference __dirname/__filename/require.
  banner: {
    js:
      "import { createRequire as __bm_cr } from 'node:module';" +
      "import { fileURLToPath as __bm_u } from 'node:url';" +
      "import { dirname as __bm_d } from 'node:path';" +
      "const require = __bm_cr(import.meta.url);" +
      "const __filename = __bm_u(import.meta.url);" +
      "const __dirname = __bm_d(__filename);",
  },
  logLevel: 'info',
});

fs.writeFileSync('dist/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
fs.chmodSync('dist/index.js', 0o755);
