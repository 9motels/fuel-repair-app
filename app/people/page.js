"use client";

import { useEffect, useState } from "react";

export default function PeoplePage() {
  const [people, setPeople] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/people?all=1");
    const data = await res.json();
    setPeople(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/people?all=1");
      const data = await res.json();
      if (!cancelled) setPeople(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addPerson(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not add this person.");
      setBusy(false);
      return;
    }
    setName("");
    await load();
    setBusy(false);
  }

  async function toggle(p) {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: p.active ? 0 : 1 }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update.");
    } else {
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">People</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Who can be picked as the person doing the work (repairs, transfers, equipment, logs)
        </p>
      </div>

      <form
        onSubmit={addPerson}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 mb-6 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Brandon)"
          className="flex-1 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          disabled={busy}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          Add Person
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 divide-y divide-slate-100">
        {people.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3">
            <span className={p.active ? "text-slate-900 dark:text-slate-100 font-medium" : "text-slate-400 dark:text-slate-500 line-through"}>
              {p.name}
            </span>
            <button
              onClick={() => toggle(p)}
              disabled={busy}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60"
            >
              {p.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {people.length === 0 && (
          <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">No people yet</div>
        )}
      </div>
    </div>
  );
}
