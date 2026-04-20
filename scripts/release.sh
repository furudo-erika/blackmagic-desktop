#!/usr/bin/env bash
# Build installers + upload to Cloudflare R2 with cache headers tuned for
# electron-updater. Two file classes:
#   - large binaries (dmg/exe/blockmap): max-age=300 (versioned filenames)
#   - update metadata (latest*.yml, version.json): no-store (must be fresh)
#
# Usage: ./scripts/release.sh
# Requires: pnpm, aws CLI, .env.local with STORAGE_* creds.

set -euo pipefail
cd "$(dirname "$0")/.."

# Load R2 creds.
set -a
# shellcheck disable=SC1091
source .env.local
set +a
export AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_ACCESS_KEY"
S3_BASE="s3://$STORAGE_BUCKET_NAME/blackmagic-desktop"
PUBLIC_BASE="$STORAGE_PUBLIC_URL/blackmagic-desktop"
ENDPOINT="--endpoint-url $STORAGE_ENDPOINT"

VERSION=$(node -e "console.log(require('./apps/desktop/package.json').version)")
# minVersion is the floor below which clients are force-quit on launch.
# Bump this only when shipping a breaking change clients MUST install.
MIN_VERSION="${MIN_VERSION:-$VERSION}"

echo "▶ Building renderer + daemon (v$VERSION)…"
pnpm --filter @bm/web build
pnpm --filter @bm/daemon build

echo "▶ Packaging mac (arm64+x64) + win (x64)…"
pnpm --filter @bm/desktop exec electron-builder --mac --x64 --arm64 --win --x64 --publish never

REL="apps/desktop/release"
MAC_ARM="$REL/BlackMagic AI-${VERSION}-arm64.dmg"
MAC_X64="$REL/BlackMagic AI-${VERSION}.dmg"
WIN_EXE="$REL/BlackMagic AI Setup ${VERSION}.exe"
MAC_YML="$REL/latest-mac.yml"
WIN_YML="$REL/latest.yml"

for f in "$MAC_ARM" "$MAC_X64" "$WIN_EXE" "$MAC_YML" "$WIN_YML"; do
  [[ -f "$f" ]] || { echo "✗ Missing: $f" >&2; exit 1; }
done

# Cache policies.
LONG_CACHE='public, max-age=300'
NO_CACHE='no-cache, no-store, must-revalidate'

upload () {
  # $1=local file  $2=remote key  $3=content-type  $4=cache-control
  echo "  → $2"
  aws s3 cp "$1" "$S3_BASE/$2" $ENDPOINT \
    --content-type "$3" \
    --cache-control "$4"
}

echo "▶ Uploading binaries…"
# electron-updater filenames (must match what's referenced in the yml).
upload "$MAC_ARM" "BlackMagic AI-${VERSION}-arm64.dmg" "application/x-apple-diskimage" "$LONG_CACHE"
upload "$MAC_X64" "BlackMagic AI-${VERSION}.dmg"       "application/x-apple-diskimage" "$LONG_CACHE"
upload "$WIN_EXE" "BlackMagic AI Setup ${VERSION}.exe" "application/x-msdownload"      "$LONG_CACHE"

# blockmaps (only if generated).
[[ -f "${MAC_ARM}.blockmap" ]] && upload "${MAC_ARM}.blockmap" "BlackMagic AI-${VERSION}-arm64.dmg.blockmap" "application/octet-stream" "$LONG_CACHE"
[[ -f "${MAC_X64}.blockmap" ]] && upload "${MAC_X64}.blockmap" "BlackMagic AI-${VERSION}.dmg.blockmap"       "application/octet-stream" "$LONG_CACHE"
[[ -f "${WIN_EXE}.blockmap" ]] && upload "${WIN_EXE}.blockmap" "BlackMagic AI Setup ${VERSION}.exe.blockmap" "application/octet-stream" "$LONG_CACHE"

# Stable aliases (used by the marketing/download page — version-agnostic URLs).
upload "$MAC_ARM" "black-magic-mac-arm64.dmg" "application/x-apple-diskimage" "$LONG_CACHE"
upload "$MAC_X64" "black-magic-mac-x64.dmg"   "application/x-apple-diskimage" "$LONG_CACHE"
upload "$WIN_EXE" "black-magic-win.exe"       "application/x-msdownload"      "$LONG_CACHE"

echo "▶ Uploading update metadata (no-cache)…"
upload "$MAC_YML" "latest-mac.yml" "text/yaml" "$NO_CACHE"
upload "$WIN_YML" "latest.yml"     "text/yaml" "$NO_CACHE"

echo "▶ Uploading download page (no-cache)…"
upload "scripts/download-page.html" "index.html" "text/html; charset=utf-8" "$NO_CACHE"

echo "▶ Writing version.json (no-cache)…"
TMP_VERSION_JSON=$(mktemp)
cat >"$TMP_VERSION_JSON" <<EOF
{
  "latestVersion": "$VERSION",
  "minVersion": "$MIN_VERSION",
  "downloadUrl": "$PUBLIC_BASE/index.html",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
upload "$TMP_VERSION_JSON" "version.json" "application/json" "$NO_CACHE"
rm "$TMP_VERSION_JSON"

echo "▶ Updating Homebrew cask (blackmagic-ai/homebrew-tap)…"
ARM_SHA=$(shasum -a 256 "$MAC_ARM" | awk '{print $1}')
X64_SHA=$(shasum -a 256 "$MAC_X64" | awk '{print $1}')
TAP_DIR="${TAP_DIR:-$HOME/.cache/blackmagic-homebrew-tap}"
if [[ ! -d "$TAP_DIR/.git" ]]; then
  git clone -q https://github.com/blackmagic-ai/homebrew-tap.git "$TAP_DIR"
fi
(
  cd "$TAP_DIR"
  git pull -q
  cat > Casks/blackmagic-ai.rb <<CASK
cask "blackmagic-ai" do
  version "$VERSION"

  on_arm do
    sha256 "$ARM_SHA"
    url "https://pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/BlackMagic%20AI-#{version}-arm64.dmg",
        verified: "pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/"
  end

  on_intel do
    sha256 "$X64_SHA"
    url "https://pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/BlackMagic%20AI-#{version}.dmg",
        verified: "pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/"
  end

  name "BlackMagic AI"
  desc "Agent-first AI desktop app"
  homepage "https://github.com/furudo-erika/blackmagic-desktop"

  app "BlackMagic AI.app"

  zap trash: [
    "~/Library/Application Support/BlackMagic AI",
    "~/Library/Logs/BlackMagic AI",
    "~/Library/Preferences/run.blackmagic.desktop.plist",
    "~/Library/Saved Application State/run.blackmagic.desktop.savedState",
  ]
end
CASK
  if ! git diff --quiet; then
    git add Casks/blackmagic-ai.rb
    git commit -q -m "blackmagic-ai $VERSION"
    git push -q origin main
    echo "  → cask updated to $VERSION"
  else
    echo "  → cask already up-to-date"
  fi
)

echo
echo "✔ Released v$VERSION (minVersion=$MIN_VERSION)."
echo "  $PUBLIC_BASE/version.json"
echo "  $PUBLIC_BASE/latest-mac.yml"
echo "  $PUBLIC_BASE/latest.yml"
echo "  $PUBLIC_BASE/black-magic-mac-arm64.dmg"
echo "  $PUBLIC_BASE/black-magic-mac-x64.dmg"
echo "  $PUBLIC_BASE/black-magic-win.exe"
