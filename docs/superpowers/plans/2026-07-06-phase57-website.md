# Phase 5.7 — Website + Member Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a white-label customer-facing website connected to the existing ERP backend, giving members a web interface for registration, login, balance checking, deposits, withdrawals, promotions, APK download, and live chat support.

**Architecture:** Separate Next.js 15 app at `/website/` (port 3001) sharing the same PostgreSQL database as ERP. Member auth is a new parallel system (phone + password, cookie `member_session`) distinct from admin JWT. Website reads existing tables (users, promotions, support_sessions, media_library) and writes deposit/withdrawal requests. ERP gains a Website Settings page + APK Manager for content control. All ERP admin routes remain untouched — the website has its own API routes.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, pg (PostgreSQL), jose (JWT HS256), bcryptjs, lucide-react, Vitest. No external chart library. No Radix UI (customer site uses plain Tailwind).

## Global Constraints

- Website is a SEPARATE Next.js app at `/website/` — never modify ERP admin routes for website features
- Member JWT: cookie name `member_session`, 7-day expiry, env `MEMBER_JWT_SECRET` (default: `member-dev-secret-change-in-production`)
- Member JWT payload: `{ sub: number (users.id), phone: string, first_name: string }`
- "Register" on website = existing Telegram-registered members activate web access by entering their phone + setting password. New accounts cannot be created from website (users.telegram_id is NOT NULL — bot owns registration)
- `website_password_hash` column added to users table (nullable) — only set when member activates web access
- Website media endpoint: `/api/public/media/[id]` reads from media_library and streams file — do NOT call ERP admin routes
- Branding from `system_settings` table (new keys added in migration 030)
- APK managed via new `apk_versions` table (migration 030)
- Live Chat: reuse existing `support_sessions` and `support_messages` tables — member sessions are linked by `user_id`
- ERP website controls MUST use `MediaPicker` from `@/components/media/MediaPicker` for logo/banner/APK selection
- Deposit/withdrawal requests submitted from website → INSERT into existing tables with status='PENDING' → admin approves in ERP
- Do NOT start: SMS OTP, Email OTP, Multi-Tenant, Billing, Public API
- Website tests: `cd website && npx vitest run`
- ERP tests: `cd erp && npx vitest run`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `erp/migrations/030_website.sql` | Create | Website settings, member auth columns, apk_versions table |
| `erp/src/lib/types.ts` | Modify | Add ApkVersion, WebsiteSettings types |
| `erp/src/app/api/apk/route.ts` | Create | ERP APK list + create |
| `erp/src/app/api/apk/[id]/route.ts` | Create | ERP APK set-current, delete |
| `erp/src/app/(dashboard)/website-settings/page.tsx` | Create | ERP Website Settings UI |
| `erp/src/app/(dashboard)/apk-manager/page.tsx` | Create | ERP APK Manager UI |
| `erp/src/components/sidebar.tsx` | Modify | Add Website section |
| `erp/tests/apk-api.test.ts` | Create | APK API tests |
| `website/package.json` | Create | Website app deps |
| `website/next.config.ts` | Create | Next.js config |
| `website/tsconfig.json` | Create | TypeScript config |
| `website/postcss.config.ts` | Create | Tailwind postcss |
| `website/vitest.config.ts` | Create | Vitest config |
| `website/middleware.ts` | Create | Member auth middleware |
| `website/src/app/globals.css` | Create | Tailwind import |
| `website/src/app/layout.tsx` | Create | Root layout with dynamic branding |
| `website/src/app/page.tsx` | Create | Homepage |
| `website/src/app/login/page.tsx` | Create | Login page |
| `website/src/app/register/page.tsx` | Create | Register/activate page |
| `website/src/app/promotions/page.tsx` | Create | Promotions listing |
| `website/src/app/download/page.tsx` | Create | APK download page |
| `website/src/app/dashboard/page.tsx` | Create | Member dashboard |
| `website/src/app/profile/page.tsx` | Create | Member profile |
| `website/src/app/chat/page.tsx` | Create | Live chat widget |
| `website/src/app/api/auth/register/route.ts` | Create | Activate web access |
| `website/src/app/api/auth/login/route.ts` | Create | Member login |
| `website/src/app/api/auth/logout/route.ts` | Create | Member logout |
| `website/src/app/api/auth/me/route.ts` | Create | Current member info |
| `website/src/app/api/public/settings/route.ts` | Create | Website brand settings |
| `website/src/app/api/public/promotions/route.ts` | Create | Public promotions list |
| `website/src/app/api/public/apk/route.ts` | Create | Current APK info + download count |
| `website/src/app/api/public/media/[id]/route.ts` | Create | Serve media from DB |
| `website/src/app/api/member/profile/route.ts` | Create | Member profile CRUD |
| `website/src/app/api/member/deposits/route.ts` | Create | Submit deposit request |
| `website/src/app/api/member/withdrawals/route.ts` | Create | Submit withdrawal request |
| `website/src/app/api/livechat/session/route.ts` | Create | Get or create chat session |
| `website/src/app/api/livechat/messages/route.ts` | Create | Send/receive messages |
| `website/src/app/api/livechat/stream/route.ts` | Create | SSE for new messages |
| `website/src/lib/db.ts` | Create | pg Pool |
| `website/src/lib/auth.ts` | Create | Member JWT + bcrypt |
| `website/src/lib/member-auth.ts` | Create | Cookie helper for API routes |
| `website/src/lib/types.ts` | Create | Website TypeScript types |
| `website/tests/auth.test.ts` | Create | Auth API tests |
| `website/tests/public-api.test.ts` | Create | Public API tests |
| `website/tests/member-api.test.ts` | Create | Member API tests |
| `website/tests/livechat.test.ts` | Create | Live chat API tests |

---

### Task 1: Database Migrations + ERP Types

**Files:**
- Create: `erp/migrations/030_website.sql`
- Modify: `erp/src/lib/types.ts`

**Interfaces:**
- Produces: `ApkVersion` interface, `WebsiteSettings` interface in `erp/src/lib/types.ts`; new DB columns and tables used by all subsequent tasks

- [ ] **Step 1: Create `erp/migrations/030_website.sql`**

```sql
-- Website brand/config keys in system_settings
INSERT INTO system_settings (key, value, description) VALUES
  ('site_brand_name',      'Member Portal', 'Website brand name shown in header'),
  ('site_primary_color',   '#3B82F6',       'Primary theme color (hex)'),
  ('site_logo_media_id',   '',              'media_library id for site logo image'),
  ('site_banner_text',     '',              'Homepage hero headline text'),
  ('site_banner_media_id', '',              'media_library id for homepage banner image'),
  ('site_contact_email',   '',              'Support contact email address'),
  ('site_contact_phone',   '',              'Support contact phone number'),
  ('site_seo_title',       'Member Portal', 'HTML <title> for website pages'),
  ('site_seo_description', '',              'Meta description for SEO'),
  ('site_terms_url',       '',              'URL to Terms & Conditions page'),
  ('website_enabled',      'true',          'Toggle to disable website publicly')
ON CONFLICT (key) DO NOTHING;

-- Member web authentication columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS website_password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website_registered_at  TIMESTAMPTZ;

-- APK version management
CREATE TABLE IF NOT EXISTS apk_versions (
  id             SERIAL PRIMARY KEY,
  version_name   VARCHAR(20)  NOT NULL,
  version_code   INTEGER      NOT NULL,
  release_notes  TEXT,
  media_id       INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  min_android    VARCHAR(10)  NOT NULL DEFAULT '6.0',
  is_current     BOOLEAN      NOT NULL DEFAULT FALSE,
  force_update   BOOLEAN      NOT NULL DEFAULT FALSE,
  download_count INTEGER      NOT NULL DEFAULT 0,
  created_by     VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one row can be is_current = TRUE at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_apk_single_current
  ON apk_versions (is_current) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_apk_versions_created
  ON apk_versions (created_at DESC);
```

- [ ] **Step 2: Apply migration manually (dev) or note for production**

```bash
# Dev: apply directly
psql $DATABASE_URL -f erp/migrations/030_website.sql
# Verify
psql $DATABASE_URL -c "\d apk_versions"
psql $DATABASE_URL -c "SELECT key FROM system_settings WHERE key LIKE 'site_%' ORDER BY key"
```

Expected: `apk_versions` table columns shown; 11 site_* keys returned.

- [ ] **Step 3: Append types to `erp/src/lib/types.ts`**

Add after the existing `CreateBroadcastInput` interface at the end of the file:

