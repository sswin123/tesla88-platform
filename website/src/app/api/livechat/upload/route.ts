import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getMember } from '@/lib/member-auth';

export const runtime = 'nodejs';

const GUEST_COOKIE = 'guest_chat_id';
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED: Record<string, string> = {
  'image/jpeg':  'jpg',
  'image/png':   'png',
  'image/gif':   'gif',
  'image/webp':  'webp',
  'video/mp4':   'mp4',
  'video/webm':  'webm',
};

export async function POST(req: NextRequest) {
  const member = await getMember();
  const guestId = req.cookies?.get(GUEST_COOKIE)?.value;
  if (!member && !guestId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 });

  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });

  const uuid = randomUUID();
  const fileName = `${uuid}.${ext}`;
  const bytes = await file.arrayBuffer();

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, fileName), Buffer.from(bytes));
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const fileId = `local:${fileName}`;
  const msgType = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
  return NextResponse.json({ file_id: fileId, message_type: msgType }, { status: 201 });
}
