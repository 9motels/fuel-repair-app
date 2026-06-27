"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import PhotoButtons from "@/lib/PhotoButtons";
import { uploadFile } from "@/lib/equipmentUtils";
import { reminderStatus, reminderDueLabel, intervalLabel } from "@/lib/vehicleReminders";

const WORK_TYPES = ["Repair", "Routine", "Inspection", "Replacement", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLE = {
  overdue: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
  soon: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  ok: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300",
  none: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400",
};

export default function EquipmentDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [eq, setEq] = useState(null);
  const [repairs, setRepairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // add-log form
  const [log, setLog] = useState({ work_type: "", notes: "", performed_at: today() });
  const [logFiles, setLogFiles] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState("");

  // reminders
  const [reminders, setReminders] = useState([]);
  const [plan, setPlan] = useState(null); // { intervals:[{...,_sel}], summary }
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [showAddRem, setShowAddRem] = useState(false);
  const [remForm, setRemForm] = useState({ label: "", interval_months: "", notes: "" });

  async function load() {
    const [res, repairsRes, remRes] = await Promise.all([
      fetch(`/api/equipment/${id}`),
      fetch(`/api/repairs?equipment_id=${id}`),
      fetch(`/api/equipment/${id}/reminders`),
    ]);
    const data = await res.json();
    const repairsData = repairsRes.ok ? await repairsRes.json() : [];
    if (!res.ok) setError(data.error || "Not found");
    else setEq(data);
    setRepairs(Array.isArray(repairsData) ? repairsData : []);
    setReminders(remRes.ok ? await remRes.json() : []);
    setLoading(false);
  }

  async function suggestPlan() {
    setPlanError("");
    setPlanBusy(true);
    try {
      const res = await fetch(`/api/equipment/${id}/maintenance-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build a plan.");
      const intervals = (Array.isArray(data.intervals) ? data.intervals : []).map((it) => ({ ...it, _sel: true }));
      setPlan({ intervals, summary: data.summary || "" });
      if (intervals.length === 0) setPlanError("No suggestions came back — add reminders manually below.");
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanBusy(false);
    }
  }

  function toggleSuggestion(i) {
    setPlan((p) => ({ ...p, intervals: p.intervals.map((it, idx) => (idx === i ? { ...it, _sel: !it._sel } : it)) }));
  }

  async function addSelectedSuggestions() {
    const selected = (plan?.intervals || []).filter((it) => it._sel);
    if (selected.length === 0) return;
    setSavingPlan(true);
    try {
      await fetch(`/api/equipment/${id}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: selected.map((s) => ({ label: s.label, interval_months: s.interval_months, notes: s.notes || "" })),
        }),
      });
      setPlan(null);
      await load();
    } finally {
      setSavingPlan(false);
    }
  }

  async function addManualReminder(e) {
    e.preventDefault();
    if (!remForm.label.trim()) return;
    await fetch(`/api/equipment/${id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: remForm.label.trim(), interval_months: remForm.interval_months, notes: remForm.notes.trim() }),
    });
    setRemForm({ label: "", interval_months: "", notes: "" });
    setShowAddRem(false);
    await load();
  }

  async function markReminderDone(rid) {
    await fetch(`/api/equipment-reminders/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_done_date: today() }),
    });
    await load();
  }

  async function deleteReminder(rid) {
    if (!confirm("Remove this reminder?")) return;
    await fetch(`/api/equipment-reminders/${rid}`, { method: "DELETE" });
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleStatus() {
    setUpdating(true);
    const next = eq.status === "retired" ? "active" : "retired";
    await fetch(`/api/equipment/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
    setUpdating(false);
  }

  async function addLog(e) {
    e.preventDefault();
    setLogError("");
    if (!log.notes.trim()) return setLogError("Describe the work done.");
    setSavingLog(true);
    try {
      const photo_urls = [];
      for (const file of logFiles) photo_urls.push(await uploadFile(file));
      const res = await fetch(`/api/equipment/${id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performed_at: log.performed_at || today(),
          work_type: log.work_type,
          notes: log.notes.trim(),
          photo_urls,
          performed_by_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the log entry.");
      setLog({ work_type: "", notes: "", performed_at: today() });
      setLogFiles([]);
      await load();
    } catch (err) {
      setLogError(err.message);
    } finally {
      setSavingLog(false);
    }
  }

  if (loading) return <div className="text-slate-500 dark:text-slate-400">Loading…</div>;
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!eq) return <div className="text-slate-500 dark:text-slate-400">Not found.</div>;

  const title = eq.name || [eq.make, eq.model].filter(Boolean).join(" ") || "Equipment";
  const photos = Array.isArray(eq.photo_urls) ? eq.photo_urls : [];
  const logs = eq.logs || [];

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/equipment" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to Equipment
      </Link>

      {/* Header / info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {title}
              {eq.status === "retired" && (
                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                  Retired
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{eq.location_name}</p>
          </div>
          <button
            onClick={toggleStatus}
            disabled={updating}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0 disabled:opacity-60"
          >
            {eq.status === "retired" ? "Reactivate" : "Retire"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {eq.category && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Category:</span> {eq.category}
            </div>
          )}
          {eq.make && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Make:</span> {eq.make}
            </div>
          )}
          {eq.model && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Model:</span> {eq.model}
            </div>
          )}
          {eq.serial && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Serial:</span> {eq.serial}
            </div>
          )}
        </div>
        {eq.description && <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 whitespace-pre-wrap">{eq.description}</p>}

        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Service reminders */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Service reminders</h2>
          <button
            onClick={suggestPlan}
            disabled={planBusy}
            className="text-sm border border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 shrink-0"
          >
            {planBusy ? "Looking it up…" : "✨ Look up schedule"}
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          AI looks up the typical service schedule for this make/model. Suggestions are estimates —
          confirm against the unit&apos;s manual.
        </p>

        {planError && <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-3">{planError}</div>}

        {plan && plan.intervals.length > 0 && (
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/30 rounded-lg p-4 mb-4">
            <ul className="space-y-2">
              {plan.intervals.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input type="checkbox" checked={s._sel} onChange={() => toggleSuggestion(i)} className="mt-1" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {s.label}{" "}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{intervalLabel({ interval_months: s.interval_months })}</span>
                    </div>
                    {s.notes && <div className="text-xs text-slate-600 dark:text-slate-300">{s.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {plan.summary && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{plan.summary}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={addSelectedSuggestions}
                disabled={savingPlan || !plan.intervals.some((it) => it._sel)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPlan ? "Adding…" : `Add ${plan.intervals.filter((it) => it._sel).length} selected`}
              </button>
              <button onClick={() => setPlan(null)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
                Discard
              </button>
            </div>
          </div>
        )}

        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No reminders yet. Use “✨ Look up schedule” or add one below.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => {
              const s = reminderStatus(r, 0);
              return (
                <li key={r.id} className={`border rounded-lg p-3 ${STATUS_STYLE[s.level] || STATUS_STYLE.none}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{intervalLabel(r)}</div>
                      {r.notes && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{r.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold">
                        {s.level === "overdue" ? "Overdue" : s.level === "soon" ? "Due soon" : s.level === "none" ? "—" : "OK"}
                      </div>
                      <div className="text-xs">{reminderDueLabel(s)}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => markReminderDone(r.id)} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">
                      Mark done today
                    </button>
                    <button onClick={() => deleteReminder(r.id)} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showAddRem ? (
          <form onSubmit={addManualReminder} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mt-4">
            <input
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Label (e.g. Replace fuel filter)"
              value={remForm.label}
              onChange={(e) => setRemForm({ ...remForm, label: e.target.value })}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="number" min="0" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Every … months" value={remForm.interval_months} onChange={(e) => setRemForm({ ...remForm, interval_months: e.target.value })} />
              <input className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Notes (part, spec…)" value={remForm.notes} onChange={(e) => setRemForm({ ...remForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add reminder</button>
              <button type="button" onClick={() => setShowAddRem(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAddRem(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-4">
            + Add a reminder
          </button>
        )}
      </div>

      {/* Troubleshoot — opens the full-screen chat with saved history */}
      <Link
        href={`/equipment/${id}/troubleshoot`}
        className="block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Troubleshoot with AI →</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Full-screen chat that knows this machine and its history. Conversations are saved so you
              can look back at past diagnoses.
            </p>
          </div>
          <span className="text-2xl shrink-0">💬</span>
        </div>
      </Link>

      {/* Maintenance log */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Maintenance log</h2>

        <form onSubmit={addLog} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={log.performed_at}
                onChange={(e) => setLog({ ...log, performed_at: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <select
                value={log.work_type}
                onChange={(e) => setLog({ ...log, work_type: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            rows={2}
            placeholder="What work was done?"
            value={log.notes}
            onChange={(e) => setLog({ ...log, notes: e.target.value })}
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <PhotoButtons onFiles={(f) => setLogFiles((prev) => [...prev, ...f])} />
          {logFiles.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {logFiles.length} photo{logFiles.length === 1 ? "" : "s"} attached
            </p>
          )}
          {logError && <div className="text-sm text-red-600 dark:text-red-400">{logError}</div>}
          <button
            type="submit"
            disabled={savingLog}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? "Saving…" : "Add log entry"}
          </button>
        </form>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No work logged yet.</p>
        ) : (
          <ul className="space-y-4">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {l.performed_at}
                  {l.work_type ? ` · ${l.work_type}` : ""}
                  {l.performed_by_name ? ` · ${l.performed_by_name}` : ""}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{l.notes}</p>
                {Array.isArray(l.photo_urls) && l.photo_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {l.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Log photo ${i + 1}`} className="w-full h-20 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Repairs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Repairs</h2>
        {repairs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No repairs logged for this machine.</p>
        ) : (
          <ul className="space-y-4">
            {repairs.map((r) => (
              <li key={r.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.description || "Repair"}</div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${Number(r.total_cost || 0).toFixed(2)}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.repair_date}</div>
                {Array.isArray(r.items) && r.items.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.items.map((it, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                        {it.item_name} x{it.quantity}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
