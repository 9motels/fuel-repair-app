"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [filterLocation, setFilterLocation] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(null); // track which item is saving
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
    const key = `${item_id}-${location_id}`;
    setSaving(key);
    await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, location_id, quantity }),
    });
    setEditingCell(null);
    await fetchAll();
    setSaving(null);
  }

  async function quickAdjust(itemId, locationId, currentQty, delta) {
    const newQty = currentQty + delta;
    const key = `${itemId}-${locationId}`;
    setSaving(key);

    // Optimistic update
    setInventory(prev => prev.map(inv =>
      String(inv.item_id) === String(itemId) && String(inv.location_id) === String(locationId)
        ? { ...inv, quantity: newQty }
        : inv
    ));

    await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: parseInt(itemId), location_id: parseInt(locationId), quantity: newQty }),
    });
    setSaving(null);
  }

  function startEdit(itemId, locationId, currentQty) {
    setEditingCell({ itemId, locationId });
    setEditValue(currentQty.toString());
    setTimeout(() => inputRef.current?.select(), 50);
  }

  function handleEditKeyDown(e, itemId, locationId) {
    if (e.key === "Enter") {
      saveQty(parseInt(itemId), parseInt(locationId), parseInt(editValue) || 0);
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

  const isSingleLocation = !!filterLocation;

  return (
    <div>
      {/* Sticky header with location selector */}
      <div className="sticky top-0 z-10 bg-slate-50 -mx-4 px-4 pt-2 pb-3 md:-mx-6 md:px-6 border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
        </div>
        <select value={filterLocation} onChange={(e) => { setFilterLocation(e.target.value); setEditingCell(null); }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Locations</option>
          {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}{l.is_central ? " (Central)" : ""}</option>)}
        </select>
      </div>

      {/* Item cards */}
      <div className="space-y-2 mt-3">
        {Object.entries(groupedByItem).map(([itemId, data]) => {
          const isLow = data.min_quantity > 0 && data.total <= data.min_quantity;

          return (
            <div key={itemId} className={`bg-white rounded-xl shadow-sm border p-3 ${isLow ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
              {/* Item header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{data.item_name}</p>
                  <div className="flex items-center gap-2">
                    {data.part_number && <span className="text-xs text-slate-400 font-mono">{data.part_number}</span>}
                    {data.category && <span className="text-xs text-slate-400">{data.category}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className={`text-base font-bold ${isLow ? "text-red-600" : "text-slate-900"}`}>{data.total}</span>
                  <span className="text-xs text-slate-400 ml-1">total</span>
                  {isLow && <p className="text-xs text-red-500 font-medium">Min: {data.min_quantity}</p>}
                </div>
              </div>

              {/* Location quantities with +/- buttons */}
              {isSingleLocation ? (
                /* Single location view */
                (() => {
                  const locId = filterLocation;
                  const inv = data.locations[locId];
                  const qty = inv ? Number(inv.quantity) : 0;
                  const isEditing = editingCell?.itemId === itemId && editingCell?.locationId === locId;
                  const isSaving = saving === `${itemId}-${locId}`;

                  return (
                    <div className="flex items-center justify-between mt-2 bg-slate-50 rounded-lg px-3 py-2">
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input ref={inputRef} type="number" value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleEditKeyDown(e, itemId, locId)}
                            className="w-20 border border-blue-400 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                          <button onClick={() => saveQty(parseInt(itemId), parseInt(locId), parseInt(editValue) || 0)}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">Save</button>
                          <button onClick={() => setEditingCell(null)}
                            className="text-slate-400 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => quickAdjust(itemId, locId, qty, -1)} disabled={isSaving}
                            className="w-10 h-10 flex items-center justify-center bg-red-100 text-red-700 rounded-lg text-xl font-bold hover:bg-red-200 active:bg-red-300 disabled:opacity-50">
                            −
                          </button>
                          <button onClick={() => startEdit(itemId, locId, qty)}
                            className={`text-2xl font-bold min-w-[3rem] text-center ${isSaving ? "text-slate-400" : "text-slate-900"}`}>
                            {qty}
                          </button>
                          <button onClick={() => quickAdjust(itemId, locId, qty, 1)} disabled={isSaving}
                            className="w-10 h-10 flex items-center justify-center bg-green-100 text-green-700 rounded-lg text-xl font-bold hover:bg-green-200 active:bg-green-300 disabled:opacity-50">
                            +
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()
              ) : (
                /* All locations view */
                <div className="space-y-1.5 mt-2">
                  {locations.map((l) => {
                    const locId = String(l.id);
                    const inv = data.locations[locId];
                    const qty = inv ? Number(inv.quantity) : 0;
                    const isEditing = editingCell?.itemId === itemId && editingCell?.locationId === locId;
                    const isSaving = saving === `${itemId}-${locId}`;

                    return (
                      <div key={l.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-slate-600 truncate mr-2 flex-1">{l.name}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input ref={inputRef} type="number" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, itemId, locId)}
                              className="w-14 border border-blue-400 rounded px-1 py-0.5 text-sm text-center focus:outline-none" autoFocus />
                            <button onClick={() => saveQty(parseInt(itemId), parseInt(locId), parseInt(editValue) || 0)}
                              className="text-blue-600 text-xs font-semibold">OK</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => quickAdjust(itemId, locId, qty, -1)} disabled={isSaving}
                              className="w-7 h-7 flex items-center justify-center bg-red-100 text-red-700 rounded text-sm font-bold hover:bg-red-200 active:bg-red-300 disabled:opacity-50">
                              −
                            </button>
                            <button onClick={() => startEdit(itemId, locId, qty)}
                              className={`text-sm font-semibold min-w-[2rem] text-center ${isSaving ? "text-slate-400" : qty === 0 ? "text-slate-400" : "text-slate-900"}`}>
                              {qty}
                            </button>
                            <button onClick={() => quickAdjust(itemId, locId, qty, 1)} disabled={isSaving}
                              className="w-7 h-7 flex items-center justify-center bg-green-100 text-green-700 rounded text-sm font-bold hover:bg-green-200 active:bg-green-300 disabled:opacity-50">
                              +
                            </button>
                          </div>
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
