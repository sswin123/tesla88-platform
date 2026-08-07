import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { can } from '@/lib/permission_engine';
import { providerRegistry } from '@/lib/services/provider-registry';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('member.provider_account.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const canViewPassword = await can(payload.role, 'member.provider_account.view_password').catch(() => false);

  const { rows } = await pool.query<{
    provider_code:     string;
    provider_login_id: string;
    provider_user_id:  number | null;
    provider_password: string;
    created_at:        string;
    updated_at:        string;
  }>(
    `SELECT
       pa.provider_code,
       pa.provider_login_id,
       pa.provider_user_id,
       pa.provider_password,
       pa.created_at,
       pa.updated_at
     FROM provider_accounts pa
     WHERE pa.user_id = $1
     ORDER BY pa.created_at DESC`,
    [uid],
  );

  // Resolve display_name + wallet_type via ProviderRegistryService (cached, never throws)
  const uniqueCodes = [...new Set(rows.map(r => r.provider_code))];
  const [displayNames, walletTypes] = await Promise.all([
    Promise.all(uniqueCodes.map(c => providerRegistry.getDisplayName(c))),
    Promise.all(uniqueCodes.map(c => providerRegistry.getWalletType(c))),
  ]);
  const nameMap = Object.fromEntries(uniqueCodes.map((c, i) => [c, displayNames[i]]));
  const typeMap = Object.fromEntries(uniqueCodes.map((c, i) => [c, walletTypes[i]]));

  return NextResponse.json({
    accounts: rows.map(r => ({
      provider_code:     r.provider_code,
      provider_name:     nameMap[r.provider_code] ?? r.provider_code,
      provider_login_id: r.provider_login_id,
      provider_user_id:  r.provider_user_id,
      wallet_type:       typeMap[r.provider_code] ?? 'SEAMLESS',
      password:          canViewPassword ? r.provider_password : null,
      created_at:        r.created_at,
      updated_at:        r.updated_at,
    })),
  });
}
