"use client";

import { useState, useEffect } from "react";

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", is_central: false });

  useEffect(() => { fetchLocations(); }, []);

  async function fetchLocations() {
    const res = await fetch("/api/locations");
    setLocations(await res.json());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const method = editing ? "PUT" : "POST";
    const body = editing ? { ...form, id: editing } : form;
    await fetch("/api/locations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setForm({ name: "", address: "", is_central: false });
    setEditing(null);
    setShowForm(false);
    fetchLocations();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this location? This will also remove all inventory at this location.")) return;
    await fetch(`/api/locations?id=${id}`, { method: "DELETE" });
    fetchLocations();
  }

  function startEdit(loc) {
    setForm({ name: loc.name, address: loc.address, is_central: !!loc.is_central });
    setEditing(loc.id);
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your repair sites and central warehouse</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: "", address: "", is_central: false }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Location
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Location" : "New Location"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Main Warehouse, Site A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="123 Main St, City, State"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-4">
            <input
              type="checkbox" checked={form.is_central}
              onChange={(e) => setForm({ ...form, is_central: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">This is the central warehouse / main location</span>
          </label>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? "Update" : "Add"} Location
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
              className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((loc) => (
          <div key={loc.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{loc.name}</h3>
                  {loc.is_central ? (
                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">Central</span>
                  ) : null}
                </div>
                {loc.address && <p className="text-sm text-slate-500 mt-1">{loc.address}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(loc)} className="text-slate-400 hover:text-blue-600 p-1" title="Edit">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleDelete(loc.id)} className="text-slate-400 hover:text-red-600 p-1" title="Delete">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {locations.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No locations yet</p>
          <p className="text-sm mt-1">Add your first location to get started</p>
        </div>
      )}
    </div>
  );
}
