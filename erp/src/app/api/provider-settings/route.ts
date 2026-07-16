import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

interface ProviderRow {
  id: number; provider: string; display_name: string; enabled: boolean;
  agent_id: string | null; secret_key: string | null; callback_secret: string | null;
  signature_type: string; signature_version: string; wallet_type: string;
  currency: string; api_url: string | null; whitelist_ips: string | null;
  response_format: string; notes: string | null;
  created_at: string; updated_at: string;
}

export async function GET() {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await pool.query<ProviderRow>(
    `SELECT id, provider, display_name, enabled, agent_id,
            -- mask secret_key for list view (show only last 4 chars)
            CASE WHEN secret_key IS NOT NULL
              THEN REPEAT('*', GREATEST(0, LENGTH(secret_key)-4)) || RIGHT(secret_key, 4)
              ELSE NULL END AS secret_key,
            CASE WHEN callback_secret IS NOT NULL
              THEN REPEAT('*', GREATEST(0, LENGTH(callback_secret)-4)) || RIGHT(callback_secret, 4)
              ELSE NULL END AS callback_secret,
            signature_type, signature_version, wallet_type, currency,
            api_url, whitelist_ips, response_format, notes,
            created_at::text, updated_at::text
     FROM provider_settings ORDER BY provider`
  );
  return NextResponse.json({ providers: r.rows });
}

export async function POST(req: NextRequest) {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Partial<ProviderRow>;
  const provider = (body.provider ?? '').trim().toUpperCase();
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

  const r = await pool.query<{ id: number }>(
    `INSERT INTO provider_settings
       (provider, display_name, enabled, agent_id, secret_key, callback_secret,
        signature_type, signature_version, wallet_type, currency, api_url,
        whitelist_ips, response_format, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (provider) DO UPDATE SET
       display_name     = EXCLUDED.display_name,
       enabled          = EXCLUDED.enabled,
       agent_id         = EXCLUDED.agent_id,
       secret_key       = COALESCE(NULLIF(EXCLUDED.secret_key,''), provider_settings.secret_key),
       callback_secret  = COALESCE(NULLIF(EXCLUDED.callback_secret,''), provider_settings.callback_secret),
       signature_type   = EXCLUDED.signature_type,
       signature_version= EXCLUDED.signature_version,
       wallet_type      = EXCLUDED.wallet_type,
       currency         = EXCLUDED.currency,
       api_url          = EXCLUDED.api_url,
       whitelist_ips    = EXCLUDED.whitelist_ips,
       response_format  = EXCLUDED.response_format,
       notes            = EXCLUDED.notes,
       updated_at       = NOW()
     RETURNING id`,
    [
      provider,
      body.display_name ?? provider,
      body.enabled ?? false,
      body.agent_id ?? null,
      body.secret_key ?? null,
      body.callback_secret ?? null,
      body.signature_type ?? 'MD5',
      body.signature_version ?? 'v1',
      body.wallet_type ?? 'SEAMLESS',
      body.currency ?? 'MYR',
      body.api_url ?? null,
      body.whitelist_ips ?? null,
      body.response_format ?? 'JSON_SUCCESS',
      body.notes ?? null,
    ]
  );
  return NextResponse.json({ ok: true, id: r.rows[0].id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Partial<ProviderRow> & { provider: string };
  const provider = (body.provider ?? '').trim().toUpperCase();
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const allowed: (keyof ProviderRow)[] = [
    'display_name', 'enabled', 'agent_id', 'signature_type', 'signature_version',
    'wallet_type', 'currency', 'api_url', 'whitelist_ips', 'response_format', 'notes',
  ];
  for (const f of allowed) {
    if (body[f] !== undefined) {
      fields.push(`${f} = $${idx++}`);
      values.push(body[f]);
    }
  }
  // Secrets: only update if non-empty (masked value '****' should not overwrite)
  if (body.secret_key && !body.secret_key.startsWith('***')) {
    fields.push(`secret_key = $${idx++}`);
    values.push(body.secret_key);
  }
  if (body.callback_secret && !body.callback_secret.startsWith('***')) {
    fields.push(`callback_secret = $${idx++}`);
    values.push(body.callback_secret);
  }

  if (!fields.length) return NextResponse.json({ ok: true });

  fields.push(`updated_at = NOW()`);
  values.push(provider);
  await pool.query(
    `UPDATE provider_settings SET ${fields.join(', ')} WHERE provider = $${idx}`,
    values
  );
  return NextResponse.json({ ok: true });
}
