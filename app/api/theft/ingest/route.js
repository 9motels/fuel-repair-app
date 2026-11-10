import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendPushToAll } from '@/lib/push';
import { deviceAuthorized, mediaPath, putPrivate, RATINGS } from '@/lib/theft';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST (multipart, Bearer THEFT_INGEST_SECRET) from the store Mac: one flagged
// clip. Fields: `meta` (JSON) + optional files `clip` (mp4), `strip` (jpg),
// `still` (jpg). Upserts the event; when meta.alert is true, pushes a
// notification to every subscribed phone. Re-posting the same id just refreshes
// it (the device retries on failure).
// meta: { id, location_id, camera, event_time, rating, reason, tags, local_note, alert }
export async function POST(request) {
  if (!deviceAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  let meta;
  try { meta = JSON.parse(form.get('meta') || ''); } catch { meta = null; }
  if (!meta?.id || !meta.location_id || !meta.camera || !meta.event_time) {
    return NextResponse.json({ error: 'meta needs id, location_id, camera, event_time' }, { status: 400 });
  }
  const rating = RATINGS.has(meta.rating) ? meta.rating : 'possible';
  const db = await getDb();
  const loc = (await db.execute({ sql: 'SELECT id, name FROM locations WHERE id = ?', args: [meta.location_id] })).rows[0];
  if (!loc) return NextResponse.json({ error: 'Unknown location_id' }, { status: 400 });

  // Store the files first so a half-written row never points at missing media.
  const paths = {};
  for (const [field, ext, type] of [['clip', 'mp4', 'video/mp4'], ['strip', 'jpg', 'image/jpeg'], ['still', 'jpg', 'image/jpeg']]) {
    const f = form.get(field);
    if (!f || typeof f === 'string' || f.size === 0) continue;
    paths[field] = await putPrivate(mediaPath(loc.id, meta.id, field, ext), f, type);
  }

  await db.execute({
    sql: `INSERT INTO theft_events (id, location_id, camera, event_time, rating, reason, tags, local_note, alerted, clip_path, strip_path, still_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            rating = excluded.rating, reason = excluded.reason, tags = excluded.tags, local_note = excluded.local_note,
            alerted = MAX(theft_events.alerted, excluded.alerted),
            clip_path = COALESCE(excluded.clip_path, theft_events.clip_path),
            strip_path = COALESCE(excluded.strip_path, theft_events.strip_path),
            still_path = COALESCE(excluded.still_path, theft_events.still_path)`,
    args: [meta.id, loc.id, meta.camera, meta.event_time, rating, meta.reason || '', JSON.stringify(meta.tags || []),
           meta.local_note || '', meta.alert ? 1 : 0, paths.clip || null, paths.strip || null, paths.still || null],
  });

  let push = { skipped: true };
  if (meta.alert) {
    const when = new Date(meta.event_time.replace(' ', 'T'));
    const t = isNaN(when) ? meta.event_time : when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    push = await sendPushToAll(db, {
      title: `${rating === 'likely' ? 'Likely' : 'Possible'} theft - ${loc.name}, ${meta.camera} ${t}`,
      body: (meta.reason || '').slice(0, 180),
      url: `/theft?e=${encodeURIComponent(meta.id)}`,
    });
  }
  return NextResponse.json({ ok: true, id: meta.id, stored: Object.keys(paths), push });
}
