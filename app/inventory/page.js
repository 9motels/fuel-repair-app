"use client";

import { useState, useEffect, useRef } from "react";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [filterLocation, setFilterLocation] = useState("");
  const [editingCell, setEditingCell] = useState(null); // { itemId, locationId }
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [invRes, locRes, itemRes] = await Promise.all([
      fetch("/api/inventory"), fetch("/api/locations"), fetch("/api/items"),
    ]);
    setInventory(await invRes.json());
    setLocations(await locRes.json());
    setItems(await itemRes.json());
  }

  async function saveQty(item_id, location_id, quantity) {
    setSaving(true);
    await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, location_id, quantity }),
    });
    setEditingCell(null);
    await fetchAll();
    setSaving(false);
  }

  function startEdit(itemId, locationId, currentQty) {
    setEditingCell({ itemId, locationId });
    setEditValue(currentQty.toString());
    setTimeout(() => inputRef.current?.select(), 50);
  }

  function handleEditKeyDown(e, itemId, locationId) {
    if (e.key === "Enter") {
      saveQty(itemId, locationId, parseInt(editValue) || 0);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  }

  const filtered = filterLocation
    ? inventory.filter((inv) => String(inv.location_id) === filterLocation)
    : inventory;

  // Group by item
  const groupedByItem = {};
  filtered.forEach((inv) => {
    const itemId = String(inv.item_id);
    if (!groupedByItem[itemId]) {
      groupedByItem[itemId] = {
        item_name: inv.item_name, part_number: inv.part_number,
        category: inv.category, min_quantity: Number(inv.min_quantity),
        unit: inv.unit, locations: {}, total: 0,
      };
    }
    groupedByItem[itemId].locations[inv.location_id] = inv;
    groupedByItem[itemId].total += Number(inv.quantity);
  });

  // Mobile: card-based view when no filter or single location
  const isSingleLocation = !!filterLocation;
  const selectedLocation = filterLocation ? locations.find(l => String(l.id) === filterLocation) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Tap a quantity to edit</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filterLocation} onChange={(e) => { setFilterLocation(e.target.value); setEditingCell(null); }}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Locations</option>
          {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
        </select>
      </div>

      {/* Card-based inventory list (mobile friendly) */}
      <div className="space-y-2">
        {Object.entries(groupedByItem).map(([itemId, data]) => {
          const isLow = data.min_quantity > 0 && data.total <= data.min_quantity;

          return (
            <div key={itemId} className={`bg-white rounded-xl shadow-sm border p-4 ${isLow ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{data.item_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {data.part_number && <span className="text-xs text-slate-400 font-mono">{data.part_number}</span>}
                    {data.category && <span className="text-xs text-slate-400">{data.category}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={`text-lg font-bold ${isLow ? "text-red-600" : "text-slate-900"}`}>{data.total}</p>
                  <p className="text-xs text-slate-400">total {data.unit}</p>
                  {isLow && <p className="text-xs text-red-500 font-medium">Min: {data.min_quantity}</p>}
                </div>
              </div>

              {/* Location breakdown */}
              {isSingleLocation ? (
                /* Single location: just show editable qty */
                <div className="mt-2">
                  {(() => {
                    const inv = data.locations[filterLocation];
                    const qty = inv ? Number(inv.quantity) : 0;
                    const isEditing = editingCell?.itemId === itemId && editingCell?.locationId === filterLocation;

                    return isEditing ? (
                      <div className="flex items-center gap-2">
                        <input ref={inputRef} type="number" value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, parseInt(itemId), parseInt(filterLocation))}
                          onBlur={() => setEditingCell(null)}
                          className="w-20 border border-blue-400 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                        <button onClick={() => saveQty(parseInt(itemId), parseInt(filterLocation), parseInt(editValue) || 0)}
                          disabled={saving}
                          className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                          {saving ? "..." : "Save"}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(itemId, filterLocation, qty)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                        Qty: {qty} — tap to edit
                      </button>
                    );
                  })()}
                </div>
              ) : (
                /* All locations: show grid of counts */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {locations.map((l) => {
                    const locId = String(l.id);
                    const inv = data.locations[locId];
                    const qty = inv ? Number(inv.quantity) : 0;
                    const isEditing = editingCell?.itemId === itemId && editingCell?.locationId === locId;

                    return (
                      <div key={l.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-600 truncate mr-2">{l.name}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input ref={inputRef} type="number" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, parseInt(itemId), parseInt(locId))}
                              onBlur={() => setEditingCell(null)}
                              className="w-14 border border-blue-400 rounded px-1 py-0.5 text-sm text-center focus:outline-none" autoFocus />
                            <button onClick={() => saveQty(parseInt(itemId), parseInt(locId), parseInt(editValue) || 0)}
                              disabled={saving}
                              className="text-blue-600 text-xs font-semibold">
                              {saving ? "..." : "OK"}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(itemId, locId, qty)}
                            className={`text-sm font-semibold min-w-[2rem] text-center ${qty === 0 ? "text-slate-400" : "text-slate-900"}`}>
                            {qty}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(groupedByItem).length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No inventory records yet</p>
          <p className="text-sm mt-1">Add items and purchases to get started</p>
        </div>
      )}
    </div>
  );
}
