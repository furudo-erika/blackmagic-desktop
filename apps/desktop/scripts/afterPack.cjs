// electron-builder afterPack hook: re-sign the app bundle ad-hoc from the
// inside out so Gatekeeper's launch check accepts it.
//
// Why not just `codesign --deep --sign -`? --deep walks the bundle in an
// order that can leave Electron Framework with a different ad-hoc TeamID
// than the outer binary, and macOS then refuses to map the framework:
//
//   "mapping process and mapped file (non-platform) have different Team IDs"
//
// The Apple-recommended fix is to sign each nested Mach-O / bundle
// explicitly, innermost first, then the outer .app last. Each call with
// `--sign -` produces a consistent ad-hoc signature.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sign(target) {
  execSync(`codesign --force --sign - "${target}"`, { stdio: 'inherit' });
}

function listFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (predicate(p, entry)) out.push(p);
      // Recurse to catch nested frameworks / helper apps too.
      listFiles(p, predicate, out);
    }
  }
  return out;
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

  // 1. Inner helper apps (GPU, Renderer, Plugin, etc) — sign their
  //    Mach-O executable, then the .app bundle itself.
  const helperApps = listFiles(
    frameworksDir,
    (_, entry) => entry.name.endsWith('.app'),
  );
  for (const helper of helperApps) {
    const execName = path.basename(helper, '.app');
    const execPath = path.join(helper, 'Contents', 'MacOS', execName);
    if (fs.existsSync(execPath)) sign(execPath);
    sign(helper);
  }

  // 2. Frameworks — sign the inner Versions/A/<Framework> first, then the
  //    .framework bundle. Electron Framework is the critical one.
  const frameworks = listFiles(
    frameworksDir,
    (_, entry) => entry.name.endsWith('.framework'),
  );
  for (const fw of frameworks) {
    const fwName = path.basename(fw, '.framework');
    const inner = path.join(fw, 'Versions', 'A', fwName);
    if (fs.existsSync(inner)) sign(inner);
    sign(fw);
  }

  // 3. Loose dylibs / Mach-O under Contents/Frameworks/*.dylib.
  if (fs.existsSync(frameworksDir)) {
    for (const name of fs.readdirSync(frameworksDir)) {
      if (name.endsWith('.dylib') || name.endsWith('.so')) {
        sign(path.join(frameworksDir, name));
      }
    }
  }

  // 4. Main app last. Identifier now matches CFBundleIdentifier, and every
  //    nested component has a fresh consistent ad-hoc signature.
  sign(appPath);

  console.log(`[afterPack] ad-hoc signed ${appName} (${helperApps.length} helpers, ${frameworks.length} frameworks)`);
};
