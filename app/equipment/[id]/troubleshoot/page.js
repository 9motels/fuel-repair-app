"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";

function fmtDate(s) {
  if (!s) return "";
  // libSQL stores 'YYYY-MM-DD HH:MM:SS' (UTC); show the date portion.
  return s.slice(0, 10);
}

export default function TroubleshootPage({ params }) {
  const { id } = use(params);
  const [equipment, setEquipment] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

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
        setMessages((conv.messages || []).map((m) => ({ role: m.role, content: m.content })));
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
    if (!cid) {
      setActiveConvId(null);
      setMessages([]);
      return;
    }
    const res = await fetch(`/api/conversations/${cid}`);
    const conv = await res.json();
    setActiveConvId(cid);
    setMessages((conv.messages || []).map((m) => ({ role: m.role, content: m.content })));
  }

  function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setError("");
  }

  async function send(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setError("");
    setSending(true);

    let cid = activeConvId;
    try {
      if (!cid) {
        const res = await fetch(`/api/equipment/${id}/conversations`, { method: "POST" });
        const data = await res.json();
        cid = data.id;
        setActiveConvId(cid);
      }
      const base = [...messages, { role: "user", content: q }];
      setMessages([...base, { role: "assistant", content: "" }]);
      setInput("");

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
          Grounded in {title}&apos;s details and full service history.
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
            Ask about this machine — e.g. &quot;It&apos;s not cooling, where do I start?&quot; Your
            conversation is saved so you can look back at it later.
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                {m.content || (sending && i === messages.length - 1 ? "Thinking…" : "")}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="shrink-0 text-sm text-red-600 mt-2">{error}</div>}

      {/* Input */}
      <form onSubmit={send} className="shrink-0 flex gap-2 mt-3">
        <input
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe the problem or ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-blue-600 text-white px-5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {sending ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
