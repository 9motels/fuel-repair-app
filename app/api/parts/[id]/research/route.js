import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { researchPart } from '@/lib/partsAi';
import { friendlyError } from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST -> web-search for sources + compatibility questions for this part need.
// Stores the result on the part; advances needs_research -> ready_to_order.
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const db = await getDb();
  const { id } = await params;
  const part = (
    await db.execute({
      sql: `SELECT p.*, e.name AS equipment_name, e.make, e.model, l.name AS location_name
            FROM parts p
            LEFT JOIN equipment e ON p.equipment_id = e.id
            LEFT JOIN locations l ON p.location_id = l.id
            WHERE p.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 });

  const equipmentLabel = part.equipment_name || [part.make, part.model].filter(Boolean).join(' ') || '';

  try {
    const result = await researchPart({
      description: part.description,
      equipmentLabel,
      locationName: part.location_name,
    });
    const compatText = result.compat_questions.length ? result.compat_questions.join(' • ') : '';
    await db.execute({
      sql: `UPDATE parts SET candidates = ?, compat_notes = ?,
                 status = CASE WHEN status = 'needs_research' THEN 'ready_to_order' ELSE status END,
                 updated_at = datetime('now')
            WHERE id = ?`,
      args: [JSON.stringify(result.candidates), compatText, id],
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('part research failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
