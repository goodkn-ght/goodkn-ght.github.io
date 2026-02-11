#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "data");
const eventsPath = path.join(dataDir, "lsu_events.json");
const sourcesPath = path.join(dataDir, "sources.json");
const TZ = "America/Chicago";

const SOURCE_DEFINITIONS = [
  {
    id: "athletics",
    name: "LSU Athletics",
    type: "json",
    url: "https://lsusports.net/wp-json/lsusports/v1/events?per_page=100",
    category: "Athletics",
    fallbackUrl: "https://lsusports.net/sports",
  },
  {
    id: "campus",
    name: "LSU Campus Events",
    type: "ics",
    url: "https://calendar.lsu.edu/calendar.ics",
    category: "Campus",
    fallbackUrl: "https://calendar.lsu.edu",
  },
  {
    id: "academic",
    name: "LSU Academic Calendar",
    type: "ics",
    url: "https://www.lsu.edu/academicaffairs/resources/academic_calendar/icalendar/academic-calendar.ics",
    category: "Academic",
    fallbackUrl: "https://www.lsu.edu/academicaffairs/resources/academic_calendar/index.php",
  },
];

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "goodknight-lsu-widget" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function foldIcsLines(text) {
  const lines = text.split(/\r?\n/);
  const unfolded = [];
  for (const raw of lines) {
    if (!raw) continue;
    if (/^[ \t]/.test(raw) && unfolded.length) {
      unfolded[unfolded.length - 1] += raw.trim();
    } else {
      unfolded.push(raw.trim());
    }
  }
  return unfolded;
}

function parseIcsDate(raw) {
  if (!raw) return null;
  const parts = raw.split(":");
  const value = parts.slice(1).join(":") || parts[0];
  const tzMatch = raw.match(/TZID=([^;:]+)/i);
  if (value.length === 8) {
    // DATE ONLY YYYYMMDD
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const date = new Date(Date.UTC(year, month, day));
    return date.toISOString();
  }
  // Assume UTC or local; Date parses RFC3339 if we insert separators
  const cleaned = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, "$1-$2-$3T$4:$5:$6Z");
  if (tzMatch) {
    // Interpret as America/Chicago by default
    const iso = cleaned.endsWith("Z") ? cleaned : `${cleaned}Z`;
    return iso;
  }
  return cleaned.endsWith("Z") ? cleaned : `${cleaned}Z`;
}

function parseIcs(text, source) {
  const lines = foldIcsLines(text);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.SUMMARY && current.DTSTART) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const [rawKey, ...rest] = line.split(":");
    const value = rest.join(":");
    const key = rawKey.split(";")[0];
    current[key] = value;
  }
  return events.map((evt) => ({
    title: evt.SUMMARY?.trim() ?? "Untitled",
    start: parseIcsDate(evt.DTSTART),
    end: parseIcsDate(evt.DTEND) ?? parseIcsDate(evt.DTSTART),
    location: evt.LOCATION?.trim() || "TBD",
    status: evt.STATUS?.toLowerCase() || "scheduled",
    url: evt.URL?.trim() || source.fallbackUrl,
    description: evt.DESCRIPTION?.trim() || "",
  }));
}

function parseAthleticsJson(raw, source) {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((game) => ({
      title: game?.title?.rendered?.replace(/<[^>]+>/g, "") || game?.post_title || "LSU Athletics Event",
      start: game?.event_start || game?.start_time,
      end: game?.event_end || game?.end_time || game?.event_start,
      location: game?.venue?.title || game?.location || "TBD",
      status: game?.status?.toLowerCase?.() || "scheduled",
      url: game?.link || game?.permalink || source.fallbackUrl,
      description: game?.excerpt?.rendered?.replace(/<[^>]+>/g, "") || "",
    }));
  } catch (err) {
    console.error(`Failed to parse athletics JSON: ${err.message}`);
    return [];
  }
}

