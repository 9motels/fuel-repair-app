import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Accepts a multipart form with a `file`, stores it in Vercel Blob, returns
// its public URL. Used by the equipment form + maintenance-log form.
export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const name = (file.name || 'photo').replace(/[^\w.\-]/g, '_');
  try {
    // On Vercel, @vercel/blob authenticates via the connected store (BLOB_STORE_ID)
    // using the deployment's OIDC token — no static token needed. For local
    // `next dev`, set BLOB_READ_WRITE_TOKEN (e.g. via `vercel env pull`).
    const blob = await put(`equipment/${name}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error('blob upload failed:', err);
    const msg = /token/i.test(err?.message || '')
      ? 'Photo storage isn’t connected — connect a Vercel Blob store to this project (or set BLOB_READ_WRITE_TOKEN for local dev).'
      : err?.message || 'Photo upload failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
