import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PART_STATUSES } from '@/lib/partsAi';
import { safeParse } from '@/lib/equipmentUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const row = (
    await db.execute({
      sql: `SELECT p.*, j.title AS job_title, l.name AS location_name,
                   e.name AS equipment_name, e.make AS equipment_make, e.model AS equipment_model
            FROM parts p
            LEFT JOIN jobs j ON p.job_id = j.id
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN equipment e ON p.equipment_id = e.id
            WHERE p.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!row) return NextResponse.json({ error: 'Part not found' }, { status: 404 });
  return NextResponse.json({ ...row, candidates: safeParse(row.candidates, null), photo_urls: safeParse(row.photo_urls, []) });
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// PATCH -> update fields and/or advance status. Status changes stamp the matching
// ordered_at / received_at / installed_at timestamp.
export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const fields = [];
  const args = [];
  for (const key of ['description', 'part_number', 'supplier', 'order_number', 'storage_location', 'notes', 'compat_notes']) {
    if (key in body) { fields.push(`${key} = ?`); args.push((body[key] ?? '').toString().trim()); }
  }
  for (const key of ['job_id', 'location_id', 'equipment_id', 'purchase_id']) {
    if (key in body) { fields.push(`${key} = ?`); args.push(body[key] || null); }
  }
  if ('quantity' in body) { fields.push('quantity = ?'); args.push(Number(body.quantity) || 1); }
  if ('cost' in body) { fields.push('cost = ?'); args.push(numOrNull(body.cost)); }
  if ('expected_date' in body) { fields.push('expected_date = ?'); args.push(body.expected_date || null); }
  if ('candidates' in body) { fields.push('candidates = ?'); args.push(body.candidates ? JSON.stringify(body.candidates) : null); }
  if ('photo_urls' in body) { fields.push('photo_urls = ?'); args.push(JSON.stringify(Array.isArray(body.photo_urls) ? body.photo_urls : [])); }

  if ('status' in body && PART_STATUSES.includes(body.status)) {
    fields.push('status = ?'); args.push(body.status);
    if (body.status === 'ordered') fields.push("ordered_at = COALESCE(ordered_at, datetime('now'))");
    if (body.status === 'received') fields.push("received_at = COALESCE(received_at, datetime('now'))");
    if (body.status === 'installed') fields.push("installed_at = COALESCE(installed_at, datetime('now'))");
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  fields.push("updated_at = datetime('now')");
  args.push(id);
  await db.execute({ sql: `UPDATE parts SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM parts WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
