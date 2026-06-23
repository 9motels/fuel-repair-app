"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePerson } from "@/lib/personContext";
import { itemUnitCost } from "@/lib/itemCost";

// Pre-pick an existing item for an extracted invoice line: part number first,
// then name match. Falls back to "new" so unmatched lines create a new item.
function matchItemId(line, items) {
  const pn = (line.part_number || "").trim().toLowerCase();
  if (pn) {
    const byPn = items.find((i) => (i.part_number || "").trim().toLowerCase() === pn);
    if (byPn) return String(byPn.id);
  }
  const desc = (line.description || "").trim().toLowerCase();
  if (desc) {
    const exact = items.find((i) => i.name.trim().toLowerCase() === desc);
    if (exact) return String(exact.id);
    const partial = items.find(
      (i) => desc.includes(i.name.trim().toLowerCase()) || i.name.trim().toLowerCase().includes(desc)
    );
    if (partial) return String(partial.id);
  }
  return "new";
}

function normalizeDate(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export default function PurchasesPage() {
  const { currentPerson } = usePerson();
  const [purchases, setPurchases] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    item_id: "", location_id: "", quantity: 1, unit_price: "", vendor: "", purchase_date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [error, setError] = useState("");

  // --- Invoice scan state ---
  const [showScan, setShowScan] = useState(false);
  const [scanLocation, setScanLocation] = useState("");
  const [scanUpload, setScanUpload] = useState(null); // { url, isPdf, name }
  const [scanning, setScanning] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanError, setScanError] = useState("");
  const [draftVendor, setDraftVendor] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      if (filterFromDate && p.purchase_date < filterFromDate) return false;
      if (filterToDate && p.purchase_date > filterToDate) return false;
      if (!q) return true;
      const hay = [
        p.item_name, p.part_number, p.location_name, p.vendor, p.notes, p.created_by_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [purchases, searchQuery, filterFromDate, filterToDate]);

  const filtersActive = searchQuery || filterFromDate || filterToDate;
  function clearFilters() {
    setSearchQuery(""); setFilterFromDate(""); setFilterToDate("");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, iRes, lRes] = await Promise.all([
          fetch("/api/purchases"),
          fetch("/api/items"),
          fetch("/api/locations"),
        ]);
        if (!pRes.ok || !iRes.ok || !lRes.ok) throw new Error("Failed to load data");
        const [p, i, l] = await Promise.all([pRes.json(), iRes.json(), lRes.json()]);
        if (!cancelled) { setPurchases(p); setItems(i); setLocations(l); }
      } catch {
        if (!cancelled) setError("Could not load purchases. Please refresh to try again.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function fetchAll() {
    try {
      const [pRes, iRes, lRes] = await Promise.all([
        fetch("/api/purchases"),
        fetch("/api/items"),
        fetch("/api/locations"),
      ]);
      if (!pRes.ok || !iRes.ok || !lRes.ok) throw new Error("Failed to load data");
      setPurchases(await pRes.json());
      setItems(await iRes.json());
      setLocations(await lRes.json());
      setError("");
    } catch {
      setError("Could not load purchases. Please refresh to try again.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        item_id: parseInt(form.item_id),
        location_id: parseInt(form.location_id),
        quantity: parseInt(form.quantity),
        unit_price: parseFloat(form.unit_price),
        created_by_id: currentPerson?.id ?? null,
      }),
    });
    setForm({ item_id: "", location_id: "", quantity: 1, unit_price: "", vendor: "", purchase_date: new Date().toISOString().split("T")[0], notes: "" });
    setShowForm(false);
    fetchAll();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this purchase record? (Inventory will not be adjusted)")) return;
    await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  // --- Invoice scan flow ---
  function openScan() {
    setShowForm(false);
    setShowScan(true);
  }

  function resetScan() {
    setShowScan(false);
    setScanLocation("");
    setScanUpload(null);
    setScanning(false);
    setExtracting(false);
    setScanError("");
    setDraftVendor("");
    setDraftDate("");
    setDraftLines([]);
  }

  async function handleInvoiceFiles(fileList) {
    const file = (fileList || [])[0];
    if (!file) return;
    setScanError("");
    setDraftLines([]);
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/purchases/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setScanUpload({ url: data.url, isPdf: !!data.isPdf, name: file.name || "invoice" });
    } catch (e) {
      setScanError(e.message || "Upload failed.");
    } finally {
      setScanning(false);
    }
  }

  async function handleExtract() {
    if (!scanUpload) return;
    setScanError("");
    setExtracting(true);
    try {
      const res = await fetch("/api/purchases/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: scanUpload.url, isPdf: scanUpload.isPdf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the invoice.");
      setDraftVendor(data.vendor || "");
      setDraftDate(normalizeDate(data.invoice_date) || new Date().toISOString().split("T")[0]);
      const lines = (Array.isArray(data.line_items) ? data.line_items : []).map((l) => ({
        description: l.description || "",
        part_number: l.part_number || "",
        quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
        unit_price: Number(l.unit_price) >= 0 ? Number(l.unit_price) : 0,
        item_id: matchItemId(l, items),
        include: true,
      }));
      setDraftLines(lines);
      if (lines.length === 0) {
        setScanError("No line items were found on this invoice. You can still log purchases manually.");
      }
    } catch (e) {
      setScanError(e.message || "Could not read the invoice.");
    } finally {
      setExtracting(false);
    }
  }

  function updateLine(idx, patch) {
    setDraftLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const includedLines = draftLines.filter((l) => l.include);
  const invoiceTotal = includedLines.reduce(
    (s, l) => s + (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0
  );

  async function handleSaveInvoice() {
    if (!scanLocation) { setScanError("Pick where these items were received first."); return; }
    if (includedLines.length === 0) { setScanError("Select at least one line to add."); return; }
    setSaving(true);
    setScanError("");
    // Cache items created during this save so a repeated line doesn't create dupes.
    const createdCache = {};
    const itemsById = {};
    items.forEach((it) => { itemsById[it.id] = it; });
    try {
      for (const line of includedLines) {
        const qty = parseInt(line.quantity) || 0;
        if (qty <= 0) continue;
        const price = parseFloat(line.unit_price) || 0;
        let itemId = line.item_id;
        if (itemId === "new") {
          const key = `${(line.description || "").trim().toLowerCase()}|${(line.part_number || "").trim().toLowerCase()}`;
          if (createdCache[key]) {
            itemId = createdCache[key];
          } else {
            const iRes = await fetch("/api/items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: (line.description || "Item").slice(0, 120),
                part_number: line.part_number || "",
                unit_cost: price,
              }),
            });
            if (!iRes.ok) throw new Error(`Could not create item: ${line.description || ""}`);
            const created = await iRes.json();
            itemId = created.id;
            createdCache[key] = itemId;
          }
        } else {
          // Existing item: auto-update its "Cost each" to the newest invoice price
          // (preserving its other fields). Skip if the price hasn't changed.
          const existing = itemsById[itemId];
          if (existing && price > 0 && itemUnitCost(existing) !== price) {
            await fetch("/api/items", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...existing, unit_cost: price }),
            });
          }
        }
        const pRes = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: parseInt(itemId),
            location_id: parseInt(scanLocation),
            quantity: qty,
            unit_price: price,
            vendor: draftVendor || "",
            purchase_date: draftDate,
            notes: "From invoice scan",
            created_by_id: currentPerson?.id ?? null,
          }),
        });
        if (!pRes.ok) throw new Error(`Could not log purchase for: ${line.description || ""}`);
      }
      resetScan();
      fetchAll();
    } catch (e) {
      setScanError(e.message || "Could not save purchases.");
    } finally {
      setSaving(false);
    }
  }

  const totalSpent = purchases.reduce((sum, p) => sum + p.quantity * p.unit_price, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
          <p className="text-sm text-slate-500 mt-1">Track what you buy and how much you spend</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => (showScan ? resetScan() : openScan())}
            disabled={!currentPerson}
            title={!currentPerson ? "Pick who you are first" : ""}
            className="bg-white text-blue-700 border border-blue-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Scan Invoice
          </button>
          <button
            onClick={() => { setShowScan(false); setShowForm(!showForm); }}
            disabled={!currentPerson}
            title={!currentPerson ? "Pick who you are first" : ""}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Log Purchase
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Purchases</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">{purchases.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Total Spent</p>
          <p className="text-xl md:text-2xl font-bold text-green-700">${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4">
          <p className="text-xs md:text-sm text-slate-500">Avg/Purchase</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">
            ${purchases.length > 0 ? (totalSpent / purchases.length).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </p>
        </div>
      </div>

      {/* Invoice scan panel */}
      {showScan && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold">Scan an Invoice</h2>
            <button type="button" onClick={resetScan} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
          <p className="text-sm text-slate-500 mb-4">Pick where the items landed, upload the invoice, and let AI itemize it. Nothing is saved until you review and confirm.</p>

          {scanError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{scanError}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Received At *</label>
              <select
                value={scanLocation}
                onChange={(e) => setScanLocation(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice (photo or PDF)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center gap-2 border border-slate-300 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload File
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { handleInvoiceFiles(e.target.files); e.target.value = ""; }} />
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { handleInvoiceFiles(e.target.files); e.target.value = ""; }} />
            </div>
          </div>

          {/* Uploaded file preview + extract trigger */}
          {scanning && <p className="text-sm text-slate-500">Uploading…</p>}
          {scanUpload && !scanning && (
            <div className="flex items-center gap-4 mb-4">
              {scanUpload.isPdf ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2">
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4z" /></svg>
                  {scanUpload.name}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scanUpload.url} alt="Invoice preview" className="h-24 w-auto rounded-lg border border-slate-200 object-contain" />
              )}
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {extracting ? "Reading invoice…" : draftLines.length ? "Re-read invoice" : "Read invoice with AI"}
              </button>
            </div>
          )}

          {/* Review table */}
          {draftLines.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
                  <input type="text" value={draftVendor} onChange={(e) => setDraftVendor(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-2">Review each line. Match it to an existing item or leave it as “➕ New item” to create one. Uncheck anything you don’t want. Saving sets each matched item’s “Cost each” to the price shown.</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">From invoice</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Item</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-20">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">Unit Price</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftLines.map((line, idx) => (
                      <tr key={idx} className={`border-b border-slate-100 ${line.include ? "" : "opacity-40"}`}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={line.include} onChange={(e) => updateLine(idx, { include: e.target.checked })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{line.description || "—"}</div>
                          {line.part_number && <div className="text-xs text-slate-400 font-mono">{line.part_number}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.item_id}
                            onChange={(e) => updateLine(idx, { item_id: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="new">➕ New item</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>{i.name}{i.part_number ? ` (${i.part_number})` : ""}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="1" value={line.quantity}
                            onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="0.01" value={line.unit_price}
                            onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">
                          ${((parseInt(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                <p className="text-sm text-slate-600">
                  {includedLines.length} of {draftLines.length} lines &middot; total <span className="font-semibold text-slate-900">${invoiceTotal.toFixed(2)}</span>
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={resetScan} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
                  <button
                    type="button"
                    onClick={handleSaveInvoice}
                    disabled={saving || !scanLocation || includedLines.length === 0}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving…" : `Add ${includedLines.length} ${includedLines.length === 1 ? "purchase" : "purchases"}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Log New Purchase</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item *</label>
              <select required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.part_number ? `(${i.part_number})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Received At *</label>
              <select required value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price ($) *</label>
              <input type="number" min="0" step="0.01" required value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
              <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Grainger, Amazon" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" required value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes" />
            </div>
          </div>
          {form.quantity && form.unit_price && (
            <div className="mt-3 text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">${(parseFloat(form.quantity) * parseFloat(form.unit_price)).toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Log Purchase</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      {!showForm && !showScan && purchases.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-2 items-end">
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by item, vendor, location, person…"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input
              type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="From date" />
            <input
              type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="To date" />
          </div>
          {filtersActive && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">Showing {filteredPurchases.length} of {purchases.length}</p>
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Unit Price</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Logged by</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{p.purchase_date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{p.item_name}</div>
                  {p.part_number && <div className="text-xs text-slate-400 font-mono">{p.part_number}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.location_name}</td>
                <td className="px-4 py-3 text-center text-slate-600">{p.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">${p.unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">${(p.quantity * p.unit_price).toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-600">{p.vendor || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{p.created_by_name || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 && (
          <div className="text-center py-8 text-slate-400">No purchases recorded yet.</div>
        )}
        {purchases.length > 0 && filteredPurchases.length === 0 && (
          <div className="text-center py-6 text-slate-400 text-sm">
            No purchases match your filters.
            <button onClick={clearFilters} className="text-blue-600 hover:underline ml-1">Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
