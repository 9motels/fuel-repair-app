import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb } from '@/lib/db';
import { runLowStockCheck } from '@/lib/lowStock';

export const runtime = 'nodejs';
export const maxDuration = 30;

const FROM_ADDRESS = process.env.RESEND_FROM || 'onboarding@resend.dev';
const TO_ADDRESS =
  process.env.LOW_STOCK_REPORT_EMAIL ||
  process.env.REPAIR_REPORT_EMAIL ||
  'andrew@national9.com';

// Same-origin manual trigger. No Bearer auth — the rest of the app has none
// either. When the app grows real auth, this and every other API route
// gets the same session gate.
export async function POST() {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }
  const db = await getDb();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await runLowStockCheck(db, {
    trigger: 'manual',
    resend,
    fromAddress: FROM_ADDRESS,
    toAddress: TO_ADDRESS,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
