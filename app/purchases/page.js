"use client";

import { useState, useEffect } from "react";

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    item_id: "", location_id: "", quantity: 1, unit_price: "", vendor: "", purchase_date: new Date().toISOString().split("T")[0], notes: "",
  });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [pRes, iRes, lRes] = await Promise.all([
      fetch("/api/purchases"),
      fetch("/api/items"),
      fetch("/api/locations"),
    ]);
    setPurchases(await pRes.json());
    setItems(await iRes.json());
    setLocations(await lRes.json());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        item_id: parseInt(form.item_id),
        location_id: parseInt(form.location_id),
        quantity: parseInt(form.quantity),
        unit_price: parseFloat(form.unit_price),
      }),
    });
    setForm({ item_id: "", location_id: "", quantity: 1, unit_price: "", vendor: "", purchase_date: new Date().toISOString().split("T")[0], notes: "" });
    setShowForm(false);
    fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this purchase record? (Inventory will not be adjusted)")) return;
    await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  const totalSpent = purchases.reduce((sum, p) => sum + p.quantity * p.unit_price, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
          <p className="text-sm text-slate-500 mt-1">Track what you buy and how much you spend</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Log Purchase
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Purchases</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">{purchases.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Total Spent</p>
          <p className="text-xl md:text-2xl font-bold text-green-700">${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Avg/Purchase</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">
            ${purchases.length > 0 ? (totalSpent / purchases.length).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Log New Purchase</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item *</label>
              <select required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.part_number ? `(${i.part_number})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Received At *</label>
              <select required value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price ($) *</label>
              <input type="number" min="0" step="0.01" required value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
              <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Grainger, Amazon" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" required value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes" />
            </div>
          </div>
          {form.quantity && form.unit_price && (
            <div className="mt-3 text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">${(parseFloat(form.quantity) * parseFloat(form.unit_price)).toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Log Purchase</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Unit Price</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{p.purchase_date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{p.item_name}</div>
                  {p.part_number && <div className="text-xs text-slate-400 font-mono">{p.part_number}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.location_name}</td>
                <td className="px-4 py-3 text-center text-slate-600">{p.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">${p.unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">${(p.quantity * p.unit_price).toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-600">{p.vendor || "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 && (
          <div className="text-center py-8 text-slate-400">No purchases recorded yet.</div>
        )}
      </div>
    </div>
  );
}
