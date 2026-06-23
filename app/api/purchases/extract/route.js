import { NextResponse } from 'next/server';
import { getClient, MODEL, friendlyError } from '@/lib/equipmentAi';
import { INVOICE_SCHEMA, INVOICE_SYSTEM, buildInvoiceContent } from '@/lib/invoiceAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { fileUrl, isPdf } -> { vendor, invoice_date, line_items: [...] }
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' },
      { status: 500 }
    );
  }
  const { fileUrl, isPdf } = await request.json();
  if (!fileUrl || typeof fileUrl !== 'string') {
    return NextResponse.json({ error: 'fileUrl is required.' }, { status: 400 });
  }

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: INVOICE_SYSTEM,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: INVOICE_SCHEMA },
      },
      messages: [{ role: 'user', content: buildInvoiceContent(fileUrl, !!isPdf) }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined to read this file.' }, { status: 422 });
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
    console.error('invoice extract failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
