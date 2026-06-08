"use client";

import { useState, useEffect, useMemo } from "react";
import { usePerson } from "@/lib/personContext";

export default function TransfersPage() {
  const { currentPerson } = usePerson();
  const [transfers, setTransfers] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    item_id: "", from_location_id: "", to_location_id: "", quantity: 1, notes: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transfers.filter((t) => {
      const dateStr = (t.created_at || "").slice(0, 10);
      if (filterFromDate && dateStr < filterFromDate) return false;
      if (filterToDate && dateStr > filterToDate) return false;
      if (!q) return true;
      const hay = [
        t.item_name, t.part_number, t.from_location_name, t.to_location_name,
        t.notes, t.created_by_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [transfers, searchQuery, filterFromDate, filterToDate]);

  const filtersActive = searchQuery || filterFromDate || filterToDate;
  function clearFilters() {
    setSearchQuery(""); setFilterFromDate(""); setFilterToDate("");
  }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [tRes, iRes, lRes, invRes] = await Promise.all([
      fetch("/api/transfers"),
      fetch("/api/items"),
      fetch("/api/locations"),
      fetch("/api/inventory"),
    ]);
    setTransfers(await tRes.json());
    setItems(await iRes.json());
    setLocations(await lRes.json());
    setInventory(await invRes.json());
  }

  function getStock(itemId, locationId) {
    const inv = inventory.find((i) => i.item_id === parseInt(itemId) && i.location_id === parseInt(locationId));
    return inv ? inv.quantity : 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        item_id: parseInt(form.item_id),
        from_location_id: parseInt(form.from_location_id),
        to_location_id: parseInt(form.to_location_id),
        quantity: parseInt(form.quantity),
        created_by_id: currentPerson?.id ?? null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Transfer failed");
      return;
    }
    setForm({ item_id: "", from_location_id: "", to_location_id: "", quantity: 1, notes: "" });
    setShowForm(false);
    fetchAll();
  }

  const availableStock = form.item_id && form.from_location_id
    ? getStock(form.item_id, form.from_location_id)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transfers</h1>
          <p className="text-sm text-slate-500 mt-1">Move inventory between locations</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(""); }}
          disabled={!currentPerson}
          title={!currentPerson ? "Pick who you are first" : ""}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + New Transfer
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Transfer Inventory</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item *</label>
              <select required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From Location *</label>
              <select required value={form.from_location_id} onChange={(e) => setForm({ ...form, from_location_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select source</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To Location *</label>
              <select required value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select destination</option>
                {locations.filter((l) => l.id !== parseInt(form.from_location_id)).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {availableStock !== null && (
                <p className="text-xs text-slate-500 mt-1">Available: {availableStock}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Transfer</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      {!showForm && transfers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-2 items-end">
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by item, location, person…"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input
              type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="From date" />
            <input
              type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="To date" />
          </div>
          {filtersActive && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">Showing {filteredTransfers.length} of {transfers.length}</p>
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[550px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">From</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">To</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Notes</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Logged by</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransfers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{t.item_name}</div>
                  {t.part_number && <div className="text-xs text-slate-400 font-mono">{t.part_number}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.from_location_name}</td>
                <td className="px-4 py-3 text-slate-600">{t.to_location_name}</td>
                <td className="px-4 py-3 text-center font-semibold text-slate-900">{t.quantity}</td>
                <td className="px-4 py-3 text-slate-500">{t.notes || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{t.created_by_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transfers.length === 0 && (
          <div className="text-center py-8 text-slate-400">No transfers recorded yet.</div>
        )}
        {transfers.length > 0 && filteredTransfers.length === 0 && (
          <div className="text-center py-6 text-slate-400 text-sm">
            No transfers match your filters.
            <button onClick={clearFilters} className="text-blue-600 hover:underline ml-1">Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
