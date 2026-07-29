import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { webSearchJson, friendlyError } from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { query } -> web-searches for buyable parts that fit this machine and
// returns { parts: [{ name, part_number, vendor, url, price, fits_note }], note }.
export async function POST(request, { params }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const body = await request.json();
  const query = (body.query || '').trim();
  if (!query) {
    return NextResponse.json({ error: 'Describe the part you need.' }, { status: 400 });
  }

  const db = await getDb();
  const { id } = await params;
  const eq = (await db.execute({ sql: 'SELECT * FROM equipment WHERE id = ?', args: [id] })).rows[0];
  if (!eq) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  const makeModel = [eq.make, eq.model].filter(Boolean).join(' ').trim() || eq.name || 'this equipment';

  const system =
    `You help a field technician find and buy the correct replacement part for a specific piece of commercial / fuel-site equipment, using web search. ` +
    `Confirm the part fits the given make/model where you can. Return direct links to a product page where the part can be bought (manufacturer, authorized distributor, or a reputable parts retailer). ` +
    `Avoid forums and dead links. Only return links and part numbers you actually found via search — never invent a part number or URL. If you are unsure a part fits, say so in fits_note rather than omitting the caveat.`;
  const prompt =
    `Equipment: ${makeModel}${eq.category ? ` (category: ${eq.category})` : ''}` +
    `${eq.serial ? `, serial ${eq.serial}` : ''}.\n` +
    `The technician needs: ${query}\n\n` +
    `Find the specific replacement part(s) and where to buy them. Respond with ONLY a JSON object of this exact shape — no prose, no markdown fences:\n` +
    `{"parts":[{"name":"part name","part_number":"OEM/vendor part # or empty","vendor":"seller","url":"https://... product page","price":"e.g. $42.00 or empty","fits_note":"how you know it fits, or a caveat"}],"note":"one short line of overall guidance"}\n` +
    `Return up to 6 parts, best match first. Use {"parts":[],"note":"..."} if you can't find a confident match.`;

  try {
    const data = await webSearchJson({ system, prompt, maxUses: 3 });
    const parts = (Array.isArray(data.parts) ? data.parts : [])
      .filter((p) => p && typeof p.url === 'string' && /^https?:\/\//i.test(p.url))
      .slice(0, 6)
      .map((p) => ({
        name: String(p.name || '').slice(0, 200),
        part_number: String(p.part_number || '').slice(0, 80),
        vendor: String(p.vendor || '').slice(0, 120),
        url: p.url,
        price: String(p.price || '').slice(0, 40),
        fits_note: String(p.fits_note || '').slice(0, 300),
      }));
    return NextResponse.json({ parts, note: String(data.note || '').slice(0, 400) });
  } catch (err) {
    console.error('find-parts failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }
}
