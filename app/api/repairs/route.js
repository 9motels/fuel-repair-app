import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('location_id');

  let sql = `SELECT r.*, l.name as location_name, p.name as created_by_name
             FROM repairs r
             JOIN locations l ON r.location_id = l.id
             LEFT JOIN people p ON r.created_by_id = p.id
             WHERE 1=1`;
  const args = [];
  if (locationId) { sql += ' AND r.location_id = ?'; args.push(locationId); }
  sql += ' ORDER BY r.repair_date DESC, r.created_at DESC';

  const repairs = (await db.execute({ sql, args })).rows;

  const result = [];
  for (const r of repairs) {
    const items = (await db.execute({
      sql: `SELECT ri.*, it.name as item_name, it.part_number, it.unit, sl.name as source_location_name
            FROM repair_items ri JOIN items it ON ri.item_id = it.id JOIN locations sl ON ri.source_location_id = sl.id
            WHERE ri.repair_id = ?`,
      args: [r.id]
    })).rows;
    const total_cost = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
    result.push({ ...r, items, total_cost });
  }
  return NextResponse.json(result);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { location_id, pump_number, repair_date, description, notes, items, created_by_id } = body;
  if (!location_id || !repair_date || !items || items.length === 0) {
    return NextResponse.json({ error: 'location_id, repair_date, and at least one item are required' }, { status: 400 });
  }

  const tx = await db.transaction('write');
  try {
    // Ensure inventory records exist
    for (const item of items) {
      const existing = await tx.execute({ sql: 'SELECT id FROM inventory WHERE item_id = ? AND location_id = ?', args: [item.item_id, item.source_location_id] });
      if (existing.rows.length === 0) {
        await tx.execute({ sql: 'INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, 0)', args: [item.item_id, item.source_location_id] });
      }
    }

    const result = await tx.execute({ sql: 'INSERT INTO repairs (location_id, pump_number, repair_date, description, notes, created_by_id) VALUES (?, ?, ?, ?, ?, ?)', args: [location_id, pump_number || null, repair_date, description || '', notes || '', created_by_id || null] });
    const repairId = Number(result.lastInsertRowid);

    for (const item of items) {
      await tx.execute({ sql: 'INSERT INTO repair_items (repair_id, item_id, source_location_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)', args: [repairId, item.item_id, item.source_location_id, item.quantity, item.unit_cost] });
      await tx.execute({ sql: "UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND location_id = ?", args: [item.quantity, item.item_id, item.source_location_id] });
    }
    await tx.commit();
    return NextResponse.json({ id: repairId });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
