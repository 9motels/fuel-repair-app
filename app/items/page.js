"use client";

import { useState, useEffect } from "react";
import { parsePriceFromText, itemUnitCost } from "@/lib/itemCost";

const CATEGORIES = ["Filters", "Hoses", "Pumps", "Fittings", "Valves", "Seals & Gaskets", "Meters", "Nozzles", "Electrical", "Hardware", "Other"];

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", description: "", category: "", part_number: "", unit: "each", min_quantity: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/items");
        if (!res.ok) throw new Error("Failed to load items");
        const json = await res.json();
        if (!cancelled) setItems(json);
      } catch {
        if (!cancelled) setError("Could not load items. Please refresh to try again.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function fetchItems() {
    try {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Failed to load items");
      setItems(await res.json());
      setError("");
    } catch {
      setError("Could not load items. Please refresh to try again.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const method = editing ? "PUT" : "POST";
    const payload = { ...form, unit_cost: parseFloat(form.unit_cost) || 0 };
    const body = editing ? { ...payload, id: editing } : payload;
    await fetch("/api/items", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setForm({ name: "", description: "", category: "", part_number: "", unit: "each", min_quantity: 0, unit_cost: "" });
    setEditing(null);
    setShowForm(false);
    fetchItems();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this item? This will also remove all inventory records for it.")) return;
    await fetch(`/api/items?id=${id}`, { method: "DELETE" });
    fetchItems();
  }

  function startEdit(item) {
    setForm({
      name: item.name, description: item.description, category: item.category,
      part_number: item.part_number, unit: item.unit, min_quantity: item.min_quantity,
      // Pre-fill cost from unit_cost, or the legacy "Unit price: $X" in description.
      unit_cost: Number(item.unit_cost) > 0 ? item.unit_cost : (parsePriceFromText(item.description) || ""),
    });
    setEditing(item.id);
    setShowForm(true);
  }

  const filtered = items.filter((item) => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.part_number.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Items</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your fuel repair parts and supplies</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: "", description: "", category: "", part_number: "", unit: "each", min_quantity: 0, unit_cost: "" }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Item
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Item" : "New Item"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Fuel Filter 10 Micron" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Part Number</label>
              <input type="text" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. FF-10M-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Unit of Measure</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="each">Each</option>
                <option value="box">Box</option>
                <option value="case">Case</option>
                <option value="pair">Pair</option>
                <option value="roll">Roll</option>
                <option value="foot">Foot</option>
                <option value="gallon">Gallon</option>
                <option value="set">Set</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min Quantity (for alerts)</label>
              <input type="number" min="0" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: parseInt(e.target.value) || 0 })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cost each ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00" />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Used to value on-hand inventory on the dashboard.</p>
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? "Update" : "Add"} Item
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
              className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Part #</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Unit</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Min Qty</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Cost each</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                  {item.description && <div className="text-xs text-slate-400 dark:text-slate-500">{item.description}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono">{item.part_number || "-"}</td>
                <td className="px-4 py-3">
                  {item.category ? (
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full">{item.category}</span>
                  ) : "-"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.unit}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.min_quantity || "-"}</td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{itemUnitCost(item) > 0 ? `$${itemUnitCost(item).toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => startEdit(item)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-xs font-medium mr-3">Edit</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 text-xs font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            {items.length === 0 ? "No items yet. Add your first item to get started." : "No items match your search."}
          </div>
        )}
      </div>
    </div>
  );
}
