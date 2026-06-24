"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import PhotoButtons from "@/lib/PhotoButtons";
import { uploadFile } from "@/lib/equipmentUtils";

const SERVICE_TYPES = ["Oil change", "Tire", "Brakes", "Inspection", "Repair", "Fluids", "Battery", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function VehicleDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [v, setV] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // add-log form
  const [log, setLog] = useState({ service_type: "", notes: "", performed_at: today(), odometer: "", cost: "" });
  const [logFiles, setLogFiles] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState("");

  // troubleshoot chat
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/vehicles/${id}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || "Not found");
    else setV(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleStatus() {
    setUpdating(true);
    const next = v.status === "retired" ? "active" : "retired";
    await fetch(`/api/vehicles/${id}`, {
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
      const res = await fetch(`/api/vehicles/${id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performed_at: log.performed_at || today(),
          service_type: log.service_type,
          odometer: log.odometer,
          cost: log.cost,
          notes: log.notes.trim(),
          photo_urls,
          performed_by_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the service entry.");
      setLog({ service_type: "", notes: "", performed_at: today(), odometer: "", cost: "" });
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
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next = [...chat, { role: "user", content: text }];
    setChat([...next, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/vehicles/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: id, messages: next }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "AI request failed.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setChat((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      setChat((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `[${err.message}]` };
        return copy;
      });
    } finally {
      setChatBusy(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!v) return <div className="text-slate-500">Not found.</div>;

  const title = v.name || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
  const photos = Array.isArray(v.photo_urls) ? v.photo_urls : [];
  const logs = v.logs || [];

  const fieldClass = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/vehicles" className="text-sm text-blue-600 hover:underline">
        ← Back to Vehicles
      </Link>

      {/* Header / info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {title}
              {v.status === "retired" && (
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                  Retired
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{v.location_name}</p>
          </div>
          <button
            onClick={toggleStatus}
            disabled={updating}
            className="text-sm text-blue-600 hover:underline shrink-0 disabled:opacity-60"
          >
            {v.status === "retired" ? "Reactivate" : "Retire"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {v.vehicle_type && (
            <div>
              <span className="text-slate-500">Type:</span> {v.vehicle_type}
            </div>
          )}
          {(v.year || v.make || v.model) && (
            <div>
              <span className="text-slate-500">Vehicle:</span> {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </div>
          )}
          {v.vin && (
            <div>
              <span className="text-slate-500">VIN:</span> <span className="font-mono">{v.vin}</span>
            </div>
          )}
          {v.plate && (
            <div>
              <span className="text-slate-500">Plate:</span> {v.plate}
            </div>
          )}
          {v.odometer ? (
            <div>
              <span className="text-slate-500">Odometer:</span> {Number(v.odometer).toLocaleString()} mi
            </div>
          ) : null}
        </div>
        {v.description && <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{v.description}</p>}

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

      {/* Service log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Service log</h2>

        <form onSubmit={addLog} className="bg-slate-50 rounded-lg p-4 space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input type="date" value={log.performed_at} onChange={(e) => setLog({ ...log, performed_at: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={log.service_type} onChange={(e) => setLog({ ...log, service_type: e.target.value })} className={fieldClass}>
                <option value="">—</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Odometer (mi)</label>
              <input type="number" min="0" value={log.odometer} onChange={(e) => setLog({ ...log, odometer: e.target.value })} className={fieldClass} placeholder="optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost ($)</label>
              <input type="number" min="0" step="0.01" value={log.cost} onChange={(e) => setLog({ ...log, cost: e.target.value })} className={fieldClass} placeholder="optional" />
            </div>
          </div>
          <textarea
            rows={2}
            placeholder="What work was done?"
            value={log.notes}
            onChange={(e) => setLog({ ...log, notes: e.target.value })}
            className={fieldClass}
          />
          <PhotoButtons onFiles={(f) => setLogFiles((prev) => [...prev, ...f])} />
          {logFiles.length > 0 && (
            <p className="text-xs text-slate-500">
              {logFiles.length} photo{logFiles.length === 1 ? "" : "s"} attached
            </p>
          )}
          {logError && <div className="text-sm text-red-600">{logError}</div>}
          <button
            type="submit"
            disabled={savingLog}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? "Saving…" : "Add service entry"}
          </button>
        </form>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No service logged yet.</p>
        ) : (
          <ul className="space-y-4">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">
                    {l.performed_at}
                    {l.service_type ? ` · ${l.service_type}` : ""}
                    {l.odometer ? ` · ${Number(l.odometer).toLocaleString()} mi` : ""}
                    {l.performed_by_name ? ` · ${l.performed_by_name}` : ""}
                  </div>
                  {l.cost ? <span className="text-sm font-semibold text-slate-900">${Number(l.cost).toFixed(2)}</span> : null}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{l.notes}</p>
                {Array.isArray(l.photo_urls) && l.photo_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {l.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Service photo ${i + 1}`} className="w-full h-20 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Troubleshoot chat */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Troubleshoot with AI 💬</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-3">
          Ask about a symptom, fault code, or part. It knows this vehicle and its service history.
        </p>

        {chat.length > 0 && (
          <div className="space-y-3 mb-3">
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block text-sm whitespace-pre-wrap rounded-2xl px-3 py-2 max-w-[90%] ${
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.content || (chatBusy ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={sendChat} className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="e.g. rough idle and a check-engine light"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={chatBusy || !chatInput.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {chatBusy ? "…" : "Ask"}
          </button>
        </form>
      </div>
    </div>
  );
}
