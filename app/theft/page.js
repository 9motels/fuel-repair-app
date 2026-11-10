"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePerson } from "@/lib/personContext";

// Theft Review: flagged camera clips from each store's AI, grouped into
// incidents (the same moment seen from several cameras), newest first. Each
// incident shows Claude's reason per camera, the 6-frame strip, the 20 s clip on
// tap, and one set of label buttons that applies to every camera in the group.
// A label can carry a short reason (chips + optional note); labels and reasons go
// back to the store Mac as training data. Push notifications deep-link here with
// ?e=<event id>.

const LABEL_BUTTONS = [
  { value: "theft", label: "Theft", cls: "bg-red-600 hover:bg-red-700 text-white" },
  { value: "not", label: "Not theft", cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { value: "unsure", label: "Unsure", cls: "bg-slate-500 hover:bg-slate-600 text-white" },
];
const LABEL_TEXT = { theft: "Theft", not: "Not theft", unsure: "Unsure" };
// Why-chips per label. Short and consistent so they can be counted later.
const REASONS = {
  theft: ["Pocketed / concealed", "Into bag or backpack", "Ate or drank it", "Left without paying", "Other camera shows it"],
  not: ["Paid at register", "Put it back", "Staff", "Just browsing / carrying openly", "Phone, keys or own item"],
  unsure: ["View blocked", "Too far / too small", "Need another camera", "Can't tell what happened"],
};
const RANK = { likely: 2, possible: 1, false: 0 };
const WINDOW_S = 120; // clips from one store within this many seconds are one incident when the device didn't tag them

function fmtTime(s) {
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtClock(s) {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? s : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
function secs(s) { return new Date(String(s).replace(" ", "T")).getTime() / 1000; }

// Group events into incidents: shared incident_id, else same store within WINDOW_S of any member.
function groupIncidents(events) {
  const groups = [];
  for (const ev of [...events].sort((a, b) => secs(b.event_time) - secs(a.event_time))) {
    let g = ev.incident_id ? groups.find((x) => x.incident_id === ev.incident_id) : null;
    if (!g && !ev.incident_id) {
      g = groups.find((x) => !x.incident_id && x.location_id === ev.location_id && x.events.some((e) => Math.abs(secs(e.event_time) - secs(ev.event_time)) <= WINDOW_S));
    }
    if (g) g.events.push(ev);
    else groups.push({ key: ev.incident_id || ev.id, incident_id: ev.incident_id, location_id: ev.location_id, events: [ev] });
  }
  for (const g of groups) {
    g.events.sort((a, b) => secs(a.event_time) - secs(b.event_time));
    g.rating = g.events.reduce((r, e) => (RANK[e.rating] > RANK[r] ? e.rating : r), "false");
    g.alerted = g.events.some((e) => e.alerted);
    g.label = g.events.every((e) => e.label && e.label === g.events[0].label) ? g.events[0].label : null;
    g.labeled = g.events.find((e) => e.label) || null;
  }
  return groups;
}

export default function TheftReviewPage() {
  const { currentPerson } = usePerson();
  const [events, setEvents] = useState([]);
  const [focus, setFocus] = useState([]); // the deep-linked incident's events (any status)
  const [locations, setLocations] = useState([]);
  const [status, setStatus] = useState("unlabeled"); // unlabeled | labeled | all
  const [locationId, setLocationId] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const e = new URLSearchParams(window.location.search).get("e");
    if (e) setFocusId(e);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ status, limit: "80" });
      if (locationId) qs.set("location_id", locationId);
      if (alertsOnly) qs.set("alerted", "1");
      const [evRes, locRes] = await Promise.all([fetch(`/api/theft/events?${qs}`), fetch("/api/locations")]);
      if (!evRes.ok) throw new Error("Could not load clips.");
      setEvents(await evRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (focusId) {
        const f = await fetch(`/api/theft/events?id=${encodeURIComponent(focusId)}`).then((r) => (r.ok ? r.json() : []));
        setFocus(f);
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [status, locationId, alertsOnly, focusId]);

  useEffect(() => { load(); }, [load]);

  // Label every clip in the incident (null clears). reason -> label_note.
  async function labelGroup(group, label, reason) {
    const body = JSON.stringify({ label, labeled_by_id: currentPerson?.id || null, label_note: reason || "" });
    const results = await Promise.all(group.events.map((ev) =>
      fetch(`/api/theft/events/${encodeURIComponent(ev.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })));
    if (results.some((r) => !r.ok)) { setError("Could not save the label."); return false; }
    const ids = new Set(group.events.map((e) => e.id));
    const patch = (x) => (ids.has(x.id) ? { ...x, label, label_note: reason || "", labeled_by_name: label ? currentPerson?.name || null : null, labeled_at: label ? new Date().toISOString() : null } : x);
    setEvents((list) => (status === "unlabeled" && label ? list.filter((x) => !ids.has(x.id)) : list.map(patch)));
    setFocus((list) => list.map(patch));
    return true;
  }

  const focusKeys = new Set(focus.map((e) => e.id));
  const groups = [...groupIncidents(focus), ...groupIncidents(events.filter((e) => !focusKeys.has(e.id)))];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Theft Review</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5">
            <option value="">All stores</option>
            {locations.filter((l) => !l.is_central).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
            {[["unlabeled", "Needs review"], ["labeled", "Labeled"], ["all", "All"]].map(([v, t]) => (
              <button key={v} onClick={() => setStatus(v)}
                      className={`px-3 py-1.5 ${status === v ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}>{t}</button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 cursor-pointer">
            <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} /> Alerts only
          </label>
        </div>
      </div>

      {!currentPerson && (
        <div className="mb-4 text-sm rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-2">
          Pick your name in the sidebar so labels are recorded as yours.
        </div>
      )}
      {error && <div className="mb-4 text-sm rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-3 py-2">{error}</div>}

      {loading ? (
        <div className="text-slate-400 dark:text-slate-500 py-16 text-center">Loading clips...</div>
      ) : groups.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400 py-16 text-center">
          {status === "unlabeled" ? "Nothing waiting for review." : "No clips match."}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => <IncidentCard key={g.key} group={g} highlight={g.events.some((e) => e.id === focusId)} onLabel={labelGroup} />)}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ group, highlight, onLabel }) {
  const [pending, setPending] = useState(null); // label chosen, waiting for a reason
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const first = group.events[0]; const last = group.events[group.events.length - 1];
  const multi = group.events.length > 1;

  useEffect(() => { if (highlight && ref.current) ref.current.scrollIntoView({ block: "start" }); }, [highlight]);

  async function save(reason) {
    setBusy(true);
    try {
      const why = [reason, note.trim()].filter(Boolean).join(" - ");
      if (await onLabel(group, pending, why)) { setPending(null); setNote(""); }
    } finally { setBusy(false); }
  }

  const ratingCls = group.rating === "likely" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    : group.rating === "possible" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

  return (
    <div ref={ref} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border ${highlight ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" : "border-slate-200 dark:border-slate-700"} overflow-hidden`}>
      <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ratingCls}`}>
          {group.rating === "likely" ? "Likely theft" : group.rating === "possible" ? "Possible" : "Low"}
        </span>
        {group.alerted ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Alerted</span> : null}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{first.location_name}</span>
        <span className="text-slate-500 dark:text-slate-400">
          · {fmtTime(first.event_time)}{multi ? ` · ${group.events.length} cameras` : ` · ${first.camera}`}
        </span>
      </div>

      {group.events.map((ev) => <CameraView key={ev.id} ev={ev} showHeader={multi} />)}

      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
        {group.label ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-700 dark:text-slate-200">
              Labeled <b>{LABEL_TEXT[group.label]}</b>{group.labeled?.label_note ? ` (${group.labeled.label_note})` : ""}
              {group.labeled?.labeled_by_name ? ` by ${group.labeled.labeled_by_name}` : ""}{group.labeled?.labeled_at ? ` · ${fmtTime(group.labeled.labeled_at)}` : ""}
            </span>
            <button disabled={busy} onClick={async () => { setBusy(true); await onLabel(group, null, ""); setBusy(false); }}
                    className="text-blue-600 dark:text-blue-300 hover:underline disabled:opacity-50">Change</button>
          </div>
        ) : pending ? (
          <div>
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Marking <b>{LABEL_TEXT[pending]}</b>. Why?</span>
              <button onClick={() => setPending(null)} className="text-slate-500 hover:underline">Back</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {REASONS[pending].map((r) => (
                <button key={r} disabled={busy} onClick={() => save(r)}
                        className="px-3 py-2 rounded-full text-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50">{r}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else? (optional)"
                     className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
              <button disabled={busy} onClick={() => save("")} className="px-3 py-2 rounded-lg text-sm bg-blue-600 text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {LABEL_BUTTONS.map((b) => (
              <button key={b.value} disabled={busy} onClick={() => setPending(b.value)}
                      className={`py-3 rounded-lg font-semibold ${b.cls} disabled:opacity-50`}>{b.label}</button>
            ))}
          </div>
        )}
        {multi && !group.label && <p className="mt-2 text-xs text-slate-400">Your label applies to all {group.events.length} cameras of this incident.</p>}
        {last !== first && !multi ? null : null}
      </div>
    </div>
  );
}

function CameraView({ ev, showHeader }) {
  const [showVideo, setShowVideo] = useState(false);
  return (
    <div className="border-t border-slate-100 dark:border-slate-700">
      {showHeader && (
        <div className="px-4 pt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {ev.camera} · {fmtClock(ev.event_time)}{ev.rating === "likely" ? " · likely" : ""}
        </div>
      )}
      <p className="px-4 py-2 text-slate-800 dark:text-slate-200">{ev.reason || <span className="text-slate-400">No description.</span>}</p>
      {showVideo && ev.clip_url ? (
        <video controls autoPlay playsInline preload="metadata" src={ev.clip_url} className="w-full bg-black max-h-[60vh]" />
      ) : ev.strip_url ? (
        <button onClick={() => ev.clip_url && setShowVideo(true)} className="block w-full relative" aria-label="Play clip">
          {/* Served through our authenticated media route; next/image can't proxy a private blob. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ev.strip_url} alt="6 frames around the flagged moment" className="w-full" loading="lazy" />
          {ev.clip_url && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="bg-black/60 text-white rounded-full px-4 py-2 text-sm font-medium">▶ Play 20 s clip</span>
            </span>
          )}
        </button>
      ) : ev.clip_url ? (
        <button onClick={() => setShowVideo(true)} className="w-full py-6 text-sm text-blue-600 dark:text-blue-300">▶ Play 20 s clip</button>
      ) : (
        <div className="px-4 pb-3 text-xs text-slate-400">No video saved for this clip.</div>
      )}
    </div>
  );
}
