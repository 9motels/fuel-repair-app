"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setLocations(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qs = locationFilter ? `?location_id=${locationFilter}` : "";
    fetch(`/api/equipment${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEquipment(Array.isArray(d) ? d : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipment</h1>
          <p className="text-sm text-slate-500 mt-1">
            Machines by location, with photos, service history, and AI help
          </p>
        </div>
        <Link
          href="/equipment/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Equipment
        </Link>
      </div>

      <div className="mb-5">
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
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No equipment yet</p>
          <p className="text-sm mt-1">Add your first machine to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map((e) => {
            const thumb = Array.isArray(e.photo_urls) ? e.photo_urls[0] : null;
            const title =
              e.name || [e.make, e.model].filter(Boolean).join(" ") || "Untitled equipment";
            return (
              <Link
                key={e.id}
                href={`/equipment/${e.id}`}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex gap-3 hover:border-blue-300 transition-colors"
              >
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-2xl">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>🛠️</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 truncate">{title}</h3>
                  {(e.make || e.model) && (
                    <p className="text-xs text-slate-500 truncate">
                      {[e.make, e.model].filter(Boolean).join(" ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {e.category ? `${e.category} · ` : ""}
                    {e.location_name}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
