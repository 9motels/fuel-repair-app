import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { safeParse } from '@/lib/equipmentUtils';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;

  const v = (
    await db.execute({
      sql: `SELECT v.*, l.name as location_name, l.address as location_address, p.name as created_by_name
            FROM vehicles v
            JOIN locations l ON v.location_id = l.id
            LEFT JOIN people p ON v.created_by_id = p.id
            WHERE v.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!v) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const logs = (
    await db.execute({
      sql: `SELECT vsl.*, p.name as performed_by_name
            FROM vehicle_service_logs vsl
            LEFT JOIN people p ON vsl.performed_by_id = p.id
            WHERE vsl.vehicle_id = ?
            ORDER BY vsl.performed_at DESC, vsl.created_at DESC`,
      args: [id],
    })
  ).rows.map((l) => ({ ...l, photo_urls: safeParse(l.photo_urls, []) }));

  return NextResponse.json({
    ...v,
    photo_urls: safeParse(v.photo_urls, []),
    ai_extracted: safeParse(v.ai_extracted, null),
    logs,
  });
}

export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const fields = [];
  const args = [];
  for (const key of ['name', 'vehicle_type', 'year', 'make', 'model', 'vin', 'plate', 'odometer', 'description', 'status', 'location_id']) {
    if (key in body) {
      fields.push(`${key} = ?`);
      args.push(body[key]);
    }
  }
  if ('photo_urls' in body) {
    fields.push('photo_urls = ?');
    args.push(JSON.stringify(Array.isArray(body.photo_urls) ? body.photo_urls : []));
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({ sql: `UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM vehicles WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