```typescript
// ── Website ──────────────────────────────────────────────────────────────────

export interface ApkVersion {
  id: number;
  version_name: string;
  version_code: number;
  release_notes: string | null;
  media_id: number | null;
  min_android: string;
  is_current: boolean;
  force_update: boolean;
  download_count: number;
  created_by: string;
  created_at: string;
}

export interface WebsiteSettings {
  site_brand_name: string;
  site_primary_color: string;
  site_logo_media_id: string;
  site_banner_text: string;
  site_banner_media_id: string;
  site_contact_email: string;
  site_contact_phone: string;
  site_seo_title: string;
  site_seo_description: string;
  site_terms_url: string;
  website_enabled: string;
}
```

- [ ] **Step 4: TypeScript check on ERP**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -10
```

Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
git add erp/migrations/030_website.sql erp/src/lib/types.ts
git commit -m "feat(website): migration 030 — website settings, member auth columns, apk_versions table"
```

---

### Task 2: Website App Bootstrap

**Files:**
- Create: `website/package.json`, `website/next.config.ts`, `website/tsconfig.json`, `website/postcss.config.ts`, `website/vitest.config.ts`
- Create: `website/middleware.ts`
- Create: `website/src/app/globals.css`, `website/src/app/layout.tsx`
- Create: `website/src/lib/db.ts`, `website/src/lib/auth.ts`, `website/src/lib/member-auth.ts`, `website/src/lib/types.ts`
- Create: `website/.env.example`

**Interfaces:**
- Produces: `signMemberJWT`, `verifyMemberJWT`, `hashPassword`, `comparePassword`, `COOKIE_NAME`, `COOKIE_MAXAGE` from `@/lib/auth`; `getMember()` from `@/lib/member-auth`; pg `pool` from `@/lib/db`; `MemberJWTPayload`, `WebsiteSettings`, `MemberProfile`, `PublicPromotion`, `ApkVersion` from `@/lib/types`

- [ ] **Step 1: Create `website/package.json`**

```json
{
  "name": "website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest"
  },
  "dependencies": {
    "next": "15.3.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "pg": "^8.13.3",
    "bcryptjs": "^3.0.2",
    "jose": "^5.9.6",
    "lucide-react": "^0.511.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/pg": "^8.11.10",
    "@types/bcryptjs": "^2.4.6",
    "tailwindcss": "^4.1.8",
    "@tailwindcss/postcss": "^4.1.8",
    "vitest": "^3.2.4",
    "@vitejs/plugin-react": "^4.5.2"
  }
}
```

- [ ] **Step 2: Create config files**

`website/next.config.ts`:
```typescript
import type { NextConfig } from 'next';
const config: NextConfig = {};
export default config;
```

`website/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`website/postcss.config.ts`:
```typescript
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```

`website/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', globals: true },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});
```

`website/.env.example`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_db
DB_USER=postgres
DB_PASSWORD=yourpassword
MEMBER_JWT_SECRET=change-this-in-production-minimum-32-chars
```

- [ ] **Step 3: Create `website/src/lib/db.ts`**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME     ?? 'erp_db',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD,
  max: 10,
});

export default pool;
```

- [ ] **Step 4: Create `website/src/lib/auth.ts`**

```typescript
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const SECRET = new TextEncoder().encode(
  process.env.MEMBER_JWT_SECRET ?? 'member-dev-secret-change-in-production'
);

export const COOKIE_NAME   = 'member_session';
export const COOKIE_MAXAGE = 60 * 60 * 24 * 7; // 7 days

export interface MemberJWTPayload {
  sub: number;
  phone: string;
  first_name: string;
}

export async function signMemberJWT(payload: MemberJWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyMemberJWT(token: string): Promise<MemberJWTPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as unknown as MemberJWTPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Create `website/src/lib/member-auth.ts`**

```typescript
import { cookies } from 'next/headers';
import { verifyMemberJWT, COOKIE_NAME, type MemberJWTPayload } from './auth';

export async function getMember(): Promise<MemberJWTPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyMemberJWT(token);
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Create `website/src/lib/types.ts`**

```typescript
export interface MemberJWTPayload {
  sub: number;
  phone: string;
  first_name: string;
}

export interface WebsiteSettings {
  site_brand_name: string;
  site_primary_color: string;
  site_logo_media_id: string;
  site_banner_text: string;
  site_banner_media_id: string;
  site_contact_email: string;
  site_contact_phone: string;
  site_seo_title: string;
  site_seo_description: string;
  site_terms_url: string;
  website_enabled: string;
}

export interface MemberProfile {
  id: number;
  first_name: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  status: string;
  total_deposit: string;
  total_withdraw: string;
  total_bonus: string;
  net_deposit: string;
  referral_code: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface PublicPromotion {
  id: number;
  name: string;
  description: string | null;
  promotion_type: string;
  bonus_type: string;
  bonus_value: string;
  min_deposit: string;
  max_bonus: string | null;
  turnover_multiplier: string;
  expiry_date: string | null;
}

export interface ApkVersion {
  id: number;
  version_name: string;
  version_code: number;
  release_notes: string | null;
  min_android: string;
  is_current: boolean;
  force_update: boolean;
  download_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  sender_type: 'USER' | 'AGENT';
  message_type: string;
  content: string | null;
  caption: string | null;
  created_at: string;
}

export interface ChatSession {
  id: number;
  status: string;
  created_at: string;
}
```

- [ ] **Step 7: Create `website/middleware.ts`**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET   = new TextEncoder().encode(process.env.MEMBER_JWT_SECRET ?? 'member-dev-secret-change-in-production');
const PROTECTED = ['/dashboard', '/profile', '/deposit', '/withdrawal', '/chat'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get('member_session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('member_session');
    return res;
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/deposit/:path*', '/withdrawal/:path*', '/chat/:path*'],
};
```

- [ ] **Step 8: Create `website/src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Create `website/src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';
import pool from '@/lib/db';
import type { WebsiteSettings } from '@/lib/types';

async function getSettings(): Promise<WebsiteSettings> {
  const keys = [
    'site_brand_name','site_primary_color','site_logo_media_id','site_banner_text',
    'site_banner_media_id','site_contact_email','site_contact_phone','site_seo_title',
    'site_seo_description','site_terms_url','website_enabled',
  ];
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)', [keys]
    );
    const map = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
    return {
      site_brand_name:      map.site_brand_name      ?? 'Member Portal',
      site_primary_color:   map.site_primary_color   ?? '#3B82F6',
      site_logo_media_id:   map.site_logo_media_id   ?? '',
      site_banner_text:     map.site_banner_text     ?? '',
      site_banner_media_id: map.site_banner_media_id ?? '',
      site_contact_email:   map.site_contact_email   ?? '',
      site_contact_phone:   map.site_contact_phone   ?? '',
      site_seo_title:       map.site_seo_title       ?? 'Member Portal',
      site_seo_description: map.site_seo_description ?? '',
      site_terms_url:       map.site_terms_url        ?? '',
      website_enabled:      map.website_enabled       ?? 'true',
    };
  } catch {
    return {
      site_brand_name: 'Member Portal', site_primary_color: '#3B82F6',
      site_logo_media_id: '', site_banner_text: '', site_banner_media_id: '',
      site_contact_email: '', site_contact_phone: '', site_seo_title: 'Member Portal',
      site_seo_description: '', site_terms_url: '', website_enabled: 'true',
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.site_seo_title, description: s.site_seo_description || undefined };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const color = s.site_primary_color;
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
            {s.site_logo_media_id
              ? <img src={`/api/public/media/${s.site_logo_media_id}`} alt="logo" className="h-8 w-auto" />
              : <span className="font-bold text-lg" style={{ color }}>{s.site_brand_name}</span>
            }
            <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Home</a>
            <a href="/promotions" className="text-sm text-gray-600 hover:text-gray-900">Promotions</a>
            <a href="/download" className="text-sm text-gray-600 hover:text-gray-900">Download</a>
            <a href="/chat" className="text-sm text-gray-600 hover:text-gray-900">Support</a>
            <div className="ml-auto flex gap-2">
              <a href="/login" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Login</a>
              <a href="/register" className="px-3 py-1.5 text-sm rounded-md text-white" style={{ background: color }}>Register</a>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} {s.site_brand_name}. All rights reserved.</p>
          {(s.site_contact_email || s.site_contact_phone) && (
            <p className="mt-1">
              {s.site_contact_email && <span>Email: {s.site_contact_email}</span>}
              {s.site_contact_email && s.site_contact_phone && ' | '}
              {s.site_contact_phone && <span>Phone: {s.site_contact_phone}</span>}
            </p>
          )}
          {s.site_terms_url && <a href={s.site_terms_url} className="mt-1 inline-block text-gray-400 hover:underline">Terms &amp; Conditions</a>}
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Install deps and verify TypeScript**

```bash
cd website && npm install
npx tsc --noEmit 2>&1 | head -20
```

Expected: Zero errors (some "cannot find module" may appear before Next.js build generates types — run `npx next build` once to fix if needed).

- [ ] **Step 11: Commit**

```bash
git add website/
git commit -m "feat(website): bootstrap Next.js 15 app — db, auth, middleware, layout, types"
```

