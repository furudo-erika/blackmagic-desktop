# Install & Run

## macOS

Downloads:

- Apple Silicon (M1/M2/M3/M4): `black-magic-mac-arm64.dmg`
- Intel: `black-magic-mac-x64.dmg`

1. Open the `.dmg`, drag **Black Magic** to Applications.
2. **First-open workaround** (the app isn't code-signed yet): right-click **Black Magic.app** → *Open* → confirm. Or from a terminal:

   ```
   xattr -d com.apple.quarantine "/Applications/Black Magic.app"
   open "/Applications/Black Magic.app"
   ```

3. Sign in (pastes your `ck_` key into `~/BlackMagic/.bm/config.toml`). The daemon starts automatically on a local port and seeds the vault.

## Windows

1. Download `Black Magic Setup 0.1.0.exe` and run.
2. Windows SmartScreen may warn — click *More info* → *Run anyway* (unsigned build).
3. The installer places the app in `%LocalAppData%\Programs\Black Magic` and drops a Start-menu shortcut.

## Vault location

Default: `~/BlackMagic` (macOS/Linux) or `%USERPROFILE%\BlackMagic` (Windows).

To use a different location, set `BM_VAULT_PATH` before launching, or edit `~/BlackMagic/.bm/config.toml` after the first run and relaunch.

## Env overrides

| Var | Default |
|---|---|
| `ZENN_API_KEY` | read from `.bm/config.toml` |
| `ZENN_BASE_URL` | `https://zenn.engineering/api/v1` |
| `BM_DEFAULT_MODEL` | `gpt-5.3-codex` |
| `BM_DAEMON_PORT` | ephemeral (allocated at boot) |
| `BM_BILLING_URL` | `https://blackmagic.engineering` |

## Troubleshooting

**Daemon doesn't start** — check `~/BlackMagic/.bm/daemon.json` after launch. If missing, inspect `~/Library/Logs/Black Magic/` (macOS) or check console output by launching from terminal:

```
"/Applications/Black Magic.app/Contents/MacOS/Black Magic"
```

**`zenn 401`** — invalid or missing `ck_` key. Re-paste in Settings.

**`zenn 402`** — credits exhausted. Top up at https://blackmagic.engineering/dashboard/billing.

**UI shows "daemon not connected"** — wait a few seconds on first launch (vault seeding + port binding). Restart the app if it persists.
