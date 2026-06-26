import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
} from '@/lib/repositories/announcement_repo';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = await getAnnouncementById(numId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Strip read-only fields
  const { id: _id, created_at: _ca, created_by: _cb, target_tag_name: _ttn, ...updateFields } = body;
  void _id; void _ca; void _cb; void _ttn;

  const updated = await updateAnnouncement(numId, updateFields);
  if (!updated) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const existing = await getAnnouncementById(numId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteAnnouncement(numId);
  return NextResponse.json({ ok: true });
}
