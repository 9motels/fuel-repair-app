import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { webSearchJson, friendlyError } from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST -> web-searches for this machine's owner / service / parts manuals and
// returns { manuals: [{ type, title, url, source, note }] } (links only, no upload).
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const db = await getDb();
  const { id } = await params;
  const eq = (await db.execute({ sql: 'SELECT * FROM equipment WHERE id = ?', args: [id] })).rows[0];
  if (!eq) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  const makeModel = [eq.make, eq.model].filter(Boolean).join(' ').trim();
  if (!makeModel) {
    return NextResponse.json(
      { error: 'Add a make and model first so I know what to search for.' },
      { status: 400 }
    );
  }

  const system =
    `You find official manufacturer documentation for a specific piece of commercial / fuel-site equipment using web search. ` +
    `Look for the owner's/user manual, the service/technical/installation manual, and the parts manual or parts list. ` +
    `Strongly prefer the manufacturer's own website or an authorized distributor. Avoid forums, ad-heavy PDF mirrors, and login walls. ` +
    `Prefer direct PDF links when available. Only return links you actually found via search — never invent or guess a URL.`;
  const prompt =
    `Equipment: ${makeModel}${eq.category ? ` (category: ${eq.category})` : ''}.` +
    `${eq.serial ? ` Serial: ${eq.serial}.` : ''}\n` +
    `Find the owner's manual, the service/technical manual, and the parts manual/list for this exact make and model.\n\n` +
    `Respond with ONLY a JSON object of this exact shape — no prose, no markdown fences:\n` +
    `{"manuals":[{"type":"owner|service|parts|other","title":"short title","url":"https://...","source":"site or publisher","note":"one short line: what it is and how confident you are it matches"}]}\n` +
    `Include only results you actually found. Return {"manuals":[]} if nothing solid turns up.`;

  try {
    const data = await webSearchJson({ system, prompt, maxUses: 4 });
    const manuals = (Array.isArray(data.manuals) ? data.manuals : [])
      .filter((m) => m && typeof m.url === 'string' && /^https?:\/\//i.test(m.url))
      .slice(0, 12)
      .map((m) => ({
        type: ['owner', 'service', 'parts', 'other'].includes(m.type) ? m.type : 'other',
        title: String(m.title || '').slice(0, 200),
        url: m.url,
        source: String(m.source || '').slice(0, 120),
        note: String(m.note || '').slice(0, 300),
      }));
    return NextResponse.json({ manuals });
  } catch (err) {
    console.error('find-manuals failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
