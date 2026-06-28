"use client";

import { useEffect, useState } from "react";
import { usePerson } from "@/lib/personContext";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Sidebar control to enable/disable web push on this device. Hidden unless the
// browser supports push AND VAPID keys are configured on the server.
export default function PushButton() {
  const { currentPerson } = usePerson();
  const [status, setStatus] = useState("checking"); // checking|unsupported|unconfigured|off|on
  const [publicKey, setPublicKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      const key = await fetch("/api/push/public-key").then((r) => r.json()).then((d) => d.publicKey).catch(() => null);
      if (cancelled) return;
      if (!key) { setStatus("unconfigured"); return; }
      setPublicKey(key);
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg("Permission denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub, person_id: currentPerson?.id || null }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("on");
    } catch {
      setMsg("Couldn’t enable");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported" || status === "unconfigured") return null;

  const base = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white";
  const icon = (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );

  return (
    <button onClick={status === "on" ? disable : enable} disabled={busy} title={status === "on" ? "Disable push on this device" : "Enable push on this device"} className={base}>
      {icon}
      <span>{busy ? "…" : status === "on" ? "Notifications on" : msg || "Enable notifications"}</span>
    </button>
  );
}
