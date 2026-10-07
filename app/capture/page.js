"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import { JOB_STATUSES, JOB_PRIORITIES, STATUS_LABEL, PRIORITY_LABEL } from "@/lib/jobsAi";

const QUEUE_KEY = "fuelapp_capture_queue_v1";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage may be unavailable (private mode) — the server copy still syncs */
  }
}
function newKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

const fieldClass =
  "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function CapturePage() {
  const { currentPerson } = usePerson();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);

  // Merged view: server captures + any device-only queued items (deduped by client_key).
  const [serverCaptures, setServerCaptures] = useState([]);
  const [queue, setQueue] = useState([]); // device queue (source of truth for sync state)

  const [locations, setLocations] = useState([]);
  const [equipment, setEquipment] = useState([]);

  // draft editor
  const [draftFor, setDraftFor] = useState(null); // capture id being structured
  const [draft, setDraft] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState("");

  const refreshServer = useCallback(() => {
    fetch("/api/captures")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setServerCaptures(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Push any unsynced queued items to the server. Idempotent on client_key, so a
  // double-flush never duplicates. Leaves items queued on network failure.
  const flushQueue = useCallback(async () => {
    let q = readQueue();
    const pending = q.filter((it) => !it.synced);
    if (pending.length === 0) return;
    for (const it of pending) {
      try {
        const res = await fetch("/api/captures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_key: it.client_key, raw_text: it.raw_text, person_id: it.person_id }),
        });
        if (res.ok) {
          const saved = await res.json();
          q = readQueue().map((x) => (x.client_key === it.client_key ? { ...x, synced: true, server_id: saved.id } : x));
          writeQueue(q);
          setQueue(q);
        }
      } catch {
        /* still offline — try again on the next flush */
        break;
      }
    }
    refreshServer();
  }, [refreshServer]);

  useEffect(() => {
    setQueue(readQueue());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    refreshServer();
    fetch("/api/locations").then((r) => r.json()).then((d) => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])).then((d) => setEquipment(Array.isArray(d) ? d : [])).catch(() => {});
    flushQueue();
    const onOnline = () => { setOnline(true); flushQueue(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCapture() {
    const raw = text.trim();
    if (!raw || saving) return;
    setSaving(true);
    const item = {
      client_key: newKey(),
      raw_text: raw,
      person_id: currentPerson?.id || null,
      created_at: new Date().toISOString(),
      synced: false,
      server_id: null,
    };
    // Optimistically queue on the device FIRST, so the note survives even if the
    // request (or the whole app) dies right here.
    const q = [item, ...readQueue()];
    writeQueue(q);
    setQueue(q);
    setText("");
    setFlash("Saved. " + (online ? "Syncing…" : "Held on this phone — will sync when online."));
    try {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_key: item.client_key, raw_text: raw, person_id: item.person_id }),
      });
      if (res.ok) {
        const saved = await res.json();
        const q2 = readQueue().map((x) => (x.client_key === item.client_key ? { ...x, synced: true, server_id: saved.id } : x));
        writeQueue(q2);
        setQueue(q2);
        setFlash("Saved & synced.");
        refreshServer();
      }
    } catch {
      setFlash("Saved on this phone — will sync when you’re back online.");
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(""), 4000);
    }
  }

  async function structure(captureId) {
    setDraftFor(captureId);
    setDraft(null);
    setDraftError("");
    setDraftBusy(true);
    try {
      const res = await fetch(`/api/captures/${captureId}/structure`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not structure this note.");
      const d = data.draft;
      setDraft({
        job_id: "",
        title: d.title || "",
        location_id: d.location_id || "",
        equipment_id: d.equipment_id || "",
        equipment_ambiguous: !!d.equipment_ambiguous,
        equipment_guess: d.equipment_guess || "",
        location_guess: d.location_guess || "",
        problem: d.problem || "",
        work_performed: d.work_performed || "",
        minutes: d.minutes ?? "",
        minutes_estimated: !!d.minutes_estimated,
        cost: d.cost ?? "",
        cost_unknown: d.cost === null || d.cost === undefined,
        cost_note: d.cost_note || "",
        status: JOB_STATUSES.includes(d.status) ? d.status : "new",
        priority: JOB_PRIORITIES.includes(d.priority) ? d.priority : "normal",
        next_action: d.next_action || "",
      });
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setDraftBusy(false);
    }
  }

  // Let the user fill a draft by hand if AI is unavailable — original text is kept.
  function manualDraft(captureId) {
    setDraftFor(captureId);
    setDraftError("");
    setDraft({
      job_id: "", title: "", location_id: "", equipment_id: "", equipment_ambiguous: false,
      equipment_guess: "", location_guess: "", problem: "", work_performed: "",
      minutes: "", minutes_estimated: false, cost: "", cost_unknown: true, cost_note: "",
      status: "new", priority: "normal", next_action: "",
    });
  }

  async function confirmDraft(captureId) {
    if (!draft.title.trim()) {
      setDraftError("Give the job a title.");
      return;
    }
    setConfirming(true);
    setDraftError("");
    try {
      const res = await fetch(`/api/captures/${captureId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: draft.job_id || null,
          title: draft.title.trim(),
          location_id: draft.location_id || null,
          equipment_id: draft.equipment_id || null,
          problem: draft.problem.trim(),
          next_action: draft.next_action.trim(),
          priority: draft.priority,
          status: draft.status,
          work_performed: draft.work_performed.trim(),
          minutes: draft.minutes === "" ? null : draft.minutes,
          minutes_estimated: draft.minutes_estimated,
          cost: draft.cost_unknown ? null : draft.cost === "" ? null : draft.cost,
          cost_note: draft.cost_note.trim(),
          person_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the job.");
      setDraftFor(null);
      setDraft(null);
      setFlash("Logged to a job ✓");
      refreshServer();
      setTimeout(() => setFlash(""), 4000);
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  // Merge server + device-queued, deduped by client_key, newest first.
  const byKey = new Map();
  for (const c of serverCaptures) byKey.set(c.client_key, { ...c, _local: queue.find((q) => q.client_key === c.client_key) });
  for (const q of queue) if (!byKey.has(q.client_key)) byKey.set(q.client_key, { ...q, id: null, status: "saved", _localOnly: true });
  const rows = Array.from(byKey.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const unsynced = queue.filter((q) => !q.synced).length;

  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quick capture</h1>
        <Link href="/jobs" className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0">
          Open jobs →
        </Link>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Say what you did in plain words (tap the mic on your keyboard to dictate). It saves instantly —
        AI turns it into a job entry after.
      </p>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. Sinclair back cooler. Cleaned condenser, cooling again. About 45 minutes, no parts. Check tomorrow."
          className={`${fieldClass} text-base`}
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className={`text-xs ${online ? "text-slate-400 dark:text-slate-500" : "text-amber-600 dark:text-amber-400"}`}>
            {online ? "Online" : "Offline — notes are held on this phone"}
            {unsynced > 0 && ` · ${unsynced} waiting to sync`}
          </span>
          <button
            onClick={saveCapture}
            disabled={saving || !text.trim()}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
        {flash && <p className="text-xs text-green-700 dark:text-green-400 mt-2">{flash}</p>}
      </div>

      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Recent notes</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing captured yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const local = c._local || (c._localOnly ? c : null);
            const synced = c._localOnly ? false : true;
            const structured = c.status === "structured";
            return (
              <li key={c.client_key} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap min-w-0">{c.raw_text}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      structured
                        ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                        : !synced || (local && !local.synced)
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {structured ? "Logged" : !synced || (local && !local.synced) ? "On this phone" : "Synced"}
                  </span>
                </div>

                {structured ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    → <Link href="/jobs" className="text-blue-600 dark:text-blue-400 hover:underline">{c.job_title || "job"}</Link>
                    {c.job_status ? ` · ${STATUS_LABEL[c.job_status] || c.job_status}` : ""}
                  </p>
                ) : c.id ? (
                  <div className="mt-2 flex gap-3">
                    <button onClick={() => structure(c.id)} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">
                      ✨ Structure into a job
                    </button>
                    <button onClick={() => manualDraft(c.id)} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">
                      Fill by hand
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Waiting to sync before it can be structured.</p>
                )}

                {/* Draft editor */}
                {draftFor === c.id && (
                  <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    {draftBusy ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Reading your note…</p>
                    ) : draftError && !draft ? (
                      <div className="text-sm text-red-600 dark:text-red-400">
                        {draftError}{" "}
                        <button onClick={() => manualDraft(c.id)} className="underline">Fill by hand</button>
                      </div>
                    ) : draft ? (
                      <div className="space-y-3">
                        {draft.equipment_ambiguous && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-2">
                            Equipment unclear{draft.equipment_guess ? ` ("${draft.equipment_guess}")` : ""} — pick the right one below.
                          </p>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Job title</label>
                          <input className={fieldClass} value={draft.title} onChange={(e) => setD({ title: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Station</label>
                            <select className={fieldClass} value={draft.location_id} onChange={(e) => setD({ location_id: e.target.value })}>
                              <option value="">{draft.location_guess ? `? ${draft.location_guess}` : "Select…"}</option>
                              {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Equipment (optional)</label>
                            <select className={fieldClass} value={draft.equipment_id} onChange={(e) => setD({ equipment_id: e.target.value })}>
                              <option value="">{draft.equipment_guess ? `? ${draft.equipment_guess}` : "None / later"}</option>
                              {equipment.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {(e.name || [e.make, e.model].filter(Boolean).join(" ") || "equipment")}
                                  {e.location_name ? ` — ${e.location_name}` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Work performed</label>
                          <textarea rows={2} className={fieldClass} value={draft.work_performed} onChange={(e) => setD({ work_performed: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Status</label>
                            <select className={fieldClass} value={draft.status} onChange={(e) => setD({ status: e.target.value })}>
                              {JOB_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
                            <select className={fieldClass} value={draft.priority} onChange={(e) => setD({ priority: e.target.value })}>
                              {JOB_PRIORITIES.map((p) => (<option key={p} value={p}>{PRIORITY_LABEL[p]}</option>))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                              Time (min){draft.minutes_estimated && draft.minutes !== "" ? " · est." : ""}
                            </label>
                            <input type="number" min="0" className={fieldClass} value={draft.minutes} placeholder="unknown"
                              onChange={(e) => setD({ minutes: e.target.value })} />
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                              <input type="checkbox" checked={draft.minutes_estimated} onChange={(e) => setD({ minutes_estimated: e.target.checked })} />
                              estimated
                            </label>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Cash cost ($)</label>
                            <input type="number" min="0" step="0.01" className={fieldClass} value={draft.cost} placeholder="unknown"
                              disabled={draft.cost_unknown}
                              onChange={(e) => setD({ cost: e.target.value })} />
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                              <input type="checkbox" checked={draft.cost_unknown} onChange={(e) => setD({ cost_unknown: e.target.checked })} />
                              unknown
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Next action / follow-up</label>
                          <input className={fieldClass} value={draft.next_action} onChange={(e) => setD({ next_action: e.target.value })} />
                        </div>
                        {draftError && <p className="text-sm text-red-600 dark:text-red-400">{draftError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => confirmDraft(c.id)} disabled={confirming} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                            {confirming ? "Saving…" : "Create job"}
                          </button>
                          <button onClick={() => { setDraftFor(null); setDraft(null); }} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
