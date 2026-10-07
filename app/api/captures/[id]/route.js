import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE -> discard a capture (e.g. a junk note). Does not touch any job it was
// already logged to.
export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM captures WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
