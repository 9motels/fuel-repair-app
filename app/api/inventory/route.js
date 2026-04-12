import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('location_id');

  let sql = `
    SELECT i.id as inventory_id, i.quantity, i.item_id, i.location_id,
           it.name as item_name, it.part_number, it.category, it.unit, it.min_quantity,
           l.name as location_name, l.is_central
    FROM inventory i
    JOIN items it ON i.item_id = it.id
    JOIN locations l ON i.location_id = l.id
  `;
  const args = [];
  if (locationId) { sql += ' WHERE i.location_id = ?'; args.push(locationId); }
  sql += ' ORDER BY it.name ASC, l.name ASC';

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { item_id, location_id, quantity } = body;
  if (!item_id || !location_id) return NextResponse.json({ error: 'item_id and location_id are required' }, { status: 400 });

  // Try insert first, update if exists
  const existing = await db.execute({ sql: 'SELECT id FROM inventory WHERE item_id = ? AND location_id = ?', args: [item_id, location_id] });
  if (existing.rows.length > 0) {
    await db.execute({ sql: "UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [quantity || 0, item_id, location_id] });
  } else {
    await db.execute({ sql: 'INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)', args: [item_id, location_id, quantity || 0] });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(request) {
  const db = await getDb();
  const body = await request.json();
  const { item_id, location_id, quantity } = body;
  if (!item_id || !location_id) return NextResponse.json({ error: 'item_id and location_id are required' }, { status: 400 });
  await db.execute({ sql: "UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [quantity, item_id, location_id] });
  return NextResponse.json({ success: true });
}
