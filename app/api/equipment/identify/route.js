import { NextResponse } from 'next/server';
import {
  getClient,
  MODEL,
  EXTRACT_SCHEMA,
  EXTRACT_SYSTEM,
  friendlyError,
} from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { imageUrl } -> { name, category, make, model, serial, description, confidence }
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' },
      { status: 500 }
    );
  }
  const body = await request.json();
  const urls = (Array.isArray(body.imageUrls) ? body.imageUrls : [body.imageUrl])
    .filter((u) => typeof u === 'string' && u);
  if (urls.length === 0) {
    return NextResponse.json({ error: 'At least one image is required.' }, { status: 400 });
  }

  try {
    const client = getClient();
    const content = urls.map((url) => ({ type: 'image', source: { type: 'url', url } }));
    content.push({
      type: 'text',
      text:
        urls.length > 1
          ? 'These photos show the SAME piece of equipment (different angles / close-ups of the nameplate). Combine what you can read across all of them to identify it — use the clearest photo for each field.'
          : 'Identify this equipment from the photo.',
    });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: EXTRACT_SYSTEM,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: EXTRACT_SCHEMA },
      },
      messages: [{ role: 'user', content }],
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
    console.error('equipment identify failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
