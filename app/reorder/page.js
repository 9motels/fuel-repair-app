"use client";

import { useEffect, useState } from 'react';

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function groupByVendor(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.vendor || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries());
}

export default function ReorderPage() {
  const [rows, setRows] = useState([]);
  const [qtyById, setQtyById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/reorder')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load reorder list');
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setRows(data);
        const initial = {};
        for (const r of data) initial[r.item_id] = r.suggested_qty;
        setQtyById(initial);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function setQty(itemId, value) {
    const n = Math.max(1, Math.floor(Number(value) || 1));
    setQtyById((prev) => ({ ...prev, [itemId]: n }));
  }

  function qtyFor(row) {
    const q = qtyById[row.item_id];
    return q == null ? row.suggested_qty : q;
  }

  function buildOrderText() {
    const groups = groupByVendor(rows);
    const blocks = [];
    for (const [vendor, items] of groups) {
      const header = vendor || 'No vendor on file';
      const lines = items.map((r) => {
        const part = r.part_number ? ` (${r.part_number})` : '';
        return `${qtyFor(r)}x ${r.name}${part}`;
      });
      blocks.push(`${header}\n${lines.join('\n')}`);
    }
    return blocks.join('\n\n');
  }

  function copyList() {
    const text = buildOrderText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const groups = groupByVendor(rows);
  const grandTotal = rows.reduce((sum, r) => sum + qtyFor(r) * (Number(r.unit_cost) || 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Reorder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Items at or below their minimum, grouped by vendor
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={copyList}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {copied ? 'Copied!' : 'Copy list'}
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      {error && !loading && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Nothing needs reordering right now.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-5">
          {groups.map(([vendor, items]) => {
            const subtotal = items.reduce(
              (sum, r) => sum + qtyFor(r) * (Number(r.unit_cost) || 0),
              0
            );
            return (
              <div
                key={vendor || '__none__'}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5"
              >
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  {vendor || 'No vendor on file'}
                </h2>
                <div className="space-y-3">
                  {items.map((row) => {
                    const qty = qtyFor(row);
                    const lineTotal = qty * (Number(row.unit_cost) || 0);
                    return (
                      <div
                        key={row.item_id}
                        className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2"
                      >
                        <div className="min-w-[10rem] flex-1">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {row.name}
                          </div>
                          {row.part_number && (
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {row.part_number}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            on hand {row.on_hand} / min {row.min_quantity}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            value={qty}
                            onChange={(e) => setQty(row.item_id, e.target.value)}
                            className="w-20 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {row.unit}
                          </span>
                        </div>
                        <div className="w-24 text-right text-sm text-slate-700 dark:text-slate-300">
                          {formatMoney(row.unit_cost)}
                        </div>
                        <div className="w-24 text-right text-sm font-medium text-slate-900 dark:text-slate-100">
                          {formatMoney(lineTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-sm text-slate-500 dark:text-slate-400 mr-2">Subtotal</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(subtotal)}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end items-baseline gap-2 px-1">
            <span className="text-sm text-slate-500 dark:text-slate-400">Grand total</span>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(grandTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
