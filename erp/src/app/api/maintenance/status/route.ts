import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/repositories/settings_repo';

export async function GET() {
  const maintenanceMode = await getSetting('maintenance_mode');
  return NextResponse.json({ maintenance_mode: maintenanceMode === 'true' });
}
