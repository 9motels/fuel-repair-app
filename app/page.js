"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { itemUnitCost } from "@/lib/itemCost";
import { reminderStatus, reminderDueLabel } from "@/lib/vehicleReminders";

export default function Dashboard() {
  const [data, setData] = useState({ locations: [], alerts: [], purchases: [], transfers: [], repairs: [], inventory: [], equipment: [], items: [], vehicles: [], serviceDue: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const [locRes, alertRes, purchRes, transRes, repRes, invRes, eqRes, itemRes, vehRes, dueRes] = await Promise.all([
        fetch("/api/locations"),
        fetch("/api/alerts"),
        fetch("/api/purchases"),
        fetch("/api/transfers"),
        fetch("/api/repairs"),
        fetch("/api/inventory"),
        fetch("/api/equipment"),
        fetch("/api/items"),
        fetch("/api/vehicles"),
        fetch("/api/vehicles/service-due"),
      ]);
      setData({
        locations: await locRes.json(),
        alerts: await alertRes.json(),
        purchases: await purchRes.json(),
        transfers: await transRes.json(),
        repairs: await repRes.json(),
        inventory: await invRes.json(),
        equipment: await eqRes.json(),
        items: await itemRes.json(),
        vehicles: await vehRes.json(),
        serviceDue: await dueRes.json(),
      });
      setLoading(false);
    }
    fetchAll();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading dashboard...</div>;
  }

  const totalItems = new Set(data.inventory.map((i) => i.item_id)).size;
  const totalSpent = data.purchases.reduce((sum, p) => sum + p.quantity * p.unit_price, 0);

  // Value of inventory on hand = qty x the item's cost. Cost is the item's
  // "Cost each" (unit_cost, or a price parsed from its description), falling back
  // to its weighted-average purchase price when no cost is recorded.
  const itemsById = {};
  data.items.forEach((it) => { itemsById[it.id] = it; });
  const spendByItem = {};
  const qtyByItem = {};
  data.purchases.forEach((p) => {
    spendByItem[p.item_id] = (spendByItem[p.item_id] || 0) + p.quantity * p.unit_price;
    qtyByItem[p.item_id] = (qtyByItem[p.item_id] || 0) + p.quantity;
  });
  const costForItem = (itemId) => {
    const fromItem = itemUnitCost(itemsById[itemId]);
    if (fromItem > 0) return fromItem;
    return qtyByItem[itemId] ? spendByItem[itemId] / qtyByItem[itemId] : 0;
  };
  const inventoryValue = data.inventory.reduce((sum, i) => sum + i.quantity * costForItem(i.item_id), 0);

  // Vehicle service that's overdue or coming due, most urgent first.
  const RANK = { overdue: 0, soon: 1 };
  const serviceDue = (data.serviceDue || [])
    .map((r) => ({ ...r, s: reminderStatus(r, r.vehicle_odometer) }))
    .filter((r) => r.s.level === "overdue" || r.s.level === "soon")
    .sort((a, b) => {
      if (RANK[a.s.level] !== RANK[b.s.level]) return RANK[a.s.level] - RANK[b.s.level];
      const am = a.s.milesLeft != null ? a.s.milesLeft : Infinity;
      const bm = b.s.milesLeft != null ? b.s.milesLeft : Infinity;
      return am - bm;
    });
  const overdueCount = serviceDue.filter((r) => r.s.level === "overdue").length;
  const vehicleTitle = (r) => r.vehicle_name || [r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle";

  const stockByLocation = {};
  data.inventory.forEach((inv) => {
    if (!stockByLocation[inv.location_id]) {
      stockByLocation[inv.location_id] = { name: inv.location_name, is_central: inv.is_central, totalQty: 0, itemCount: 0 };
    }
    stockByLocation[inv.location_id].totalQty += inv.quantity;
    stockByLocation[inv.location_id].itemCount++;
  });

  const recentPurchases = data.purchases.slice(0, 5);
  const recentTransfers = data.transfers.slice(0, 5);
  const recentRepairs = data.repairs.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Fuel Repair Inventory Overview</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/equipment"
            className="bg-white text-blue-700 border border-blue-300 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
          >
            Equipment
          </Link>
          <Link
            href="/repairs?new=1"
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + Log Repair
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5">
          <p className="text-xs md:text-sm text-slate-500">Locations</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{data.locations.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5">
          <p className="text-xs md:text-sm text-slate-500">Unique Items</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5">
          <p className="text-xs md:text-sm text-slate-500">Inventory Value</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">${inventoryValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">on hand, at item cost</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5">
          <p className="text-xs md:text-sm text-slate-500">Total Spent</p>
          <p className="text-2xl md:text-3xl font-bold text-green-700 mt-1">${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <Link href="/equipment" className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5 hover:border-blue-300 transition-colors">
          <p className="text-xs md:text-sm text-slate-500">Equipment</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{data.equipment.length}</p>
        </Link>
        <Link href="/vehicles" className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-5 hover:border-blue-300 transition-colors">
          <p className="text-xs md:text-sm text-slate-500">Vehicles</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{data.vehicles.length}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Low Stock Alerts</h2>
            {data.alerts.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-semibold">{data.alerts.length}</span>
            )}
          </div>
          <div className="p-4">
            {data.alerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">All stock levels are good</p>
            ) : (
              <div className="space-y-3">
                {data.alerts.slice(0, 8).map((alert, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{alert.item_name}</p>
                      <p className="text-xs text-slate-500">Total across all locations</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-red-600">{alert.total_quantity}</span>
                      <span className="text-xs text-slate-400"> / {alert.min_quantity} {alert.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vehicle Service Due */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Vehicle Service Due</h2>
            {serviceDue.length > 0 && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${overdueCount > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {serviceDue.length}
              </span>
            )}
          </div>
          <div className="p-4">
            {serviceDue.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">All vehicles up to date</p>
            ) : (
              <div className="space-y-3">
                {serviceDue.slice(0, 8).map((r) => (
                  <Link key={r.id} href={`/vehicles/${r.vehicle_id}`} className="flex items-center justify-between gap-2 hover:bg-slate-50 -mx-1 px-1 rounded">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{vehicleTitle(r)}</p>
                      <p className="text-xs text-slate-500 truncate">{r.label}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${r.s.level === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                      {r.s.level === "overdue" ? "Overdue" : "Due soon"} · {reminderDueLabel(r.s)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Repairs */}
      <div className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Repairs</h2>
            <Link href="/repairs" className="text-xs text-blue-600 hover:text-blue-800 font-medium">View all</Link>
          </div>
          <div className="p-4">
            {recentRepairs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No repairs yet</p>
            ) : (
              <div className="space-y-3">
                {recentRepairs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.description || "Repair"}</p>
                      <p className="text-xs text-slate-500">{r.repair_date} &middot; {r.location_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">${r.total_cost?.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">{r.items?.length || 0} items</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchases */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Purchases</h2>
            <Link href="/purchases" className="text-xs text-blue-600 hover:text-blue-800 font-medium">View all</Link>
          </div>
          <div className="p-4">
            {recentPurchases.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No purchases yet</p>
            ) : (
              <div className="space-y-3">
                {recentPurchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.item_name}</p>
                      <p className="text-xs text-slate-500">{p.purchase_date} &middot; {p.location_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">${(p.quantity * p.unit_price).toFixed(2)}</p>
                      <p className="text-xs text-slate-400">x{p.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Transfers */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Transfers</h2>
            <Link href="/transfers" className="text-xs text-blue-600 hover:text-blue-800 font-medium">View all</Link>
          </div>
          <div className="p-4">
            {recentTransfers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No transfers yet</p>
            ) : (
              <div className="space-y-3">
                {recentTransfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.item_name}</p>
                      <p className="text-xs text-slate-500">{t.from_location_name} &rarr; {t.to_location_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">x{t.quantity}</p>
                      <p className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick start guide for empty state */}
      {data.locations.length === 0 && (
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-blue-900">Get Started</h3>
          <p className="text-sm text-blue-700 mt-2">
            Start by adding your locations, then add your inventory items and log purchases.
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <Link href="/locations" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              Add Locations
            </Link>
            <Link href="/items" className="bg-white text-blue-700 border border-blue-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50">
              Add Items
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
