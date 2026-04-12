import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM locations ORDER BY is_central DESC, name ASC');
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const { name, address, is_central } = body;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const result = await db.execute({ sql: 'INSERT INTO locations (name, address, is_central) VALUES (?, ?, ?)', args: [name, address || '', is_central ? 1 : 0] });
  return NextResponse.json({ id: Number(result.lastInsertRowid), name, address, is_central });
}

export async function PUT(request) {
  const db = await getDb();
  const body = await request.json();
  const { id, name, address, is_central } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name are required' }, { status: 400 });
  await db.execute({ sql: 'UPDATE locations SET name = ?, address = ?, is_central = ? WHERE id = ?', args: [name, address || '', is_central ? 1 : 0, id] });
  return NextResponse.json({ id, name, address, is_central });
}

export async function DELETE(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  await db.execute({ sql: 'DELETE FROM locations WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
