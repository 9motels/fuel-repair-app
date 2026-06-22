import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — one conversation with its messages (oldest first).
export async function GET(request, { params }) {
  const db = await getDb();
  const { cid } = await params;
  const conv = (
    await db.execute({ sql: 'SELECT * FROM troubleshoot_conversations WHERE id = ?', args: [cid] })
  ).rows[0];
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const rows = (
    await db.execute({
      sql: 'SELECT id, role, content, images, created_at FROM troubleshoot_messages WHERE conversation_id = ? ORDER BY id ASC',
      args: [cid],
    })
  ).rows;
  const messages = rows.map((m) => {
    let images = [];
    try {
      images = m.images ? JSON.parse(m.images) : [];
    } catch {
      images = [];
    }
    return { ...m, images };
  });
  return NextResponse.json({ ...conv, messages });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { cid } = await params;
  await db.execute({ sql: 'DELETE FROM troubleshoot_conversations WHERE id = ?', args: [cid] });
  return NextResponse.json({ success: true });
}