---

### Task 3: Member Auth APIs + Tests

**Files:**
- Create: `website/src/app/api/auth/register/route.ts`
- Create: `website/src/app/api/auth/login/route.ts`
- Create: `website/src/app/api/auth/logout/route.ts`
- Create: `website/src/app/api/auth/me/route.ts`
- Create: `website/tests/auth.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `hashPassword`, `comparePassword`, `signMemberJWT`, `COOKIE_NAME`, `COOKIE_MAXAGE` from `@/lib/auth`; `getMember` from `@/lib/member-auth`
- Produces: `POST /api/auth/register` → 200 + sets `member_session` cookie; `POST /api/auth/login` → 200 + sets cookie; `POST /api/auth/logout` → 200 + clears cookie; `GET /api/auth/me` → 200 `{ sub, phone, first_name }`

- [ ] **Step 1: Write failing test**

Create `website/tests/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── register ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when phone missing', async () => {
    const res = await register(makeReq({ password: 'pass1234' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password missing', async () => {
    const res = await register(makeReq({ phone: '0123456789' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password shorter than 8 chars', async () => {
    const res = await register(makeReq({ phone: '0123456789', password: 'short' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 when phone not found in DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await register(makeReq({ phone: '0199999999', password: 'pass1234' }) as never);
    expect(res.status).toBe(404);
  });

  it('returns 409 when web access already activated', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'existing_hash' }],
    } as never);
    const res = await register(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(409);
  });

  it('returns 200 and sets cookie on success', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1, first_name: 'Alice', website_password_hash: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await register(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; first_name: string };
    expect(data.ok).toBe(true);
    expect(data.first_name).toBe('Alice');
    expect(res.headers.get('set-cookie')).toContain('member_session');
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when fields missing', async () => {
    const res = await login(makeReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 401 when user not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when no web password set', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: null, status: 'ACTIVE' }],
    } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when account frozen', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'FROZEN' }],
    } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(403);
  });

  it('returns 401 when password incorrect', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'ACTIVE' }],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'wrongpass' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets cookie on valid credentials', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'ACTIVE' }],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('member_session');
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('member_session=;');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd website && npx vitest run tests/auth.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `website/src/app/api/auth/register/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword, signMemberJWT, COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json() as { phone?: string; password?: string; first_name?: string };
  const { phone, password } = body;

  if (!phone || !password)
    return NextResponse.json({ error: 'phone and password required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const existing = await pool.query<{ id: number; first_name: string; website_password_hash: string | null }>(
    `SELECT id, first_name, website_password_hash
     FROM users WHERE phone = $1 AND status = 'ACTIVE'`,
    [phone]
  );
  if (existing.rows.length === 0)
    return NextResponse.json({ error: 'Phone number not found. Please register via Telegram first.' }, { status: 404 });
  if (existing.rows[0].website_password_hash)
    return NextResponse.json({ error: 'Web access already activated. Please login instead.' }, { status: 409 });

  const hash = await hashPassword(password);
  await pool.query(
    'UPDATE users SET website_password_hash = $1, website_registered_at = NOW() WHERE id = $2',
    [hash, existing.rows[0].id]
  );

  const token = await signMemberJWT({
    sub: existing.rows[0].id,
    phone,
    first_name: body.first_name ?? existing.rows[0].first_name,
  });
  const res = NextResponse.json({ ok: true, first_name: existing.rows[0].first_name });
  res.cookies.set(COOKIE_NAME, token, { httpOnly: true, maxAge: COOKIE_MAXAGE, path: '/', sameSite: 'lax' });
  return res;
}
```

- [ ] **Step 4: Create `website/src/app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { comparePassword, signMemberJWT, COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json() as { phone?: string; password?: string };
  const { phone, password } = body;

  if (!phone || !password)
    return NextResponse.json({ error: 'phone and password required' }, { status: 400 });

  const res = await pool.query<{ id: number; first_name: string; website_password_hash: string | null; status: string }>(
    'SELECT id, first_name, website_password_hash, status FROM users WHERE phone = $1',
    [phone]
  );
  const user = res.rows[0];
  if (!user || !user.website_password_hash)
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  if (user.status !== 'ACTIVE')
    return NextResponse.json({ error: 'Account is frozen. Contact support.' }, { status: 403 });

  const ok = await comparePassword(password, user.website_password_hash);
  if (!ok) return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });

  const token = await signMemberJWT({ sub: user.id, phone, first_name: user.first_name });
  const response = NextResponse.json({ ok: true, first_name: user.first_name });
  response.cookies.set(COOKIE_NAME, token, { httpOnly: true, maxAge: COOKIE_MAXAGE, path: '/', sameSite: 'lax' });
  return response;
}
```

- [ ] **Step 5: Create `website/src/app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
```

- [ ] **Step 6: Create `website/src/app/api/auth/me/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ sub: member.sub, phone: member.phone, first_name: member.first_name });
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd website && npx vitest run tests/auth.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 9/9 tests PASS.

- [ ] **Step 8: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 9: Commit**

```bash
git add website/src/app/api/auth/ website/tests/auth.test.ts
git commit -m "feat(website): member auth APIs — register, login, logout, me + tests"
```

---

### Task 4: Public APIs + Tests

**Files:**
- Create: `website/src/app/api/public/settings/route.ts`
- Create: `website/src/app/api/public/promotions/route.ts`
- Create: `website/src/app/api/public/apk/route.ts`
- Create: `website/src/app/api/public/media/[id]/route.ts`
- Create: `website/tests/public-api.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `WebsiteSettings`, `PublicPromotion`, `ApkVersion` from `@/lib/types`
- Produces: `GET /api/public/settings` → WebsiteSettings object; `GET /api/public/promotions` → PublicPromotion[]; `GET /api/public/apk` → ApkVersion | null; `POST /api/public/apk` → increments download_count; `GET /api/public/media/[id]` → binary file stream

- [ ] **Step 1: Write failing test**

Create `website/tests/public-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getSettings }    from '@/app/api/public/settings/route';
import { GET as getPromotions }  from '@/app/api/public/promotions/route';
import { GET as getApk, POST as postApk } from '@/app/api/public/apk/route';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/public/settings', () => {
  it('returns settings object', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { key: 'site_brand_name', value: 'TestBrand' },
        { key: 'site_primary_color', value: '#FF0000' },
      ],
    } as never);
    const res = await getSettings();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, string>;
    expect(data.site_brand_name).toBe('TestBrand');
  });
});

describe('GET /api/public/promotions', () => {
  it('returns array of active promotions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Welcome Bonus', bonus_value: '100', min_deposit: '50' }],
    } as never);
    const res = await getPromotions();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  it('returns empty array when no active promotions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getPromotions();
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });
});

describe('GET /api/public/apk', () => {
  it('returns null when no current APK', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getApk();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  it('returns current APK info', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, version_name: '1.0.0', version_code: 1, is_current: true, download_count: 42 }],
    } as never);
    const res = await getApk();
    const data = await res.json() as { version_name: string; download_count: number };
    expect(data.version_name).toBe('1.0.0');
    expect(data.download_count).toBe(42);
  });
});

describe('POST /api/public/apk', () => {
  it('returns 400 when id missing', async () => {
    const req = new Request('http://localhost/', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
    const res = await postApk(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 and increments count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const req = new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ id: 1 }), headers: { 'Content-Type': 'application/json' } });
    const res = await postApk(req as never);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd website && npx vitest run tests/public-api.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `website/src/app/api/public/settings/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const WEBSITE_KEYS = [
  'site_brand_name','site_primary_color','site_logo_media_id','site_banner_text',
  'site_banner_media_id','site_contact_email','site_contact_phone','site_seo_title',
  'site_seo_description','site_terms_url','website_enabled',
];

export async function GET() {
  const res = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM system_settings WHERE key = ANY($1)', [WEBSITE_KEYS]
  );
  const settings = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
  return NextResponse.json(settings);
}
```

- [ ] **Step 4: Create `website/src/app/api/public/promotions/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';

export async function GET() {
  const res = await pool.query<PublicPromotion>(
    `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
            min_deposit, max_bonus, turnover_multiplier, expiry_date
     FROM promotions
     WHERE is_active = TRUE AND deleted_at IS NULL
       AND (expiry_date IS NULL OR expiry_date > NOW())
     ORDER BY id DESC`
  );
  return NextResponse.json(res.rows);
}
```

- [ ] **Step 5: Create `website/src/app/api/public/apk/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { ApkVersion } from '@/lib/types';

