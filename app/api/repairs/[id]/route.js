import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const repair = (await db.execute({ sql: `SELECT r.*, l.name as location_name FROM repairs r JOIN locations l ON r.location_id = l.id WHERE r.id = ?`, args: [id] })).rows[0];
  if (!repair) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
  const items = (await db.execute({ sql: `SELECT ri.*, it.name as item_name, it.part_number, it.unit, sl.name as source_location_name FROM repair_items ri JOIN items it ON ri.item_id = it.id JOIN locations sl ON ri.source_location_id = sl.id WHERE ri.repair_id = ?`, args: [id] })).rows;
  const total_cost = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
  return NextResponse.json({ ...repair, items, total_cost });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM repairs WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
