import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// DELETE -> remove a document record. (The Blob object is left in place; the
// connected store can't be deleted from here without a static token.)
export async function DELETE(request, { params }) {
  const db = await getDb();
  const { docId } = await params;
  await db.execute({ sql: 'DELETE FROM equipment_documents WHERE id = ?', args: [docId] });
  return NextResponse.json({ success: true });
}
