import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Accepts a multipart form with a `file`, stores it in Vercel Blob, returns
// its public URL. Used by the equipment form, maintenance-log form, and the
// equipment documents (manuals / warranty PDFs) uploader.
export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const isImage = !!file.type && file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Only image or PDF files are allowed.' }, { status: 400 });
  }
  // Photos are capped at 15 MB; PDFs (manuals) can be larger but Claude's PDF
  // reader tops out at 32 MB, so hold the line there.
  const limit = isPdf ? 32 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > limit) {
    return NextResponse.json(
      { error: isPdf ? 'PDF is too large (max 32 MB).' : 'Image is too large (max 15 MB).' },
      { status: 400 }
    );
  }
  const name = (file.name || (isPdf ? 'document.pdf' : 'photo')).replace(/[^\w.\-]/g, '_');
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
