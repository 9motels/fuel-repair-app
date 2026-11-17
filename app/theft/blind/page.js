"use client";

import { useState, useEffect, useCallback } from "react";
import { usePerson } from "@/lib/personContext";

// Blind review: a fixed set of clips marked from the video alone. No AI rating, reason or label is shown or even
// loaded here; the store Mac scores the marks against each model once the set is done. /theft/blind?set=<id>

const CHOICES = [
  { value: "worth", label: "Worth my time", cls: "bg-red-600 hover:bg-red-700 text-white" },
  { value: "ordinary", label: "Ordinary", cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { value: "cant_tell", label: "Can't tell", cls: "bg-slate-500 hover:bg-slate-600 text-white" },
];
const TEXT = { worth: "Worth my time", ordinary: "Ordinary", cant_tell: "Can't tell" };

function fmtTime(s) {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? s : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function BlindReviewPage() {
  const { currentPerson } = usePerson();
  const [set, setSet] = useState(null);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setSet(new URLSearchParams(window.location.search).get("set") || "blind30");
  }, []);

  const load = useCallback(async () => {
    if (!set) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/theft/blind?set=${encodeURIComponent(set)}`);
      if (!res.ok) throw new Error("Could not load the test.");
      setClips(await res.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [set]);
  useEffect(() => { load(); }, [load]);

  async function mark(c, answer) {
    const res = await fetch("/api/theft/blind", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set, event_id: c.event_id, answer, person_id: currentPerson?.id || null }),
    });
    if (!res.ok) { setError("Could not save."); return; }
    setClips((list) => list.map((x) => (x.event_id === c.event_id ? { ...x, answer } : x)));
  }

  const done = clips.filter((c) => c.answer).length;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Blind review</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
        Watch each clip and mark it. No AI answers are shown here. {done} of {clips.length} marked.
      </p>
      {error && <div className="mb-4 text-sm rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-3 py-2">{error}</div>}
      {loading ? (
        <div className="text-slate-400 py-16 text-center">Loading...</div>
      ) : (
        <div className="space-y-4">
          {clips.map((c) => <BlindCard key={c.event_id} c={c} onMark={mark} />)}
          {clips.length > 0 && done === clips.length && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-4 py-3 text-sm">
              All {clips.length} marked. Tell Claude you&apos;re done and it will compare your marks with the AI.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlindCard({ c, onMark }) {
  const [play, setPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  async function choose(v) { setBusy(true); try { await onMark(c, v); } finally { setBusy(false); } }
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-2 text-sm flex items-center gap-2">
        <span className="font-semibold text-slate-900 dark:text-slate-100">#{c.position}</span>
        <span className="text-slate-500 dark:text-slate-400">{c.camera} · {fmtTime(c.event_time)}</span>
      </div>
      {c.clip_url ? (
        play ? <video controls autoPlay playsInline preload="metadata" src={c.clip_url} className="w-full bg-black max-h-[60vh]" />
             : <button onClick={() => setPlay(true)} className="w-full py-10 bg-black text-white text-sm font-medium">▶ Play clip</button>
      ) : <div className="px-4 py-3 text-xs text-slate-400">No video for this clip.</div>}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
        {c.answer ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-200">Marked <b>{TEXT[c.answer]}</b></span>
            <button disabled={busy} onClick={() => choose(null)} className="text-blue-600 dark:text-blue-300 hover:underline">Change</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {CHOICES.map((b) => (
              <button key={b.value} disabled={busy} onClick={() => choose(b.value)} className={`py-3 rounded-lg font-semibold text-sm ${b.cls} disabled:opacity-50`}>{b.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
