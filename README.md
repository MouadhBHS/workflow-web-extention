# Workflow — Time with intention

A local-first Manifest V3 time tracker for **Opera Air and Chrome**, migrated from [ADHD_Tracker](https://github.com/Selmi-Med-Dhia/ADHD_Tracker) at `61c8ccaa7372b06c05cf56d85ee75283da056e2e`. No server, accounts, telemetry, remote scripts, or browsing-history access.

## Install in Opera Air

1. Download this repository's ZIP with **Code → Download ZIP** and extract it to a permanent folder. Alternatively, use the smaller `workflow-extension.zip` from a successful Actions run and extract it.
2. Open `opera://extensions`, enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
3. Open the Extensions menu and **pin Workflow** to the toolbar. Pinning requires your action; extensions cannot force themselves into the toolbar.
4. Click Workflow to stamp in, switch categories, add a note, or stamp out. **Open dashboard** opens the complete app in a tab.

No build is needed to install. Keep the extracted folder in place. To update, replace its files and use Reload on the same extension card; do not remove the extension if you want to retain its data. Export a backup first. Browser profiles and different installation paths may have separate extension data.

## Appearance

In **Settings → Appearance → Color theme**, choose **Dark** or **Light**. The preference is saved locally, synchronizes across the open dashboard and quick-stamp popup, and is included in backups. Dark is the default for existing installs. The popup has a rounded inner frame; the browser controls the outside popup window frame, which can vary by browser and operating system.

## Floating Windows companion (optional)

The toolbar badge is intentionally **empty**; click the pinned Workflow icon to stamp in/out. For a large, playful always-on-top clock, download and run **Workflow Companion.exe** from the Windows build artifact. It stays small, can be dragged anywhere, and animates its eyes and expression based on the currently active category.

1. Open the companion executable on Windows. Right-click the character or its tray icon and choose **Copy pairing key**.
2. In the extension dashboard, open **Settings → Floating desktop companion**, paste the key, and select **Connect**. Approve access **only to 127.0.0.1** when Opera asks. No external network access.
3. Your time starts syncing immediately and every ~30 seconds while Opera is open, including category names and colors. The desktop clock advances from the original session start timestamp even if the extension popup is closed.
4. Right-click the companion for **Start with Windows**, **Copy pairing key**, **Regenerate key**, **Hide** (tray icon restores it), or **Exit**.

The companion is display-only: tracking history, notes, session changes and category management stay in the extension. It cannot stamp in/out. The pairing secret is a random 128-bit value stored separately from your tracking backups. The bridge listens strictly on `127.0.0.1:38473`; only requests with the key and a browser-extension origin are accepted. Connecting is optional, and losing the connection never causes a tracking write to fail. The companion indicates when the browser has not refreshed it recently; a running timer continues from the last known timestamp. If you close the browser, syncing stops until it restarts. Do not uninstall the extension or clear its storage if you need your history.

An active session **continues through sleep and browser restarts until stamped out**, like a stopwatch. Forgotten time can be corrected in Timeline.

## Features retained and added

| Desktop feature | Extension equivalent |
|---|---|
| Stamp in/out and switch category | Toolbar popup and dashboard; one active session |
| Optional session notes | Popup and add/edit entry dialog |
| Today totals and distribution | Overview, with 7-day rhythm chart |
| 7/30-day insights | Insights tab, daily bars and proportions |
| Timeline slider | Drag-select gaps, move/resize ranges, arrow-key handles, exact time fields |
| Reassign or clear a range | Atomic trimming/splitting; outside notes and active remainder preserved |
| Manual entry edit/delete | Timeline dialog; rejects overlaps and future times |
| Category colors and 12 icons | Settings, synchronized across open views |
| **Editable category names** | Settings, 1–32 characters; historical IDs stay intact |
| System tray | Browser toolbar popup; dashboard remains independent |
| Windows startup | Extension loads with the browser; companion has optional per-user Start with Windows |
| Acrylic desktop transparency | Adjustable dark dashboard tint; browser cannot blur desktop behind its page |
| Optional active-use reminders | Opt-in idle + notifications permissions; approximately 2 minutes of observed active use, configurable cooldown, paused while idle/tracking |
| Local SQLite | Local extension storage; JSON backup/restore and desktop migration script |

Shortcuts: **Alt+Shift+W** quick stamp, **Alt+Shift+S** stamp out. Change bindings in the browser's extension shortcut settings if another app reserves them. Reminder notifications are optional and off initially. Browser/OS notification settings may suppress them.

## Move your desktop history

The extension cannot silently read Windows application data. Close the desktop tracker and copy `%APPDATA%\com.tempo.adhdtracker\tempo.sqlite3` (check your actual Tauri app-data folder). Run with Python 3:

```powershell
python scripts/migrate-desktop.py "C:\path\to\tempo.sqlite3" workflow-backup.json
```

This reads the SQLite file in read-only mode and exports entries, colors/icons, tint and cooldown. Reminders remain disabled until enabled in the browser. In extension **Settings → Restore JSON**, select the output. Restoring replaces current extension entries and settings after confirmation. Export current data first. Invalid/overlapping histories are rejected without modifying data. A still-active desktop session stays active after import.

## Windows companion developer build

The native Windows source is in `companion/`. The separate **Build Windows companion** GitHub Actions workflow compiles a self-contained win-x64 `WorkflowCompanion.exe`, exercises real loopback HTTP security tests, and saves screenshots generated by the **same GDI+ renderer used by the floating window**. Download its artifact from the Actions tab. No .NET installation is needed to run the published executable. Opera Air itself is not installed on the CI runner, so first pairing must also be checked on the target PC.

```powershell
dotnet run --project companion/WorkflowCompanion.csproj -c Release -- --self-test
dotnet run --project companion/WorkflowCompanion.csproj -c Release -- --render-samples artifacts/companion
dotnet publish companion/WorkflowCompanion.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false
```

## Development and validation

Node 22+, Python 3 (packaging/migration only):

```sh
npm install
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run package
```

On Linux use `xvfb-run -a npm run test:browser` for a headed browser. `CHROME_PATH` optionally selects an executable. The browser suite loads the **real unpacked extension** in an isolated persistent profile. It exercises browser storage, the service worker, empty badge state, popup/dashboard synchronization, category editing, timeline changes, concurrent writes, and browser/worker restarts. Screenshots and the machine-readable results are generated in `artifacts/`. GitHub Actions publishes these alongside the install ZIP. Opera Air-specific visual checks still need Windows/Opera Air; Chromium tests must not be mistaken for an Opera Air test.

Data mutations are serialized by the service worker and stored atomically under one versioned storage key. If storage quota is reached, the write fails visibly without replacing existing data. There are no content scripts or automatic host permissions; local loopback host permission is requested only when the user pairs the companion. Browser local storage is not an encrypted vault; export backups before uninstalling or clearing profile data.
