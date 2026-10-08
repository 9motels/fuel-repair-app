"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import { uploadFile } from "@/lib/equipmentUtils";
import { PART_STATUSES, PART_STATUS_LABEL } from "@/lib/partsAi";

const fieldClass =
  "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_BADGE = {
  needs_research: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  ready_to_order: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  ordered: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
  received: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  installed: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  cancelled: "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
};

// The attention pipeline, in order. Resolved (installed/cancelled) is behind a toggle.
const SECTIONS = ["needs_research", "ready_to_order", "ordered", "received"];

export default function PartsPage() {
  const { currentPerson } = usePerson();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const [locations, setLocations] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [openJobs, setOpenJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ description: "", job_id: "", location_id: "", equipment_id: "", quantity: 1, notes: "" });
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [researchId, setResearchId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState("");

  // match a delivery
  const [showMatch, setShowMatch] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [matchError, setMatchError] = useState("");
  const [matchPhotoUrl, setMatchPhotoUrl] = useState("");

  async function load() {
    const res = await fetch("/api/parts");
    setParts(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/locations").then((r) => r.json()).then((d) => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])).then((d) => setEquipment(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/jobs?open=1").then((r) => (r.ok ? r.json() : [])).then((d) => setOpenJobs(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/vehicles").then((r) => (r.ok ? r.json() : [])).then((d) => setVehicles(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const storageOptions = [...new Set(["Office", "My truck", ...vehicles.map((v) => v.name).filter(Boolean), ...locations.map((l) => l.name)])];
  const todayStr = new Date().toISOString().slice(0, 10);

  async function patchPart(id, patch) {
    await fetch(`/api/parts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    await load();
  }

  async function createPart(e) {
    e.preventDefault();
    if (!addForm.description.trim()) return;
    setSaving(true);
    await fetch("/api/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, job_id: addForm.job_id || null, location_id: addForm.location_id || null, equipment_id: addForm.equipment_id || null, created_by_id: currentPerson?.id || null }),
    });
    setAddForm({ description: "", job_id: "", location_id: "", equipment_id: "", quantity: 1, notes: "" });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  async function research(id) {
    setBusyId(id);
    setResearchId(id);
    setRowError("");
    try {
      const res = await fetch(`/api/parts/${id}/research`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed.");
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(p) {
    setEdit({
      description: p.description || "", quantity: p.quantity || 1, job_id: p.job_id || "",
      location_id: p.location_id || "", equipment_id: p.equipment_id || "", part_number: p.part_number || "",
      supplier: p.supplier || "", order_number: p.order_number || "", expected_date: p.expected_date || "",
      cost: p.cost ?? "", storage_location: p.storage_location || "", notes: p.notes || "",
    });
    setEditId(p.id);
  }
  async function saveEdit(id) {
    await patchPart(id, { ...edit, cost: edit.cost === "" ? null : edit.cost });
    setEditId(null);
  }

  async function del(id) {
    if (!confirm("Delete this part need?")) return;
    await fetch(`/api/parts/${id}`, { method: "DELETE" });
    await load();
  }

  async function uploadMatch(file) {
    setMatchError("");
    setMatching(true);
    setMatchResult(null);
    try {
      const url = await uploadFile(file);
      setMatchPhotoUrl(url);
      const res = await fetch("/api/parts/match-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the slip.");
      setMatchResult(data);
    } catch (err) {
      setMatchError(err.message);
    } finally {
      setMatching(false);
    }
  }

  async function receiveMatch(p) {
    const ex = matchResult?.extracted || {};
    await patchPart(p.id, {
      status: "received",
      order_number: p.order_number || ex.order_number || "",
      supplier: p.supplier || ex.supplier || "",
      photo_urls: [...(p.photo_urls || []), ...(matchPhotoUrl ? [matchPhotoUrl] : [])],
    });
    setShowMatch(false);
    setMatchResult(null);
    setMatchPhotoUrl("");
  }

  const visible = parts.filter((p) => (showResolved ? true : !["installed", "cancelled"].includes(p.status)));
  const resolvedCount = parts.filter((p) => ["installed", "cancelled"].includes(p.status)).length;

  function section(status) {
    return visible.filter((p) => p.status === status);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Parts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">From “need a fan” to installed — nothing forgotten in between.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { setShowMatch((v) => !v); setShowAdd(false); }} className="bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40">
            📦 Match a delivery
          </button>
          <button onClick={() => { setShowAdd((v) => !v); setShowMatch(false); }} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">
            + Add part
          </button>
        </div>
      </div>

      {/* Match a delivery */}
      {showMatch && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Match a delivery</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Snap the packing slip or order confirmation — AI reads it and finds which ordered part it is.</p>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && uploadMatch(e.target.files[0])}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
          {matching && <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">Reading the slip…</p>}
          {matchError && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{matchError}</p>}
          {matchResult && (
            <div className="mt-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Read: {[matchResult.extracted.supplier, matchResult.extracted.order_number && `#${matchResult.extracted.order_number}`, matchResult.extracted.date].filter(Boolean).join(" · ") || "no header details"}
                {Array.isArray(matchResult.extracted.items) && matchResult.extracted.items.length > 0 && ` · ${matchResult.extracted.items.length} line item(s)`}
              </div>
              {matchResult.matches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No ordered parts to match. Add the part first, mark it Ordered, then match.</p>
              ) : (
                <ul className="space-y-2">
                  {matchResult.matches.map((p) => (
                    <li key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.description}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {[p.job_title, p.location_name, p.order_number && `#${p.order_number}`].filter(Boolean).join(" · ")}
                        </div>
                        <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.confidence === "high" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : p.confidence === "medium" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                          {p.confidence} match
                        </span>
                      </div>
                      <button onClick={() => receiveMatch(p)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 shrink-0">
                        This one — mark received
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Uncertain matches are flagged — confirm the right one.</p>
            </div>
          )}
        </div>
      )}

      {/* Add part */}
      {showAdd && (
        <form onSubmit={createPart} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-5 space-y-3">
          <input className={fieldClass} placeholder="What's needed? e.g. condenser fan motor (you can order-later)" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={fieldClass} value={addForm.job_id} onChange={(e) => setAddForm({ ...addForm, job_id: e.target.value })}>
              <option value="">Link to a job (optional)…</option>
              {openJobs.map((j) => (<option key={j.id} value={j.id}>{j.title}{j.location_name ? ` — ${j.location_name}` : ""}</option>))}
            </select>
            <input type="number" min="1" className={fieldClass} placeholder="Qty" value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} />
            <select className={fieldClass} value={addForm.location_id} onChange={(e) => setAddForm({ ...addForm, location_id: e.target.value })}>
              <option value="">Station (optional)…</option>
              {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
            <select className={fieldClass} value={addForm.equipment_id} onChange={(e) => setAddForm({ ...addForm, equipment_id: e.target.value })}>
              <option value="">Equipment (optional)…</option>
              {equipment.map((e) => (<option key={e.id} value={e.id}>{(e.name || [e.make, e.model].filter(Boolean).join(" ") || "equipment")}{e.location_name ? ` — ${e.location_name}` : ""}</option>))}
            </select>
          </div>
          <input className={fieldClass} placeholder="Notes (optional)" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !addForm.description.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Add part need"}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
          </div>
        </form>
      )}

      <datalist id="storage-options">
        {storageOptions.map((o) => (<option key={o} value={o} />))}
      </datalist>

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">No parts in the pipeline</p>
          <p className="text-sm mt-1">Add a need — you don’t have to know the exact part yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((status) => {
            const items = section(status);
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  {PART_STATUS_LABEL[status]} <span className="text-slate-400 dark:text-slate-500">({items.length})</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((p) => {
                    const eqName = p.equipment_name || [p.equipment_make, p.equipment_model].filter(Boolean).join(" ");
                    const late = p.status === "ordered" && p.expected_date && p.expected_date < todayStr;
                    const meta = [
                      p.part_number && `#${p.part_number}`,
                      p.supplier,
                      p.order_number && `ord ${p.order_number}`,
                      p.storage_location && `📍 ${p.storage_location}`,
                      p.cost != null && `$${Number(p.cost).toFixed(2)}`,
                    ].filter(Boolean).join(" · ");
                    return (
                      <li key={p.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {p.description}{p.quantity > 1 ? ` ×${p.quantity}` : ""}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {[p.job_title && <Link key="j" href={`/jobs/${p.job_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{p.job_title}</Link>, p.location_name, eqName].filter(Boolean).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [])}
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status]}`}>{PART_STATUS_LABEL[p.status]}</span>
                        </div>

                        {meta && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{meta}</div>}
                        {p.expected_date && p.status === "ordered" && (
                          <div className={`text-xs mt-0.5 ${late ? "text-red-600 dark:text-red-400 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>
                            {late ? "Late — expected " : "Expected "}{p.expected_date}
                          </div>
                        )}
                        {p.compat_notes && (
                          <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-2 mt-2">
                            Confirm before ordering: {p.compat_notes}
                          </div>
                        )}

                        {/* Research results */}
                        {Array.isArray(p.candidates) && p.candidates.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {p.candidates.map((c, i) => (
                              <li key={i} className="flex items-start justify-between gap-2 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                                <div className="min-w-0">
                                  <a href={c.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline break-words">{c.name || c.url}</a>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{[c.part_number && `#${c.part_number}`, c.vendor, c.price].filter(Boolean).join(" · ")}</div>
                                  {c.fits_note && <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.fits_note}</div>}
                                </div>
                                <button onClick={() => patchPart(p.id, { part_number: c.part_number || p.part_number, supplier: c.vendor || p.supplier })} className="text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0">Use</button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {rowError && busyId === null && researchId === p.id && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{rowError}</p>}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <select value={p.status} onChange={(e) => patchPart(p.id, { status: e.target.value })} className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded px-2 py-1 text-xs">
                            {PART_STATUSES.map((s) => (<option key={s} value={s}>{PART_STATUS_LABEL[s]}</option>))}
                          </select>
                          {(p.status === "needs_research" || p.status === "ready_to_order") && (
                            <button onClick={() => research(p.id)} disabled={busyId === p.id} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50">
                              {busyId === p.id ? "Researching…" : "✨ Research"}
                            </button>
                          )}
                          <button onClick={() => (editId === p.id ? setEditId(null) : startEdit(p))} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">
                            {editId === p.id ? "Close" : "Edit"}
                          </button>
                          <button onClick={() => del(p.id)} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 ml-auto">Delete</button>
                        </div>

                        {/* Edit panel */}
                        {editId === p.id && edit && (
                          <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
                            <input className={fieldClass} placeholder="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                            <div className="grid grid-cols-2 gap-3">
                              <input className={fieldClass} placeholder="Part number" value={edit.part_number} onChange={(e) => setEdit({ ...edit, part_number: e.target.value })} />
                              <input className={fieldClass} placeholder="Supplier" value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} />
                              <input className={fieldClass} placeholder="Order number" value={edit.order_number} onChange={(e) => setEdit({ ...edit, order_number: e.target.value })} />
                              <div>
                                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">Expected arrival</label>
                                <input type="date" className={fieldClass} value={edit.expected_date || ""} onChange={(e) => setEdit({ ...edit, expected_date: e.target.value })} />
                              </div>
                              <input list="storage-options" className={fieldClass} placeholder="Stored where? (truck, office…)" value={edit.storage_location} onChange={(e) => setEdit({ ...edit, storage_location: e.target.value })} />
                              <input type="number" min="0" step="0.01" className={fieldClass} placeholder="Actual cost ($)" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
                              <input type="number" min="1" className={fieldClass} placeholder="Qty" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
                              <select className={fieldClass} value={edit.job_id} onChange={(e) => setEdit({ ...edit, job_id: e.target.value })}>
                                <option value="">No job</option>
                                {openJobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                              </select>
                            </div>
                            <input className={fieldClass} placeholder="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(p.id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                              <button onClick={() => setEditId(null)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {resolvedCount > 0 && (
        <button onClick={() => setShowResolved((v) => !v)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-6">
          {showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
        </button>
      )}
    </div>
  );
}
