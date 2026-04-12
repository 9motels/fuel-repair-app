import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('item_id');
  const locationId = searchParams.get('location_id');

  let sql = `SELECT p.*, it.name as item_name, it.part_number, l.name as location_name FROM purchases p JOIN items it ON p.item_id = it.id JOIN locations l ON p.location_id = l.id WHERE 1=1`;
  const args = [];
  if (itemId) { sql += ' AND p.item_id = ?'; args.push(itemId); }
  if (locationId) { sql += ' AND p.location_id = ?'; args.push(locationId); }
  sql += ' ORDER BY p.purchase_date DESC, p.created_at DESC';

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { item_id, location_id, quantity, unit_price, vendor, purchase_date, notes } = body;
  if (!item_id || !location_id || !quantity || unit_price === undefined || !purchase_date) {
    return NextResponse.json({ error: 'item_id, location_id, quantity, unit_price, and purchase_date are required' }, { status: 400 });
  }

  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({ sql: 'INSERT INTO purchases (item_id, location_id, quantity, unit_price, vendor, purchase_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [item_id, location_id, quantity, unit_price, vendor || '', purchase_date, notes || ''] });

    // Upsert inventory
    const existing = await tx.execute({ sql: 'SELECT id, quantity as qty FROM inventory WHERE item_id = ? AND location_id = ?', args: [item_id, location_id] });
    if (existing.rows.length > 0) {
      await tx.execute({ sql: "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [quantity, item_id, location_id] });
    } else {
      await tx.execute({ sql: 'INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)', args: [item_id, location_id, quantity] });
    }
    await tx.commit();
    return NextResponse.json({ id: Number(result.lastInsertRowid), ...body });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  await db.execute({ sql: 'DELETE FROM purchases WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
