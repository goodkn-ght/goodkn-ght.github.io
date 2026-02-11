# LSU Live Widget

A self-updating LSU events widget built for static hosting (GitHub Pages). It fetches athletics, campus, and academic sources via GitHub Actions, normalizes to JSON, and renders a fully client-side experience with tabs, filters, highlights, and add-to-calendar links.

## Features
- **UI:** Tabs for *Live Now*, *This Week*, and *Calendar*, keyword search, category filters, notification toggle (localStorage), source health badge, and ICS add-to-calendar.
- **Innovation modules:** spotlight on the next three marquee events, quick links (athletics hub, tickets, map, etc.), and an academic deadline radar.
- **Data:** Normalized schema `{ id, title, category, start, end, location, status, url, source, updated_at }` saved to `/data/lsu_events.json` with `/data/sources.json` capturing health + telemetry.
- **Automation:** Scheduled workflow refreshes data every 30 minutes (06:00–22:00 America/Chicago) and hourly overnight, only committing changes when JSON files differ.

## Embedding the Widget
Add these tags anywhere inside your GitHub Pages layout:

```html
<link rel="stylesheet" href="/lsu-widget/widget.css" />
<script src="/lsu-widget/widget.js"></script>
<div id="lsu-widget"></div>
```

The script auto-mounts when it detects `#lsu-widget`. For local testing, open `/lsu-widget/index.html`.

## Data Pipeline
1. **Workflow:** `.github/workflows/lsu-widget-data.yml` runs on the schedule above (plus `workflow_dispatch`).
2. **Fetcher:** `scripts/lsu-widget-fetch.js` hits public LSU endpoints:
   - LSU Athletics JSON (`/wp-json/tribe/events/v1/events`)
   - LSU Campus calendar ICS (`calendar.lsu.edu/calendar.ics`)
   - LSU academic calendar ICS
3. **Parsing:** JSON / ICS parsers normalize events, dedupe by `title+start`, and trim to the nearest ~120 items. When a source fails, the script logs the error, preserves previously good data, and (if nothing exists) seeds with realistic synthetic events.
4. **Outputs:**
   - `/data/lsu_events.json` – events, timezone, highlights, deadline radar.
   - `/data/sources.json` – per-source status, timestamps, latency or errors.
5. **Commit logic:** After fetching, the workflow checks for diffs. If unchanged, it exits without a commit to minimize noise.

## Customization
- **Categories:** edit `CATEGORY_OPTIONS` in `lsu-widget/widget.js` to expose new filters.
- **Sources:** update `SOURCES` inside `scripts/lsu-widget-fetch.js` with new feeds or alternate URLs. The schema + dedupe logic adapts automatically.
- **Innovation modules:** adjust the quick-link list or deadline radar behavior in `widget.js` without touching the data pipeline.

## Operational Notes
- **Timezone:** All scheduling assumptions use `America/Chicago`. ICS parsing applies a simplified UTC-6 offset when timezones are not supplied.
- **Fail-soft behavior:** If every feed fails, the script reuses the previous snapshot; if none exists, it uses synthetic seeds and marks sources as errored.
- **Testing locally:** Run `node scripts/lsu-widget-fetch.js` to refresh JSON, then open `/lsu-widget/index.html` via a static server (e.g., `npx serve`).
- **Future enhancements:** Replace failing endpoints with confirmed LSU feeds (athletics APIs occasionally 404/403 anonymously). The script is structured so swapping URLs is a single change.
