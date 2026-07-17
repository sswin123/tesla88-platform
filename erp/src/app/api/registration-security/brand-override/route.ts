import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { invalidatePolicyCache } from '@/lib/services/RegistrationPolicyService';

export async function GET() {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT id, brand_name, phone_check_enabled, phone_max_accounts,
            bank_check_enabled, bank_max_members, notes,
            created_at::text, updated_at::text
     FROM brand_registration_override ORDER BY brand_name`
  );
  return NextResponse.json({ overrides: rows });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    brand_name?: string;
    phone_check_enabled?: boolean | null;
    phone_max_accounts?: number | null;
    bank_check_enabled?: boolean | null;
    bank_max_members?: number | null;
    notes?: string;
  };

  if (!body.brand_name?.trim())
    return NextResponse.json({ error: 'brand_name required' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO brand_registration_override
       (brand_name, phone_check_enabled, phone_max_accounts, bank_check_enabled, bank_max_members, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (brand_name) DO UPDATE SET
       phone_check_enabled = EXCLUDED.phone_check_enabled,
       phone_max_accounts  = EXCLUDED.phone_max_accounts,
       bank_check_enabled  = EXCLUDED.bank_check_enabled,
       bank_max_members    = EXCLUDED.bank_max_members,
       notes               = EXCLUDED.notes,
       updated_at          = NOW()
     RETURNING id`,
    [
      body.brand_name.trim().toUpperCase(),
      body.phone_check_enabled ?? null,
      body.phone_max_accounts  ?? null,
      body.bank_check_enabled  ?? null,
      body.bank_max_members    ?? null,
      body.notes?.trim() || null,
    ]
  );

  invalidatePolicyCache();
  return NextResponse.json({ ok: true, id: rows[0].id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await pool.query('DELETE FROM brand_registration_override WHERE id = $1', [id]);
  invalidatePolicyCache();
  return NextResponse.json({ ok: true });
}
