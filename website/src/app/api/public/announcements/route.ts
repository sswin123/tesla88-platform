import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicAnnouncement {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'promotion' | 'warning';
  link_url: string | null;
  display_order: number;
}

export async function GET() {
  try {
    const res = await pool.query<PublicAnnouncement>(
      `SELECT id, title, message, type, link_url, display_order
       FROM website_announcements
       WHERE is_active = TRUE
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at   IS NULL OR end_at   >  NOW())
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
