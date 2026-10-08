import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { extractDelivery } from '@/lib/partsAi';
import { friendlyError } from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STOP = new Set(['the', 'and', 'for', 'with', 'part', 'parts', 'pack', 'each', 'new', 'inch', 'size']);
function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// POST { imageUrl } -> read a packing slip / order confirmation and match it to an
// open ordered part. Returns the extraction + ranked candidate parts to confirm.
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }
  const body = await request.json();
  const imageUrl = (body.imageUrl || '').trim();
  if (!imageUrl) return NextResponse.json({ error: 'A photo is required.' }, { status: 400 });

  const db = await getDb();
  let extracted;
  try {
    extracted = await extractDelivery({ imageUrl });
  } catch (err) {
    console.error('delivery extract failed:', err);
    return NextResponse.json({ error: friendlyError(err) }, { status: err?.status || 500 });
  }

  // Candidates = parts still awaiting delivery (ordered first, then ready_to_order).
  const parts = (
    await db.execute({
      sql: `SELECT p.*, j.title AS job_title, l.name AS location_name, e.name AS equipment_name
            FROM parts p
            LEFT JOIN jobs j ON p.job_id = j.id
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN equipment e ON p.equipment_id = e.id
            WHERE p.status IN ('ordered', 'ready_to_order')`,
      args: [],
    })
  ).rows;

  const exOrder = (extracted.order_number || '').trim().toLowerCase();
  const exSupplier = (extracted.supplier || '').trim().toLowerCase();
  const exTokens = new Set([
    ...tokens((extracted.items || []).map((i) => i.description).join(' ')),
    ...tokens((extracted.items || []).map((i) => i.part_number).join(' ')),
  ]);

  const scored = parts.map((p) => {
    let score = 0;
    const pOrder = (p.order_number || '').trim().toLowerCase();
    if (exOrder && pOrder && (pOrder === exOrder || pOrder.includes(exOrder) || exOrder.includes(pOrder))) score += 100;
    const pSupplier = (p.supplier || '').trim().toLowerCase();
    if (exSupplier && pSupplier && (pSupplier.includes(exSupplier) || exSupplier.includes(pSupplier))) score += 30;
    const pTokens = new Set([...tokens(p.description), ...tokens(p.part_number)]);
    let overlap = 0;
    for (const t of pTokens) if (exTokens.has(t)) overlap += 1;
    score += Math.min(overlap * 10, 40);
    const confidence = score >= 100 ? 'high' : score >= 30 ? 'medium' : 'low';
    return { ...p, _score: score, confidence };
  });

  // If anything scored, surface those (ranked); otherwise return the ordered list
  // so the tech can still match by hand. Never auto-apply — this is a suggestion.
  scored.sort((a, b) => b._score - a._score);
  const positive = scored.filter((p) => p._score > 0);
  const matches = (positive.length ? positive : scored).slice(0, 6);

  return NextResponse.json({ extracted, matches });
}
