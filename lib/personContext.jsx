"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "fuel-app:current-person-id";

const PersonContext = createContext({
  people: [],
  currentPerson: null,
  loading: true,
  setCurrentPersonId: () => {},
  clear: () => {},
});

export function usePerson() {
  return useContext(PersonContext);
}

export function PersonProvider({ children }) {
  const [people, setPeople] = useState([]);
  const [currentPersonId, setCurrentPersonIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load people list + restore stored selection on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
        const res = await fetch("/api/people");
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setPeople(list);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (list.find((p) => p.id === parsed)) {
            setCurrentPersonIdState(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to load people", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setCurrentPersonId = useCallback((id) => {
    setCurrentPersonIdState(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, String(id));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clear = useCallback(() => setCurrentPersonId(null), [setCurrentPersonId]);

  const currentPerson = people.find((p) => p.id === currentPersonId) || null;

  return (
    <PersonContext.Provider
      value={{ people, currentPerson, loading, setCurrentPersonId, clear }}
    >
      {children}
    </PersonContext.Provider>
  );
}

/**
 * Picker chip — shows the current person, or an amber "Pick who you are"
 * prompt if none selected. Clicking opens a small dropdown of other people.
 *
 * variant: "header" (compact, for mobile top bar)
 *        | "sidebar" (block, for desktop sidebar footer)
 */
export function PersonPicker({ variant = "header" }) {
  const { people, currentPerson, loading, setCurrentPersonId } = usePerson();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className={
        variant === "sidebar"
          ? "px-4 py-3 text-xs text-slate-500"
          : "text-xs text-slate-300"
      }>
        Loading…
      </div>
    );
  }

  const others = people.filter((p) => p.id !== currentPerson?.id);

  if (variant === "sidebar") {
    return (
      <div className="border-t border-slate-700 p-3 mt-auto">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Signed in as</p>
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPerson
                ? "bg-slate-700 text-white hover:bg-slate-600"
                : "bg-amber-500 text-amber-950 hover:bg-amber-400"
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {currentPerson ? currentPerson.name : "Pick who you are"}
            </span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-lg overflow-hidden z-10">
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentPersonId(p.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    p.id === currentPerson?.id
                      ? "bg-blue-600 text-white"
                      : "text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              {currentPerson && (
                <button
                  onClick={() => { setCurrentPersonId(null); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 border-t border-slate-700"
                >
                  Sign out of this device
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // header variant
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          currentPerson
            ? "bg-slate-700 text-white hover:bg-slate-600"
            : "bg-amber-500 text-amber-950 hover:bg-amber-400"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        {currentPerson ? currentPerson.name : "Pick you"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => { setCurrentPersonId(p.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                p.id === currentPerson?.id
                  ? "bg-blue-600 text-white"
                  : "text-slate-200 hover:bg-slate-700"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
