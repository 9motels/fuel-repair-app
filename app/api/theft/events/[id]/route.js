import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LABELS, presentEvent } from '@/lib/theft';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const row = (await db.execute({
    sql: `SELECT e.*, l.name AS location_name, p.name AS labeled_by_name FROM theft_events e
          JOIN locations l ON e.location_id = l.id LEFT JOIN people p ON e.labeled_by_id = p.id WHERE e.id = ?`,
    args: [id],
  })).rows[0];
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(presentEvent(row));
}

// PATCH { label: theft|not|unsure|null, labeled_by_id?, label_note? } -> the
// reviewer's verdict. null clears it (puts the clip back in the queue). The
// store Mac pulls labels through /api/theft/labels and folds them into its
// training set.
export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!('label' in body)) return NextResponse.json({ error: 'label is required' }, { status: 400 });
  if (body.label !== null && !LABELS.has(body.label)) {
    return NextResponse.json({ error: 'label must be theft, not, unsure or null' }, { status: 400 });
  }
  const res = await db.execute({
    sql: `UPDATE theft_events SET label = ?, labeled_by_id = ?, label_note = ?,
          labeled_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ?`,
    args: [body.label, body.label ? (body.labeled_by_id || null) : null, body.label_note || '', body.label, id],
  });
  if (res.rowsAffected === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
