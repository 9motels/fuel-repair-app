"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());
  const [locations, setLocations] = useState([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // null | 'sending' | 'sent' | 'failed'
  const [emailError, setEmailError] = useState("");

  // Load locations once.
  useEffect(() => {
    fetch("/api/locations").then((r) => r.json()).then(setLocations).catch(() => {});
  }, []);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: fromDate, to: toDate });
      if (selectedLocationIds.length) qs.set("location_id", selectedLocationIds.join(","));
      const res = await fetch(`/api/reports/summary?${qs.toString()}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, selectedLocationIds]);

  // Debounced fetch when filters change.
  useEffect(() => {
    const t = setTimeout(fetchSummary, 250);
    return () => clearTimeout(t);
  }, [fetchSummary]);

  function toggleLocation(id) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function emailReport() {
    setEmailStatus("sending"); setEmailError("");
    try {
      const res = await fetch("/api/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate, location_ids: selectedLocationIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmailStatus("failed");
        setEmailError(json.error || "Unknown error");
      } else {
        setEmailStatus("sent");
      }
    } catch (e) {
      setEmailStatus("failed");
      setEmailError(e.message || "Send failed");
    }
  }

  function setPreset(days) {
    setFromDate(daysAgoStr(days));
    setToDate(todayStr());
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Reports</h1>
      <p className="text-sm text-slate-500 mb-4">Repair spend, top parts, and trends across your locations.</p>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-5 sticky top-0 z-10">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button
            onClick={emailReport}
            disabled={emailStatus === "sending"}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {emailStatus === "sending" ? "Sending…" : emailStatus === "sent" ? "Sent ✓" : "Email Report"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-xs text-slate-500 mr-1 mt-1">Quick:</span>
          <PresetButton onClick={() => setPreset(7)}>7d</PresetButton>
          <PresetButton onClick={() => setPreset(30)}>30d</PresetButton>
          <PresetButton onClick={() => setPreset(90)}>90d</PresetButton>
          <PresetButton onClick={() => setPreset(365)}>1y</PresetButton>
        </div>

        {locations.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1.5">Locations (none = all):</p>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((l) => {
                const on = selectedLocationIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLocation(l.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {emailStatus === "failed" && (
          <div className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded p-2">
            Email failed: {emailError}
          </div>
        )}
      </div>

      {loading && !data && <p className="text-sm text-slate-400">Loading…</p>}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <SummaryCard label="Total Spend" value={fmt(data.totals.spend)} highlight />
            <SummaryCard label="Parts Cost" value={fmt(data.totals.parts_cost)} />
            <SummaryCard label="Closed" value={data.totals.repairs_closed} />
            <SummaryCard label="Open" value={data.totals.repairs_open} />
          </div>

          <Section title="Spend by Location">
            <Table
              headers={["Location", "Repairs", "Total"]}
              align={["left", "center", "right"]}
              empty="No repairs in this range"
              rows={data.by_location.map((r) => [
                r.location_name,
                r.repair_count,
                <span className="font-semibold">{fmt(r.total_cost)}</span>,
              ])}
            />
          </Section>

          <Section title="Top 10 Parts by Cost">
            <Table
              headers={["Part", "Qty", "Total"]}
              align={["left", "center", "right"]}
              empty="No parts used in this range"
              rows={data.top_parts.map((p) => [
                <div>
                  <div className="font-medium">{p.item_name}</div>
                  {p.part_number && <div className="font-mono text-xs text-slate-400">{p.part_number}</div>}
                </div>,
                p.total_qty,
                <span className="font-semibold">{fmt(p.total_cost)}</span>,
              ])}
            />
          </Section>

          {data.by_pump.length > 0 && (
            <Section title="Cost per Pump" subtitle="Tap a row to see that pump's full repair history">
              <Table
                headers={["Location", "Pump", "Repairs", "Total"]}
                align={["left", "center", "center", "right"]}
                empty="No pump repairs in this range"
                rows={data.by_pump.map((r) => [
                  <Link href={`/pumps/${r.location_id}/${r.pump_number}`} className="text-blue-600 hover:underline">
                    {r.location_name}
                  </Link>,
                  <Link href={`/pumps/${r.location_id}/${r.pump_number}`} className="text-blue-600 hover:underline">
                    Pump {r.pump_number}
                  </Link>,
                  r.repair_count,
                  <span className="font-semibold">{fmt(r.total_cost)}</span>,
                ])}
              />
            </Section>
          )}

          <Section title="Monthly Trend">
            <Table
              headers={["Month", "Repairs", "Total"]}
              align={["left", "center", "right"]}
              empty="No data"
              rows={data.by_month.map((r) => [
                r.month,
                r.repair_count,
                <span className="font-semibold">{fmt(r.total_cost)}</span>,
              ])}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function PresetButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="text-xs px-2.5 py-1 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
      {children}
    </button>
  );
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
      <p className="text-xs md:text-sm text-slate-500">{label}</p>
      <p className={`text-xl md:text-2xl font-bold mt-1 ${highlight ? "text-green-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mb-2">{subtitle}</p>}
      {children}
    </div>
  );
}

function Table({ headers, align, rows, empty }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[360px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`px-4 py-3 font-medium text-slate-600 text-${align?.[i] || "left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-6 text-center text-slate-400">{empty}</td>
            </tr>
          ) : rows.map((cells, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {cells.map((c, j) => (
                <td key={j} className={`px-4 py-3 text-slate-700 text-${align?.[j] || "left"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
