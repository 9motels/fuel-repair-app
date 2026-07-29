"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import PhotoButtons from "@/lib/PhotoButtons";
import { uploadFile } from "@/lib/equipmentUtils";
import { reminderStatus, reminderDueLabel, intervalLabel } from "@/lib/vehicleReminders";

const WORK_TYPES = ["Repair", "Routine", "Inspection", "Replacement", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLE = {
  overdue: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
  soon: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  ok: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300",
  none: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400",
};

const KIND_LABEL = { manual: "Manual", warranty: "Warranty", receipt: "Receipt", other: "Doc" };
const KIND_STYLE = {
  manual: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  warranty: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  receipt: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  other: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
};

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Warranty expiry vs today -> { date, days, level } where level is expired/soon/ok.
function warrantyStatus(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  const level = days < 0 ? "expired" : days <= 60 ? "soon" : "ok";
  return { date: dateStr, days, level };
}

export default function EquipmentDetailPage({ params }) {
  const { id } = use(params);
  const { currentPerson } = usePerson();
  const [eq, setEq] = useState(null);
  const [repairs, setRepairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // rename
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // documents (manuals / warranty PDFs)
  const [docFile, setDocFile] = useState(null);
  const [docName, setDocName] = useState("");
  const [docKind, setDocKind] = useState("manual");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");

  // warranty
  const [editWarranty, setEditWarranty] = useState(false);
  const [warranty, setWarranty] = useState({ warranty_provider: "", warranty_expires: "", warranty_notes: "" });
  const [savingWarranty, setSavingWarranty] = useState(false);

  // online manual search
  const [manualResults, setManualResults] = useState(null); // null = not run, [] = none found
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const [addingUrl, setAddingUrl] = useState("");

  // parts finder
  const [partQuery, setPartQuery] = useState("");
  const [partResults, setPartResults] = useState(null);
  const [partsNote, setPartsNote] = useState("");
  const [partsBusy, setPartsBusy] = useState(false);
  const [partsError, setPartsError] = useState("");

  // add-log form
  const [log, setLog] = useState({ work_type: "", notes: "", performed_at: today() });
  const [logFiles, setLogFiles] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState("");

  // reminders
  const [reminders, setReminders] = useState([]);
  const [plan, setPlan] = useState(null); // { intervals:[{...,_sel}], summary }
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [showAddRem, setShowAddRem] = useState(false);
  const [remForm, setRemForm] = useState({ label: "", interval_months: "", notes: "" });

  async function load() {
    const [res, repairsRes, remRes] = await Promise.all([
      fetch(`/api/equipment/${id}`),
      fetch(`/api/repairs?equipment_id=${id}`),
      fetch(`/api/equipment/${id}/reminders`),
    ]);
    const data = await res.json();
    const repairsData = repairsRes.ok ? await repairsRes.json() : [];
    if (!res.ok) setError(data.error || "Not found");
    else setEq(data);
    setRepairs(Array.isArray(repairsData) ? repairsData : []);
    setReminders(remRes.ok ? await remRes.json() : []);
    setLoading(false);
  }

  async function suggestPlan() {
    setPlanError("");
    setPlanBusy(true);
    try {
      const res = await fetch(`/api/equipment/${id}/maintenance-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build a plan.");
      const intervals = (Array.isArray(data.intervals) ? data.intervals : []).map((it) => ({ ...it, _sel: true }));
      setPlan({ intervals, summary: data.summary || "" });
      if (intervals.length === 0) setPlanError("No suggestions came back — add reminders manually below.");
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanBusy(false);
    }
  }

  function toggleSuggestion(i) {
    setPlan((p) => ({ ...p, intervals: p.intervals.map((it, idx) => (idx === i ? { ...it, _sel: !it._sel } : it)) }));
  }

  function updateSuggestion(i, patch) {
    setPlan((p) => ({ ...p, intervals: p.intervals.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  }

  async function addSelectedSuggestions() {
    const selected = (plan?.intervals || []).filter((it) => it._sel);
    if (selected.length === 0) return;
    setSavingPlan(true);
    try {
      await fetch(`/api/equipment/${id}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: selected.map((s) => ({ label: s.label, interval_months: s.interval_months, notes: s.notes || "" })),
        }),
      });
      setPlan(null);
      await load();
    } finally {
      setSavingPlan(false);
    }
  }

  async function addManualReminder(e) {
    e.preventDefault();
    if (!remForm.label.trim()) return;
    await fetch(`/api/equipment/${id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: remForm.label.trim(), interval_months: remForm.interval_months, notes: remForm.notes.trim() }),
    });
    setRemForm({ label: "", interval_months: "", notes: "" });
    setShowAddRem(false);
    await load();
  }

  async function markReminderDone(rid) {
    await fetch(`/api/equipment-reminders/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_done_date: today() }),
    });
    await load();
  }

  async function deleteReminder(rid) {
    if (!confirm("Remove this reminder?")) return;
    await fetch(`/api/equipment-reminders/${rid}`, { method: "DELETE" });
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-pull the suggested schedule + search for manuals when arriving from
  // "Add equipment" (?suggest=1).
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("suggest")) {
      Promise.resolve().then(() => {
        suggestPlan();
        findManuals();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function startRename() {
    setNameInput(eq.name || "");
    setRenaming(true);
  }

  async function saveName() {
    setSavingName(true);
    try {
      await fetch(`/api/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setRenaming(false);
      await load();
    } finally {
      setSavingName(false);
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    setDocError("");
    if (!docFile) {
      setDocError("Choose a file first.");
      return;
    }
    setUploadingDoc(true);
    try {
      const url = await uploadFile(docFile);
      const res = await fetch(`/api/equipment/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: docName.trim() || docFile.name,
          url,
          kind: docKind,
          content_type: docFile.type || "",
          size: docFile.size || 0,
          uploaded_by_id: currentPerson?.id || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not save the document.");
      }
      setDocFile(null);
      setDocName("");
      setDocKind("manual");
      await load();
    } catch (err) {
      setDocError(err.message || "Upload failed.");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function deleteDocument(docId) {
    if (!confirm("Remove this document?")) return;
    await fetch(`/api/equipment/documents/${docId}`, { method: "DELETE" });
    await load();
  }

  function startEditWarranty() {
    setWarranty({
      warranty_provider: eq.warranty_provider || "",
      warranty_expires: eq.warranty_expires || "",
      warranty_notes: eq.warranty_notes || "",
    });
    setEditWarranty(true);
  }

  async function saveWarranty() {
    setSavingWarranty(true);
    try {
      await fetch(`/api/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warranty),
      });
      setEditWarranty(false);
      await load();
    } finally {
      setSavingWarranty(false);
    }
  }

  async function findManuals() {
    setManualError("");
    setManualBusy(true);
    try {
      const res = await fetch(`/api/equipment/${id}/find-manuals`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Manual search failed.");
      setManualResults(Array.isArray(data.manuals) ? data.manuals : []);
    } catch (err) {
      setManualError(err.message);
      setManualResults([]);
    } finally {
      setManualBusy(false);
    }
  }

  async function saveFoundManual(m) {
    setAddingUrl(m.url);
    try {
      const kind = ["owner", "service", "parts"].includes(m.type) ? "manual" : "other";
      await fetch(`/api/equipment/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: m.title || `${m.type} manual`,
          url: m.url,
          kind,
          content_type: /\.pdf($|\?)/i.test(m.url) ? "application/pdf" : "",
          uploaded_by_id: currentPerson?.id || null,
        }),
      });
      setManualResults((r) => (r || []).filter((x) => x.url !== m.url));
      await load();
    } finally {
      setAddingUrl("");
    }
  }

  async function findParts(e) {
    e.preventDefault();
    const q = partQuery.trim();
    if (!q) return;
    setPartsError("");
    setPartsNote("");
    setPartsBusy(true);
    try {
      const res = await fetch(`/api/equipment/${id}/find-parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parts search failed.");
      setPartResults(Array.isArray(data.parts) ? data.parts : []);
      setPartsNote(data.note || "");
    } catch (err) {
      setPartsError(err.message);
      setPartResults([]);
    } finally {
      setPartsBusy(false);
    }
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

  if (loading) return <div className="text-slate-500 dark:text-slate-400">Loading…</div>;
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!eq) return <div className="text-slate-500 dark:text-slate-400">Not found.</div>;

  const title = eq.name || [eq.make, eq.model].filter(Boolean).join(" ") || "Equipment";
  const photos = Array.isArray(eq.photo_urls) ? eq.photo_urls : [];
  const logs = eq.logs || [];
  const documents = Array.isArray(eq.documents) ? eq.documents : [];
  const warrantyExpiry = warrantyStatus(eq.warranty_expires);
  const hasWarranty = eq.warranty_provider || eq.warranty_expires || eq.warranty_notes;
  const fieldClass =
    "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/equipment" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to Equipment
      </Link>

      {/* Header / info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  placeholder={[eq.make, eq.model].filter(Boolean).join(" ") || "Equipment name"}
                  className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingName ? "Saving…" : "Save name"}
                  </button>
                  <button onClick={() => setRenaming(false)} className="text-sm text-slate-500 dark:text-slate-400 hover:underline">
                    Cancel
                  </button>
                  <span className="text-xs text-slate-400 dark:text-slate-500">Leave blank to use make/model</span>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="min-w-0 truncate">{title}</span>
                  {eq.status === "retired" && (
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide shrink-0">
                      Retired
                    </span>
                  )}
                  <button
                    onClick={startRename}
                    title="Rename"
                    className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{eq.location_name}</p>
              </>
            )}
          </div>
          {!renaming && (
            <button
              onClick={toggleStatus}
              disabled={updating}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0 disabled:opacity-60"
            >
              {eq.status === "retired" ? "Reactivate" : "Retire"}
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {eq.category && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Category:</span> {eq.category}
            </div>
          )}
          {eq.make && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Make:</span> {eq.make}
            </div>
          )}
          {eq.model && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Model:</span> {eq.model}
            </div>
          )}
          {eq.serial && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Serial:</span> {eq.serial}
            </div>
          )}
        </div>
        {eq.description && <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 whitespace-pre-wrap">{eq.description}</p>}

        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Warranty */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Warranty</h2>
          {!editWarranty && (
            <button onClick={startEditWarranty} className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0">
              {hasWarranty ? "Edit" : "+ Add warranty"}
            </button>
          )}
        </div>
        {editWarranty ? (
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Provider / plan</label>
                <input className={fieldClass} placeholder="e.g. True — 5-yr compressor" value={warranty.warranty_provider} onChange={(e) => setWarranty({ ...warranty, warranty_provider: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Expires</label>
                <input type="date" className={fieldClass} value={warranty.warranty_expires || ""} onChange={(e) => setWarranty({ ...warranty, warranty_expires: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Notes</label>
              <input className={fieldClass} placeholder="Coverage, claim phone, terms…" value={warranty.warranty_notes} onChange={(e) => setWarranty({ ...warranty, warranty_notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={saveWarranty} disabled={savingWarranty} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {savingWarranty ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditWarranty(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
                Cancel
              </button>
            </div>
          </div>
        ) : hasWarranty ? (
          <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1 mt-2">
            {eq.warranty_provider && (
              <div><span className="text-slate-500 dark:text-slate-400">Provider:</span> {eq.warranty_provider}</div>
            )}
            {warrantyExpiry && (
              <div className="flex items-center gap-2 flex-wrap">
                <span><span className="text-slate-500 dark:text-slate-400">Expires:</span> {warrantyExpiry.date}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${warrantyExpiry.level === "expired" ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" : warrantyExpiry.level === "soon" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"}`}>
                  {warrantyExpiry.level === "expired" ? "Expired" : warrantyExpiry.level === "soon" ? `${warrantyExpiry.days} days left` : "Active"}
                </span>
              </div>
            )}
            {eq.warranty_notes && <div className="text-slate-600 dark:text-slate-300">{eq.warranty_notes}</div>}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">No warranty recorded.</p>
        )}
      </div>

      {/* Manuals & documents */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manuals &amp; documents</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
          Attach the owner&apos;s/service manual, spec sheets, or warranty paperwork (PDF or image).
          Manuals get fed to the AI troubleshooter so it can cite the real procedures and part numbers.
        </p>

        {/* AI web search for manuals */}
        <div className="mb-4">
          <button
            onClick={findManuals}
            disabled={manualBusy}
            className="text-sm border border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
          >
            {manualBusy ? "Searching the web…" : "🔎 Find manuals online"}
          </button>
          {manualError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{manualError}</p>}
          {manualResults && manualResults.length === 0 && !manualBusy && !manualError && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">No manuals found online — try attaching one below.</p>
          )}
          {manualResults && manualResults.length > 0 && (
            <ul className="space-y-2 mt-3">
              {manualResults.map((m, i) => (
                <li key={i} className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/30 rounded-lg p-3 flex items-start gap-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${KIND_STYLE[["owner", "service", "parts"].includes(m.type) ? "manual" : "other"]}`}>
                    {m.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={m.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline break-words">
                      {m.title || m.url}
                    </a>
                    {(m.source || m.note) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">{[m.source, m.note].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <button
                    onClick={() => saveFoundManual(m)}
                    disabled={addingUrl === m.url}
                    className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0 disabled:opacity-50"
                  >
                    {addingUrl === m.url ? "Saving…" : "Save"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {documents.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No documents yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${KIND_STYLE[d.kind] || KIND_STYLE.other}`}>
                  {KIND_LABEL[d.kind] || "Doc"}
                </span>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex-1 min-w-0">
                  {d.name}
                </a>
                {fmtSize(d.size) && <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{fmtSize(d.size)}</span>}
                <button onClick={() => deleteDocument(d.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 shrink-0">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={uploadDocument} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">File (PDF or image)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <select value={docKind} onChange={(e) => setDocKind(e.target.value)} className={fieldClass}>
                <option value="manual">Manual</option>
                <option value="warranty">Warranty</option>
                <option value="receipt">Receipt</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <input className={fieldClass} placeholder="Label (optional — defaults to the file name)" value={docName} onChange={(e) => setDocName(e.target.value)} />
          {docError && <div className="text-sm text-red-600 dark:text-red-400">{docError}</div>}
          <button type="submit" disabled={uploadingDoc || !docFile} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {uploadingDoc ? "Uploading…" : "Add document"}
          </button>
        </form>
      </div>

      {/* Find parts online */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Find parts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
          Describe the part you need — AI searches the web for the right part for this make/model and gives you direct links to buy it.
        </p>
        <form onSubmit={findParts} className="flex gap-2 mb-3">
          <input
            value={partQuery}
            onChange={(e) => setPartQuery(e.target.value)}
            placeholder="e.g. door gasket, igniter, compressor start relay"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={partsBusy || !partQuery.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {partsBusy ? "Searching…" : "Find"}
          </button>
        </form>
        {partsError && <p className="text-sm text-red-600 dark:text-red-400">{partsError}</p>}
        {partResults && partResults.length === 0 && !partsBusy && !partsError && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No confident match found — try describing the part differently.</p>
        )}
        {partResults && partResults.length > 0 && (
          <ul className="space-y-2">
            {partResults.map((p, i) => (
              <li key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline break-words">
                      {p.name || p.url}
                    </a>
                    {(p.part_number || p.vendor) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {[p.part_number && `#${p.part_number}`, p.vendor].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {p.fits_note && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{p.fits_note}</div>}
                  </div>
                  {p.price && <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 shrink-0">{p.price}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {partsNote && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{partsNote}</p>}
      </div>

      {/* Service reminders */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Service reminders</h2>
          <button
            onClick={suggestPlan}
            disabled={planBusy}
            className="text-sm border border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 shrink-0"
          >
            {planBusy ? "Looking it up…" : "✨ Look up schedule"}
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          AI looks up the typical service schedule for this make/model. Suggestions are estimates —
          confirm against the unit&apos;s manual.
        </p>

        {planError && <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-3">{planError}</div>}

        {plan && plan.intervals.length > 0 && (
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/30 rounded-lg p-4 mb-4">
            <ul className="space-y-2">
              {plan.intervals.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input type="checkbox" checked={s._sel} onChange={() => toggleSuggestion(i)} className="mt-1" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1">
                      <span>{s.label}</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        · every
                        <input type="number" min="0" value={s.interval_months ?? ""}
                          onChange={(e) => updateSuggestion(i, { interval_months: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                          className="w-14 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1 py-0.5 text-xs" />
                        months
                      </span>
                    </div>
                    {s.notes && <div className="text-xs text-slate-600 dark:text-slate-300">{s.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {plan.summary && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{plan.summary}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={addSelectedSuggestions}
                disabled={savingPlan || !plan.intervals.some((it) => it._sel)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPlan ? "Adding…" : `Add ${plan.intervals.filter((it) => it._sel).length} selected`}
              </button>
              <button onClick={() => setPlan(null)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
                Discard
              </button>
            </div>
          </div>
        )}

        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No reminders yet. Use “✨ Look up schedule” or add one below.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => {
              const s = reminderStatus(r, 0);
              return (
                <li key={r.id} className={`border rounded-lg p-3 ${STATUS_STYLE[s.level] || STATUS_STYLE.none}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{intervalLabel(r)}</div>
                      {r.notes && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{r.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold">
                        {s.level === "overdue" ? "Overdue" : s.level === "soon" ? "Due soon" : s.level === "none" ? "—" : "OK"}
                      </div>
                      <div className="text-xs">{reminderDueLabel(s)}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => markReminderDone(r.id)} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">
                      Mark done today
                    </button>
                    <button onClick={() => deleteReminder(r.id)} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showAddRem ? (
          <form onSubmit={addManualReminder} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mt-4">
            <input
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Label (e.g. Replace fuel filter)"
              value={remForm.label}
              onChange={(e) => setRemForm({ ...remForm, label: e.target.value })}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="number" min="0" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Every … months" value={remForm.interval_months} onChange={(e) => setRemForm({ ...remForm, interval_months: e.target.value })} />
              <input className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Notes (part, spec…)" value={remForm.notes} onChange={(e) => setRemForm({ ...remForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add reminder</button>
              <button type="button" onClick={() => setShowAddRem(false)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAddRem(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-4">
            + Add a reminder
          </button>
        )}
      </div>

      {/* Troubleshoot — opens the full-screen chat with saved history */}
      <Link
        href={`/equipment/${id}/troubleshoot`}
        className="block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Troubleshoot with AI →</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Full-screen chat that knows this machine and its history. Conversations are saved so you
              can look back at past diagnoses.
            </p>
          </div>
          <span className="text-2xl shrink-0">💬</span>
        </div>
      </Link>

      {/* Maintenance log */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Maintenance log</h2>

        <form onSubmit={addLog} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={log.performed_at}
                onChange={(e) => setLog({ ...log, performed_at: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <select
                value={log.work_type}
                onChange={(e) => setLog({ ...log, work_type: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <PhotoButtons onFiles={(f) => setLogFiles((prev) => [...prev, ...f])} />
          {logFiles.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {logFiles.length} photo{logFiles.length === 1 ? "" : "s"} attached
            </p>
          )}
          {logError && <div className="text-sm text-red-600 dark:text-red-400">{logError}</div>}
          <button
            type="submit"
            disabled={savingLog}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? "Saving…" : "Add log entry"}
          </button>
        </form>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No work logged yet.</p>
        ) : (
          <ul className="space-y-4">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {l.performed_at}
                  {l.work_type ? ` · ${l.work_type}` : ""}
                  {l.performed_by_name ? ` · ${l.performed_by_name}` : ""}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{l.notes}</p>
                {Array.isArray(l.photo_urls) && l.photo_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {l.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
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

      {/* Repairs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Repairs</h2>
        {repairs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No repairs logged for this machine.</p>
        ) : (
          <ul className="space-y-4">
            {repairs.map((r) => (
              <li key={r.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.description || "Repair"}</div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${Number(r.total_cost || 0).toFixed(2)}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.repair_date}</div>
                {Array.isArray(r.items) && r.items.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.items.map((it, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                        {it.item_name} x{it.quantity}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