export async function GET() {
  const res = await pool.query<ApkVersion>(
    `SELECT id, version_name, version_code, release_notes, min_android,
            is_current, force_update, download_count, created_at
     FROM apk_versions WHERE is_current = TRUE LIMIT 1`
  );
  return NextResponse.json(res.rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { id?: number };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await pool.query(
    'UPDATE apk_versions SET download_count = download_count + 1 WHERE id = $1',
    [body.id]
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Create `website/src/app/api/public/media/[id]/route.ts`**

```typescript
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
  return new NextResponse(file_data, {
    headers: {
      'Content-Type':        mime_type ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${file_name}"`,
      'Cache-Control':       'public, max-age=31536000, immutable',
    },
  });
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd website && npx vitest run tests/public-api.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 7/7 tests PASS.

- [ ] **Step 8: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 9: Commit**

```bash
git add website/src/app/api/public/ website/tests/public-api.test.ts
git commit -m "feat(website): public APIs — settings, promotions, APK, media serving + tests"
```

---

### Task 5: Member APIs + Tests

**Files:**
- Create: `website/src/app/api/member/profile/route.ts`
- Create: `website/src/app/api/member/deposits/route.ts`
- Create: `website/src/app/api/member/withdrawals/route.ts`
- Create: `website/tests/member-api.test.ts`

**Interfaces:**
- Consumes: `pool`, `getMember`, `hashPassword`
- Produces: `GET /api/member/profile` → MemberProfile; `PATCH /api/member/profile` → change password; `GET /api/member/deposits` → deposit history[]; `POST /api/member/deposits` → 201; `GET /api/member/withdrawals` → withdrawal history[]; `POST /api/member/withdrawals` → 201

- [ ] **Step 1: Write failing test**

