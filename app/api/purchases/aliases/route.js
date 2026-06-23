import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Remembered mappings from an invoice line (description / part number) to an item,
// so the invoice scanner can auto-match the same line next time.

export async function GET() {
  const db = await getDb();
  const result = await db.execute(
    'SELECT id, source_text, part_number, vendor, item_id FROM invoice_item_aliases'
  );
  return NextResponse.json(result.rows);
}

// POST { aliases: [{ source_text, part_number, vendor, item_id }] } -> upsert each
// (keyed by source_text). Newest mapping wins.
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const aliases = Array.isArray(body.aliases) ? body.aliases : [];
  let saved = 0;
  for (const a of aliases) {
    const sourceText = (a?.source_text || '').trim();
    const itemId = parseInt(a?.item_id);
    if (!sourceText || !Number.isInteger(itemId)) continue;
    await db.execute({
      sql: `INSERT INTO invoice_item_aliases (source_text, part_number, vendor, item_id, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(source_text) DO UPDATE SET
              item_id = excluded.item_id,
              part_number = excluded.part_number,
              vendor = excluded.vendor,
              updated_at = datetime('now')`,
      args: [sourceText, (a.part_number || '').trim(), (a.vendor || '').trim(), itemId],
    });
    saved += 1;
  }
  return NextResponse.json({ success: true, saved });
}

// DELETE ?id=  -> forget a remembered mapping.
export async function DELETE(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await db.execute({ sql: 'DELETE FROM invoice_item_aliases WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}
