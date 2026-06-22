import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — list troubleshoot conversations for this equipment (newest activity first).
export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const rows = (
    await db.execute({
      sql: `SELECT c.id, c.title, c.created_at, c.updated_at,
                   (SELECT COUNT(*) FROM troubleshoot_messages m WHERE m.conversation_id = c.id) AS message_count
            FROM troubleshoot_conversations c
            WHERE c.equipment_id = ?
            ORDER BY c.updated_at DESC`,
      args: [id],
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST — start a new conversation.
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await db.execute({
    sql: 'INSERT INTO troubleshoot_conversations (equipment_id, title) VALUES (?, ?)',
    args: [id, (body.title || '').slice(0, 60)],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
