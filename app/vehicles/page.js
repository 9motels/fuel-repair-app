"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { reminderStatus } from "@/lib/vehicleReminders";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [due, setDue] = useState([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setLocations(Array.isArray(d) ? d : []));
    fetch("/api/vehicles/service-due")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDue(Array.isArray(d) ? d : []));
  }, []);

  // Worst service status per vehicle (overdue beats due-soon).
  const worstByVehicle = {};
  due.forEach((r) => {
    const lvl = reminderStatus(r, r.vehicle_odometer).level;
    if (lvl !== "overdue" && lvl !== "soon") return;
    if (worstByVehicle[r.vehicle_id] === "overdue") return;
    if (lvl === "overdue" || !worstByVehicle[r.vehicle_id]) worstByVehicle[r.vehicle_id] = lvl;
  });

  useEffect(() => {
    let cancelled = false;
    const qs = locationFilter ? `?location_id=${locationFilter}` : "";
    fetch(`/api/vehicles${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setVehicles(Array.isArray(d) ? d : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationFilter]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? vehicles.filter((v) =>
        [v.name, v.year, v.make, v.model, v.vin, v.plate, v.vehicle_type].some(
          (val) => typeof val === "string" && val.toLowerCase().includes(q)
        )
      )
    : vehicles;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vehicles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Fleet by location, with photos, service history, and AI help
          </p>
        </div>
        <Link
          href="/vehicles/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Vehicle
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, year, make, model, VIN, plate…"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[16rem]"
        />
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No vehicles yet</p>
          <p className="text-sm mt-1">Add your first vehicle to get started</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No matching vehicles</p>
          <p className="text-sm mt-1">Try a different search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => {
            const thumb = Array.isArray(v.photo_urls) ? v.photo_urls[0] : null;
            const title =
              v.name || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Untitled vehicle";
            const sub = [v.year, v.make, v.model].filter(Boolean).join(" ");
            return (
              <Link
                key={v.id}
                href={`/vehicles/${v.id}`}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex gap-3 hover:border-blue-300 transition-colors"
              >
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-2xl">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>🚚</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 truncate">{title}</h3>
                  {sub && sub !== title && <p className="text-xs text-slate-500 truncate">{sub}</p>}
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {v.plate ? `${v.plate} · ` : ""}
                    {v.location_name}
                  </p>
                  {v.odometer ? (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{Number(v.odometer).toLocaleString()} mi</p>
                  ) : null}
                  {worstByVehicle[v.id] && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        worstByVehicle[v.id] === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {worstByVehicle[v.id] === "overdue" ? "Service overdue" : "Service due soon"}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
