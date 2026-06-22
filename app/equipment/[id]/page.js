"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";

const WORK_TYPES = ["Repair", "Routine", "Inspection", "Replacement", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/equipment/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Photo upload failed.");
  }
  return (await res.json()).url;
}

export default function EquipmentDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [eq, setEq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // add-log form
  const [log, setLog] = useState({ work_type: "", notes: "", performed_at: today() });
  const [logFiles, setLogFiles] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState("");

  // troubleshoot chat
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef(null);

  async function load() {
    const res = await fetch(`/api/equipment/${id}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || "Not found");
    else setEq(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  async function toggleStatus() {
    setUpdating(true);
    const next = eq.status === "retired" ? "active" : "retired";
    await fetch(`/api/equipment/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
    setUpdating(false);
  }

  async function addLog(e) {
    e.preventDefault();
    setLogError("");
    if (!log.notes.trim()) return setLogError("Describe the work done.");
    setSavingLog(true);
    try {
      const photo_urls = [];
      for (const file of logFiles) photo_urls.push(await uploadFile(file));
      const res = await fetch(`/api/equipment/${id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performed_at: log.performed_at || today(),
          work_type: log.work_type,
          notes: log.notes.trim(),
          photo_urls,
          performed_by_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the log entry.");
      setLog({ work_type: "", notes: "", performed_at: today() });
      setLogFiles([]);
      await load();
    } catch (err) {
      setLogError(err.message);
    } finally {
      setSavingLog(false);
    }
  }

  async function sendChat(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    const base = [...chat, { role: "user", content: q }];
    setChat([...base, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);
    setChatError("");

    const equipment = {
      name: eq.name,
      category: eq.category,
      make: eq.make,
      model: eq.model,
      serial: eq.serial,
      location: eq.location_name,
      description: eq.description,
    };
    const logs = (eq.logs || []).map((l) => ({
      performed_at: l.performed_at,
      work_type: l.work_type,
      performed_by: l.performed_by_name,
      notes: l.notes,
    }));

    try {
      const res = await fetch("/api/equipment/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipment, logs, messages: base }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Troubleshooting request failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setChat((prev) => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          });
        }
      }
    } catch (err) {
      setChatError(err.message);
      setChat((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) copy.pop();
        return copy;
      });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!eq) return <div className="text-slate-500">Not found.</div>;

  const title = eq.name || [eq.make, eq.model].filter(Boolean).join(" ") || "Equipment";
  const photos = Array.isArray(eq.photo_urls) ? eq.photo_urls : [];
  const logs = eq.logs || [];

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/equipment" className="text-sm text-blue-600 hover:underline">
        ← Back to Equipment
      </Link>

      {/* Header / info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {title}
              {eq.status === "retired" && (
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                  Retired
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{eq.location_name}</p>
          </div>
          <button
            onClick={toggleStatus}
            disabled={updating}
            className="text-sm text-blue-600 hover:underline shrink-0 disabled:opacity-60"
          >
            {eq.status === "retired" ? "Reactivate" : "Retire"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {eq.category && (
            <div>
              <span className="text-slate-500">Category:</span> {eq.category}
            </div>
          )}
          {eq.make && (
            <div>
              <span className="text-slate-500">Make:</span> {eq.make}
            </div>
          )}
          {eq.model && (
            <div>
              <span className="text-slate-500">Model:</span> {eq.model}
            </div>
          )}
          {eq.serial && (
            <div>
              <span className="text-slate-500">Serial:</span> {eq.serial}
            </div>
          )}
        </div>
        {eq.description && <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{eq.description}</p>}

        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Troubleshoot */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Troubleshoot</h2>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">
          Ask about this machine — it already knows the model and service history.
        </p>
        {chat.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto mb-3">
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.content || (sending && i === chat.length - 1 ? "Thinking…" : "")}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
        {chatError && <div className="text-sm text-red-600 mb-2">{chatError}</div>}
        <form onSubmit={sendChat} className="flex gap-2">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. It's not cooling — where do I start?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {sending ? "…" : "Ask"}
          </button>
        </form>
      </div>

      {/* Maintenance log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Maintenance log</h2>

        <form onSubmit={addLog} className="bg-slate-50 rounded-lg p-4 space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={log.performed_at}
                onChange={(e) => setLog({ ...log, performed_at: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select
                value={log.work_type}
                onChange={(e) => setLog({ ...log, work_type: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            rows={2}
            placeholder="What work was done?"
            value={log.notes}
            onChange={(e) => setLog({ ...log, notes: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="block w-full text-sm"
            onChange={(e) => setLogFiles(Array.from(e.target.files || []))}
          />
          {logError && <div className="text-sm text-red-600">{logError}</div>}
          <button
            type="submit"
            disabled={savingLog}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? "Saving…" : "Add log entry"}
          </button>
        </form>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No work logged yet.</p>
        ) : (
          <ul className="space-y-4">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 pl-3">
                <div className="text-xs text-slate-500">
                  {l.performed_at}
                  {l.work_type ? ` · ${l.work_type}` : ""}
                  {l.performed_by_name ? ` · ${l.performed_by_name}` : ""}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{l.notes}</p>
                {Array.isArray(l.photo_urls) && l.photo_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {l.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Log photo ${i + 1}`} className="w-full h-20 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
