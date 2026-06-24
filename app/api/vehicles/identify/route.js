import { NextResponse } from 'next/server';
import { getClient, MODEL, friendlyError } from '@/lib/equipmentAi';
import { VEHICLE_EXTRACT_SCHEMA, VEHICLE_EXTRACT_SYSTEM } from '@/lib/vehicleAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { imageUrl } -> { name, vehicle_type, year, make, model, vin, plate, description, confidence }
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' },
      { status: 500 }
    );
  }
  const { imageUrl } = await request.json();
  if (!imageUrl || typeof imageUrl !== 'string') {
    return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 });
  }

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: VEHICLE_EXTRACT_SYSTEM,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: VEHICLE_EXTRACT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: 'Identify this vehicle from the photo.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined to read this image.' }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === 'text')?.text || '';
    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Model returned an unparseable response.' }, { status: 502 });
    }
    return NextResponse.json(extracted);
  } catch (err) {
    console.error('vehicle identify failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
