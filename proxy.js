import { NextResponse } from 'next/server';

// App-wide passcode gate (Next 16 "proxy" convention). INERT until APP_PASSCODE
// is set in the environment — with no passcode configured, every request passes
// through unchanged. The auth cookie holds the SHA-256 of the passcode (HttpOnly),
// so the raw code is never stored client-side.

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(request) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.next(); // gate disabled until configured

  const { pathname } = request.nextUrl;
  // Always-open paths: the login screen, the auth API, and cron (own secret).
  if (pathname === '/login' || pathname.startsWith('/api/auth') || pathname.startsWith('/api/cron')) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('fuelapp_auth')?.value;
  const expected = await sha256Hex(passcode);
  if (cookie && cookie === expected) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals + static/PWA assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-192.png|icon-512.png).*)'],
};