Create `website/tests/member-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() } }));

const mockMember = { sub: 1, phone: '0123456789', first_name: 'Alice' };
vi.mock('@/lib/member-auth', () => ({ getMember: vi.fn().mockResolvedValue(mockMember) }));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/member/profile/route';
import { GET as getDeposits, POST as postDeposit } from '@/app/api/member/deposits/route';
import { GET as getWithdrawals, POST as postWithdrawal } from '@/app/api/member/withdrawals/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('GET /api/member/profile', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getProfile();
    expect(res.status).toBe(401);
  });

  it('returns member profile', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', phone: '0123456789', total_deposit: '500.00' }],
    } as never);
    const res = await getProfile();
    expect(res.status).toBe(200);
    const data = await res.json() as { first_name: string };
    expect(data.first_name).toBe('Alice');
  });
});

describe('PATCH /api/member/profile', () => {
  it('returns 400 when new_password missing', async () => {
    const res = await patchProfile(makeReq('PATCH', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 and updates password', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await patchProfile(makeReq('PATCH', { new_password: 'newpass123' }) as never);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/member/deposits', () => {
  it('returns 400 when amount missing', async () => {
    const res = await postDeposit(makeReq('POST', { provider: 'GAME_A' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when provider missing', async () => {
    const res = await postDeposit(makeReq('POST', { amount: 100 }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid submission', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 99 }] } as never);
    const res = await postDeposit(makeReq('POST', { amount: 100, provider: 'GAME_A' }) as never);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/member/withdrawals', () => {
  it('returns 400 when amount missing', async () => {
    const res = await postWithdrawal(makeReq('POST', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid submission', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ bank_name: 'BANK', bank_account: '123', bank_holder_name: 'Alice' }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 55 }] } as never);
    const res = await postWithdrawal(makeReq('POST', { amount: 200 }) as never);
    expect(res.status).toBe(201);
  });
});

describe('GET /api/member/deposits', () => {
  it('returns deposit history array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, deposit_amount: '100' }] } as never);
    const res = await getDeposits();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('GET /api/member/withdrawals', () => {
  it('returns withdrawal history array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getWithdrawals();
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd website && npx vitest run tests/member-api.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `website/src/app/api/member/profile/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await pool.query(
    `SELECT id, first_name, phone, bank_name, bank_account, bank_holder_name,
            status, total_deposit, total_withdraw, total_bonus, net_deposit,
            referral_code, created_at, last_seen_at
     FROM users WHERE id = $1`,
    [member.sub]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function PATCH(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { new_password?: string };
  if (!body.new_password)
    return NextResponse.json({ error: 'new_password required' }, { status: 400 });
  if (body.new_password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const hash = await hashPassword(body.new_password);
  await pool.query('UPDATE users SET website_password_hash = $1 WHERE id = $2', [hash, member.sub]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create `website/src/app/api/member/deposits/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, deposit_amount, bonus_amount, status, provider, created_at, reviewed_at
     FROM deposit_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { amount?: number; provider?: string; promotion_id?: number };
  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: 'amount required and must be positive' }, { status: 400 });
  if (!body.provider)
    return NextResponse.json({ error: 'provider required' }, { status: 400 });

  const res = await pool.query(
    `INSERT INTO deposit_requests
       (user_id, provider, deposit_amount, bonus_amount, credit_amount, status, promotion_id)
     VALUES ($1, $2, $3, 0, $3, 'PENDING', $4)
     RETURNING id`,
    [member.sub, body.provider, body.amount, body.promotion_id ?? null]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
```

- [ ] **Step 5: Create `website/src/app/api/member/withdrawals/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, withdraw_amount, status, bank_name, bank_account, created_at, reviewed_at
     FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { amount?: number };
  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: 'amount required and must be positive' }, { status: 400 });

  const userRes = await pool.query<{ bank_name: string; bank_account: string; bank_holder_name: string }>(
    'SELECT bank_name, bank_account, bank_holder_name FROM users WHERE id = $1',
    [member.sub]
  );
  const u = userRes.rows[0];
  if (!u?.bank_account)
    return NextResponse.json({ error: 'No bank account on file. Contact support.' }, { status: 400 });

  const res = await pool.query(
    `INSERT INTO withdrawal_requests
       (user_id, withdraw_amount, bank_name, bank_account, bank_holder_name, status, provider, game_username)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'MANUAL', '')
     RETURNING id`,
    [member.sub, body.amount, u.bank_name, u.bank_account, u.bank_holder_name]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd website && npx vitest run tests/member-api.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 9/9 PASS.

- [ ] **Step 7: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 8: Commit**

```bash
git add website/src/app/api/member/ website/tests/member-api.test.ts
git commit -m "feat(website): member APIs — profile, deposits, withdrawals + tests"
```

---

### Task 6: Website Pages (UI)

**Files:**
- Create: `website/src/app/page.tsx` (homepage — server component)
- Create: `website/src/app/promotions/page.tsx` (server component)
- Create: `website/src/app/download/page.tsx` (server component)
- Create: `website/src/app/login/page.tsx` ('use client')
- Create: `website/src/app/register/page.tsx` ('use client')
- Create: `website/src/app/dashboard/page.tsx` ('use client')
- Create: `website/src/app/profile/page.tsx` ('use client')

**Interfaces:**
- Consumes: `/api/public/settings`, `/api/public/promotions`, `/api/public/apk`, `/api/auth/*`, `/api/member/*`
- No unit tests for this task — TypeScript check + full suite must pass

- [ ] **Step 1: Create `website/src/app/page.tsx`** (homepage — server component)

```typescript
import pool from '@/lib/db';
import type { PublicPromotion, WebsiteSettings } from '@/lib/types';

async function getData() {
  const [settingsRes, promoRes] = await Promise.all([
    pool.query<{ key: string; value: string }>('SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [['site_brand_name','site_primary_color','site_banner_text','site_banner_media_id','site_contact_email','site_contact_phone']]),
    pool.query<PublicPromotion>(
      `SELECT id, name, description, bonus_type, bonus_value, min_deposit, expiry_date
       FROM promotions WHERE is_active = TRUE AND deleted_at IS NULL
       AND (expiry_date IS NULL OR expiry_date > NOW()) ORDER BY id DESC LIMIT 3`
    ),
  ]);
  const s = Object.fromEntries(settingsRes.rows.map(r => [r.key, r.value])) as Partial<WebsiteSettings>;
  return { settings: s, promotions: promoRes.rows };
}

export default async function HomePage() {
  const { settings: s, promotions } = await getData();
  const color = s.site_primary_color ?? '#3B82F6';

  return (
    <div>
      {/* Hero */}
      <section className="rounded-2xl overflow-hidden mb-12" style={{ background: `linear-gradient(135deg, ${color}20, ${color}10)`, border: `1px solid ${color}30` }}>
        {s.site_banner_media_id && (
          <img src={`/api/public/media/${s.site_banner_media_id}`} alt="banner" className="w-full h-48 object-cover" />
        )}
        <div className="p-10 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {s.site_banner_text || `Welcome to ${s.site_brand_name ?? 'Member Portal'}`}
          </h1>
          <p className="text-gray-600 mb-8">Manage your account, check promotions, and get support anytime.</p>
          <div className="flex gap-4 justify-center">
            <a href="/register" className="px-6 py-3 rounded-lg text-white font-medium" style={{ background: color }}>Get Started</a>
            <a href="/login"    className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Login</a>
          </div>
        </div>
      </section>

      {/* Top Promotions */}
      {promotions.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Current Promotions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {promotions.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                <p className="mt-3 text-sm font-medium" style={{ color }}>
                  {p.bonus_type === 'PERCENTAGE' ? `${p.bonus_value}% bonus` : `RM ${p.bonus_value} bonus`} · Min deposit RM {p.min_deposit}
                </p>
                {p.expiry_date && <p className="text-xs text-gray-400 mt-1">Expires: {new Date(p.expiry_date).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <a href="/promotions" className="text-sm font-medium" style={{ color }}>View all promotions →</a>
          </div>
        </section>
      )}

      {/* CTA row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <a href="/download" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">📱</div>
          <h3 className="font-semibold">Download App</h3>
          <p className="text-sm text-gray-500 mt-1">Get the Android APK</p>
        </a>
        <a href="/chat" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">💬</div>
          <h3 className="font-semibold">Live Support</h3>
          <p className="text-sm text-gray-500 mt-1">Chat with our team</p>
        </a>
        <a href="/dashboard" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">👤</div>
          <h3 className="font-semibold">My Account</h3>
          <p className="text-sm text-gray-500 mt-1">Check balance & history</p>
        </a>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create `website/src/app/promotions/page.tsx`** (server component)

```typescript
import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';

export default async function PromotionsPage() {
  const res = await pool.query<PublicPromotion>(
    `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
            min_deposit, max_bonus, turnover_multiplier, expiry_date
     FROM promotions WHERE is_active = TRUE AND deleted_at IS NULL
     AND (expiry_date IS NULL OR expiry_date > NOW()) ORDER BY id DESC`
  );
  const promos = res.rows;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Current Promotions</h1>
      {promos.length === 0 ? (
        <p className="text-gray-500">No active promotions at this time. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {promos.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900">{p.name}</h2>
              {p.description && <p className="text-gray-600 mt-2 text-sm">{p.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Bonus:</span> <span className="font-medium">{p.bonus_type === 'PERCENTAGE' ? `${p.bonus_value}%` : `RM ${p.bonus_value}`}</span></div>
                <div><span className="text-gray-500">Min Deposit:</span> <span className="font-medium">RM {p.min_deposit}</span></div>
                {p.max_bonus && <div><span className="text-gray-500">Max Bonus:</span> <span className="font-medium">RM {p.max_bonus}</span></div>}
                <div><span className="text-gray-500">Turnover:</span> <span className="font-medium">{p.turnover_multiplier}×</span></div>
              </div>
              {p.expiry_date && <p className="mt-3 text-xs text-orange-600">Expires: {new Date(p.expiry_date).toLocaleDateString('en-MY')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `website/src/app/download/page.tsx`** (server component)

```typescript
import pool from '@/lib/db';
import type { ApkVersion } from '@/lib/types';

export default async function DownloadPage() {
  const res = await pool.query<ApkVersion>(
    'SELECT id, version_name, version_code, release_notes, min_android, download_count, created_at FROM apk_versions WHERE is_current = TRUE LIMIT 1'
  );
  const apk = res.rows[0] ?? null;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Download App</h1>
      <p className="text-gray-500 mb-8">Get the latest version of our Android app.</p>
      {!apk ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-3">🚀</div>
          <p className="text-gray-600">App coming soon. Check back later!</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="text-5xl">📱</div>
            <div>
              <h2 className="text-xl font-bold">Version {apk.version_name}</h2>
              <p className="text-sm text-gray-500">Build {apk.version_code} · Android {apk.min_android}+</p>
              <p className="text-sm text-gray-400">{apk.download_count.toLocaleString()} downloads</p>
            </div>
          </div>
          {apk.release_notes && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">What&apos;s New</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{apk.release_notes}</p>
            </div>
          )}
          <a
            href={`/api/public/media/${apk.id}`}
            className="block w-full py-3 text-center rounded-lg text-white font-semibold bg-blue-600 hover:bg-blue-700"
            onClick={async () => { await fetch('/api/public/apk', { method: 'POST', body: JSON.stringify({ id: apk.id }), headers: { 'Content-Type': 'application/json' } }); }}
          >
            Download APK
          </a>
          <p className="mt-3 text-xs text-gray-400 text-center">Enable &quot;Install from unknown sources&quot; in Android settings before installing.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `website/src/app/login/page.tsx`** ('use client')

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    setLoading(false);
    if (res.ok) { router.push('/dashboard'); return; }
    const data = await res.json() as { error: string };
    setError(data.error ?? 'Login failed');
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Member Login</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" required placeholder="01xxxxxxxxx"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="••••••••"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Logging in…' : 'Login'}
        </button>
        <p className="text-center text-sm text-gray-500">
          First time? <a href="/register" className="text-blue-600 hover:underline">Activate web access</a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create `website/src/app/register/page.tsx`** ('use client')

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    setLoading(false);
    if (res.ok) { router.push('/dashboard'); return; }
    const data = await res.json() as { error: string };
    setError(data.error ?? 'Registration failed');
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Activate Web Access</h1>
      <p className="text-gray-500 text-sm mb-6">Already registered via Telegram? Enter your phone number to set a web password.</p>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Registered Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" required placeholder="01xxxxxxxxx"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Activating…' : 'Activate Web Access'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Already activated? <a href="/login" className="text-blue-600 hover:underline">Login here</a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Create `website/src/app/dashboard/page.tsx`** ('use client')

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberProfile } from '@/lib/types';

function fmt(n: string | number) {
  return `RM ${parseFloat(String(n)).toFixed(2)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [deposits, setDeposits]     = useState<unknown[]>([]);
  const [withdrawals, setWithdrawals] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/member/profile').then(r => r.json()),
      fetch('/api/member/deposits').then(r => r.json()),
      fetch('/api/member/withdrawals').then(r => r.json()),
    ]).then(([p, d, w]) => {
      setProfile(p as MemberProfile);
      setDeposits(d as unknown[]);
      setWithdrawals(w as unknown[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  if (!profile) return <div className="text-center py-12 text-red-400">Failed to load profile.</div>;

  const balance = parseFloat(profile.total_deposit) - parseFloat(profile.total_withdraw);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Welcome, {profile.first_name}</h1>
        <button onClick={handleLogout} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Logout</button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Net Balance', value: fmt(balance) },
          { label: 'Total Deposit', value: fmt(profile.total_deposit) },
          { label: 'Total Withdrawal', value: fmt(profile.total_withdraw) },
          { label: 'Total Bonus', value: fmt(profile.total_bonus) },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <a href="/deposit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Deposit</a>
        <a href="/withdrawal" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Withdraw</a>
        <a href="/profile" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Profile</a>
        <a href="/chat" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Support</a>
      </div>

      {/* Recent transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Recent Deposits</h2>
          {deposits.length === 0 ? <p className="text-sm text-gray-400">No deposits yet.</p> : (
            <div className="space-y-2">
              {(deposits as { id: number; deposit_amount: string; status: string; created_at: string }[]).slice(0, 5).map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{new Date(d.created_at).toLocaleDateString()}</span>
                  <span className="font-medium">{fmt(d.deposit_amount)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'APPROVED' ? 'bg-green-100 text-green-700' : d.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Recent Withdrawals</h2>
          {withdrawals.length === 0 ? <p className="text-sm text-gray-400">No withdrawals yet.</p> : (
            <div className="space-y-2">
              {(withdrawals as { id: number; withdraw_amount: string; status: string; created_at: string }[]).slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{new Date(w.created_at).toLocaleDateString()}</span>
                  <span className="font-medium">{fmt(w.withdraw_amount)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${w.status === 'PAID' ? 'bg-green-100 text-green-700' : w.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `website/src/app/profile/page.tsx`** ('use client')

```typescript
'use client';
import { useEffect, useState } from 'react';
import type { MemberProfile } from '@/lib/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [newPass, setNewPass]     = useState('');
  const [confirm, setConfirm]     = useState('');
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');

  useEffect(() => {
    fetch('/api/member/profile').then(r => r.json()).then(d => setProfile(d as MemberProfile));
  }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setError('');
    if (newPass !== confirm) { setError('Passwords do not match'); return; }
    const res = await fetch('/api/member/profile', {
      method: 'PATCH',
      body: JSON.stringify({ new_password: newPass }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) { setMsg('Password updated successfully'); setNewPass(''); setConfirm(''); }
    else { const d = await res.json() as { error: string }; setError(d.error); }
  }

  if (!profile) return <div className="text-center py-12 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-4 text-gray-700">Account Details</h2>
        <div className="space-y-3 text-sm">
          {[['Name', profile.first_name], ['Phone', profile.phone], ['Bank', profile.bank_name],
            ['Bank Account', profile.bank_account], ['Account Holder', profile.bank_holder_name],
            ['Member Since', new Date(profile.created_at).toLocaleDateString('en-MY')]
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4 text-gray-700">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{msg}</div>}
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}
          <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" required minLength={8} placeholder="New password (min 8 chars)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={8} placeholder="Confirm new password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Update Password</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Fix any type errors before committing.

- [ ] **Step 9: Run full website test suite (no regressions)**

```bash
cd website && npx vitest run 2>&1 | tail -10
```

- [ ] **Step 10: Commit**

```bash
git add website/src/app/
git commit -m "feat(website): all 7 pages — homepage, promotions, download, login, register, dashboard, profile"
```

---

### Task 7: Live Chat (Website Side)

**Files:**
- Create: `website/src/app/api/livechat/session/route.ts`
- Create: `website/src/app/api/livechat/messages/route.ts`
- Create: `website/src/app/api/livechat/stream/route.ts`
- Create: `website/src/app/chat/page.tsx`
- Create: `website/tests/livechat.test.ts`

**Interfaces:**
- Consumes: `pool`, `getMember`, `verifyMemberJWT`, `COOKIE_NAME`; existing `support_sessions` and `support_messages` tables
- Produces: `GET /api/livechat/session` → ChatSession (get or create); `GET /api/livechat/messages?session_id=N` → ChatMessage[]; `POST /api/livechat/messages` → 201; `GET /api/livechat/stream?session_id=N` → SSE stream of new messages

- [ ] **Step 1: Write failing test**

Create `website/tests/livechat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
const mockMember = { sub: 1, phone: '0123456789', first_name: 'Alice' };
vi.mock('@/lib/member-auth', () => ({ getMember: vi.fn().mockResolvedValue(mockMember) }));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getSession } from '@/app/api/livechat/session/route';
import { GET as getMessages, POST as postMessage } from '@/app/api/livechat/messages/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown, search?: string) {
  return new Request(`http://localhost/${search ?? ''}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('GET /api/livechat/session', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getSession();
    expect(res.status).toBe(401);
  });

  it('returns existing open session', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 5, status: 'OPEN', created_at: new Date().toISOString() }] } as never);
    const res = await getSession();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number };
    expect(data.id).toBe(5);
  });

  it('creates new session when none exists', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'OPEN', created_at: new Date().toISOString() }] } as never);
    const res = await getSession();
    expect(res.status).toBe(201);
  });
});

describe('POST /api/livechat/messages', () => {
  it('returns 400 when session_id missing', async () => {
    const res = await postMessage(makeReq('POST', { content: 'hi' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when content missing', async () => {
    const res = await postMessage(makeReq('POST', { session_id: 1 }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 when session not found or closed', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await postMessage(makeReq('POST', { session_id: 99, content: 'hi' }) as never);
    expect(res.status).toBe(404);
  });

  it('returns 201 on success', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 50, created_at: new Date().toISOString() }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await postMessage(makeReq('POST', { session_id: 1, content: 'Hello' }) as never);
    expect(res.status).toBe(201);
  });
});

describe('GET /api/livechat/messages', () => {
  it('returns 400 when session_id missing', async () => {
    const res = await getMessages(makeReq('GET') as never);
    expect(res.status).toBe(400);
  });

  it('returns 403 when session does not belong to member', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=99') as never);
    expect(res.status).toBe(403);
  });

  it('returns messages array', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, sender_type: 'USER', content: 'hi', created_at: new Date().toISOString() }] } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=1') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd website && npx vitest run tests/livechat.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `website/src/app/api/livechat/session/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Return existing open/active session
  const existing = await pool.query(
    `SELECT id, status, created_at FROM support_sessions
     WHERE user_id = $1 AND status IN ('OPEN','ACTIVE') ORDER BY created_at DESC LIMIT 1`,
    [member.sub]
  );
  if (existing.rows.length > 0) return NextResponse.json(existing.rows[0]);

  // Create new session
  const created = await pool.query(
    `INSERT INTO support_sessions (user_id, status, last_message_at) VALUES ($1, 'OPEN', NOW())
     RETURNING id, status, created_at`,
    [member.sub]
  );
  return NextResponse.json(created.rows[0], { status: 201 });
}
```

- [ ] **Step 4: Create `website/src/app/api/livechat/messages/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const check = await pool.query(
    'SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, member.sub]
  );
  if (check.rows.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const msgs = await pool.query(
    `SELECT id, sender_type, message_type, content, caption, created_at
     FROM support_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [sessionId]
  );
  return NextResponse.json(msgs.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { session_id?: number; content?: string };
  if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (!body.content)    return NextResponse.json({ error: 'content required' }, { status: 400 });

  const check = await pool.query(
    `SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2 AND status IN ('OPEN','ACTIVE')`,
    [body.session_id, member.sub]
  );
  if (check.rows.length === 0)
    return NextResponse.json({ error: 'Session not found or closed' }, { status: 404 });

  const msg = await pool.query(
    `INSERT INTO support_messages (session_id, sender_type, message_type, content)
     VALUES ($1, 'USER', 'TEXT', $2) RETURNING id, created_at`,
    [body.session_id, body.content]
  );
  await pool.query('UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1', [body.session_id]);
  return NextResponse.json({ ok: true, id: msg.rows[0].id }, { status: 201 });
}
```

- [ ] **Step 5: Create `website/src/app/api/livechat/stream/route.ts`** (SSE — polls every 3s for new messages)

```typescript
import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { verifyMemberJWT, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return new Response('Unauthorized', { status: 401 });

  let member;
  try { member = await verifyMemberJWT(token); }
  catch { return new Response('Unauthorized', { status: 401 }); }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return new Response('session_id required', { status: 400 });

  const check = await pool.query(
    'SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, member.sub]
  );
  if (check.rows.length === 0) return new Response('Forbidden', { status: 403 });

  const encoder = new TextEncoder();
  let lastId = parseInt(req.nextUrl.searchParams.get('last_id') ?? '0');

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: 'connected' });

      const interval = setInterval(async () => {
        try {
          const msgs = await pool.query(
            `SELECT id, sender_type, message_type, content, caption, created_at
             FROM support_messages WHERE session_id = $1 AND id > $2 ORDER BY id ASC`,
            [sessionId, lastId]
          );
          for (const m of msgs.rows) {
            send({ type: 'message', ...m });
            lastId = m.id as number;
          }
          // Also check session status
          const sess = await pool.query('SELECT status FROM support_sessions WHERE id = $1', [sessionId]);
          if (sess.rows[0]?.status === 'CLOSED') {
            send({ type: 'session_closed' });
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 3000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
```

- [ ] **Step 6: Create `website/src/app/chat/page.tsx`** ('use client')

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSession } from '@/lib/types';

export default function ChatPage() {
  const [session, setSession]   = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get or create session
    fetch('/api/livechat/session')
      .then(r => r.json())
      .then(async (s: ChatSession) => {
        setSession(s);
        const msgs = await fetch(`/api/livechat/messages?session_id=${s.id}`).then(r => r.json()) as ChatMessage[];
        setMessages(msgs);

        // Connect SSE
        const lastId = msgs.length > 0 ? msgs[msgs.length - 1].id : 0;
        const es = new EventSource(`/api/livechat/stream?session_id=${s.id}&last_id=${lastId}`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data as string) as { type: string } & ChatMessage;
          if (data.type === 'message') setMessages(prev => [...prev, data]);
          if (data.type === 'session_closed') { es.close(); setSession(prev => prev ? { ...prev, status: 'CLOSED' } : prev); }
        };
        return () => es.close();
      })
      .catch(() => setError('Failed to connect. Please refresh.'));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session || sending) return;
    setSending(true);
    const res = await fetch('/api/livechat/messages', {
      method: 'POST',
      body: JSON.stringify({ session_id: session.id, content: input.trim() }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSending(false);
    if (res.ok) {
      setMessages(prev => [...prev, { id: Date.now(), sender_type: 'USER', message_type: 'TEXT', content: input.trim(), caption: null, created_at: new Date().toISOString() }]);
      setInput('');
    }
  }

  if (error) return <div className="text-center py-12 text-red-400">{error}</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Live Support</h1>
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: '65vh' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${session?.status === 'ACTIVE' ? 'bg-green-500' : 'bg-yellow-400'}`} />
          <span className="text-sm font-medium">{session?.status === 'ACTIVE' ? 'Agent connected' : 'Waiting for agent…'}</span>
          {session?.status === 'CLOSED' && <span className="text-xs text-gray-400 ml-auto">Session closed</span>}
        </div>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-8">
              <p>How can we help you today?</p>
              <p className="mt-1">Our team will respond shortly.</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.sender_type === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
                m.sender_type === 'USER'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}>
                {m.content}
                <div className={`text-xs mt-0.5 ${m.sender_type === 'USER' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <form onSubmit={sendMessage} className="border-t border-gray-200 p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={session?.status === 'CLOSED' ? 'Session closed' : 'Type a message…'}
            disabled={!session || session.status === 'CLOSED'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
          <button type="submit" disabled={!input.trim() || !session || session.status === 'CLOSED' || sending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd website && npx vitest run tests/livechat.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 8/8 PASS.

- [ ] **Step 8: Full website test suite**

```bash
cd website && npx vitest run 2>&1 | tail -10
```

- [ ] **Step 9: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 10: Commit**

```bash
git add website/src/app/api/livechat/ website/src/app/chat/ website/tests/livechat.test.ts
git commit -m "feat(website): live chat — session, messages, SSE stream, chat page + tests"
```

---

### Task 8: ERP Website Controls

**Files:**
- Create: `erp/src/app/api/apk/route.ts` (GET list, POST create)
- Create: `erp/src/app/api/apk/[id]/route.ts` (PATCH, DELETE)
- Create: `erp/src/app/(dashboard)/website-settings/page.tsx`
- Create: `erp/src/app/(dashboard)/apk-manager/page.tsx`
- Modify: `erp/src/components/sidebar.tsx` (add Website section)
- Create: `erp/tests/apk-api.test.ts`

**Interfaces:**
- Consumes: `pool`, existing `system_settings` table (site_* keys from migration 030), `apk_versions` table, ERP auth middleware, `MediaPicker` component
- Produces: APK Manager + Website Settings pages accessible from ERP sidebar

- [ ] **Step 1: Write failing tests**

Create `erp/tests/apk-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: 1, username: 'admin' }) }));

import pool from '@/lib/db';
import { GET, POST } from '@/app/api/apk/route';
import { PATCH, DELETE } from '@/app/api/apk/[id]/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/api/apk', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, id: string, body?: unknown) {
  return new Request(`http://localhost/api/apk/${id}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('GET /api/apk', () => {
  it('returns list of APK versions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, version_name: '1.0.0', version_code: 1, is_current: true, download_count: 0, created_at: new Date().toISOString() }],
    } as never);
    const res = await GET(makeReq('GET') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('POST /api/apk', () => {
  it('returns 400 when version_name missing', async () => {
    const res = await POST(makeReq('POST', { version_code: 1, min_android: '6.0' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when version_code missing', async () => {
    const res = await POST(makeReq('POST', { version_name: '1.0.0', min_android: '6.0' }) as never);
    expect(res.status).toBe(400);
  });

  it('creates APK version and returns 201', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 1, version_name: '1.0.0' }] })
      .mockResolvedValueOnce(undefined);
    const res = await POST(makeReq('POST', { version_name: '1.0.0', version_code: 1, min_android: '6.0', is_current: true }) as never);
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/apk/[id]', () => {
  it('returns 400 when nothing to update', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
    const res = await PATCH(makeIdReq('PATCH', '1', {}) as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when APK not found', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    const res = await PATCH(makeIdReq('PATCH', '99', { is_current: true }) as never, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('updates is_current and returns 200', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 1, is_current: true }] })
      .mockResolvedValueOnce(undefined);
    const res = await PATCH(makeIdReq('PATCH', '1', { is_current: true }) as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/apk/[id]', () => {
  it('returns 404 when APK not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await DELETE(makeIdReq('DELETE', '99') as never, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when deleting current version', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, is_current: true }] } as never);
    const res = await DELETE(makeIdReq('DELETE', '1') as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
  });

  it('deletes APK and returns 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 2, is_current: false }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await DELETE(makeIdReq('DELETE', '2') as never, { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd erp && npx vitest run tests/apk-api.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `erp/src/app/api/apk/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  await requireAdmin(req);
  const res = await pool.query(
    `SELECT id, version_name, version_code, release_notes, media_id, min_android,
            is_current, force_update, download_count, created_by, created_at
     FROM apk_versions ORDER BY created_at DESC`
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  const body = await req.json() as {
    version_name?: string; version_code?: number; release_notes?: string;
    media_id?: number | null; min_android?: string; is_current?: boolean; force_update?: boolean;
  };
  if (!body.version_name) return NextResponse.json({ error: 'version_name required' }, { status: 400 });
  if (!body.version_code) return NextResponse.json({ error: 'version_code required' }, { status: 400 });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (body.is_current) {
      await client.query('UPDATE apk_versions SET is_current = FALSE WHERE is_current = TRUE');
    }
    const res = await client.query(
      `INSERT INTO apk_versions (version_name, version_code, release_notes, media_id, min_android, is_current, force_update, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [body.version_name, body.version_code, body.release_notes ?? null, body.media_id ?? null,
       body.min_android ?? '6.0', body.is_current ?? false, body.force_update ?? false, admin.username]
    );
    await client.query('COMMIT');
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (e) {
    await client?.query('ROLLBACK');
    throw e;
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 4: Create `erp/src/app/api/apk/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await req.json() as { is_current?: boolean; force_update?: boolean; release_notes?: string };

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (body.is_current === true) {
      await client.query('UPDATE apk_versions SET is_current = FALSE WHERE is_current = TRUE AND id != $1', [id]);
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.is_current    !== undefined) { sets.push(`is_current = $${i++}`);    vals.push(body.is_current); }
    if (body.force_update  !== undefined) { sets.push(`force_update = $${i++}`);  vals.push(body.force_update); }
    if (body.release_notes !== undefined) { sets.push(`release_notes = $${i++}`); vals.push(body.release_notes); }
    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    vals.push(id);
    const res = await client.query(
      `UPDATE apk_versions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    await client.query('COMMIT');
    if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (e) {
    await client?.query('ROLLBACK');
    throw e;
  } finally {
    client?.release();
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const check = await pool.query('SELECT id, is_current FROM apk_versions WHERE id = $1', [id]);
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (check.rows[0].is_current) return NextResponse.json({ error: 'Cannot delete current version. Set another version as current first.' }, { status: 409 });
  await pool.query('DELETE FROM apk_versions WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run APK tests — expect pass**

```bash
cd erp && npx vitest run tests/apk-api.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 9/9 PASS.

- [ ] **Step 6: Create `erp/src/app/(dashboard)/website-settings/page.tsx`** ('use client')

```typescript
'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media-picker';

interface SiteSettings {
  site_brand_name: string; site_primary_color: string; site_logo_media_id: string;
  site_banner_text: string; site_banner_media_id: string; site_contact_email: string;
  site_contact_phone: string; site_seo_title: string; site_seo_description: string;
  site_terms_url: string; website_enabled: string;
}

const DEFAULTS: SiteSettings = {
  site_brand_name: '', site_primary_color: '#3B82F6', site_logo_media_id: '',
  site_banner_text: '', site_banner_media_id: '', site_contact_email: '',
  site_contact_phone: '', site_seo_title: '', site_seo_description: '',
  site_terms_url: '', website_enabled: 'true',
};

const LABELS: Record<keyof SiteSettings, string> = {
  site_brand_name: 'Brand Name', site_primary_color: 'Primary Color (hex)',
  site_logo_media_id: 'Logo', site_banner_text: 'Banner Text',
  site_banner_media_id: 'Banner Image', site_contact_email: 'Contact Email',
  site_contact_phone: 'Contact Phone', site_seo_title: 'SEO Title',
  site_seo_description: 'SEO Description', site_terms_url: 'Terms URL',
  website_enabled: 'Website Enabled',
};

export default function WebsiteSettingsPage() {
  const [form, setForm] = useState<SiteSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((rows: { key: string; value: string }[]) => {
        const patch: Partial<SiteSettings> = {};
        for (const r of rows) {
          if (r.key in DEFAULTS) (patch as Record<string, string>)[r.key] = r.value;
        }
        setForm(prev => ({ ...prev, ...patch }));
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    const settings = Object.entries(form).map(([key, value]) => ({ key, value }));
    const res = await fetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (res.ok) setMsg('Settings saved.');
    else { const d = await res.json() as { error: string }; setError(d.error); }
  }

  function setField(key: keyof SiteSettings) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  const TEXT_FIELDS: (keyof SiteSettings)[] = [
    'site_brand_name','site_primary_color','site_banner_text',
    'site_contact_email','site_contact_phone','site_seo_title','site_terms_url',
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Website Settings</h1>
      <form onSubmit={save} className="space-y-5">
        {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

        <div className="flex items-center gap-3">
          <input type="checkbox" id="enabled" checked={form.website_enabled === 'true'}
            onChange={e => setForm(prev => ({ ...prev, website_enabled: e.target.checked ? 'true' : 'false' }))}
            className="h-4 w-4 rounded border-gray-300" />
          <label htmlFor="enabled" className="text-sm font-medium text-gray-700">Website Enabled</label>
        </div>

        {TEXT_FIELDS.map(key => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{LABELS[key]}</label>
            <input value={form[key]} onChange={setField(key)} type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SEO Description</label>
          <textarea value={form.site_seo_description} onChange={setField('site_seo_description')} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
          <MediaPicker
            value={form.site_logo_media_id ? parseInt(form.site_logo_media_id) : null}
            onChange={id => setForm(prev => ({ ...prev, site_logo_media_id: id ? String(id) : '' }))}
            accept="image/*"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Banner Image</label>
          <MediaPicker
            value={form.site_banner_media_id ? parseInt(form.site_banner_media_id) : null}
            onChange={id => setForm(prev => ({ ...prev, site_banner_media_id: id ? String(id) : '' }))}
            accept="image/*"
          />
        </div>

        <button type="submit" disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Create `erp/src/app/(dashboard)/apk-manager/page.tsx`** ('use client')

```typescript
'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media-picker';

interface ApkVersion {
  id: number; version_name: string; version_code: number; release_notes: string | null;
  media_id: number | null; min_android: string; is_current: boolean;
  force_update: boolean; download_count: number; created_by: string; created_at: string;
}

interface FormState {
  version_name: string; version_code: string; release_notes: string;
  media_id: number | null; min_android: string; is_current: boolean; force_update: boolean;
}

const BLANK: FormState = {
  version_name: '', version_code: '', release_notes: '', media_id: null,
  min_android: '6.0', is_current: false, force_update: false,
};

export default function ApkManagerPage() {
  const [versions, setVersions] = useState<ApkVersion[]>([]);
  const [form, setForm]         = useState<FormState>(BLANK);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [error, setError]       = useState('');

  async function load() {
    const res = await fetch('/api/apk');
    if (res.ok) setVersions(await res.json() as ApkVersion[]);
  }

  useEffect(() => { void load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    const res = await fetch('/api/apk', {
      method: 'POST',
      body: JSON.stringify({ ...form, version_code: parseInt(form.version_code) }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (res.ok) { setMsg('APK version created.'); setForm(BLANK); void load(); }
    else { const d = await res.json() as { error: string }; setError(d.error); }
  }

  async function setCurrent(id: number) {
    await fetch(`/api/apk/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_current: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function deleteVersion(id: number) {
    if (!confirm('Delete this APK version?')) return;
    const res = await fetch(`/api/apk/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json() as { error: string }; alert(d.error); return; }
    void load();
  }

  const TEXT_FIELDS: { key: keyof FormState; label: string; ph: string }[] = [
    { key: 'version_name', label: 'Version Name', ph: 'e.g. 1.2.0' },
    { key: 'version_code', label: 'Version Code', ph: 'e.g. 12' },
    { key: 'min_android',  label: 'Min Android',  ph: 'e.g. 6.0' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">APK Manager</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold mb-4">Add New Version</h2>
          <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{msg}</div>}
            {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            {TEXT_FIELDS.map(({ key, label, ph }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input value={form[key] as string} placeholder={ph} required
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Release Notes</label>
              <textarea value={form.release_notes} rows={3}
                onChange={e => setForm(prev => ({ ...prev, release_notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">APK File</label>
              <MediaPicker value={form.media_id} onChange={id => setForm(prev => ({ ...prev, media_id: id }))} accept=".apk" />
            </div>
            <div className="flex gap-6">
              {([['is_current', 'Set as current'], ['force_update', 'Force update']] as [keyof FormState, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form[key] as boolean}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300" />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={saving}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Add Version'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">All Versions</h2>
          {versions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No APK versions yet.</div>
          ) : (
            <div className="space-y-3">
              {versions.map(v => (
                <div key={v.id} className={`bg-white rounded-xl border p-4 ${v.is_current ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{v.version_name}</span>
                        {v.is_current && <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Current</span>}
                        {v.force_update && <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">Force</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Build {v.version_code} · Android {v.min_android}+ · {v.download_count} downloads</p>
                      {v.release_notes && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{v.release_notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!v.is_current && (
                        <button onClick={() => setCurrent(v.id)} className="text-xs px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50">Set Current</button>
                      )}
                      <button onClick={() => deleteVersion(v.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add Website section to ERP sidebar**

Open `erp/src/components/sidebar.tsx`. Find the existing nav items array. Add `Globe` to the lucide-react import and append a Website section:

```typescript
// Add to import:
import { ..., Globe, Smartphone } from 'lucide-react';

// Add new section object to the nav array:
{
  title: 'Website',
  items: [
    { href: '/website-settings', label: 'Website Settings', icon: Globe },
    { href: '/apk-manager',      label: 'APK Manager',      icon: Smartphone },
  ],
},
```

Follow the exact existing pattern for how sections and items are structured in that file.

- [ ] **Step 9: Full ERP test suite**

```bash
cd erp && npx vitest run 2>&1 | tail -10
```

- [ ] **Step 10: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -15
```

Fix any errors before committing.

- [ ] **Step 11: Commit**

```bash
git add erp/src/app/api/apk/ erp/src/app/(dashboard)/website-settings/ erp/src/app/(dashboard)/apk-manager/ erp/src/components/sidebar.tsx erp/tests/apk-api.test.ts
git commit -m "feat(erp): APK Manager + Website Settings pages + sidebar + API + tests"
```

---

### Task 9: Final Verification

**No new files.** Runs commands only.

- [ ] **Step 1: Apply DB migration**

```bash
psql "$DATABASE_URL" -f erp/migrations/030_website.sql
```

Expected: INSERT 11, ALTER TABLE, CREATE TABLE, CREATE UNIQUE INDEX — no errors.

- [ ] **Step 2: Full ERP test suite**

```bash
cd erp && npx vitest run 2>&1 | tail -10
```

Expected: All passing (same count as before Phase 5.7, plus new tests from Tasks 2, 3, 4, 5, 8).

- [ ] **Step 3: Full website test suite**

```bash
cd website && npx vitest run 2>&1 | tail -10
```

Expected: All passing (tests from Tasks 2, 3, 4, 5, 7).

- [ ] **Step 4: ERP TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -10
```

Expected: no output (zero errors).

- [ ] **Step 5: Website TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -10
```

Expected: no output (zero errors).

- [ ] **Step 6: ERP build check**

```bash
cd erp && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Website build check**

```bash
cd website && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 8: Architecture guard — no ERP routes touched by website**

```bash
# Confirm website has no imports from /erp/
grep -r "from.*erp/" website/src/ 2>/dev/null | head -5
# Expected: no output
```

- [ ] **Step 9: Architecture guard — no new business logic in website API routes**

```bash
# Website API routes should only read/write DB — no Telegram, no relay calls
grep -r "TELEGRAM\|bot_relay\|fetch.*relay" website/src/app/api/ 2>/dev/null | head -5
# Expected: no output
```

- [ ] **Step 10: Final summary commit (if any loose files)**

```bash
git status
# If clean: nothing to do
# If files remain: stage and commit with appropriate message
```

---

## Self-Review

### Spec Coverage Checklist

| Spec Requirement | Implemented In |
|---|---|
| Homepage (banner, promotions preview, download CTA) | Task 6 — `website/src/app/page.tsx` |
| Promotions page (listing) | Task 6 — `website/src/app/promotions/page.tsx` |
| APK Download page | Task 6 — `website/src/app/download/page.tsx` |
| Login (phone + password) | Task 3 + Task 6 |
| Register (activate web access) | Task 3 + Task 6 |
| Member Dashboard | Task 6 — `website/src/app/dashboard/page.tsx` |
| Member Profile + password change | Task 5 (API) + Task 6 (page) |
| Live Chat (member side) | Task 7 |
| DB migration (site_* settings, website_password_hash, apk_versions) | Task 1 |
| Website Next.js 15 app bootstrap | Task 2 |
| Member JWT auth (cookie, 7-day) | Task 2 + Task 3 |
| Middleware protecting /dashboard, /profile, /deposit, /withdrawal, /chat | Task 2 |
| Public API — settings, promotions, APK, media | Task 4 |
| Member APIs — profile, deposits, withdrawals, password change | Task 5 |
| ERP Website Settings page | Task 8 |
| ERP APK Manager page | Task 8 |
| APK CRUD API (GET, POST, PATCH, DELETE) | Task 8 |
| Sidebar Website section | Task 8 |
| Final verification commands | Task 9 |

### Placeholder Scan

- No TBD or TODO in plan
- All code blocks contain complete implementations
- All file paths are exact and consistent across tasks

### Type Consistency

- `MemberJWTPayload`: `{ sub: number; phone: string; first_name: string }` — defined Task 2, used Tasks 3, 4, 5, 7
- `COOKIE_NAME`: `'member_session'` — defined Task 2, used Tasks 3, 4, 7
- `pool`: default export from `@/lib/db` — consistent across all tasks
- `getMember()`: from `@/lib/member-auth` — consistent Tasks 3, 4, 5, 7
- `ApkVersion.media_id` references `media_library(id)` — consistent Tasks 1, 4, 6, 8
- `PublicPromotion` type used in Tasks 4 and 6 — same fields
