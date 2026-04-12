import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM items ORDER BY name ASC');
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { name, description, category, part_number, unit, min_quantity } = body;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const result = await db.execute({ sql: 'INSERT INTO items (name, description, category, part_number, unit, min_quantity) VALUES (?, ?, ?, ?, ?, ?)', args: [name, description || '', category || '', part_number || '', unit || 'each', min_quantity || 0] });
  return NextResponse.json({ id: Number(result.lastInsertRowid), ...body });
}

export async function PUT(request) {
  const db = await getDb();
  const body = await request.json();
  const { id, name, description, category, part_number, unit, min_quantity } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name are required' }, { status: 400 });
  await db.execute({ sql: 'UPDATE items SET name = ?, description = ?, category = ?, part_number = ?, unit = ?, min_quantity = ? WHERE id = ?', args: [name, description || '', category || '', part_number || '', unit || 'each', min_quantity || 0, id] });
  return NextResponse.json({ id, ...body });
}

export async function DELETE(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  await db.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
