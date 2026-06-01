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

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  // In non-production we allow unauthenticated calls so we can hit the
  // endpoint locally without setting up a secret.
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }

  const db = await getDb();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const result = await runLowStockCheck(db, {
    trigger: 'cron',
    resend,
    fromAddress: FROM_ADDRESS,
    toAddress: TO_ADDRESS,
  });

  const httpStatus = result.ok ? 200 : 502;
  return NextResponse.json(result, { status: httpStatus });
}
