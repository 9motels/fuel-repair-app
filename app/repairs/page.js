"use client";

import { useState, useEffect, useMemo } from "react";
import { usePerson } from "@/lib/personContext";

export default function RepairsPage() {
  const { currentPerson } = usePerson();
  const [repairs, setRepairs] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | open | closed

  const [repairForm, setRepairForm] = useState({
    location_id: "", pump_number: "", repair_date: new Date().toISOString().split("T")[0], description: "", notes: "", equipment_id: "",
  });

  const [itemForm, setItemForm] = useState({ item_id: "", source_location_id: "", quantity: 1, unit_cost: "" });
  const [repairItems, setRepairItems] = useState([]);
  const [closingId, setClosingId] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  // Open the form automatically when arriving from the dashboard "Log Repair" button (/repairs?new=1)
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new")) {
      setShowForm(true);
    }
  }, []);

  async function fetchAll() {
    const [rRes, iRes, lRes, invRes, eqRes] = await Promise.all([
      fetch("/api/repairs"), fetch("/api/items"), fetch("/api/locations"), fetch("/api/inventory"), fetch("/api/equipment"),
    ]);
    setRepairs(await rRes.json());
    setItems(await iRes.json());
    setLocations(await lRes.json());
    setInventory(await invRes.json());
    setEquipment(await eqRes.json());
  }

  function getStock(itemId, locationId) {
    const inv = inventory.find((i) => i.item_id === parseInt(itemId) && i.location_id === parseInt(locationId));
    return inv ? inv.quantity : 0;
  }

  function getLastPrice(itemId) {
    const item = items.find((i) => i.id === parseInt(itemId));
    if (item && item.description) {
      const match = item.description.match(/\$(\d+\.?\d*)/);
      if (match) return parseFloat(match[1]);
    }
    return 0;
  }

  function handleItemSelect(itemId) {
    const price = getLastPrice(itemId);
    const sourceLoc = repairForm.location_id || "";
    setItemForm({ item_id: itemId, source_location_id: sourceLoc, unit_cost: price.toString(), quantity: 1 });
  }

  function addItemToRepair() {
    if (!itemForm.item_id || !itemForm.source_location_id || !itemForm.quantity || !itemForm.unit_cost) return;
    const item = items.find((i) => i.id === parseInt(itemForm.item_id));
    const sourceLoc = locations.find((l) => l.id === parseInt(itemForm.source_location_id));
    setRepairItems([...repairItems, {
      item_id: parseInt(itemForm.item_id),
      source_location_id: parseInt(itemForm.source_location_id),
      quantity: parseInt(itemForm.quantity),
      unit_cost: parseFloat(itemForm.unit_cost),
      item_name: item?.name || "",
      source_location_name: sourceLoc?.name || "",
    }]);
    setItemForm({ item_id: "", source_location_id: repairForm.location_id || "", quantity: 1, unit_cost: "" });
  }

  function removeRepairItem(index) {
    setRepairItems(repairItems.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (repairItems.length === 0) { setError("Add at least one part below before saving"); return; }
    const res = await fetch("/api/repairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...repairForm,
        location_id: parseInt(repairForm.location_id),
        pump_number: repairForm.pump_number ? parseInt(repairForm.pump_number) : null,
        equipment_id: repairForm.equipment_id ? parseInt(repairForm.equipment_id) : null,
        created_by_id: currentPerson?.id ?? null,
        items: repairItems.map(i => ({ item_id: i.item_id, source_location_id: i.source_location_id, quantity: i.quantity, unit_cost: i.unit_cost })),
      }),
    });
    if (!res.ok) { const data = await res.json(); setError(data.error || "Failed to save repair"); return; }
    setRepairForm({ location_id: "", pump_number: "", repair_date: new Date().toISOString().split("T")[0], description: "", notes: "", equipment_id: "" });
    setRepairItems([]);
    setShowForm(false);
    fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this repair record? (Inventory will NOT be restored)")) return;
    await fetch(`/api/repairs/${id}`, { method: "DELETE" });
    fetchAll();
  }

  function handleDuplicate(repair) {
    // Pre-fill the form from an existing repair so the user can save a
    // near-copy with one or two edits (e.g. new date).
    setRepairForm({
      location_id: String(repair.location_id ?? ""),
      pump_number: repair.pump_number ? String(repair.pump_number) : "",
      repair_date: new Date().toISOString().split("T")[0], // today, not the original date
      description: repair.description || "",
      notes: repair.notes || "",
      equipment_id: String(repair.equipment_id ?? ""),
    });
    setRepairItems((repair.items || []).map((i) => ({
      item_id: i.item_id,
      source_location_id: i.source_location_id,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
      item_name: i.item_name || "",
      source_location_name: i.source_location_name || "",
    })));
    setShowForm(true);
    setError("");
    // Scroll to top so the form is visible on mobile.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Memoized filtered list.
  const filteredRepairs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return repairs.filter((r) => {
      if (filterStatus !== "all") {
        const st = r.status || "open";
        if (st !== filterStatus) return false;
      }
      if (filterFromDate && r.repair_date < filterFromDate) return false;
      if (filterToDate && r.repair_date > filterToDate) return false;
      if (!q) return true;
      const hay = [
        r.description, r.notes, r.location_name, r.created_by_name,
        r.pump_number ? `pump ${r.pump_number}` : "",
        ...(r.items || []).map((i) => `${i.item_name} ${i.part_number || ""}`),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [repairs, searchQuery, filterFromDate, filterToDate, filterStatus]);

  function clearFilters() {
    setSearchQuery(""); setFilterFromDate(""); setFilterToDate(""); setFilterStatus("all");
  }
  const filtersActive = searchQuery || filterFromDate || filterToDate || filterStatus !== "all";

  async function handleCloseAndEmail(repair) {
    if (!confirm(`Close repair #${repair.id} and email a report to the configured address? This cannot be undone.`)) return;
    setClosingId(repair.id);
    try {
      const res = await fetch("/api/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repair_id: repair.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Email failed: ${data.error || "Unknown error"}`);
        return;
      }
      alert(`Report sent to ${data.sent_to}.`);
      fetchAll();
    } finally {
      setClosingId(null);
    }
  }

  const runningTotal = repairItems.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
  const availableStock = itemForm.item_id && itemForm.source_location_id
    ? getStock(itemForm.item_id, itemForm.source_location_id) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Repairs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track repairs and parts used</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(""); setRepairItems([]); }}
          disabled={!currentPerson}
          title={!currentPerson ? "Pick who you are first" : ""}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Log Repair
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 md:p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Log Repair</h2>
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {/* Step 1: Repair details */}
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs font-semibold text-blue-800">Step 1: Repair Info</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location *</label>
              <select required value={repairForm.location_id} onChange={(e) => setRepairForm({ ...repairForm, location_id: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pump #</label>
              <select value={repairForm.pump_number} onChange={(e) => setRepairForm({ ...repairForm, pump_number: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">N/A</option>
                {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>Pump {n}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
              <input type="date" required value={repairForm.repair_date} onChange={(e) => setRepairForm({ ...repairForm, repair_date: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <input type="text" value={repairForm.description} onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Nozzle swap" />
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Equipment (optional)</label>
            <select value={repairForm.equipment_id} onChange={(e) => setRepairForm({ ...repairForm, equipment_id: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">None</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.name || [eq.make, eq.model].filter(Boolean).join(" ") || `Equipment #${eq.id}`}</option>
              ))}
            </select>
          </div>

          {/* Items already added */}
          {repairItems.length > 0 && (
            <div className="mb-4">
              <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2 mb-2">
                <p className="text-xs font-semibold text-green-800">Parts Added ({repairItems.length})</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden">
                {repairItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.item_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">from {item.source_location_name} &middot; x{item.quantity} @ ${item.unit_cost.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">${(item.quantity * item.unit_cost).toFixed(2)}</span>
                      <button type="button" onClick={() => removeRepairItem(idx)} className="text-red-500 dark:text-red-400 hover:text-red-700 p-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-100 dark:bg-slate-700 font-semibold">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Running Total</span>
                  <span className="text-lg text-slate-900 dark:text-slate-100">${runningTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Add parts */}
          <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-4 bg-blue-50 dark:bg-blue-950/40/50">
            <div className="mb-3">
              <p className="text-xs font-semibold text-blue-800">Step 2: Add Parts (one at a time, tap &quot;+ Add Part&quot; for each)</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Item</label>
                <select value={itemForm.item_id} onChange={(e) => handleItemSelect(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select item...</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">From Location</label>
                  <select value={itemForm.source_location_id} onChange={(e) => setItemForm({ ...itemForm, source_location_id: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Source</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {availableStock !== null && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">In stock: {availableStock}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Qty</label>
                  <input type="number" min="1" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Unit Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={addItemToRepair}
                    className="w-full bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700">
                    + Add Part
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Save */}
          <div className="flex gap-2">
            <button type="submit"
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                repairItems.length > 0
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-slate-200 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              }`}>
              Save Repair {repairItems.length > 0 ? `(${repairItems.length} part${repairItems.length > 1 ? "s" : ""} — $${runningTotal.toFixed(2)})` : ""}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setRepairItems([]); }}
              className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      {!showForm && repairs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by part, location, pump, person…"
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              title="From date"
            />
            <input
              type="date"
              value={filterToDate}
              onChange={(e) => setFilterToDate(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
              title="To date"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          {filtersActive && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredRepairs.length} of {repairs.length}
              </p>
              <button onClick={clearFilters} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Repairs list */}
      <div className="space-y-3">
        {filteredRepairs.map((repair) => (
          <div key={repair.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{repair.description || "Repair"}</span>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full">{repair.location_name}</span>
                  {repair.pump_number && (
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full">Pump {repair.pump_number}</span>
                  )}
                  {repair.equipment_name && (
                    <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{repair.equipment_name}</span>
                  )}
                  {repair.status === "closed" ? (
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">Closed</span>
                  ) : (
                    <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">Open</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {repair.repair_date} <span className="text-slate-400 dark:text-slate-500">· logged by {repair.created_by_name || "—"}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">${repair.total_cost?.toFixed(2)}</span>
                <button onClick={() => handleDelete(repair.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
            {repair.items && repair.items.length > 0 && (
              <div className="mt-2 space-y-1">
                {repair.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{item.item_name} x{item.quantity} <span className="text-slate-400 dark:text-slate-500">from {item.source_location_name}</span></span>
                    <span className="font-medium">${(item.quantity * item.unit_cost).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => handleDuplicate(repair)}
                disabled={!currentPerson}
                title={!currentPerson ? "Pick who you are first" : "Pre-fill a new repair with the same parts"}
                className="text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Duplicate
              </button>
              {repair.status !== "closed" && (
                <button
                  onClick={() => handleCloseAndEmail(repair)}
                  disabled={closingId === repair.id}
                  className="text-sm font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  {closingId === repair.id ? "Sending…" : "Close & Email Report"}
                </button>
              )}
            </div>
            {repair.status === "closed" && repair.closed_at && (
              <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Closed {new Date(repair.closed_at + "Z").toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {repairs.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">No repairs logged yet</p>
          <p className="text-sm mt-1">Tap &quot;+ Log Repair&quot; to record your first repair</p>
        </div>
      )}
      {repairs.length > 0 && filteredRepairs.length === 0 && !showForm && (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500">
          <p className="text-sm">No repairs match your filters.</p>
          <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">Clear filters</button>
        </div>
      )}
    </div>
  );
}
