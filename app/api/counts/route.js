import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET -> recent count sessions (open ones first) with line/discrepancy tallies.
export async function GET() {
  const db = await getDb();
  const rows = (
    await db.execute(`
      SELECT s.*, l.name AS location_name, p.name AS created_by_name,
             (SELECT COUNT(*) FROM count_lines cl
               WHERE cl.session_id = s.id AND cl.counted_qty IS NOT NULL) AS counted_count,
             (SELECT COUNT(*) FROM count_lines cl
               WHERE cl.session_id = s.id AND cl.counted_qty IS NOT NULL
                 AND cl.counted_qty != cl.system_qty) AS variance_count
      FROM count_sessions s
      JOIN locations l ON s.location_id = l.id
      LEFT JOIN people p ON s.created_by_id = p.id
      ORDER BY (s.status = 'open') DESC, s.created_at DESC
      LIMIT 25`)
  ).rows;
  return NextResponse.json(rows);
}

// POST { location_id, created_by_id? } -> start a count. If an open session
// already exists for that location, return it (resume) instead of forking a
// second count of the same shelf.
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const locationId = Number(body.location_id);
  if (!locationId) {
    return NextResponse.json({ error: 'Pick a location to count.' }, { status: 400 });
  }
  const existing = (
    await db.execute({
      sql: "SELECT id FROM count_sessions WHERE location_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      args: [locationId],
    })
  ).rows[0];
  if (existing) {
    return NextResponse.json({ id: existing.id, resumed: true });
  }
  const result = await db.execute({
    sql: 'INSERT INTO count_sessions (location_id, created_by_id) VALUES (?, ?)',
    args: [locationId, body.created_by_id || null],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid), resumed: false });
}
