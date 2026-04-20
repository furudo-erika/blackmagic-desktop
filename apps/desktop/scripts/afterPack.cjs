// electron-builder afterPack hook: replace Electron's linker-signed stub with
// a real ad-hoc signature whose designated identifier matches the bundle ID.
// Without this, macOS Gatekeeper rejects the app on launch as "damaged"
// (Identifier=Electron vs CFBundleIdentifier=run.blackmagic.desktop mismatch).

const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);

  execSync(
    `codesign --force --deep --options runtime --sign - "${appPath}"`,
    { stdio: 'inherit' }
  );

  // Strip quarantine in case build env leaked any.
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  } catch {}

  console.log(`[afterPack] ad-hoc signed ${appName}`);
};
