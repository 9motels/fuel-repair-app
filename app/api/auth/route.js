import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

// GET -> { configured } so the UI knows whether the gate is active.
export async function GET() {
  return NextResponse.json({ configured: !!process.env.APP_PASSCODE });
}

// POST { passcode } -> sets the auth cookie when the passcode matches.
export async function POST(request) {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return NextResponse.json({ error: 'Login is not configured.' }, { status: 400 });
  const { passcode } = await request.json().catch(() => ({}));
  if (!passcode || passcode !== expected) {
    return NextResponse.json({ error: 'Incorrect passcode.' }, { status: 401 });
  }
  const token = crypto.createHash('sha256').update(expected).digest('hex');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fuelapp_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 60, // 60 days
  });
  return res;
}

// DELETE -> clear the cookie (lock the app).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fuelapp_auth', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
