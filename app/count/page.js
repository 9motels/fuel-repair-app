"use client";

import { useEffect, useState } from "react";
import { usePerson } from "@/lib/personContext";

const fieldClass =
  "border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_BADGE = {
  open: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  applied: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  cancelled: "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
};

export default function CountPage() {
  const { currentPerson } = usePerson();
  const [locations, setLocations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // start form
  const [startLocation, setStartLocation] = useState("");
  const [starting, setStarting] = useState(false);

  // active session
  const [detail, setDetail] = useState(null); // { ...session, lines, items }
  const [counts, setCounts] = useState({}); // item_id -> string in the inputs
  const [savedCounts, setSavedCounts] = useState({}); // last value persisted per item
  const [search, setSearch] = useState("");
  const [hideCounted, setHideCounted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null); // apply summary banner
  const [error, setError] = useState("");

  async function loadList() {
    const [locRes, sesRes] = await Promise.all([fetch("/api/locations"), fetch("/api/counts")]);
    setLocations(locRes.ok ? await locRes.json() : []);
    setSessions(sesRes.ok ? await sesRes.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    loadList();
  }, []);

  async function openSession(id) {
    setError("");
    const res = await fetch(`/api/counts/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not open that count.");
      return;
    }
    const initial = {};
    for (const line of data.lines || []) {
      if (line.counted_qty !== null && line.counted_qty !== undefined) {
        initial[line.item_id] = String(line.counted_qty);
      }
    }
    setCounts(initial);
    setSavedCounts(initial);
    setSearch("");
    setHideCounted(false);
    setShowReview(false);
    setResult(null);
    setDetail(data);
  }

  async function startCount(e) {
    e.preventDefault();
    if (!startLocation) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: Number(startLocation), created_by_id: currentPerson?.id || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the count.");
      await openSession(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function saveLine(item) {
    const value = counts[item.item_id] ?? "";
    if ((savedCounts[item.item_id] ?? "") === value) return; // unchanged
    const res = await fetch(`/api/counts/${detail.id}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.item_id,
        counted_qty: value === "" ? null : Number(value),
        system_qty: Number(item.quantity) || 0,
      }),
    });
    if (res.ok) {
      setSavedCounts((s) => ({ ...s, [item.item_id]: value }));
    }
  }

  async function cancelCount() {
    if (!confirm("Cancel this count? Entered numbers are kept for reference but nothing is applied.")) return;
    await fetch(`/api/counts/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    setDetail(null);
    setLoading(true);
    await loadList();
  }

  async function applyCount() {
    setApplying(true);
    setError("");
    try {
      const res = await fetch(`/api/counts/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not apply the count.");
      setResult({ location: detail.location_name, counted: data.counted, adjusted: data.adjusted });
      setDetail(null);
      setLoading(true);
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  // ---------- active-count derived state ----------
  const items = detail?.items || [];
  const q = search.trim().toLowerCase();
  const visibleItems = items.filter((it) => {
    if (q && ![it.name, it.part_number].some((v) => typeof v === "string" && v.toLowerCase().includes(q))) return false;
    if (hideCounted && (counts[it.item_id] ?? "") !== "") return false;
    return true;
  });
  const countedItems = items.filter((it) => (counts[it.item_id] ?? "") !== "");
  const discrepancies = countedItems
    .map((it) => ({ ...it, counted: Number(counts[it.item_id]), delta: Number(counts[it.item_id]) - Number(it.quantity) }))
    .filter((it) => it.delta !== 0);
  const unsaved = Object.keys(counts).some((k) => (counts[k] ?? "") !== (savedCounts[k] ?? ""));

  if (loading && !detail) {
    return <div className="text-slate-500 dark:text-slate-400">Loading…</div>;
  }

  // ---------- view: active count ----------
  if (detail) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => { setDetail(null); setLoading(true); loadList(); }} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← All counts
        </button>
        <div className="flex items-start justify-between gap-3 mt-2 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Counting {detail.location_name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {countedItems.length} of {items.length} counted · {discrepancies.length} discrepanc{discrepancies.length === 1 ? "y" : "ies"}
              {unsaved ? " · saving…" : ""}
            </p>
          </div>
          <button onClick={cancelCount} className="text-sm text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 shrink-0 mt-1">
            Cancel count
          </button>
        </div>

        {error && <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">{error}</div>}

        {/* Review & apply */}
        {showReview ? (
          <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 rounded-xl p-5 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Review adjustments</h2>
            {discrepancies.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                Every counted item matches the system — applying just closes the count.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 mb-3">
                {discrepancies.map((it) => (
                  <li key={it.item_id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{it.name}</span>
                    <span className="shrink-0 text-slate-500 dark:text-slate-400">
                      {it.quantity} → <span className="font-semibold text-slate-900 dark:text-slate-100">{it.counted}</span>{" "}
                      <span className={`font-semibold ${it.delta < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                        ({it.delta > 0 ? "+" : ""}{it.delta})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Applying sets on-hand to your counted numbers for the {countedItems.length} counted item{countedItems.length === 1 ? "" : "s"}. Uncounted items are untouched.
            </p>
            <div className="flex gap-2">
              <button onClick={applyCount} disabled={applying || unsaved} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {applying ? "Applying…" : `Apply ${discrepancies.length} adjustment${discrepancies.length === 1 ? "" : "s"}`}
              </button>
              <button onClick={() => setShowReview(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
                Keep counting
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or part number…"
              className={`${fieldClass} flex-1 min-w-[12rem]`}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={hideCounted} onChange={(e) => setHideCounted(e.target.checked)} />
              Hide counted
            </label>
            <button
              onClick={() => setShowReview(true)}
              disabled={countedItems.length === 0}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Review &amp; apply
            </button>
          </div>
        )}

        {/* Checklist */}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No inventory items at this location.</p>
        ) : (
          <ul className="space-y-2">
            {visibleItems.map((it) => {
              const value = counts[it.item_id] ?? "";
              const hasCount = value !== "";
              const delta = hasCount ? Number(value) - Number(it.quantity) : 0;
              const tone = !hasCount
                ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                : delta === 0
                  ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40"
                  : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40";
              return (
                <li key={it.item_id} className={`border rounded-lg p-3 flex items-center gap-3 ${tone}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{it.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {it.part_number ? `${it.part_number} · ` : ""}system: {it.quantity} {it.unit || ""}
                      {hasCount && delta !== 0 && (
                        <span className={`font-semibold ${delta < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {" "}· {delta > 0 ? "+" : ""}{delta}
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={value}
                    placeholder="—"
                    onChange={(e) => setCounts((c) => ({ ...c, [it.item_id]: e.target.value }))}
                    onBlur={() => saveLine(it)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-20 text-center border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // ---------- view: start / history ----------
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Count</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
        Walk a location, enter what&apos;s actually on the shelf, review the differences, and apply
        corrections in one pass.
      </p>

      {result && (
        <div className="text-sm text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg p-3 mb-4">
          Count applied at {result.location}: {result.counted} item{result.counted === 1 ? "" : "s"} counted,{" "}
          {result.adjusted} adjustment{result.adjusted === 1 ? "" : "s"} written.
        </div>
      )}
      {error && <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">{error}</div>}

      <form onSubmit={startCount} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location to count</label>
          <select value={startLocation} onChange={(e) => setStartLocation(e.target.value)} className={`${fieldClass} w-full`}>
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={starting || !startLocation} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {starting ? "Starting…" : "Start count"}
        </button>
      </form>

      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Recent counts</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No counts yet.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center gap-3">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${STATUS_BADGE[s.status] || STATUS_BADGE.cancelled}`}>
                {s.status}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.location_name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {(s.created_at || "").slice(0, 10)}
                  {s.created_by_name ? ` · ${s.created_by_name}` : ""} · {s.counted_count} counted · {s.variance_count} variance{s.variance_count === 1 ? "" : "s"}
                </div>
              </div>
              {s.status === "open" && (
                <button onClick={() => openSession(s.id)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0">
                  Resume
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
