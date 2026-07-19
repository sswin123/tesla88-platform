import { NextResponse } from 'next/server';

// Public endpoint for external uptime monitoring only.
// Returns minimal status — no infrastructure details exposed.
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
