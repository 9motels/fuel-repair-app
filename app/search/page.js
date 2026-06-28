'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const SECTIONS = [
  { key: 'items', label: 'Items', chip: 'Item' },
  { key: 'equipment', label: 'Equipment', chip: 'Equipment' },
  { key: 'vehicles', label: 'Vehicles', chip: 'Vehicle' },
  { key: 'repairs', label: 'Repairs', chip: 'Repair' },
];

const EMPTY = { items: [], equipment: [], vehicles: [], repairs: [] };

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  function runSearch(value) {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data) => {
        setResults(data || EMPTY);
        setLoading(false);
      })
      .catch(() => {
        setResults(EMPTY);
        setLoading(false);
      });
  }

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    runSearch(value);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q && q.trim().length >= 2) {
      Promise.resolve()
        .then(() => {
          setQuery(q);
          setLoading(true);
          return fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        })
        .then((res) => res.json())
        .then((data) => {
          setResults(data || EMPTY);
          setLoading(false);
        })
        .catch(() => {
          setResults(EMPTY);
          setLoading(false);
        });
    }
  }, []);

  const hasAny =
    results &&
    SECTIONS.some((s) => Array.isArray(results[s.key]) && results[s.key].length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Search
      </h1>

      <input
        type="text"
        value={query}
        onChange={handleChange}
        autoFocus
        placeholder="Search items, equipment, vehicles, repairs..."
        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="mt-6">
        {query.trim().length < 2 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Type at least 2 characters
          </p>
        )}

        {query.trim().length >= 2 && loading && !results && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Searching...</p>
        )}

        {query.trim().length >= 2 && results && !hasAny && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No matches</p>
        )}

        {results && hasAny && (
          <div className="space-y-6">
            {SECTIONS.map((section) => {
              const rows = Array.isArray(results[section.key])
                ? results[section.key]
                : [];
              if (rows.length === 0) return null;
              return (
                <section key={section.key}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    {section.label}
                  </h2>
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {rows.map((row) => (
                      <Link
                        key={`${section.key}-${row.id}`}
                        href={row.href}
                        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {row.title}
                          </div>
                          {row.sub && (
                            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {row.sub}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full">
                          {section.chip}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
