"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

export default function PumpDetailPage({ params }) {
  const { location_id, pump_number } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pumps/${location_id}/${pump_number}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [location_id, pump_number]);

  if (loading) {
    return <div className="text-slate-500">Loading…</div>;
  }
  if (!data || data.error) {
    return <div className="text-red-600">{data?.error || "Not found"}</div>;
  }

  return (
    <div>
      <Link href="/reports" className="text-sm text-blue-600 hover:underline">← Back to Reports</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">
        Pump {data.pump_number} <span className="text-slate-500 font-normal text-lg">at {data.location.name}</span>
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <Card label="Repairs" value={data.repair_count} />
        <Card label="Lifetime Cost" value={`$${data.lifetime_cost.toFixed(2)}`} highlight />
        <Card label="First Repair" value={data.first_repair || "—"} small />
        <Card label="Last Repair" value={data.last_repair || "—"} small />
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Repair history</h2>
      {data.repairs.length === 0 ? (
        <div className="text-slate-400">No repairs on this pump yet.</div>
      ) : (
        <div className="space-y-3">
          {data.repairs.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-semibold text-slate-900">{r.description || "Repair"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.repair_date}
                    <span className="text-slate-400"> · logged by {r.created_by_name || "—"}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      r.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>{r.status === "closed" ? "Closed" : "Open"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">${r.total_cost.toFixed(2)}</div>
                </div>
              </div>
              {r.notes && <div className="text-xs text-slate-500 mt-1">{r.notes}</div>}
              {r.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {it.item_name} x{it.quantity}{" "}
                        <span className="text-slate-400">from {it.source_location_name}</span>
                      </span>
                      <span className="font-medium">${(it.quantity * it.unit_cost).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, highlight, small }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
      <p className="text-xs md:text-sm text-slate-500">{label}</p>
      <p className={`font-bold mt-1 ${highlight ? "text-green-700 text-xl md:text-2xl" : small ? "text-base text-slate-900" : "text-xl md:text-2xl text-slate-900"}`}>{value}</p>
    </div>
  );
}
