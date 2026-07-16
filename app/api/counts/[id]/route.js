import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET -> session + its saved lines + every inventory item at that location
// (the walk-the-shelf checklist is items ∪ lines, merged client-side).
export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;

  const session = (
    await db.execute({
      sql: `SELECT s.*, l.name AS location_name, p.name AS created_by_name
            FROM count_sessions s
            JOIN locations l ON s.location_id = l.id
            LEFT JOIN people p ON s.created_by_id = p.id
            WHERE s.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!session) return NextResponse.json({ error: 'Count not found' }, { status: 404 });

  const [lines, items] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM count_lines WHERE session_id = ?', args: [id] }),
    db.execute({
      sql: `SELECT i.item_id, it.name, it.part_number, it.unit, i.quantity
            FROM inventory i
            JOIN items it ON i.item_id = it.id
            WHERE i.location_id = ?
            ORDER BY it.name COLLATE NOCASE`,
      args: [session.location_id],
    }),
  ]);

  return NextResponse.json({ ...session, lines: lines.rows, items: items.rows });
}

// PATCH { action: 'apply' | 'cancel' }.
// apply: for every counted line, set the location's on-hand to the counted
// quantity (only rows that actually differ get written), then close the session.
export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const session = (
    await db.execute({ sql: 'SELECT * FROM count_sessions WHERE id = ?', args: [id] })
  ).rows[0];
  if (!session) return NextResponse.json({ error: 'Count not found' }, { status: 404 });
  if (session.status !== 'open') {
    return NextResponse.json({ error: `This count is already ${session.status}.` }, { status: 409 });
  }

  if (body.action === 'cancel') {
    await db.execute({ sql: "UPDATE count_sessions SET status = 'cancelled' WHERE id = ?", args: [id] });
    return NextResponse.json({ success: true, status: 'cancelled' });
  }

  if (body.action !== 'apply') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const lines = (
    await db.execute({
      sql: 'SELECT item_id, counted_qty FROM count_lines WHERE session_id = ? AND counted_qty IS NOT NULL',
      args: [id],
    })
  ).rows;

  // Compare against the LIVE quantity at apply time (not the snapshot) so a
  // purchase/transfer logged mid-count doesn't get silently clobbered back.
  let adjusted = 0;
  for (const line of lines) {
    const inv = (
      await db.execute({
        sql: 'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
        args: [line.item_id, session.location_id],
      })
    ).rows[0];
    const counted = Number(line.counted_qty);
    if (!inv) {
      await db.execute({
        sql: 'INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)',
        args: [line.item_id, session.location_id, counted],
      });
      adjusted++;
    } else if (Number(inv.quantity) !== counted) {
      await db.execute({
        sql: "UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?",
        args: [counted, line.item_id, session.location_id],
      });
      adjusted++;
    }
  }

  await db.execute({
    sql: "UPDATE count_sessions SET status = 'applied', applied_at = datetime('now') WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ success: true, status: 'applied', counted: lines.length, adjusted });
}
