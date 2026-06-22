"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";

function fmtDate(s) {
  if (!s) return "";
  // libSQL stores 'YYYY-MM-DD HH:MM:SS' (UTC); show the date portion.
  return s.slice(0, 10);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/equipment/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Photo upload failed.");
  }
  return (await res.json()).url;
}

function mapMessages(list) {
  return (list || []).map((m) => ({
    role: m.role,
    content: m.content,
    images: Array.isArray(m.images) ? m.images : [],
  }));
}

export default function TroubleshootPage({ params }) {
  const { id } = use(params);
  const [equipment, setEquipment] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const attachRef = useRef(null);

  async function loadConversations() {
    const res = await fetch(`/api/equipment/${id}/conversations`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // Initial load: equipment header + conversations, open the most recent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [eqRes, convs] = await Promise.all([
        fetch(`/api/equipment/${id}`).then((r) => r.json()),
        loadConversations(),
      ]);
      if (cancelled) return;
      setEquipment(eqRes);
      setConversations(convs);
      if (convs.length > 0) {
        const res = await fetch(`/api/conversations/${convs[0].id}`);
        const conv = await res.json();
        if (cancelled) return;
        setActiveConvId(convs[0].id);
        setMessages(mapMessages(conv.messages));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(cid) {
    setError("");
    setPendingImages([]);
    if (!cid) {
      setActiveConvId(null);
      setMessages([]);
      return;
    }
    const res = await fetch(`/api/conversations/${cid}`);
    const conv = await res.json();
    setActiveConvId(cid);
    setMessages(mapMessages(conv.messages));
  }

  function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setPendingImages([]);
    setError("");
  }

  async function onAttach(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadFile(f));
      setPendingImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePending(idx) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function send(e) {
    e.preventDefault();
    const q = input.trim();
    if ((!q && pendingImages.length === 0) || sending || uploadingPhoto) return;
    setError("");
    setSending(true);

    const imgs = pendingImages;
    let cid = activeConvId;
    try {
      if (!cid) {
        const res = await fetch(`/api/equipment/${id}/conversations`, { method: "POST" });
        const data = await res.json();
        cid = data.id;
        setActiveConvId(cid);
      }
      const base = [...messages, { role: "user", content: q, images: imgs }];
      setMessages([...base, { role: "assistant", content: "", images: [] }]);
      setInput("");
      setPendingImages([]);

      const res = await fetch("/api/equipment/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: id, conversationId: cid, messages: base }),
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
          setMessages((prev) => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          });
        }
      }
      setConversations(await loadConversations());
    } catch (err) {
      setError(err.message);
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) copy.pop();
        return copy;
      });
    } finally {
      setSending(false);
    }
  }

  const title = equipment
    ? equipment.name || [equipment.make, equipment.model].filter(Boolean).join(" ") || "Equipment"
    : "Equipment";

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-3.5rem)]">
      {/* Header */}
      <div className="shrink-0">
        <Link href={`/equipment/${id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to {title}
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">Troubleshoot</h1>
        <p className="text-xs text-slate-500">
          Grounded in {title}&apos;s details and service history. Attach a photo of the fault or an
          error code for a sharper diagnosis.
        </p>
      </div>

      {/* Conversation picker */}
      <div className="shrink-0 flex gap-2 mt-3">
        <select
          value={activeConvId || ""}
          onChange={(e) => openConversation(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">New conversation</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.title || "Untitled") + " · " + fmtDate(c.updated_at)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={newConversation}
          className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50 shrink-0"
        >
          + New
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-slate-400 px-6">
            Ask about this machine — describe the problem or attach a photo of the fault or an error
            code. Your conversation is saved so you can look back at it later.
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                {Array.isArray(m.images) && m.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 mb-1">
                    {m.images.map((url, j) => (
                      <a key={j} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="attachment" className="w-full h-24 object-cover rounded" />
                      </a>
                    ))}
                  </div>
                )}
                {m.content || (sending && i === messages.length - 1 ? "Thinking…" : "")}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="shrink-0 text-sm text-red-600 mt-2">{error}</div>}

      {/* Pending attachments */}
      {(pendingImages.length > 0 || uploadingPhoto) && (
        <div className="shrink-0 flex items-center gap-2 mt-2 flex-wrap">
          {pendingImages.map((url, idx) => (
            <div key={idx} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-14 h-14 object-cover rounded border border-slate-300" />
              <button
                type="button"
                onClick={() => removePending(idx)}
                className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-5 h-5 text-xs leading-5 text-center"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
          {uploadingPhoto && <span className="text-xs text-slate-500">Uploading photo…</span>}
        </div>
      )}

      {/* Input */}
      <form onSubmit={send} className="shrink-0 flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => attachRef.current?.click()}
          disabled={uploadingPhoto}
          className="shrink-0 border border-slate-300 text-slate-600 rounded-lg px-3 py-2.5 hover:bg-slate-50 disabled:opacity-60"
          title="Attach a photo"
          aria-label="Attach a photo"
        >
          📷
        </button>
        <input ref={attachRef} type="file" accept="image/*" multiple className="hidden" onChange={onAttach} />
        <input
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe the problem, attach a photo, or ask…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={sending || uploadingPhoto || (!input.trim() && pendingImages.length === 0)}
          className="bg-blue-600 text-white px-5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {sending ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
