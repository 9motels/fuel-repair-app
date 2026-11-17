import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { deviceAuthorized } from '@/lib/theft';

export const runtime = 'nodejs';

// Store Mac only (Bearer THEFT_INGEST_SECRET).
// POST { set, ids: [event id, ...] } -> create/replace a blind set in that order.
// GET ?set=<id> -> the reviewer's marks, for scoring against the models.
export async function POST(request) {
  if (!deviceAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { set, ids } = await request.json().catch(() => ({}));
  if (!set || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'set and ids are required' }, { status: 400 });
  const db = await getDb();
  const known = new Set((await db.execute({
    sql: `SELECT id FROM theft_events WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids,
  })).rows.map((r) => r.id));
  const missing = ids.filter((i) => !known.has(i));
  if (missing.length) return NextResponse.json({ error: 'unknown event ids', missing }, { status: 400 });
  await db.execute({ sql: 'DELETE FROM theft_blind_sets WHERE set_id = ?', args: [set] });
  for (let k = 0; k < ids.length; k += 1) {
    await db.execute({ sql: 'INSERT INTO theft_blind_sets (set_id, event_id, position) VALUES (?, ?, ?)', args: [set, ids[k], k + 1] });
  }
  return NextResponse.json({ ok: true, set, count: ids.length });
}

export async function GET(request) {
  if (!deviceAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const set = new URL(request.url).searchParams.get('set');
  const db = await getDb();
  const rows = (await db.execute({
    sql: `SELECT a.event_id, a.answer, a.answered_at, p.name AS person FROM theft_blind_answers a
          LEFT JOIN people p ON p.id = a.person_id WHERE a.set_id = ? ORDER BY a.answered_at`,
    args: [set || ''],
  })).rows;
  return NextResponse.json(rows);
}
