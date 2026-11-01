import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { structureCapture } from '@/lib/jobsAi';
import { friendlyError } from '@/lib/equipmentAi';
import { PART_OPEN_STATUSES } from '@/lib/partMeta';
import { storageOptions } from '@/lib/partsDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST -> AI parses the capture's raw text into an editable draft (NOT committed).
// On failure the original capture is untouched so nothing is lost.
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const db = await getDb();
  const { id } = await params;

  const capture = (await db.execute({ sql: 'SELECT * FROM captures WHERE id = ?', args: [id] })).rows[0];
  if (!capture) return NextResponse.json({ error: 'Capture not found' }, { status: 404 });

  const [locRes, eqRes, partRes, storage] = await Promise.all([
    db.execute('SELECT id, name FROM locations ORDER BY name'),
    db.execute(`SELECT e.id, e.name, e.make, e.model, l.name AS location_name
                FROM equipment e LEFT JOIN locations l ON e.location_id = l.id
                WHERE e.status != 'retired' ORDER BY l.name, e.name`),
    db.execute({
      sql: `SELECT p.id, p.description, p.quantity, p.status, p.part_number, p.supplier, p.order_number,
                   l.name AS location_name, j.title AS job_title
            FROM parts p
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE p.status IN (${PART_OPEN_STATUSES.map(() => '?').join(',')})
            ORDER BY p.updated_at DESC LIMIT 60`,
      args: PART_OPEN_STATUSES,
    }),
    storageOptions(db),
  ]);

  try {
    const draft = await structureCapture({
      rawText: capture.raw_text,
      locations: locRes.rows,
      equipment: eqRes.rows,
      openParts: partRes.rows,
      storageOptions: storage,
    });
    // Drop any part match the model pointed at that isn't actually an open part.
    const openIds = new Set(partRes.rows.map((p) => Number(p.id)));
    draft.parts = (Array.isArray(draft.parts) ? draft.parts : []).map((p) => ({
      ...p,
      match_part_id: p.match_part_id && openIds.has(Number(p.match_part_id)) ? Number(p.match_part_id) : null,
    }));
    // Stash the AI result for reference; status flips to 'structured' only on confirm.
    await db.execute({
      sql: 'UPDATE captures SET ai_json = ? WHERE id = ?',
      args: [JSON.stringify(draft), id],
    });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error('capture structure failed:', err);
    // Original capture is intact — report the failure so the UI can retry or
    // let the user fill the draft by hand.
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
