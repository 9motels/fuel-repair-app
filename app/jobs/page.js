"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import { JOB_STATUSES, JOB_PRIORITIES, STATUS_LABEL, PRIORITY_LABEL } from "@/lib/jobsAi";

const fieldClass =
  "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_BADGE = {
  new: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  scheduled: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
  waiting_parts: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  waiting_contractor: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  completed: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
};
const PRIORITY_DOT = { urgent: "bg-red-500", high: "bg-orange-500", normal: "bg-slate-300 dark:bg-slate-600", low: "bg-slate-200 dark:bg-slate-700" };

function fmtMins(m) {
  const n = Number(m) || 0;
  if (n <= 0) return "";
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export default function JobsPage() {
  const { currentPerson } = usePerson();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("open"); // open | all | <status>

  const [showNew, setShowNew] = useState(false);
  const [locations, setLocations] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", location_id: "", equipment_id: "", priority: "normal", status: "new", problem: "", next_action: "", due_date: "" });

  async function load() {
    const qs = tab === "open" ? "?open=1" : tab === "all" ? "" : `?status=${tab}`;
    const res = await fetch(`/api/jobs${qs}`);
    setJobs(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    fetch("/api/locations").then((r) => r.json()).then((d) => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])).then((d) => setEquipment(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function createJob(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, location_id: form.location_id || null, equipment_id: form.equipment_id || null, created_by_id: currentPerson?.id || null }),
    });
    setForm({ title: "", location_id: "", equipment_id: "", priority: "normal", status: "new", problem: "", next_action: "", due_date: "" });
    setShowNew(false);
    setSaving(false);
    load();
  }

  async function setStatus(job, status) {
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const tabs = [
    ["open", "Open"],
    ["waiting_parts", "Waiting Parts"],
    ["waiting_contractor", "Waiting Contractor"],
    ["completed", "Done"],
    ["all", "All"],
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Jobs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Open work across all stations — repairs &amp; maintenance.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowNew((v) => !v)} className="bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40">
            + New job
          </button>
          <Link href="/capture" className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">
            ⚡ Capture
          </Link>
        </div>
      </div>

      {showNew && (
        <form onSubmit={createJob} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-5 space-y-3">
          <input className={fieldClass} placeholder="Job title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={fieldClass} value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
              <option value="">Station…</option>
              {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
            <select className={fieldClass} value={form.equipment_id} onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}>
              <option value="">Equipment (optional)…</option>
              {equipment.map((e) => (<option key={e.id} value={e.id}>{(e.name || [e.make, e.model].filter(Boolean).join(" ") || "equipment")}{e.location_name ? ` — ${e.location_name}` : ""}</option>))}
            </select>
          </div>
          <input className={fieldClass} placeholder="Problem / what's wrong (optional)" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
          <input className={fieldClass} placeholder="Next action (optional)" value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
              <select className={fieldClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {JOB_PRIORITIES.map((p) => (<option key={p} value={p}>{PRIORITY_LABEL[p]}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Status</label>
              <select className={fieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {JOB_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Due</label>
              <input type="date" className={fieldClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.title.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Create job"}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-1.5 flex-wrap mb-5">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
              tab === key
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">Nothing here</p>
          <p className="text-sm mt-1">Capture a note to start a job.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const eqName = j.equipment_name || [j.equipment_make, j.equipment_model].filter(Boolean).join(" ");
            return (
              <li key={j.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${PRIORITY_DOT[j.priority] || PRIORITY_DOT.normal}`} title={PRIORITY_LABEL[j.priority]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/jobs/${j.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:underline">{j.title}</Link>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[j.status] || ""}`}>
                        {STATUS_LABEL[j.status] || j.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {[j.location_name, eqName].filter(Boolean).join(" · ") || "No station set"}
                    </p>
                    {j.next_action && <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">Next: {j.next_action}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 dark:text-slate-500">
                      {j.due_date && j.status !== "completed" && (
                        <span className={j.due_date < todayStr ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                          {j.due_date < todayStr ? "Overdue " : "Due "}{j.due_date}
                        </span>
                      )}
                      {j.update_count > 0 && <span>{j.update_count} update{j.update_count === 1 ? "" : "s"}</span>}
                      {fmtMins(j.total_minutes) && <span>{fmtMins(j.total_minutes)} logged</span>}
                      <select
                        value={j.status}
                        onChange={(e) => setStatus(j, e.target.value)}
                        className="ml-auto border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded px-1.5 py-1 text-xs"
                      >
                        {JOB_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
