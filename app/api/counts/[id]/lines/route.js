import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST { item_id, counted_qty, system_qty } -> upsert one count line.
// counted_qty of null/'' clears the entry (row kept for the audit trail).
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const itemId = Number(body.item_id);
  if (!itemId) return NextResponse.json({ error: 'item_id is required.' }, { status: 400 });

  const session = (
    await db.execute({ sql: 'SELECT status FROM count_sessions WHERE id = ?', args: [id] })
  ).rows[0];
  if (!session) return NextResponse.json({ error: 'Count not found' }, { status: 404 });
  if (session.status !== 'open') {
    return NextResponse.json({ error: `This count is already ${session.status}.` }, { status: 409 });
  }

  const counted =
    body.counted_qty === null || body.counted_qty === '' ? null : Number(body.counted_qty);
  if (counted !== null && (!Number.isFinite(counted) || counted < 0)) {
    return NextResponse.json({ error: 'Count must be 0 or more.' }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO count_lines (session_id, item_id, system_qty, counted_qty)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(session_id, item_id)
          DO UPDATE SET counted_qty = excluded.counted_qty,
                        system_qty = excluded.system_qty,
                        updated_at = datetime('now')`,
    args: [id, itemId, Number(body.system_qty) || 0, counted],
  });
  return NextResponse.json({ success: true });
}
