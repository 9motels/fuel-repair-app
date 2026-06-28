import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

// POST a PushSubscription (+ optional person_id) -> store it (upsert by endpoint).
export async function POST(request) {
  const db = await getDb();
  const body = await request.json().catch(() => ({}));
  const sub = body.subscription || body;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, person_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, person_id = excluded.person_id`,
    args: [endpoint, p256dh, auth, body.person_id || null],
  });
  return NextResponse.json({ ok: true });
}

// DELETE ?endpoint= -> remove a subscription.
export async function DELETE(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  if (endpoint) {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [endpoint] });
  }
  return NextResponse.json({ ok: true });
}
