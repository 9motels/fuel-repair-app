import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getClient, MODEL, friendlyError } from '@/lib/equipmentAi';
import { MAINTENANCE_PLAN_SCHEMA, MAINTENANCE_PLAN_SYSTEM, buildMaintenancePlanPrompt } from '@/lib/vehicleAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Decode a VIN via NHTSA's free public vPIC API (no key needed).
async function decodeVin(vin) {
  if (!vin || vin.replace(/\s/g, '').length < 11) return null;
  try {
    const r = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin.trim())}?format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const row = j?.Results?.[0];
    if (!row) return null;
    return {
      make: row.Make,
      model: row.Model,
      year: row.ModelYear,
      engineCylinders: row.EngineCylinders,
      displacementL: row.DisplacementL,
      fuelType: row.FuelTypePrimary,
      trim: row.Trim,
      driveType: row.DriveType,
      bodyClass: row.BodyClass,
    };
  } catch {
    return null;
  }
}

// POST -> { intervals: [...], summary, decoded } for the vehicle (reads it from DB).
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const { id } = await params;
  const db = await getDb();
  const v = (await db.execute({ sql: 'SELECT * FROM vehicles WHERE id = ?', args: [id] })).rows[0];
  if (!v) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const decoded = await decodeVin(v.vin);

  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      system: MAINTENANCE_PLAN_SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: MAINTENANCE_PLAN_SCHEMA } },
      messages: [{ role: 'user', content: buildMaintenancePlanPrompt(v, decoded) }],
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
    return NextResponse.json({ ...plan, decoded });
  } catch (err) {
    console.error('maintenance plan failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
