import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — active people by default (used by the name-picker). ?all=1 returns
// everyone incl. deactivated (used by the People management screen).
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all');
  const sql = all
    ? 'SELECT id, name, active FROM people ORDER BY active DESC, name'
    : 'SELECT id, name, active FROM people WHERE active = 1 ORDER BY name';
  const result = await db.execute(sql);
  return NextResponse.json(result.rows);
}

export async function POST(request) {
  const db = await getDb();
  const { name } = await request.json();
  const trimmed = (name || '').trim();
  if (!trimmed) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  try {
    const result = await db.execute({
      sql: 'INSERT INTO people (name, active) VALUES (?, 1)',
      args: [trimmed],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid), name: trimmed, active: 1 });
  } catch (e) {
    if (/unique/i.test(e.message || '')) {
      return NextResponse.json({ error: 'That name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Activate / deactivate (soft toggle — keeps attribution history intact).
export async function PATCH(request) {
  const db = await getDb();
  const { id, active } = await request.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await db.execute({ sql: 'UPDATE people SET active = ? WHERE id = ?', args: [active ? 1 : 0, id] });
  return NextResponse.json({ success: true });
}
