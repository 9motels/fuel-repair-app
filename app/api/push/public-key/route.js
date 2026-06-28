import { NextResponse } from 'next/server';

// The client needs the VAPID public key to subscribe. Null when push isn't configured.
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
