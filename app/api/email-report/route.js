import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  const { subject, html, text } = body;
  return NextResponse.json({ subject, html, text, ready: true });
}
