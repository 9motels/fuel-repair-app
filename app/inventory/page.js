"use client";

import { useState, useEffect } from "react";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [filterLocation, setFilterLocation] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ item_id: "", location_id: "", quantity: 0 });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [invRes, locRes, itemRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/locations"),
      fetch("/api/items"),
    ]);
    setInventory(await invRes.json());
    setLocations(await locRes.json());
    setItems(await itemRes.json());
  }

  async function handleUpdateQty(item_id, location_id, quantity) {
    await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, location_id, quantity }),
    });
    fetchAll();
  }

  async function handleAddInventory(e) {
    e.preventDefault();
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAddForm({ item_id: "", location_id: "", quantity: 0 });
    setShowAdd(false);
    fetchAll();
  }

  const filtered = filterLocation
    ? inventory.filter((inv) => inv.location_id === parseInt(filterLocation))
    : inventory;

  // Group by item
  const groupedByItem = {};
  filtered.forEach((inv) => {
    if (!groupedByItem[inv.item_id]) {
      groupedByItem[inv.item_id] = {
        item_name: inv.item_name,
        part_number: inv.part_number,
        category: inv.category,
        min_quantity: inv.min_quantity,
        unit: inv.unit,
        locations: {},
        total: 0,
      };
    }
    groupedByItem[inv.item_id].locations[inv.location_id] = inv;
    groupedByItem[inv.item_id].total += inv.quantity;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Stock levels across all locations</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Set Stock
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddInventory} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Set Stock Level</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item *</label>
              <select required value={addForm.item_id} onChange={(e) => setAddForm({ ...addForm, item_id: parseInt(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.part_number ? `(${i.part_number})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location *</label>
              <select required value={addForm.location_id} onChange={(e) => setAddForm({ ...addForm, location_id: parseInt(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
              <input type="number" min="0" value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: parseInt(e.target.value) || 0 })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Set Stock</button>
            <button type="button" onClick={() => setShowAdd(false)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-3 mb-4">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Part #</th>
              {!filterLocation && locations.map((l) => (
                <th key={l.id} className="text-center px-4 py-3 font-medium text-slate-600">{l.name}</th>
              ))}
              {filterLocation && <th className="text-center px-4 py-3 font-medium text-slate-600">Quantity</th>}
              <th className="text-center px-4 py-3 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedByItem).map(([itemId, data]) => {
              const isLow = data.min_quantity > 0 && data.total <= data.min_quantity;
              return (
                <tr key={itemId} className={`border-b border-slate-100 hover:bg-slate-50 ${isLow ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{data.item_name}</div>
                    {data.category && <span className="text-xs text-slate-400">{data.category}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{data.part_number || "-"}</td>
                  {!filterLocation && locations.map((l) => {
                    const inv = data.locations[l.id];
                    const qty = inv ? inv.quantity : 0;
                    const locLow = isLow; // highlight individual cells only if total across all locations is low
                    return (
                      <td key={l.id} className="text-center px-4 py-3">
                        <input
                          type="number" min="0" value={qty}
                          onChange={(e) => handleUpdateQty(parseInt(itemId), l.id, parseInt(e.target.value) || 0)}
                          className={`w-16 text-center border rounded px-1 py-0.5 text-sm ${locLow ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200"}`}
                        />
                      </td>
                    );
                  })}
                  {filterLocation && (
                    <td className="text-center px-4 py-3">
                      {data.locations[parseInt(filterLocation)]?.quantity || 0}
                    </td>
                  )}
                  <td className={`text-center px-4 py-3 font-semibold ${isLow ? "text-red-600" : "text-slate-900"}`}>
                    {data.total} {data.unit}
                    {isLow && <div className="text-xs text-red-500">Low stock (min: {data.min_quantity})</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {Object.keys(groupedByItem).length === 0 && (
          <div className="text-center py-8 text-slate-400">
            No inventory records yet. Add items and set stock levels to get started.
          </div>
        )}
      </div>
    </div>
  );
}
