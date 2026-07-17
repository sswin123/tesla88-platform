import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { invalidatePolicyCache } from '@/lib/services/RegistrationPolicyService';

export async function GET() {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rows } = await pool.query<{ key: string; value: string; description: string; updated_at: string }>(
      'SELECT key, value, description, updated_at::text FROM registration_security_config ORDER BY key'
    );
    return NextResponse.json({ config: rows });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (msg.includes('does not exist')) {
      return NextResponse.json({ error: 'migration_required', message: '请先执行 Migration 057' }, { status: 503 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, string>;

  for (const [key, value] of Object.entries(body)) {
    await pool.query(
      `INSERT INTO registration_security_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
  }

  invalidatePolicyCache();
  return NextResponse.json({ ok: true });
}
