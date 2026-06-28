import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendPushToAll, pushConfigured } from '@/lib/push';

export const runtime = 'nodejs';

// POST -> send a test notification to all subscribed devices.
export async function POST() {
  if (!pushConfigured()) {
    return NextResponse.json({ error: 'Push isn’t configured (VAPID keys missing).' }, { status: 400 });
  }
  const db = await getDb();
  const result = await sendPushToAll(db, {
    title: '23 Fuels Maintenance',
    body: 'Push notifications are working 🎉',
    url: '/',
  });
  return NextResponse.json(result);
}
