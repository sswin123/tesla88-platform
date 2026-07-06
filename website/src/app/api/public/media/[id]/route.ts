import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return new NextResponse(null, { status: 400 });

  const res = await pool.query<{ file_data: Buffer; mime_type: string | null; file_name: string }>(
    'SELECT file_data, mime_type, file_name FROM media_library WHERE id = $1 AND deleted_at IS NULL',
    [numId]
  );
  if (res.rows.length === 0) return new NextResponse(null, { status: 404 });

  const { file_data, mime_type, file_name } = res.rows[0];
  return new NextResponse(new Uint8Array(file_data), {
    headers: {
      'Content-Type':        mime_type ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${file_name}"`,
      'Cache-Control':       'public, max-age=31536000, immutable',
    },
  });
}
