import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Accepts a multipart form with a `file`, stores it in Vercel Blob, returns
// its public URL. Used by the equipment form + maintenance-log form.
export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          'Photo storage isn’t configured yet — enable a Vercel Blob store on this project (adds BLOB_READ_WRITE_TOKEN).',
      },
      { status: 500 }
    );
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const name = (file.name || 'photo').replace(/[^\w.\-]/g, '_');
  const blob = await put(`equipment/${name}`, file, {
    access: 'public',
    addRandomSuffix: true,
  });
  return NextResponse.json({ url: blob.url });
}
