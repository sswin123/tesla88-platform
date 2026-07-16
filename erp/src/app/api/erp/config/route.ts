import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    website_url: process.env.WEBSITE_URL ?? '',
  });
}