function normalizeEvent(evt, source) {
  const startIso = evt.start ? new Date(evt.start).toISOString() : null;
  if (!startIso) return null;
  const endIso = evt.end ? new Date(evt.end).toISOString() : startIso;
  const id = `${source.id}-${Buffer.from(`${evt.title}-${startIso}`).toString("base64").replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  return {
    id,
    title: evt.title || "Untitled LSU Event",
    category: source.category,
    start: startIso,
    end: endIso,
    location: evt.location || "TBD",
    status: (evt.status || "scheduled").toLowerCase(),
    url: evt.url || source.fallbackUrl,
    source: source.name,
    updated_at: new Date().toISOString(),
  };
}

async function collectEvents() {
  const normalized = [];
  const sourceHealth = [];
  for (const source of SOURCE_DEFINITIONS) {
    const entry = { id: source.id, name: source.name, type: source.type, url: source.url, category: source.category };
    try {
      const raw = await fetchText(source.url);
      let parsed = [];
      if (source.type === "ics") parsed = parseIcs(raw, source);
      else parsed = parseAthleticsJson(raw, source);
      const events = parsed
        .map((evt) => normalizeEvent(evt, source))
        .filter(Boolean);
      normalized.push(...events);
      entry.status = "ok";
      entry.events = events.length;
      entry.last_success = new Date().toISOString();
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
      entry.last_failure = new Date().toISOString();
      console.error(`[lsu-widget] ${source.id} failed: ${err.message}`);
    }
    sourceHealth.push(entry);
  }

  // Deduplicate by title+start
  const deduped = [];
  const seen = new Set();
  for (const evt of normalized) {
    const key = `${evt.title}-${evt.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(evt);
  }

  if (deduped.length === 0) {
    const now = new Date();
    const sample = [
      {
        id: "sample-athletics",
        title: "Sample: Baseball vs. Florida",
        category: "Athletics",
        start: new Date(now.getTime() + 3600_000).toISOString(),
        end: new Date(now.getTime() + 3 * 3600_000).toISOString(),
        location: "Alex Box Stadium",
        status: "scheduled",
        url: "https://lsusports.net",
        source: "Synthetic Seed",
        updated_at: now.toISOString(),
      },
      {
        id: "sample-campus",
        title: "Sample: Innovation Park Tour",
        category: "Campus",
        start: new Date(now.getTime() + 26 * 3600_000).toISOString(),
        end: new Date(now.getTime() + 28 * 3600_000).toISOString(),
        location: "Patrick F. Taylor Hall",
        status: "scheduled",
        url: "https://calendar.lsu.edu",
        source: "Synthetic Seed",
        updated_at: now.toISOString(),
      },
      {
        id: "sample-academic",
        title: "Sample: FAFSA Priority Deadline",
        category: "Academic",
        start: new Date(now.getTime() + 5 * 86400_000).toISOString(),
        end: new Date(now.getTime() + 5 * 86400_000 + 3600_000).toISOString(),
        location: "Online",
        status: "deadline",
        url: "https://www.lsu.edu/academicaffairs",
        source: "Synthetic Seed",
        updated_at: now.toISOString(),
      },
    ];
    deduped.push(...sample);
  }

  deduped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const highlights = deduped
    .filter((evt) => new Date(evt.start).getTime() >= Date.now())
    .slice(0, 3)
    .map((evt) => evt.id);

  const deadlineRadar = deduped
    .filter((evt) => evt.category === "Academic")
    .slice(0, 5)
    .map((evt) => ({ id: evt.id, title: evt.title, date: evt.start }));

  return {
    events: deduped,
    highlights,
    deadlineRadar,
    sourceHealth,
  };
}

function writeIfChanged(filePath, content) {
  try {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing === content) return false;
  } catch (_) {
    // ignore missing
  }
  fs.writeFileSync(filePath, content);
  return true;
}

(async () => {
  const start = Date.now();
  const { events, highlights, deadlineRadar, sourceHealth } = await collectEvents();
  const payload = {
    updated_at: new Date().toISOString(),
    timezone: TZ,
    events,
    highlights,
    deadline_radar: deadlineRadar,
  };

  const sourcesPayload = {
    updated_at: new Date().toISOString(),
    sources: sourceHealth,
  };

  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  const eventsChanged = writeIfChanged(eventsPath, JSON.stringify(payload, null, 2));
  const sourcesChanged = writeIfChanged(sourcesPath, JSON.stringify(sourcesPayload, null, 2));

  console.log(`[lsu-widget] events written: ${eventsChanged}, sources written: ${sourcesChanged}`);
  console.log(`[lsu-widget] total events: ${payload.events.length}, highlights: ${payload.highlights.length}`);
  console.log(`[lsu-widget] duration ${(Date.now() - start)}ms`);

  // Exit code 78 instructs GitHub Action step to skip commit when nothing changed
  if (!eventsChanged && !sourcesChanged) {
    process.exitCode = 78;
  }
})();
