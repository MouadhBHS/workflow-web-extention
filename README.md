# Workflow — Time with intention

A local-first Manifest V3 time tracker for **Opera Air and Chrome**, migrated from [ADHD_Tracker](https://github.com/Selmi-Med-Dhia/ADHD_Tracker) at `61c8ccaa7372b06c05cf56d85ee75283da056e2e`. No server, accounts, telemetry, remote scripts, or browsing-history access.

## Install in Opera Air

1. Download this repository's ZIP with **Code → Download ZIP** and extract it to a permanent folder. Alternatively, use the smaller `workflow-extension.zip` from a successful Actions run and extract it.
2. Open `opera://extensions`, enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
3. Open the Extensions menu and **pin Workflow** to the toolbar. Pinning requires your action; extensions cannot force themselves into the toolbar.
4. Click Workflow to stamp in, switch categories, add a note, or stamp out. **Open dashboard** opens the complete app in a tab.

No build is needed to install. Keep the extracted folder in place. To update, replace its files and use Reload on the same extension card; do not remove the extension if you want to retain its data. Export a backup first. Browser profiles and different installation paths may have separate extension data.

## Toolbar timer

The native action badge occupies the existing icon slot: `0m`–`59m`, then `1:00`–`9:59`, then `10h` and above. Hover for the full hours/minutes and category. The popup and dashboard show hours/minutes/seconds.

Chrome's toolbar action API offers an icon, badge, tooltip and popup, not arbitrary persistent HTML. A native badge is used instead of repeatedly generating timer images. Pinning makes it visible across all tabs, even with the dashboard closed. Background alarms refresh it about every 30 seconds; browser scheduling can delay a refresh, particularly during sleep. Elapsed time is calculated from persisted timestamps, never accumulated ticks.

An active session **continues through sleep and browser restarts until stamped out**, like a stopwatch. No background code runs while the browser is fully closed. The badge catches up when it resumes. Forgotten time can be corrected in Timeline.

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
| Windows startup | Extension loads with the browser; cannot launch Opera with Windows |
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

## Development and validation

Node 22+, Python 3 (packaging/migration only):

```sh
npm install
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run package
```

On Linux use `xvfb-run -a npm run test:browser` for a headed browser. `CHROME_PATH` optionally selects an executable. The browser suite loads the **real unpacked extension** in an isolated persistent profile. It exercises browser storage, the service worker, badge state, popup/dashboard synchronization, category editing, timeline changes, concurrent writes, and browser/worker restarts. Screenshots and the machine-readable results are generated in `artifacts/`. GitHub Actions publishes these alongside the install ZIP. Opera Air-specific visual checks still need Windows/Opera Air; Chromium tests must not be mistaken for an Opera Air test.

Data mutations are serialized by the service worker and stored atomically under one versioned storage key. If storage quota is reached, the write fails visibly without replacing existing data. There are no content scripts or host permissions. Browser local storage is not an encrypted vault; export backups before uninstalling or clearing profile data.
