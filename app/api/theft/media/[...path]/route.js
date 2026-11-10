import { NextResponse } from 'next/server';
import { getPrivate } from '@/lib/theft';

export const runtime = 'nodejs';

// GET /api/theft/media/theft/<location>/<event>/<kind>.<ext> -> serves the
// private blob. The passcode gate (proxy.js) already covers /api/*, so only a
// logged-in user reaches this; the blob itself has no public URL.
//
// iPhone/Safari will not play a <video> unless the server answers byte-range
// requests (206 + Content-Range) and sends Content-Length, so the file is read
// into memory (clips are kept under 4 MB by the device) and sliced here.
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

  const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
  const total = buf.length;
  const type = result.blob?.contentType || 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range) {
    let start = range[1] === '' ? Math.max(0, total - Number(range[2])) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? total - 1 : Math.min(Number(range[2]), total - 1);
    if (isNaN(start) || isNaN(end) || start > end || start >= total) {
      return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${total}` } });
    }
    return new NextResponse(buf.subarray(start, end + 1), {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new NextResponse(buf, { headers: { ...base, 'Content-Length': String(total) } });
}
