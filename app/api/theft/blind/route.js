import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

const ANSWERS = new Set(['worth', 'ordinary', 'cant_tell']);

// GET ?set=<id> -> the set's clips in order, with the reviewer's own marks. Deliberately NO rating, reason, tags,
// follow-up or label: the reviewer must judge the video alone.
export async function GET(request) {
  const db = await getDb();
  const set = new URL(request.url).searchParams.get('set');
  if (!set) return NextResponse.json({ error: 'set is required' }, { status: 400 });
  const rows = (await db.execute({
    sql: `SELECT s.position, s.event_id, e.camera, e.event_time, e.clip_path, a.answer
          FROM theft_blind_sets s JOIN theft_events e ON e.id = s.event_id
          LEFT JOIN theft_blind_answers a ON a.set_id = s.set_id AND a.event_id = s.event_id
          WHERE s.set_id = ? ORDER BY s.position`,
    args: [set],
  })).rows;
  return NextResponse.json(rows.map((r) => ({
    position: r.position, event_id: r.event_id, camera: r.camera, event_time: r.event_time, answer: r.answer || null,
    clip_url: r.clip_path ? `/api/theft/media/${r.clip_path}` : null,
  })));
}

// PATCH { set, event_id, answer: worth|ordinary|cant_tell|null, person_id? } -> save (or clear) one mark.
export async function PATCH(request) {
  const db = await getDb();
  const { set, event_id, answer, person_id } = await request.json().catch(() => ({}));
  if (!set || !event_id) return NextResponse.json({ error: 'set and event_id are required' }, { status: 400 });
  if (answer === null) {
    await db.execute({ sql: 'DELETE FROM theft_blind_answers WHERE set_id = ? AND event_id = ?', args: [set, event_id] });
    return NextResponse.json({ success: true });
  }
  if (!ANSWERS.has(answer)) return NextResponse.json({ error: 'answer must be worth, ordinary or cant_tell' }, { status: 400 });
  await db.execute({
    sql: `INSERT INTO theft_blind_answers (set_id, event_id, answer, person_id) VALUES (?, ?, ?, ?)
          ON CONFLICT(set_id, event_id) DO UPDATE SET answer = excluded.answer, person_id = excluded.person_id, answered_at = datetime('now')`,
    args: [set, event_id, answer, person_id || null],
  });
  return NextResponse.json({ success: true });
}
