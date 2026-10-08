import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const repair = (await db.execute({ sql: `SELECT r.*, l.name as location_name, p.name as created_by_name FROM repairs r JOIN locations l ON r.location_id = l.id LEFT JOIN people p ON r.created_by_id = p.id WHERE r.id = ?`, args: [id] })).rows[0];
  if (!repair) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
  const items = (await db.execute({ sql: `SELECT ri.*, it.name as item_name, it.part_number, it.unit, sl.name as source_location_name FROM repair_items ri JOIN items it ON ri.item_id = it.id JOIN locations sl ON ri.source_location_id = sl.id WHERE ri.repair_id = ?`, args: [id] })).rows;
  const total_cost = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
  return NextResponse.json({ ...repair, items, total_cost });
}

export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const fields = [];
  const args = [];
  // job_id: link to a job, or null to unlink. (Other repair fields can join later.)
  if ('job_id' in body) { fields.push('job_id = ?'); args.push(body.job_id || null); }
  for (const key of ['description', 'notes', 'repair_date', 'equipment_id']) {
    if (key in body) { fields.push(`${key} = ?`); args.push(body[key] === '' ? null : body[key]); }
  }
  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  args.push(id);
  await db.execute({ sql: `UPDATE repairs SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM repairs WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
