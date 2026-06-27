import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getClient, MODEL, friendlyError, EQUIP_PLAN_SCHEMA, EQUIP_PLAN_SYSTEM, buildEquipPlanPrompt } from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST -> { intervals: [...], summary } for the equipment (read from DB).
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const { id } = await params;
  const db = await getDb();
  const eq = (await db.execute({ sql: 'SELECT * FROM equipment WHERE id = ?', args: [id] })).rows[0];
  if (!eq) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      system: EQUIP_PLAN_SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: EQUIP_PLAN_SCHEMA } },
      messages: [{ role: 'user', content: buildEquipPlanPrompt(eq) }],
    });
    if (resp.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined this request.' }, { status: 422 });
    }
    const text = resp.content.find((b) => b.type === 'text')?.text || '';
    let plan;
    try {
      plan = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Model returned an unparseable response.' }, { status: 502 });
    }
    return NextResponse.json(plan);
  } catch (err) {
    console.error('equipment maintenance plan failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
