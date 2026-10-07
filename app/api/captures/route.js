import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET [?status=] -> recent captures (the durable quick-capture log).
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const args = [];
  let where = '';
  if (status) {
    where = 'WHERE c.status = ?';
    args.push(status);
  }
  const rows = (
    await db.execute({
      sql: `SELECT c.*, p.name AS person_name,
                   j.title AS job_title, j.status AS job_status
            FROM captures c
            LEFT JOIN people p ON c.person_id = p.id
            LEFT JOIN jobs j ON c.job_id = j.id
            ${where}
            ORDER BY c.created_at DESC
            LIMIT 40`,
      args,
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST { client_key, raw_text, person_id? } -> save the original note PROMPTLY.
// Idempotent on client_key: a retried offline-queue flush returns the same row
// instead of creating a duplicate. No AI here — this must be fast and reliable.
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const clientKey = (body.client_key || '').trim();
  const rawText = (body.raw_text || '').trim();
  if (!clientKey) {
    return NextResponse.json({ error: 'client_key is required.' }, { status: 400 });
  }
  if (!rawText) {
    return NextResponse.json({ error: 'The note is empty.' }, { status: 400 });
  }
  await db.execute({
    sql: 'INSERT OR IGNORE INTO captures (client_key, raw_text, person_id) VALUES (?, ?, ?)',
    args: [clientKey, rawText, body.person_id || null],
  });
  const row = (
    await db.execute({ sql: 'SELECT * FROM captures WHERE client_key = ?', args: [clientKey] })
  ).rows[0];
  return NextResponse.json(row);
}
