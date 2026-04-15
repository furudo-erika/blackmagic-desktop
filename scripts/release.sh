#!/usr/bin/env bash
# Build installers and upload them to a fresh GitHub Release.
#
# Usage:
#   ./scripts/release.sh [tag]        # defaults to v<package.json version>
#
# Requires: pnpm, gh (authenticated), electron-builder deps installed.
# Drops:    apps/desktop/release/*.dmg, *.exe
# Uploads:  to github.com/furudo-erika/blackmagic-desktop/releases/<tag>

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./apps/desktop/package.json').version)")
TAG="${1:-v$VERSION}"

echo "▶ Building renderer + daemon…"
pnpm --filter @bm/web build
pnpm --filter @bm/daemon build

echo "▶ Packaging Mac (arm64 + x64) + Windows (x64)…"
pnpm --filter @bm/desktop exec electron-builder --mac --x64 --arm64 --win --x64

RELEASE_DIR="apps/desktop/release"
MAC_ARM="$RELEASE_DIR/Black Magic-${VERSION}-arm64.dmg"
MAC_X64="$RELEASE_DIR/Black Magic-${VERSION}.dmg"
WIN_EXE="$RELEASE_DIR/Black Magic Setup ${VERSION}.exe"

for f in "$MAC_ARM" "$MAC_X64" "$WIN_EXE"; do
  [[ -f "$f" ]] || { echo "✗ Missing: $f" >&2; exit 1; }
done

NOTES="Automated build of $TAG.

**Install**
- macOS arm64: \`black-magic-mac-arm64.dmg\`
- macOS Intel: \`black-magic-mac-x64.dmg\`
- Windows x64: \`black-magic-win.exe\`

First-open on macOS (unsigned): \`xattr -d com.apple.quarantine /Applications/Black\\ Magic.app\`."

echo "▶ Creating release ${TAG}…"
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "  (release exists — uploading / overwriting assets)"
  gh release upload --clobber "$TAG" \
    "$MAC_ARM#black-magic-mac-arm64.dmg" \
    "$MAC_X64#black-magic-mac-x64.dmg" \
    "$WIN_EXE#black-magic-win.exe"
else
  gh release create "$TAG" \
    --title "Black Magic Desktop $TAG" \
    --notes "$NOTES" \
    "$MAC_ARM#black-magic-mac-arm64.dmg" \
    "$MAC_X64#black-magic-mac-x64.dmg" \
    "$WIN_EXE#black-magic-win.exe"
fi

BASE="https://github.com/furudo-erika/blackmagic-desktop/releases/download/$TAG"
echo
echo "✔ Release $TAG live. Stable URLs:"
echo "  $BASE/black-magic-mac-arm64.dmg"
echo "  $BASE/black-magic-mac-x64.dmg"
echo "  $BASE/black-magic-win.exe"
