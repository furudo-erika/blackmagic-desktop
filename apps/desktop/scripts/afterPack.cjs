// electron-builder afterPack hook: re-sign the app bundle ad-hoc from the
// inside out so Gatekeeper's launch check accepts it.
//
// Order matters. codesign refuses to sign a bundle whose nested Mach-O
// components are unsigned, and readdir returns entries alphabetically — so
// a naïve post-order walk of Versions/A hits the main framework binary
// ("Electron Framework") before the Helpers/ directory, which fails.
//
// Handle each bundle type explicitly so inner helpers always go first.
//
// Each call uses `--sign -` alone (no --deep, no --options runtime) for a
// consistent ad-hoc signature; hardened runtime without an entitlements
// plist breaks Electron at launch.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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

// Recursively sign every Mach-O file under `dir` (skips symlinks).
// Used on framework helper / library directories where there are no nested
// code bundles — just plain Mach-O binaries.
function signMachOsUnder(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      signMachOsUnder(p);
      continue;
    }
    if (entry.isFile() && isMachO(p)) sign(p);
  }
}

function signFramework(fwPath) {
  const fwName = path.basename(fwPath, '.framework');
  const versionDir = path.join(fwPath, 'Versions', 'A');
  // 1. Helpers (e.g. chrome_crashpad_handler) — must be signed before the
  //    main framework binary or codesign on the binary errors "not signed
  //    at all. In subcomponent: Helpers/chrome_crashpad_handler".
  signMachOsUnder(path.join(versionDir, 'Helpers'));
  // 2. Libraries / Resources (if they contain Mach-Os).
  signMachOsUnder(path.join(versionDir, 'Libraries'));
  // 3. Main framework binary.
  const mainBin = path.join(versionDir, fwName);
  if (fs.existsSync(mainBin)) sign(mainBin);
  // 4. The framework bundle itself.
  sign(fwPath);
}

function signHelperApp(appPath) {
  // <Something>.app: sign Mach-Os under Contents/MacOS then the bundle.
  signMachOsUnder(path.join(appPath, 'Contents', 'MacOS'));
  sign(appPath);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');

  // Clear any lingering xattrs first — they corrupt re-signing.
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  } catch {}

  // Sign everything inside Contents/Frameworks first.
  if (fs.existsSync(frameworksDir)) {
    // Order: frameworks (with their own helpers) before helper .apps —
    // the helper apps link to Electron Framework so they need it signed.
    for (const entry of fs.readdirSync(frameworksDir)) {
      const p = path.join(frameworksDir, entry);
      if (entry.endsWith('.framework')) signFramework(p);
    }
    for (const entry of fs.readdirSync(frameworksDir)) {
      const p = path.join(frameworksDir, entry);
      if (entry.endsWith('.app')) signHelperApp(p);
      else if (/\.(dylib|so|node)$/i.test(entry) && isMachO(p)) sign(p);
    }
  }

  // Sign any loose Mach-Os under Contents/MacOS (the main exec).
  signMachOsUnder(path.join(appPath, 'Contents', 'MacOS'));

  // Finally the outer .app.
  sign(appPath);

  console.log(`[afterPack] ad-hoc signed ${appName}`);
};
