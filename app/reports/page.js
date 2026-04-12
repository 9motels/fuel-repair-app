"use client";

import { useState, useEffect } from "react";

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState({});

  useEffect(() => {
    fetch("/api/locations").then(r => r.json()).then(setLocations);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [month]);

  async function fetchReports() {
    setLoading(true);
    const res = await fetch(`/api/reports?month=${month}`);
    setReports(await res.json());
    setLoading(false);
  }

  function formatMonth(m) {
    const [year, mon] = m.split("-");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[parseInt(mon) - 1]} ${year}`;
  }

  function generateReportText(report) {
    let text = `Fuel Repair Inventory - Monthly Report\n`;
    text += `Location: ${report.location.name}\n`;
    text += `Period: ${formatMonth(report.month)}\n\n`;
    text += `Repairs: ${report.repair_count}\n`;
    text += `Total Parts Cost: $${report.total_cost.toFixed(2)}\n`;
    text += `${"─".repeat(40)}\n\n`;

    if (report.repairs.length > 0) {
      text += `REPAIR DETAILS\n\n`;
      report.repairs.forEach(r => {
        text += `${r.repair_date} — ${r.description || "Repair"}\n`;
        r.items.forEach(i => {
          text += `  • ${i.item_name} x${i.quantity} — $${(i.quantity * i.unit_cost).toFixed(2)}\n`;
          if (i.source_location_name !== report.location.name) {
            text += `    (parts from ${i.source_location_name})\n`;
          }
        });
        text += `  Repair Total: $${r.total_cost.toFixed(2)}\n\n`;
      });

      text += `${"─".repeat(40)}\n`;
      text += `SUMMARY BY ITEM\n\n`;
      report.item_summary.forEach(i => {
        text += `  ${i.item_name.padEnd(35)} x${String(i.total_qty).padEnd(4)} $${i.total_cost.toFixed(2)}\n`;
      });
      text += `${"─".repeat(40)}\n`;
      text += `  ${"TOTAL".padEnd(40)} $${report.total_cost.toFixed(2)}\n`;
    } else {
      text += `No repairs recorded this month.\n`;
    }

    return text;
  }

  function generateReportHTML(report) {
    let html = `<div style="font-family: Arial, sans-serif; max-width: 600px;">`;
    html += `<h2 style="color: #1e293b;">Fuel Repair Inventory - Monthly Report</h2>`;
    html += `<p><strong>Location:</strong> ${report.location.name}<br>`;
    html += `<strong>Period:</strong> ${formatMonth(report.month)}</p>`;
    html += `<table style="width:100%; border-collapse:collapse; margin: 16px 0;">`;
    html += `<tr><td style="padding:8px; background:#f1f5f9;"><strong>Repairs</strong></td><td style="padding:8px; background:#f1f5f9; text-align:right;">${report.repair_count}</td></tr>`;
    html += `<tr><td style="padding:8px;"><strong>Total Parts Cost</strong></td><td style="padding:8px; text-align:right; color:#16a34a; font-weight:bold;">$${report.total_cost.toFixed(2)}</td></tr>`;
    html += `</table>`;

    if (report.repairs.length > 0) {
      html += `<h3 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">Repair Details</h3>`;
      report.repairs.forEach(r => {
        html += `<div style="margin-bottom:16px;">`;
        html += `<p style="margin:0; font-weight:bold;">${r.repair_date} — ${r.description || "Repair"}</p>`;
        html += `<table style="width:100%; margin-top:4px;">`;
        r.items.forEach(i => {
          html += `<tr><td style="padding:2px 8px; font-size:14px;">&bull; ${i.item_name} x${i.quantity}</td>`;
          html += `<td style="padding:2px 8px; font-size:14px; text-align:right;">$${(i.quantity * i.unit_cost).toFixed(2)}</td></tr>`;
        });
        html += `<tr><td style="padding:4px 8px; font-size:14px; font-weight:bold; border-top:1px solid #e2e8f0;">Repair Total</td>`;
        html += `<td style="padding:4px 8px; font-size:14px; font-weight:bold; text-align:right; border-top:1px solid #e2e8f0;">$${r.total_cost.toFixed(2)}</td></tr>`;
        html += `</table></div>`;
      });

      html += `<h3 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">Summary by Item</h3>`;
      html += `<table style="width:100%; border-collapse:collapse;">`;
      html += `<tr style="background:#f1f5f9;"><th style="padding:8px; text-align:left;">Item</th><th style="padding:8px; text-align:center;">Qty</th><th style="padding:8px; text-align:right;">Cost</th></tr>`;
      report.item_summary.forEach(i => {
        html += `<tr><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">${i.item_name}</td>`;
        html += `<td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">${i.total_qty}</td>`;
        html += `<td style="padding:6px 8px; text-align:right; border-bottom:1px solid #f1f5f9;">$${i.total_cost.toFixed(2)}</td></tr>`;
      });
      html += `<tr style="font-weight:bold; background:#f1f5f9;"><td style="padding:8px;">TOTAL</td><td></td>`;
      html += `<td style="padding:8px; text-align:right; color:#16a34a;">$${report.total_cost.toFixed(2)}</td></tr>`;
      html += `</table>`;
    } else {
      html += `<p style="color:#94a3b8;">No repairs recorded this month.</p>`;
    }

    html += `</div>`;
    return html;
  }

  async function emailReport(report) {
    setEmailStatus(prev => ({ ...prev, [report.location.id]: "sending" }));
    try {
      const res = await fetch("/api/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Fuel Repair Report - ${report.location.name} - ${formatMonth(report.month)}`,
          html: generateReportHTML(report),
          text: generateReportText(report),
        }),
      });
      if (res.ok) {
        setEmailStatus(prev => ({ ...prev, [report.location.id]: "sent" }));
      } else {
        setEmailStatus(prev => ({ ...prev, [report.location.id]: "error" }));
      }
    } catch {
      setEmailStatus(prev => ({ ...prev, [report.location.id]: "error" }));
    }
    setTimeout(() => setEmailStatus(prev => ({ ...prev, [report.location.id]: null })), 3000);
  }

  async function emailAll() {
    for (const report of reports.filter(r => r.repair_count > 0)) {
      await emailReport(report);
    }
  }

  const totalAllLocations = reports.reduce((sum, r) => sum + r.total_cost, 0);
  const totalRepairs = reports.reduce((sum, r) => sum + r.repair_count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly repair reports by location</p>
        </div>
        {totalRepairs > 0 && (
          <button onClick={emailAll}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Email All
          </button>
        )}
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-slate-700">Month:</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Overall summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Total Repairs</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">{totalRepairs}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Total Cost</p>
          <p className="text-xl md:text-2xl font-bold text-green-700">${totalAllLocations.toFixed(2)}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading reports...</div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.location.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Location header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{report.location.name}</h3>
                    {report.location.is_central ? (
                      <span className="bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded font-medium">Central</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {report.repair_count} repair{report.repair_count !== 1 ? "s" : ""} &middot; ${report.total_cost.toFixed(2)}
                  </p>
                </div>
                {report.repair_count > 0 && (
                  <button onClick={() => emailReport(report)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      emailStatus[report.location.id] === "sent"
                        ? "bg-green-100 text-green-700"
                        : emailStatus[report.location.id] === "sending"
                        ? "bg-slate-100 text-slate-500"
                        : emailStatus[report.location.id] === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}>
                    {emailStatus[report.location.id] === "sent" ? "Drafted!" :
                     emailStatus[report.location.id] === "sending" ? "Sending..." :
                     emailStatus[report.location.id] === "error" ? "Failed" :
                     "Email Report"}
                  </button>
                )}
              </div>

              {/* Report content */}
              {report.repair_count > 0 ? (
                <div className="p-4">
                  {/* Repair details */}
                  <div className="space-y-3 mb-4">
                    {report.repairs.map((r) => (
                      <div key={r.id} className="border-l-2 border-slate-200 pl-3">
                        <p className="text-sm font-medium text-slate-900">{r.repair_date} — {r.description || "Repair"}</p>
                        <div className="mt-1 space-y-0.5">
                          {r.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-600">
                              <span>{item.item_name} x{item.quantity}</span>
                              <span>${(item.quantity * item.unit_cost).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs font-semibold text-slate-700 mt-1">Repair: ${r.total_cost.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Item summary */}
                  {report.item_summary.length > 0 && (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Summary by Item</p>
                      <div className="space-y-1">
                        {report.item_summary.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-slate-700">{item.item_name} <span className="text-slate-400">x{item.total_qty}</span></span>
                            <span className="font-medium text-slate-900">${item.total_cost.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 mt-2">
                          <span className="text-slate-900">Total</span>
                          <span className="text-green-700">${report.total_cost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-slate-400">No repairs this month</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
