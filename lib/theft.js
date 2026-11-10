import { get, put, del } from '@vercel/blob';

// Theft Review: flagged camera clips posted by the store Mac (theft-ai pipeline),
// reviewed and labeled in the app. Media is customer footage, so it lives in
// PRIVATE blobs and is only served through /api/theft/media (behind the passcode).

export const LABELS = new Set(['theft', 'not', 'unsure']);
export const RATINGS = new Set(['likely', 'possible', 'false']);

// Shared secret for the store Mac -> app calls (ingest, label pull). Separate
// from the passcode so the device never holds a user login. INERT (refuses all
// calls) in production until THEFT_INGEST_SECRET is set.
export function deviceAuthorized(request) {
  const secret = process.env.THEFT_INGEST_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

// Blob pathname for an event's file. Event ids come from the device
// ("20261109-160145-Register_2"); keep them to a safe charset.
export function mediaPath(locationId, eventId, kind, ext) {
  const safe = String(eventId).replace(/[^\w.-]/g, '_');
  return `theft/${Number(locationId)}/${safe}/${kind}.${ext}`;
}

export async function putPrivate(pathname, file, contentType) {
  const blob = await put(pathname, file, { access: 'private', addRandomSuffix: false, contentType });
  return blob.pathname;
}

export async function getPrivate(pathname) {
  return get(pathname, { access: 'private' });
}

export async function deletePrivate(pathnames) {
  if (pathnames.length === 0) return;
  await del(pathnames, { access: 'private' });
}

// Row -> what the page needs. Media URLs point at our authenticated proxy.
export function presentEvent(row) {
  const media = (p) => (p ? `/api/theft/media/${p}` : null);
  return {
    ...row,
    tags: safeJson(row.tags, []),
    clip_url: media(row.clip_path),
    strip_url: media(row.strip_path),
    still_url: media(row.still_path),
  };
}

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
