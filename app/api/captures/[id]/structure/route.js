import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { structureCapture } from '@/lib/jobsAi';
import { friendlyError } from '@/lib/equipmentAi';

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

  const [locRes, eqRes] = await Promise.all([
    db.execute('SELECT id, name FROM locations ORDER BY name'),
    db.execute(`SELECT e.id, e.name, e.make, e.model, l.name AS location_name
                FROM equipment e LEFT JOIN locations l ON e.location_id = l.id
                WHERE e.status != 'retired' ORDER BY l.name, e.name`),
  ]);

  try {
    const draft = await structureCapture({
      rawText: capture.raw_text,
      locations: locRes.rows,
      equipment: eqRes.rows,
    });
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
