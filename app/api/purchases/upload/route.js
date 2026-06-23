import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Accepts a multipart form with a `file` (invoice photo or PDF), stores it in
// Vercel Blob, and returns its public URL plus whether it's a PDF.
export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const type = file.type || '';
  const isPdf = type === 'application/pdf';
  if (!type.startsWith('image/') && !isPdf) {
    return NextResponse.json({ error: 'Upload a photo or a PDF of the invoice.' }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File is too large (max 25 MB).' }, { status: 400 });
  }
  const name = (file.name || 'invoice').replace(/[^\w.\-]/g, '_');
  try {
    // On Vercel, @vercel/blob authenticates via the connected store using the
    // deployment's OIDC token — no static token needed. For local `next dev`,
    // set BLOB_READ_WRITE_TOKEN (e.g. via `vercel env pull`).
    const blob = await put(`invoices/${name}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url, isPdf });
  } catch (err) {
    console.error('invoice upload failed:', err);
    const msg = /token/i.test(err?.message || '')
      ? 'File storage isn’t connected — connect a Vercel Blob store to this project (or set BLOB_READ_WRITE_TOKEN for local dev).'
      : err?.message || 'Upload failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
