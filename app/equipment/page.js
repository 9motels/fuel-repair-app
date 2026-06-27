"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { reminderStatus } from "@/lib/vehicleReminders";

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [due, setDue] = useState([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setLocations(Array.isArray(d) ? d : []));
    fetch("/api/equipment/service-due")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDue(Array.isArray(d) ? d : []));
  }, []);

  // Worst service status per equipment (overdue beats due-soon).
  const worstByEquip = {};
  due.forEach((r) => {
    const lvl = reminderStatus(r, 0).level;
    if (lvl !== "overdue" && lvl !== "soon") return;
    if (worstByEquip[r.equipment_id] === "overdue") return;
    if (lvl === "overdue" || !worstByEquip[r.equipment_id]) worstByEquip[r.equipment_id] = lvl;
  });

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

  const q = search.trim().toLowerCase();
  const filteredEquipment = q
    ? equipment.filter((e) =>
        [e.name, e.make, e.model, e.serial, e.category].some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q)
        )
      )
    : equipment;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Equipment</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          placeholder="Search name, make, model, serial, category…"
          className="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[16rem]"
        />
      </div>

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400">Loading…</div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">No equipment yet</p>
          <p className="text-sm mt-1">Add your first machine to get started</p>
        </div>
      ) : filteredEquipment.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">No matching equipment</p>
          <p className="text-sm mt-1">Try a different search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEquipment.map((e) => {
            const thumb = Array.isArray(e.photo_urls) ? e.photo_urls[0] : null;
            const title =
              e.name || [e.make, e.model].filter(Boolean).join(" ") || "Untitled equipment";
            return (
              <Link
                key={e.id}
                href={`/equipment/${e.id}`}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>🛠️</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h3>
                  {(e.make || e.model) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[e.make, e.model].filter(Boolean).join(" ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {e.category ? `${e.category} · ` : ""}
                    {e.location_name}
                  </p>
                  {worstByEquip[e.id] && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        worstByEquip[e.id] === "overdue"
                          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {worstByEquip[e.id] === "overdue" ? "Service overdue" : "Service due soon"}
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
