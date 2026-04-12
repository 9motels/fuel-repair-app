import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute(`
    SELECT t.*, it.name as item_name, it.part_number,
           fl.name as from_location_name, tl.name as to_location_name
    FROM transfers t
    JOIN items it ON t.item_id = it.id
    JOIN locations fl ON t.from_location_id = fl.id
    JOIN locations tl ON t.to_location_id = tl.id
    ORDER BY t.created_at DESC
  `);
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { item_id, from_location_id, to_location_id, quantity, notes } = body;
  if (!item_id || !from_location_id || !to_location_id || !quantity) {
    return NextResponse.json({ error: 'item_id, from_location_id, to_location_id, and quantity are required' }, { status: 400 });
  }
  if (from_location_id === to_location_id) {
    return NextResponse.json({ error: 'Cannot transfer to the same location' }, { status: 400 });
  }

  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({ sql: 'INSERT INTO transfers (item_id, from_location_id, to_location_id, quantity, notes) VALUES (?, ?, ?, ?, ?)', args: [item_id, from_location_id, to_location_id, quantity, notes || ''] });
    await tx.execute({ sql: "UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [quantity, item_id, from_location_id] });

    const existing = await tx.execute({ sql: 'SELECT id FROM inventory WHERE item_id = ? AND location_id = ?', args: [item_id, to_location_id] });
    if (existing.rows.length > 0) {
      await tx.execute({ sql: "UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [quantity, item_id, to_location_id] });
    } else {
      await tx.execute({ sql: 'INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)', args: [item_id, to_location_id, quantity] });
    }
    await tx.commit();
    return NextResponse.json({ id: Number(result.lastInsertRowid), ...body });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
