import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function safeParse(v, fallback) {
  if (v == null) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;

  const eq = (
    await db.execute({
      sql: `SELECT e.*, l.name as location_name, l.address as location_address, p.name as created_by_name
            FROM equipment e
            JOIN locations l ON e.location_id = l.id
            LEFT JOIN people p ON e.created_by_id = p.id
            WHERE e.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!eq) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  const logs = (
    await db.execute({
      sql: `SELECT ml.*, p.name as performed_by_name
            FROM maintenance_logs ml
            LEFT JOIN people p ON ml.performed_by_id = p.id
            WHERE ml.equipment_id = ?
            ORDER BY ml.performed_at DESC, ml.created_at DESC`,
      args: [id],
    })
  ).rows.map((l) => ({ ...l, photo_urls: safeParse(l.photo_urls, []) }));

  return NextResponse.json({
    ...eq,
    photo_urls: safeParse(eq.photo_urls, []),
    ai_extracted: safeParse(eq.ai_extracted, null),
    logs,
  });
}

export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const fields = [];
  const args = [];
  for (const key of ['name', 'category', 'make', 'model', 'serial', 'description', 'status', 'location_id']) {
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

  await db.execute({ sql: `UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM equipment WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
