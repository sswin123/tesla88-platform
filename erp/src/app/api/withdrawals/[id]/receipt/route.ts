import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';
import { mediaService, MediaValidationError } from '@/lib/media';

// POST: upload receipt for an approved withdrawal
// Accepts multipart/form-data with a "file" field
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const withdrawalId = parseInt(id, 10);
  if (isNaN(withdrawalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Verify withdrawal exists and is PAID
  const check = await pool.query<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM withdrawal_requests WHERE id = $1 AND status = 'PAID'`,
    [withdrawalId]
  );
  if (!check.rows[0]) {
    return NextResponse.json(
      { error: 'Withdrawal not found or not yet approved' },
      { status: 404 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let mediaId: number;
  try {
    const result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType: file.type || 'application/octet-stream',
      uploadedBy: payload.sub,
      displayName: `WD-${withdrawalId}-receipt`,
    });
    mediaId = result.record.id;
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    console.error('[withdrawal/receipt POST] media save error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  // Save media_id to withdrawal_requests
  await pool.query(
    `UPDATE withdrawal_requests SET receipt_media_id = $1 WHERE id = $2`,
    [mediaId, withdrawalId]
  );

  logAudit({
    admin_id:    payload.sub,
    action:      'WITHDRAWAL_RECEIPT_UPLOAD',
    target_type: 'withdrawal',
    target_id:   withdrawalId,
    new_value:   { receipt_media_id: mediaId },
  }).catch(() => {});

  return NextResponse.json({ ok: true, receipt_media_id: mediaId });
}

// DELETE: remove receipt from a withdrawal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const withdrawalId = parseInt(id, 10);
  if (isNaN(withdrawalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await pool.query(
    `UPDATE withdrawal_requests SET receipt_media_id = NULL WHERE id = $1`,
    [withdrawalId]
  );

  return NextResponse.json({ ok: true });
}
