# Person 3 — UI & Dashboard (Full Stack · Wow #2 & #3 Owner)

**You own:** what judges see. Polish > features.

**Time:** 2:00 PM → 6:00 PM demo  
**Wow moments:** Live dashboard ticking + side-by-side doc → JSON → Parquet

---

## Your stack

- React + TypeScript (Tauri frontend)
- Tailwind or existing design system
- `@tauri-apps/api` event listener + invoke

---

## Hour-by-hour

### 2:00–2:30 — Shell + drop zone

- [ ] Two-tab layout:
  - **Pipeline** (default) — dashboard
  - **Extraction** — side-by-side viewer
- [ ] Drag-and-drop zone (also file picker fallback):

```tsx
// on drop:
await invoke("ingest_files", { paths });
await invoke("process_batch");
```

- [ ] Show immediate feedback: "Processing N files..." spinner

### 2:30–3:30 — Pipeline Health Dashboard (6 cards only)

Build these cards — big numbers, dark theme, update live:

| Card | Source |
|------|--------|
| Files Ingested | `metrics.totalFiles` |
| Completed / Failed | `metrics.completed` / `metrics.failed` |
| Extraction Accuracy | `metrics.accuracyPct` % |
| Validation Pass Rate | `metrics.validationPassRate` % |
| AI vs Deterministic | `metrics.aiParsed` vs `metrics.deterministicParsed` |
| Recent Failures table | `metrics.recentFailures` |

- [ ] Listen for Tauri events:

```tsx
import { listen } from "@tauri-apps/api/event";

listen("metrics:update", () => refreshMetrics());
listen("file:completed", () => refreshMetrics());
listen("file:failed", () => refreshMetrics());
```

- [ ] Poll fallback every 2s if events flaky: `invoke("get_metrics")`

### 3:30–4:30 — Live status + color coding

- [ ] File list below cards: name, type icon, status badge
  - 🟢 completed
  - 🔴 failed / quarantined
  - 🟡 processing
- [ ] Parser path badge on each row: **"AI Learned"** (purple) vs **"Deterministic ⚡"** (green)
- [ ] Cards animate on change (simple count-up or flash — CSS only, no library)

### 4:30–5:15 — Extraction viewer (side-by-side)

- [ ] Tab 2: dropdown or file list → select file
- [ ] Three columns:
  1. **Source** — img preview or "PDF/Excel" icon + filename
  2. **Silver JSON** — pretty-printed, syntax highlight optional
  3. **Gold Row** — table with Parquet row fields
- [ ] Show accuracy badge per file if available
- [ ] `invoke("get_file_detail", { fileId })`

### 5:15–5:30 — SQL demo panel (small)

- [ ] Collapsible "Analytics" section with pre-filled query + Run button
- [ ] Display results as simple HTML table
- [ ] `invoke("run_analytics_query", { sql })`

### 5:30–5:45 — Polish pass

- [ ] Full viewport, no scroll jank
- [ ] Font size readable from 3 meters (judges table)
- [ ] Hide dev clutter, console errors
- [ ] App title: **Smriti** + subtitle "Enterprise Document Ingestion"

### 5:45–6:00 — Demo standby

- [ ] You drive the UI during demo (clicks)
- [ ] Pre-select best-looking file in Extraction tab before demo starts
- [ ] Window maximized, notifications off

---

## Component checklist

```
src/
  App.tsx
  components/
    DropZone.tsx         P0
    MetricsDashboard.tsx P0
    FailuresTable.tsx    P0
    FileList.tsx         P0
    ExtractionViewer.tsx P0
    SqlPanel.tsx         P1
```

---

## Do NOT build

- Auth, settings page, plugin installer
- Charts library / graphs (numbers in cards enough)
- WebSocket server
- Mobile responsive
- More than 2 tabs

---

## Done by 6 PM

- [ ] Drop files → dashboard numbers move without refresh
- [ ] Failure shows red in file list + failures table
- [ ] Deterministic badge visible on re-ingested file
- [ ] Side-by-side view shows JSON for ≥1 file
- [ ] Looks intentional, not hackathon-default ugly

---

## If blocked

| Blocker | Fallback |
|---------|----------|
| Tauri events not firing | 2s polling `get_metrics` |
| Image preview hard | Show filename + type icon only |
| JSON pretty-print | `JSON.stringify(data, null, 2)` in `<pre>` |
| Parquet row unavailable | Show "Gold ✓ written" + path string |

---

## Demo clicks (you operate UI)

| Time | Your action |
|------|-------------|
| 1–2 min | Drag-drop batch onto zone |
| 2–4 min | Point at dashboard cards updating |
| 7–8 min | Show Deterministic ⚡ badge on re-ingested file |
| 8–10 min | Click failed file → show red status |
| 10–12 min | Switch to Extraction tab → side-by-side |
| 12–13 min | Hit Run on SQL panel |
