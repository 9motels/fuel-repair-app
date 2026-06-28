"use client";

import { useEffect, useState } from 'react';

function money(x) {
  return `$${Number(x || 0).toFixed(2)}`;
}

function vehicleName(v) {
  return v.name || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();
}

function equipmentName(e) {
  return e.name || `${e.make || ''} ${e.model || ''}`.trim();
}

export default function InsightsPage() {
  const [data, setData] = useState({ vehicles: [], locations: [], equipment: [] });

  useEffect(() => {
    fetch('/api/reports/maintenance-costs')
      .then((r) => r.json())
      .then((d) =>
        setData({
          vehicles: d.vehicles || [],
          locations: d.locations || [],
          equipment: d.equipment || [],
        })
      )
      .catch(() => setData({ vehicles: [], locations: [], equipment: [] }));
  }, []);

  const equipmentRows = (data.equipment || []).filter((e) => Number(e.total) > 0);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cost Insights</h1>
        <p className="text-slate-500 dark:text-slate-400">Maintenance &amp; repair spend</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Vehicle maintenance spend
        </h2>
        {data.vehicles.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Vehicle</th>
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 text-right">Odometer</th>
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 text-right">Cost/mile</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.map((v) => {
                  const odo = Number(v.odometer) || 0;
                  const total = Number(v.total) || 0;
                  return (
                    <tr key={v.id} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{vehicleName(v)}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{money(total)}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        {odo > 0 ? `${odo.toLocaleString()} mi` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        {odo > 0 ? `$${(total / odo).toFixed(3)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Repair spend by location
        </h2>
        {data.locations.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Location</th>
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.locations.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.name}</td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Repair spend by equipment
        </h2>
        {equipmentRows.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Equipment</th>
                  <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{equipmentName(e)}</td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{money(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
