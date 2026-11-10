import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { deviceAuthorized } from '@/lib/theft';

export const runtime = 'nodejs';

// GET ?since=<ISO> (Bearer THEFT_INGEST_SECRET) -> labels set since that time,
// for the store Mac to fold into its training set. `since` is the labeled_at
// value the device last saw.
export async function GET(request) {
  if (!deviceAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const since = new URL(request.url).searchParams.get('since') || '1970-01-01';
  const rows = (await db.execute({
    sql: `SELECT e.id, e.location_id, e.label, e.label_note, e.labeled_at, p.name AS labeled_by
          FROM theft_events e LEFT JOIN people p ON e.labeled_by_id = p.id
          WHERE e.labeled_at > ? ORDER BY e.labeled_at ASC LIMIT 500`,
    args: [since],
  })).rows;
  return NextResponse.json(rows);
}
