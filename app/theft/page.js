"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePerson } from "@/lib/personContext";

// Theft Review: flagged camera clips from each store's AI, newest first. Each
// card shows Claude's one-line reason, the 6-frame strip, the 20 s clip on tap,
// and three big label buttons. Labels go back to the store Mac as training data.
// Push notifications deep-link here with ?e=<event id>.

const LABEL_BUTTONS = [
  { value: "theft", label: "Theft", cls: "bg-red-600 hover:bg-red-700 text-white" },
  { value: "not", label: "Not theft", cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { value: "unsure", label: "Unsure", cls: "bg-slate-500 hover:bg-slate-600 text-white" },
];
const LABEL_TEXT = { theft: "Theft", not: "Not theft", unsure: "Unsure" };

function fmtTime(s) {
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TheftReviewPage() {
  const { currentPerson } = usePerson();
  const [events, setEvents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [status, setStatus] = useState("unlabeled"); // unlabeled | labeled | all
  const [locationId, setLocationId] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  // ?e=<id> from a push notification: show that clip at the top whatever the filters say.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const e = new URLSearchParams(window.location.search).get("e");
    if (e) setFocusId(e);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ status, limit: "60" });
      if (locationId) qs.set("location_id", locationId);
      if (alertsOnly) qs.set("alerted", "1");
      const [evRes, locRes] = await Promise.all([fetch(`/api/theft/events?${qs}`), fetch("/api/locations")]);
      if (!evRes.ok) throw new Error("Could not load clips.");
      setEvents(await evRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (focusId) {
        const one = await fetch(`/api/theft/events?id=${encodeURIComponent(focusId)}`).then((r) => (r.ok ? r.json() : []));
        setFocusEvent(one[0] || null);
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [status, locationId, alertsOnly, focusId]);

  useEffect(() => { load(); }, [load]);

  async function setLabel(ev, label) {
    const res = await fetch(`/api/theft/events/${encodeURIComponent(ev.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, labeled_by_id: currentPerson?.id || null }),
    });
    if (!res.ok) { setError("Could not save the label."); return; }
    const patch = (x) => (x.id === ev.id ? { ...x, label, labeled_by_name: label ? currentPerson?.name || null : null, labeled_at: label ? new Date().toISOString() : null } : x);
    setEvents((list) => (status === "unlabeled" && label ? list.filter((x) => x.id !== ev.id) : list.map(patch)));
    setFocusEvent((f) => (f && f.id === ev.id ? patch(f) : f));
  }

  const list = focusEvent ? [focusEvent, ...events.filter((x) => x.id !== focusEvent.id)] : events;

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
      ) : list.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400 py-16 text-center">
          {status === "unlabeled" ? "Nothing waiting for review." : "No clips match."}
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((ev) => <EventCard key={ev.id} ev={ev} highlight={ev.id === focusId} onLabel={setLabel} />)}
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, highlight, onLabel }) {
  const [showVideo, setShowVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (highlight && ref.current) ref.current.scrollIntoView({ block: "start" }); }, [highlight]);

  async function choose(label) {
    setBusy(true);
    try { await onLabel(ev, label); } finally { setBusy(false); }
  }

  const ratingCls = ev.rating === "likely" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    : ev.rating === "possible" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

  return (
    <div ref={ref} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border ${highlight ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" : "border-slate-200 dark:border-slate-700"} overflow-hidden`}>
      <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ratingCls}`}>
          {ev.rating === "likely" ? "Likely theft" : ev.rating === "possible" ? "Possible" : "Low"}
        </span>
        {ev.alerted ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Alerted</span> : null}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{ev.location_name}</span>
        <span className="text-slate-500 dark:text-slate-400">· {ev.camera} · {fmtTime(ev.event_time)}</span>
      </div>
      <p className="px-4 pb-3 text-slate-800 dark:text-slate-200">{ev.reason || <span className="text-slate-400">No description.</span>}</p>

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
        <div className="px-4 py-3 text-xs text-slate-400">Media no longer stored (older clips are pruned; the store NVR keeps the footage).</div>
      )}

      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
        {ev.label ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-700 dark:text-slate-200">
              Labeled <b>{LABEL_TEXT[ev.label] || ev.label}</b>{ev.labeled_by_name ? ` by ${ev.labeled_by_name}` : ""}{ev.labeled_at ? ` · ${fmtTime(ev.labeled_at)}` : ""}
            </span>
            <button disabled={busy} onClick={() => choose(null)} className="text-blue-600 dark:text-blue-300 hover:underline disabled:opacity-50">Change</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {LABEL_BUTTONS.map((b) => (
              <button key={b.value} disabled={busy} onClick={() => choose(b.value)}
                      className={`py-3 rounded-lg font-semibold ${b.cls} disabled:opacity-50`}>{b.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
