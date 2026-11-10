import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/theft';

export const runtime = 'nodejs';

// GET /api/theft/media/theft/<location>/<event>/<kind>.<ext> -> streams the
// private blob. The passcode gate (proxy.js) already covers /api/*, so only a
// logged-in user reaches this; the blob itself has no public URL.
export async function GET(request, { params }) {
  const { path } = await params;
  const pathname = (path || []).join('/');
  if (!pathname.startsWith('theft/') || pathname.includes('..')) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  }
  let result;
  try { result = await getPrivate(pathname); } catch (e) {
    console.error('theft media fetch failed:', e);
    return NextResponse.json({ error: 'Media unavailable' }, { status: 502 });
  }
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
