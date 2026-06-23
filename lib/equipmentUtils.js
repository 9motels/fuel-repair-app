// Shared helpers for the equipment module (API routes + client pages).

export function safeParse(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// POST a single File to the equipment upload route and return its public URL.
// Used by the equipment form, the maintenance-log form, and the troubleshoot chat.
export async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/equipment/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Photo upload failed.");
  }
  return (await res.json()).url;
}
