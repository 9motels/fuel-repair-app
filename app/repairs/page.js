"use client";

import { useState, useEffect } from "react";

export default function RepairsPage() {
  const [repairs, setRepairs] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [repairForm, setRepairForm] = useState({
    location_id: "", pump_number: "", repair_date: new Date().toISOString().split("T")[0], description: "", notes: "",
  });

  const [itemForm, setItemForm] = useState({ item_id: "", source_location_id: "", quantity: 1, unit_cost: "" });
  const [repairItems, setRepairItems] = useState([]);
  const [closingId, setClosingId] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [rRes, iRes, lRes, invRes] = await Promise.all([
      fetch("/api/repairs"), fetch("/api/items"), fetch("/api/locations"), fetch("/api/inventory"),
    ]);
    setRepairs(await rRes.json());
    setItems(await iRes.json());
    setLocations(await lRes.json());
    setInventory(await invRes.json());
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
        items: repairItems.map(i => ({ item_id: i.item_id, source_location_id: i.source_location_id, quantity: i.quantity, unit_cost: i.unit_cost })),
      }),
    });
    if (!res.ok) { const data = await res.json(); setError(data.error || "Failed to save repair"); return; }
    setRepairForm({ location_id: "", pump_number: "", repair_date: new Date().toISOString().split("T")[0], description: "", notes: "" });
    setRepairItems([]);
    setShowForm(false);
    fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this repair record? (Inventory will NOT be restored)")) return;
    await fetch(`/api/repairs/${id}`, { method: "DELETE" });
    fetchAll();
  }

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
          <h1 className="text-2xl font-bold text-slate-900">Repairs</h1>
          <p className="text-sm text-slate-500 mt-1">Track repairs and parts used</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(""); setRepairItems([]); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Log Repair
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Log Repair</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {/* Step 1: Repair details */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs font-semibold text-blue-800">Step 1: Repair Info</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location *</label>
              <select required value={repairForm.location_id} onChange={(e) => setRepairForm({ ...repairForm, location_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pump #</label>
              <select value={repairForm.pump_number} onChange={(e) => setRepairForm({ ...repairForm, pump_number: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">N/A</option>
                {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>Pump {n}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" required value={repairForm.repair_date} onChange={(e) => setRepairForm({ ...repairForm, repair_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input type="text" value={repairForm.description} onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Nozzle swap" />
            </div>
          </div>

          {/* Items already added */}
          {repairItems.length > 0 && (
            <div className="mb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
                <p className="text-xs font-semibold text-green-800">Parts Added ({repairItems.length})</p>
              </div>
              <div className="bg-slate-50 rounded-lg overflow-hidden">
                {repairItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                      <p className="text-xs text-slate-500">from {item.source_location_name} &middot; x{item.quantity} @ ${item.unit_cost.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-sm font-bold text-slate-900">${(item.quantity * item.unit_cost).toFixed(2)}</span>
                      <button type="button" onClick={() => removeRepairItem(idx)} className="text-red-500 hover:text-red-700 p-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-100 font-semibold">
                  <span className="text-sm text-slate-700">Running Total</span>
                  <span className="text-lg text-slate-900">${runningTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Add parts */}
          <div className="border border-blue-200 rounded-lg p-3 mb-4 bg-blue-50/50">
            <div className="mb-3">
              <p className="text-xs font-semibold text-blue-800">Step 2: Add Parts (one at a time, tap &quot;+ Add Part&quot; for each)</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Item</label>
                <select value={itemForm.item_id} onChange={(e) => handleItemSelect(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select item...</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">From Location</label>
                  <select value={itemForm.source_location_id} onChange={(e) => setItemForm({ ...itemForm, source_location_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Source</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {availableStock !== null && (
                    <p className="text-xs text-slate-500 mt-1">In stock: {availableStock}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Qty</label>
                  <input type="number" min="1" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unit Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}>
              Save Repair {repairItems.length > 0 ? `(${repairItems.length} part${repairItems.length > 1 ? "s" : ""} — $${runningTotal.toFixed(2)})` : ""}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setRepairItems([]); }}
              className="px-4 py-3 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* Repairs list */}
      <div className="space-y-3">
        {repairs.map((repair) => (
          <div key={repair.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">{repair.description || "Repair"}</span>
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{repair.location_name}</span>
                  {repair.pump_number && (
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Pump {repair.pump_number}</span>
                  )}
                  {repair.status === "closed" ? (
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">Closed</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">Open</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{repair.repair_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">${repair.total_cost?.toFixed(2)}</span>
                <button onClick={() => handleDelete(repair.id)} className="text-slate-400 hover:text-red-600 p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
            {repair.items && repair.items.length > 0 && (
              <div className="mt-2 space-y-1">
                {repair.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{item.item_name} x{item.quantity} <span className="text-slate-400">from {item.source_location_name}</span></span>
                    <span className="font-medium">${(item.quantity * item.unit_cost).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {repair.status !== "closed" && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => handleCloseAndEmail(repair)}
                  disabled={closingId === repair.id}
                  className="text-sm font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  {closingId === repair.id ? "Sending…" : "Close & Email Report"}
                </button>
              </div>
            )}
            {repair.status === "closed" && repair.closed_at && (
              <div className="mt-2 text-xs text-slate-400">
                Closed {new Date(repair.closed_at + "Z").toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {repairs.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No repairs logged yet</p>
          <p className="text-sm mt-1">Tap &quot;+ Log Repair&quot; to record your first repair</p>
        </div>
      )}
    </div>
  );
}
