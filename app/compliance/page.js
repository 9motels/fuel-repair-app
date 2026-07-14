"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  complianceStatus,
  complianceDueLabel,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_TEMPLATES,
} from "@/lib/compliance";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// today + N months, as YYYY-MM-DD (used to seed template due dates).
function inMonths(n) {
  const d = new Date(today() + "T00:00:00");
  d.setMonth(d.getMonth() + (Number(n) || 0));
  return d.toISOString().slice(0, 10);
}

const STATUS_STYLE = {
  overdue: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
  soon: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
  ok: "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
  none: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700",
};

const STATUS_TEXT = {
  overdue: "text-red-700 dark:text-red-300",
  soon: "text-amber-700 dark:text-amber-300",
  ok: "text-green-700 dark:text-green-300",
  none: "text-slate-400 dark:text-slate-500",
};

export default function CompliancePage() {
  const [tasks, setTasks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ label: "", category: "", location_id: "", next_due_date: "", interval_months: "", notes: "" });

  // templates picker
  const [tplLocation, setTplLocation] = useState("");
  const [tplSel, setTplSel] = useState(() => COMPLIANCE_TEMPLATES.map(() => false));

  // per-row reschedule
  const [reschedId, setReschedId] = useState(null);
  const [reschedDate, setReschedDate] = useState("");

  async function load() {
    const [tRes, lRes] = await Promise.all([fetch("/api/compliance"), fetch("/api/locations")]);
    setTasks(tRes.ok ? await tRes.json() : []);
    setLocations(lRes.ok ? await lRes.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const fieldClass =
    "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

  async function addTask(e) {
    e.preventDefault();
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim(),
          category: form.category,
          location_id: form.location_id || null,
          next_due_date: form.next_due_date || null,
          interval_months: form.interval_months || null,
          notes: form.notes.trim(),
        }),
      });
      setForm({ label: "", category: "", location_id: "", next_due_date: "", interval_months: "", notes: "" });
      setShowAdd(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addTemplates() {
    const picked = COMPLIANCE_TEMPLATES.filter((_, i) => tplSel[i]);
    if (picked.length === 0) return;
    setSaving(true);
    try {
      await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: picked.map((t) => ({
            label: t.label,
            category: t.category,
            interval_months: t.interval_months,
            location_id: tplLocation || null,
            next_due_date: inMonths(t.interval_months),
          })),
        }),
      });
      setTplSel(COMPLIANCE_TEMPLATES.map(() => false));
      setShowTemplates(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function markDone(id) {
    await fetch(`/api/compliance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "done" }),
    });
    await load();
  }

  async function saveReschedule(id) {
    await fetch(`/api/compliance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next_due_date: reschedDate || null }),
    });
    setReschedId(null);
    setReschedDate("");
    await load();
  }

  async function removeTask(id) {
    if (!confirm("Remove this compliance task?")) return;
    await fetch(`/api/compliance/${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = locationFilter
    ? tasks.filter((t) => String(t.location_id) === String(locationFilter))
    : tasks;

  // Group by location name (unassigned last).
  const groups = [];
  const byLoc = new Map();
  for (const t of filtered) {
    const key = t.location_id || "none";
    if (!byLoc.has(key)) {
      const g = { key, name: t.location_name || "No location", tasks: [] };
      byLoc.set(key, g);
      groups.push(g);
    }
    byLoc.get(key).tasks.push(t);
  }
  groups.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.name.localeCompare(b.name)));

  const dueCount = tasks.filter((t) => {
    const l = complianceStatus(t).level;
    return l === "overdue" || l === "soon";
  }).length;

  const anyTplSelected = tplSel.some(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Compliance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Recurring inspections &amp; certifications by site — calibration, vapor recovery, fire, health.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setShowTemplates((v) => !v); setShowAdd(false); }}
            className="bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            Add common tasks
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setShowTemplates(false); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + Add task
          </button>
        </div>
      </div>

      {dueCount > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
          {dueCount} task{dueCount === 1 ? "" : "s"} overdue or due within 30 days.
        </p>
      )}

      {/* Templates picker */}
      {showTemplates && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Common fuel / c-store tasks</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Pick a site and the tasks to add. Intervals are typical estimates — adjust each due date after adding to match your AHJ.
          </p>
          <select value={tplLocation} onChange={(e) => setTplLocation(e.target.value)} className={`${fieldClass} mb-3`}>
            <option value="">No specific location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <ul className="space-y-1.5 mb-4">
            {COMPLIANCE_TEMPLATES.map((t, i) => (
              <li key={t.label}>
                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplSel[i]}
                    onChange={() => setTplSel((s) => s.map((v, idx) => (idx === i ? !v : v)))}
                    className="mt-1"
                  />
                  <span>
                    {t.label}
                    <span className="text-xs text-slate-400 dark:text-slate-500"> · every {t.interval_months} mo · {t.category}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={addTemplates} disabled={saving || !anyTplSelected} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Adding…" : `Add ${tplSel.filter(Boolean).length} selected`}
            </button>
            <button onClick={() => setShowTemplates(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual add */}
      {showAdd && (
        <form onSubmit={addTask} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Task *</label>
            <input className={fieldClass} placeholder="e.g. Annual dispenser calibration" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
              <select className={fieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {COMPLIANCE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Location</label>
              <select className={fieldClass} value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                <option value="">No specific location</option>
                {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Next due</label>
              <input type="date" className={fieldClass} value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Repeat every … months</label>
              <input type="number" min="0" className={fieldClass} placeholder="e.g. 12" value={form.interval_months} onChange={(e) => setForm({ ...form, interval_months: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Notes</label>
            <input className={fieldClass} placeholder="Vendor, cert #, reference…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? "Saving…" : "Add task"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Location filter */}
      <div className="mb-5">
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All locations</option>
          {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </select>
      </div>

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">No compliance tasks yet</p>
          <p className="text-sm mt-1">Use “Add common tasks” to start from the usual fuel / c-store list.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{g.name}</h2>
              <ul className="space-y-2">
                {g.tasks.map((t) => {
                  const s = complianceStatus(t);
                  return (
                    <li key={t.id} className={`border rounded-lg p-3 ${STATUS_STYLE[s.level] || STATUS_STYLE.none}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.label}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {[t.category, t.equipment_name, t.interval_months ? `every ${t.interval_months} mo` : null].filter(Boolean).join(" · ")}
                          </div>
                          {t.notes && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{t.notes}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-xs font-semibold ${STATUS_TEXT[s.level]}`}>
                            {s.level === "overdue" ? "Overdue" : s.level === "soon" ? "Due soon" : s.level === "none" ? "No date" : "OK"}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {s.dueDate ? `${s.dueDate}${complianceDueLabel(s) ? ` · ${complianceDueLabel(s)}` : ""}` : t.last_done_date ? `done ${t.last_done_date}` : "—"}
                          </div>
                        </div>
                      </div>
                      {reschedId === t.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-2 py-1 text-xs" />
                          <button onClick={() => saveReschedule(t.id)} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">Save</button>
                          <button onClick={() => setReschedId(null)} className="text-xs text-slate-400 dark:text-slate-500 hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-3 mt-2">
                          <button onClick={() => markDone(t.id)} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">Mark done today</button>
                          <button onClick={() => { setReschedId(t.id); setReschedDate(t.next_due_date || ""); }} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">Reschedule</button>
                          <button onClick={() => removeTask(t.id)} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">Remove</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
