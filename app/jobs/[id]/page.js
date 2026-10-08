"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import { JOB_STATUSES, JOB_PRIORITIES, STATUS_LABEL, PRIORITY_LABEL } from "@/lib/jobsAi";
import { PART_STATUSES, PART_STATUS_LABEL } from "@/lib/partsAi";

const fieldClass =
  "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const KINDS = [
  ["work", "Work"],
  ["troubleshoot", "Troubleshoot"],
  ["remote", "Remote support"],
  ["research", "Research"],
  ["contractor", "Contractor coord."],
];
const KIND_LABEL = Object.fromEntries(KINDS);

function fmtMins(m, est) {
  const n = Number(m) || 0;
  if (n <= 0) return "";
  const h = Math.floor(n / 60);
  const r = n % 60;
  const s = h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  return est ? `~${s}` : s;
}

export default function JobDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingField, setSavingField] = useState(false);

  const [form, setForm] = useState({
    kind: "work", work_performed: "", minutes: "", minutes_estimated: false,
    cost: "", cost_unknown: true, cost_note: "", follow_up: "", status: "",
  });
  const [savingUpdate, setSavingUpdate] = useState(false);

  // edit + repairs
  const [locations, setLocations] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [linkId, setLinkId] = useState("");

  // parts for this job
  const [parts, setParts] = useState([]);
  const [newPart, setNewPart] = useState("");

  async function loadParts() {
    const res = await fetch(`/api/parts?job_id=${id}`);
    setParts(res.ok ? await res.json() : []);
  }

  async function addPart(e) {
    e.preventDefault();
    if (!newPart.trim()) return;
    await fetch("/api/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: newPart.trim(), job_id: Number(id), created_by_id: currentPerson?.id || null }),
    });
    setNewPart("");
    loadParts();
  }

  async function setPartStatus(pid, status) {
    await fetch(`/api/parts/${pid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadParts();
  }

  async function loadCandidates(data) {
    if (!data) return;
    const qs = data.equipment_id ? `?equipment_id=${data.equipment_id}` : data.location_id ? `?location_id=${data.location_id}` : "";
    if (!qs) { setCandidates([]); return; }
    const res = await fetch(`/api/repairs${qs}`);
    const rows = res.ok ? await res.json() : [];
    setCandidates(rows.filter((r) => !r.job_id));
  }

  async function load() {
    const res = await fetch(`/api/jobs/${id}`);
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Not found"); setLoading(false); return; }
    setJob(data);
    setLoading(false);
    loadCandidates(data);
  }

  useEffect(() => {
    load();
    loadParts();
    fetch("/api/locations").then((r) => r.json()).then((d) => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])).then((d) => setEquipment(Array.isArray(d) ? d : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    setEdit({
      title: job.title || "", problem: job.problem || "", next_action: job.next_action || "",
      location_id: job.location_id || "", equipment_id: job.equipment_id || "",
      scheduled_date: job.scheduled_date || "", due_date: job.due_date || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    });
    setEditing(false);
    await load();
  }

  async function linkRepair() {
    if (!linkId) return;
    await fetch(`/api/repairs/${linkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: Number(id) }),
    });
    setLinkId("");
    await load();
  }

  async function unlinkRepair(rid) {
    await fetch(`/api/repairs/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: null }),
    });
    await load();
  }

  async function patch(patchObj) {
    setSavingField(true);
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchObj),
    });
    await load();
    setSavingField(false);
  }

  async function addUpdate(e) {
    e.preventDefault();
    setSavingUpdate(true);
    await fetch(`/api/jobs/${id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: form.kind,
        work_performed: form.work_performed.trim(),
        minutes: form.minutes === "" ? null : form.minutes,
        minutes_estimated: form.minutes_estimated,
        cost: form.cost_unknown ? null : form.cost === "" ? null : form.cost,
        cost_note: form.cost_note.trim(),
        follow_up: form.follow_up.trim(),
        status: form.status || undefined,
        person_id: currentPerson?.id || null,
      }),
    });
    setForm({ kind: "work", work_performed: "", minutes: "", minutes_estimated: false, cost: "", cost_unknown: true, cost_note: "", follow_up: "", status: "" });
    await load();
    setSavingUpdate(false);
  }

  if (loading) return <div className="text-slate-500 dark:text-slate-400">Loading…</div>;
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!job) return <div className="text-slate-500 dark:text-slate-400">Not found.</div>;

  const eqName = job.equipment_name || [job.equipment_make, job.equipment_model].filter(Boolean).join(" ");
  const updates = job.updates || [];
  const totalMin = updates.reduce((s, u) => s + (Number(u.minutes) || 0), 0);
  const totalCash = updates.reduce((s, u) => s + (Number(u.cost) || 0), 0);
  const anyUnknownCost = updates.some((u) => u.cost === null || u.cost === undefined);
  const repairs = job.repairs || [];
  const totalParts = repairs.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/jobs" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← Back to Jobs</Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 min-w-0">{job.title}</h1>
          {!editing && (
            <button onClick={startEdit} className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0">Edit</button>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {[job.location_name, eqName].filter(Boolean).join(" · ") || "No station set"}
          {eqName && job.equipment_id ? (
            <> · <Link href={`/equipment/${job.equipment_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">equipment history</Link></>
          ) : null}
        </p>
        {job.problem && <p className="text-sm text-slate-700 dark:text-slate-300 mt-3">{job.problem}</p>}

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Status</label>
            <select value={job.status} onChange={(e) => patch({ status: e.target.value })} disabled={savingField}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm">
              {JOB_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
            <select value={job.priority} onChange={(e) => patch({ priority: e.target.value })} disabled={savingField}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm">
              {JOB_PRIORITIES.map((p) => (<option key={p} value={p}>{PRIORITY_LABEL[p]}</option>))}
            </select>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 pb-2">
            {fmtMins(totalMin) && <span>{fmtMins(totalMin)} logged</span>}
            {totalCash > 0 && <span>{fmtMins(totalMin) ? " · " : ""}${totalCash.toFixed(2)} cash{anyUnknownCost ? "+" : ""}</span>}
            {totalParts > 0 && <span>{(fmtMins(totalMin) || totalCash > 0) ? " · " : ""}${totalParts.toFixed(2)} parts</span>}
          </div>
        </div>
        {job.next_action && (
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-3">
            <span className="text-slate-500 dark:text-slate-400">Next:</span> {job.next_action}
          </p>
        )}
      </div>

      {/* Edit details */}
      {editing && edit && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit details</h2>
          <input className={fieldClass} placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={fieldClass} value={edit.location_id} onChange={(e) => setEdit({ ...edit, location_id: e.target.value })}>
              <option value="">Station…</option>
              {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
            <select className={fieldClass} value={edit.equipment_id} onChange={(e) => setEdit({ ...edit, equipment_id: e.target.value })}>
              <option value="">Equipment (optional)…</option>
              {equipment.map((e) => (<option key={e.id} value={e.id}>{(e.name || [e.make, e.model].filter(Boolean).join(" ") || "equipment")}{e.location_name ? ` — ${e.location_name}` : ""}</option>))}
            </select>
          </div>
          <input className={fieldClass} placeholder="Problem / what's wrong" value={edit.problem} onChange={(e) => setEdit({ ...edit, problem: e.target.value })} />
          <input className={fieldClass} placeholder="Next action" value={edit.next_action} onChange={(e) => setEdit({ ...edit, next_action: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Scheduled</label>
              <input type="date" className={fieldClass} value={edit.scheduled_date || ""} onChange={(e) => setEdit({ ...edit, scheduled_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Due</label>
              <input type="date" className={fieldClass} value={edit.due_date || ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveEdit} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
            <button onClick={() => setEditing(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Linked repairs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Repairs &amp; parts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Link an existing repair to pull its part costs into this job — no double entry.</p>
        {repairs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No repairs linked.</p>
        ) : (
          <ul className="space-y-2">
            {repairs.map((r) => (
              <li key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.description || "Repair"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.repair_date}{r.location_name ? ` · ${r.location_name}` : ""}</div>
                    {Array.isArray(r.items) && r.items.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {r.items.map((it, i) => (<li key={i} className="text-xs text-slate-600 dark:text-slate-300">{it.item_name} ×{it.quantity}</li>))}
                      </ul>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">${Number(r.total_cost || 0).toFixed(2)}</div>
                    <button onClick={() => unlinkRepair(r.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">Unlink</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 && (
          <div className="flex gap-2 mt-3">
            <select className={fieldClass} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">Link an existing repair…</option>
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>{r.repair_date} · {r.description || "Repair"} · ${Number(r.total_cost || 0).toFixed(2)}</option>
              ))}
            </select>
            <button onClick={linkRepair} disabled={!linkId} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0">Link</button>
          </div>
        )}
      </div>

      {/* Parts needed */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Parts</h2>
          <Link href="/parts" className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0">All parts →</Link>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Add a need even before you know the exact part — track it through install on the Parts page.</p>
        {parts.length > 0 && (
          <ul className="space-y-2 mb-3">
            {parts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-slate-800 dark:text-slate-200">{p.description}{p.quantity > 1 ? ` ×${p.quantity}` : ""}</div>
                  {(p.part_number || p.supplier || p.storage_location) && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{[p.part_number && `#${p.part_number}`, p.supplier, p.storage_location && `📍 ${p.storage_location}`].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <select value={p.status} onChange={(e) => setPartStatus(p.id, e.target.value)} className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded px-2 py-1 text-xs shrink-0">
                  {PART_STATUSES.map((s) => (<option key={s} value={s}>{PART_STATUS_LABEL[s]}</option>))}
                </select>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addPart} className="flex gap-2">
          <input className={fieldClass} placeholder="Need a part? e.g. condenser fan motor" value={newPart} onChange={(e) => setNewPart(e.target.value)} />
          <button type="submit" disabled={!newPart.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0">Add</button>
        </form>
      </div>

      {/* Add update */}
      <form onSubmit={addUpdate} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Log work</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
            <select className={fieldClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Set status (optional)</label>
            <select className={fieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">— no change —</option>
              {JOB_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
            </select>
          </div>
        </div>
        <textarea rows={2} className={fieldClass} placeholder="What did you do?" value={form.work_performed} onChange={(e) => setForm({ ...form, work_performed: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Time (min)</label>
            <input type="number" min="0" className={fieldClass} placeholder="unknown" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <input type="checkbox" checked={form.minutes_estimated} onChange={(e) => setForm({ ...form, minutes_estimated: e.target.checked })} /> estimated
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Cash cost ($)</label>
            <input type="number" min="0" step="0.01" className={fieldClass} placeholder="unknown" disabled={form.cost_unknown} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <input type="checkbox" checked={form.cost_unknown} onChange={(e) => setForm({ ...form, cost_unknown: e.target.checked })} /> unknown
            </label>
          </div>
        </div>
        <input className={fieldClass} placeholder="Next action / follow-up (optional)" value={form.follow_up} onChange={(e) => setForm({ ...form, follow_up: e.target.value })} />
        <button type="submit" disabled={savingUpdate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {savingUpdate ? "Saving…" : "Add update"}
        </button>
      </form>

      {/* History */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">History</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No updates yet.</p>
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {String(u.created_at).slice(0, 16).replace("T", " ")}
                  {` · ${KIND_LABEL[u.kind] || u.kind}`}
                  {u.person_name ? ` · ${u.person_name}` : ""}
                  {fmtMins(u.minutes, u.minutes_estimated) ? ` · ${fmtMins(u.minutes, u.minutes_estimated)}` : ""}
                  {u.cost !== null && u.cost !== undefined ? ` · $${Number(u.cost).toFixed(2)}` : ""}
                  {u.status_after ? ` · → ${STATUS_LABEL[u.status_after] || u.status_after}` : ""}
                </div>
                {u.work_performed && <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap">{u.work_performed}</p>}
                {u.cost_note && <p className="text-xs text-slate-500 dark:text-slate-400">{u.cost_note}</p>}
                {u.follow_up && <p className="text-xs text-slate-500 dark:text-slate-400">Next: {u.follow_up}</p>}
                {u.raw_text && u.raw_text !== u.work_performed && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">original: “{u.raw_text}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
