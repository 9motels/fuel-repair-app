import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET -> list documents (manuals / warranty / other) for a piece of equipment.
export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const rows = (
    await db.execute({
      sql: `SELECT d.*, p.name AS uploaded_by_name
            FROM equipment_documents d
            LEFT JOIN people p ON d.uploaded_by_id = p.id
            WHERE d.equipment_id = ?
            ORDER BY d.created_at DESC`,
      args: [id],
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST { name, url, kind?, content_type?, size?, uploaded_by_id? } -> record a
// document already uploaded to Blob via /api/equipment/upload.
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const name = (body.name || '').trim();
  const url = (body.url || '').trim();
  if (!name || !url) {
    return NextResponse.json({ error: 'A name and file are required.' }, { status: 400 });
  }
  const kind = ['manual', 'warranty', 'receipt', 'other'].includes(body.kind) ? body.kind : 'manual';
  const result = await db.execute({
    sql: `INSERT INTO equipment_documents (equipment_id, name, url, kind, content_type, size, uploaded_by_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      name,
      url,
      kind,
      body.content_type || '',
      Number(body.size) || 0,
      body.uploaded_by_id || null,
    ],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
