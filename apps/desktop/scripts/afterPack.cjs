// electron-builder afterPack hook: re-sign the app bundle ad-hoc from the
// inside out so Gatekeeper's launch check accepts it.
//
// Strategy: walk the bundle bottom-up. At each node:
//   - if it's a Mach-O executable or dylib, codesign --sign -
//   - if it's a code bundle (.app, .framework), codesign --sign - the bundle
//   - signatures are applied in post-order so nested Mach-O / Helpers
//     (e.g. Electron Framework/Versions/A/Helpers/chrome_crashpad_handler)
//     always get signed before the outer framework, which codesign requires.
//
// Each call uses `--sign -` alone (no --deep, no --options runtime) to get
// a consistent ad-hoc signature without hardened-runtime semantics we don't
// have entitlements for.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_EXTS = new Set(['.app', '.framework']);

function sign(target) {
  execSync(`codesign --force --sign - "${target}"`, { stdio: 'inherit' });
}

function isMachO(filepath) {
  try {
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const m = buf.readUInt32BE(0);
    // Mach-O magic numbers (32/64, LE/BE) + fat binary.
    return (
      m === 0xfeedface ||
      m === 0xfeedfacf ||
      m === 0xcefaedfe ||
      m === 0xcffaedfe ||
      m === 0xcafebabe ||
      m === 0xbebafeca
    );
  } catch {
    return false;
  }
}

function walkAndSign(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;

  if (stat.isDirectory()) {
    const ext = path.extname(target);
    const isBundle = BUNDLE_EXTS.has(ext);
    // Recurse first — post-order sign.
    for (const entry of fs.readdirSync(target)) {
      walkAndSign(path.join(target, entry));
    }
    if (isBundle) sign(target);
    return;
  }

  if (stat.isFile() && stat.mode & 0o111 /* any x bit */) {
    if (isMachO(target)) sign(target);
    return;
  }
  if (stat.isFile() && /\.(dylib|so|node)$/i.test(target) && isMachO(target)) {
    sign(target);
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);

  // Clear any lingering xattrs first — they corrupt re-signing.
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  } catch {}

  walkAndSign(appPath);

  console.log(`[afterPack] ad-hoc signed ${appName} (leaf-first)`);
};
