"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import PhotoButtons from "@/lib/PhotoButtons";
import { uploadFile } from "@/lib/equipmentUtils";
import { reminderStatus, reminderDueLabel, intervalLabel } from "@/lib/vehicleReminders";

const SERVICE_TYPES = ["Oil change", "Tire", "Brakes", "Inspection", "Repair", "Fluids", "Battery", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLE = {
  overdue: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
  soon: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  ok: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300",
  none: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400",
};

function suggestionNotes(s) {
  return [s.fluid && `Fluid: ${s.fluid}`, s.capacity && `Capacity: ${s.capacity}`, s.notes]
    .filter(Boolean)
    .join(" · ");
}

export default function VehicleDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [v, setV] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // rename
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // service log form
  const [log, setLog] = useState({ service_type: "", notes: "", performed_at: today(), odometer: "", cost: "" });
  const [logFiles, setLogFiles] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState("");

  // reminders
  const [plan, setPlan] = useState(null); // { intervals:[{...,_sel}], summary, decoded }
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [showAddRem, setShowAddRem] = useState(false);
  const [remForm, setRemForm] = useState({ label: "", interval_miles: "", interval_months: "", notes: "" });

  // troubleshoot chat
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function load() {
    const [res, remRes] = await Promise.all([
      fetch(`/api/vehicles/${id}`),
      fetch(`/api/vehicles/${id}/reminders`),
    ]);
    const data = await res.json();
    if (!res.ok) setError(data.error || "Not found");
    else setV(data);
    setReminders(remRes.ok ? await remRes.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-pull the suggested schedule when arriving from "Add vehicle" (?suggest=1).
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("suggest")) {
      Promise.resolve().then(() => suggestPlan());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStatus() {
    setUpdating(true);
    const next = v.status === "retired" ? "active" : "retired";
    await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
    setUpdating(false);
  }

  function startRename() {
    setNameInput(v.name || "");
    setRenaming(true);
  }

  async function saveName() {
    setSavingName(true);
    try {
      await fetch(`/api/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setRenaming(false);
      await load();
    } finally {
      setSavingName(false);
    }
  }

  async function addLog(e) {
    e.preventDefault();
    setLogError("");
    if (!log.notes.trim()) return setLogError("Describe the work done.");
    setSavingLog(true);
    try {
      const photo_urls = [];
      for (const file of logFiles) photo_urls.push(await uploadFile(file));
      const res = await fetch(`/api/vehicles/${id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performed_at: log.performed_at || today(),
          service_type: log.service_type,
          odometer: log.odometer,
          cost: log.cost,
          notes: log.notes.trim(),
          photo_urls,
          performed_by_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the service entry.");
      setLog({ service_type: "", notes: "", performed_at: today(), odometer: "", cost: "" });
      setLogFiles([]);
      await load();
    } catch (err) {
      setLogError(err.message);
    } finally {
      setSavingLog(false);
    }
  }

  // --- reminders ---
  async function suggestPlan() {
    setPlanError("");
    setPlanBusy(true);
    try {
      const res = await fetch(`/api/vehicles/${id}/maintenance-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build a plan.");
      const intervals = (Array.isArray(data.intervals) ? data.intervals : []).map((it) => ({ ...it, _sel: true }));
      setPlan({ intervals, summary: data.summary || "", decoded: data.decoded || null });
      if (intervals.length === 0) setPlanError("No suggestions came back — add reminders manually below.");
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanBusy(false);
    }
  }

  function toggleSuggestion(i) {
    setPlan((p) => ({
      ...p,
      intervals: p.intervals.map((it, idx) => (idx === i ? { ...it, _sel: !it._sel } : it)),
    }));
  }

  function updateSuggestion(i, patch) {
    setPlan((p) => ({ ...p, intervals: p.intervals.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  }

  async function addSelectedSuggestions() {
    const selected = (plan?.intervals || []).filter((it) => it._sel);
    if (selected.length === 0) return;
    setSavingPlan(true);
    try {
      await fetch(`/api/vehicles/${id}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: selected.map((s) => ({
            label: s.label,
            interval_miles: s.interval_miles,
            interval_months: s.interval_months,
            notes: suggestionNotes(s),
          })),
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
    await fetch(`/api/vehicles/${id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: remForm.label.trim(),
        interval_miles: remForm.interval_miles,
        interval_months: remForm.interval_months,
        notes: remForm.notes.trim(),
      }),
    });
    setRemForm({ label: "", interval_miles: "", interval_months: "", notes: "" });
    setShowAddRem(false);
    await load();
  }

  async function markReminderDone(rid) {
    await fetch(`/api/vehicle-reminders/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_done_date: today(), last_done_odometer: Number(v.odometer) || 0 }),
    });
    await load();
  }

  async function deleteReminder(rid) {
    if (!confirm("Remove this reminder?")) return;
    await fetch(`/api/vehicle-reminders/${rid}`, { method: "DELETE" });
    await load();
  }

  async function sendChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next = [...chat, { role: "user", content: text }];
    setChat([...next, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/vehicles/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: id, messages: next }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "AI request failed.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setChat((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      setChat((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `[${err.message}]` };
        return copy;
      });
    } finally {
      setChatBusy(false);
    }
  }

  if (loading) return <div className="text-slate-500 dark:text-slate-400">Loading…</div>;
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!v) return <div className="text-slate-500 dark:text-slate-400">Not found.</div>;

  const title = v.name || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
  const photos = Array.isArray(v.photo_urls) ? v.photo_urls : [];
  const logs = v.logs || [];

  const fieldClass = "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/vehicles" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to Vehicles
      </Link>

      {/* Header / info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  placeholder={[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle name"}
                  className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingName ? "Saving…" : "Save name"}
                  </button>
                  <button onClick={() => setRenaming(false)} className="text-sm text-slate-500 dark:text-slate-400 hover:underline">
                    Cancel
                  </button>
                  <span className="text-xs text-slate-400 dark:text-slate-500">Leave blank to use year/make/model</span>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="min-w-0 truncate">{title}</span>
                  {v.status === "retired" && (
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide shrink-0">
                      Retired
                    </span>
                  )}
                  <button
                    onClick={startRename}
                    title="Rename"
                    className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{v.location_name}</p>
              </>
            )}
          </div>
          {!renaming && (
            <button
              onClick={toggleStatus}
              disabled={updating}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0 disabled:opacity-60"
            >
              {v.status === "retired" ? "Reactivate" : "Retire"}
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {v.vehicle_type && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Type:</span> {v.vehicle_type}
            </div>
          )}
          {(v.year || v.make || v.model) && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Vehicle:</span> {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </div>
          )}
          {v.vin && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">VIN:</span> <span className="font-mono">{v.vin}</span>
            </div>
          )}
          {v.plate && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Plate:</span> {v.plate}
            </div>
          )}
          {v.odometer ? (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Odometer:</span> {Number(v.odometer).toLocaleString()} mi
            </div>
          ) : null}
        </div>
        {v.description && <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 whitespace-pre-wrap">{v.description}</p>}

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
            {planBusy ? "Thinking…" : "✨ Suggest from VIN"}
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Track intervals by miles and/or time. Suggestions (with fluids &amp; capacities) are AI estimates —
          confirm against the owner&apos;s manual.
        </p>

        {planError && <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-3">{planError}</div>}

        {/* AI suggestions review */}
        {plan && plan.intervals.length > 0 && (
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40/40 rounded-lg p-4 mb-4">
            {plan.decoded && (plan.decoded.displacementL || plan.decoded.trim) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                VIN decoded: {[plan.decoded.year, plan.decoded.make, plan.decoded.model, plan.decoded.displacementL && `${plan.decoded.displacementL}L`, plan.decoded.trim].filter(Boolean).join(" · ")}
              </p>
            )}
            <ul className="space-y-2">
              {plan.intervals.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input type="checkbox" checked={s._sel} onChange={() => toggleSuggestion(i)} className="mt-1" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1">
                      <span>{s.label}</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        · every
                        <input type="number" min="0" value={s.interval_miles ?? ""}
                          onChange={(e) => updateSuggestion(i, { interval_miles: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                          className="w-16 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1 py-0.5 text-xs" />
                        mi /
                        <input type="number" min="0" value={s.interval_months ?? ""}
                          onChange={(e) => updateSuggestion(i, { interval_months: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                          className="w-12 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1 py-0.5 text-xs" />
                        mo
                      </span>
                    </div>
                    {suggestionNotes(s) && <div className="text-xs text-slate-600 dark:text-slate-300">{suggestionNotes(s)}</div>}
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
              <button onClick={() => setPlan(null)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Existing reminders */}
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No reminders yet. Use “✨ Suggest from VIN” or add one below.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => {
              const s = reminderStatus(r, v.odometer);
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
                    <button onClick={() => deleteReminder(r.id)} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Manual add */}
        {showAddRem ? (
          <form onSubmit={addManualReminder} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mt-4">
            <input
              className={fieldClass}
              placeholder="Label (e.g. Oil change)"
              value={remForm.label}
              onChange={(e) => setRemForm({ ...remForm, label: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min="0" className={fieldClass} placeholder="Every … miles" value={remForm.interval_miles} onChange={(e) => setRemForm({ ...remForm, interval_miles: e.target.value })} />
              <input type="number" min="0" className={fieldClass} placeholder="Every … months" value={remForm.interval_months} onChange={(e) => setRemForm({ ...remForm, interval_months: e.target.value })} />
            </div>
            <input className={fieldClass} placeholder="Notes (fluid, capacity, part…)" value={remForm.notes} onChange={(e) => setRemForm({ ...remForm, notes: e.target.value })} />
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add reminder</button>
              <button type="button" onClick={() => setShowAddRem(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAddRem(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-4">
            + Add a reminder
          </button>
        )}
      </div>

      {/* Service log */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Service log</h2>

        <form onSubmit={addLog} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date</label>
              <input type="date" value={log.performed_at} onChange={(e) => setLog({ ...log, performed_at: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <select value={log.service_type} onChange={(e) => setLog({ ...log, service_type: e.target.value })} className={fieldClass}>
                <option value="">—</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Odometer (mi)</label>
              <input type="number" min="0" value={log.odometer} onChange={(e) => setLog({ ...log, odometer: e.target.value })} className={fieldClass} placeholder="optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Cost ($)</label>
              <input type="number" min="0" step="0.01" value={log.cost} onChange={(e) => setLog({ ...log, cost: e.target.value })} className={fieldClass} placeholder="optional" />
            </div>
          </div>
          <textarea
            rows={2}
            placeholder="What work was done?"
            value={log.notes}
            onChange={(e) => setLog({ ...log, notes: e.target.value })}
            className={fieldClass}
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
            {savingLog ? "Saving…" : "Add service entry"}
          </button>
        </form>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No service logged yet.</p>
        ) : (
          <ul className="space-y-4">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {l.performed_at}
                    {l.service_type ? ` · ${l.service_type}` : ""}
                    {l.odometer ? ` · ${Number(l.odometer).toLocaleString()} mi` : ""}
                    {l.performed_by_name ? ` · ${l.performed_by_name}` : ""}
                  </div>
                  {l.cost ? <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${Number(l.cost).toFixed(2)}</span> : null}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{l.notes}</p>
                {Array.isArray(l.photo_urls) && l.photo_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {l.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Service photo ${i + 1}`} className="w-full h-20 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Troubleshoot chat */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Troubleshoot with AI 💬</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
          Ask about a symptom, fault code, or part. It knows this vehicle and its service history.
        </p>

        {chat.length > 0 && (
          <div className="space-y-3 mb-3">
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block text-sm whitespace-pre-wrap rounded-2xl px-3 py-2 max-w-[90%] ${
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {m.content || (chatBusy ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={sendChat} className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="e.g. rough idle and a check-engine light"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={chatBusy || !chatInput.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {chatBusy ? "…" : "Ask"}
          </button>
        </form>
      </div>
    </div>
  );
}
