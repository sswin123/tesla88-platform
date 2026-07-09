import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

const MOCK_BRAND = vi.hoisted(() => ({
  brand_name: 'TestCasino',
  company_name: 'TestCasino Sdn Bhd',
  tagline: '最好的游戏平台',
  logo_media_id: 5,
  favicon_media_id: null,
  primary_color: '#ff6600',
  secondary_color: '#cc4400',
  theme_mode: 'dark',
  website_domain: null,
  api_domain: null,
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  seo_title: 'TestCasino Online',
  seo_description: 'Best online casino in Malaysia',
  seo_keywords: null,
}));

vi.mock('@/lib/brand', () => ({
  getBrand: vi.fn().mockResolvedValue(MOCK_BRAND),
  BRAND_FALLBACK: MOCK_BRAND,
  invalidateBrandCache: vi.fn(),
}));

import manifest from '@/app/manifest';
import Loading from '@/app/loading';
import Error from '@/app/error';
import OfflinePage from '@/app/offline/page';
import { getBrand } from '@/lib/brand';

beforeEach(() => vi.clearAllMocks());

/* ── Manifest ──────────────────────────────────────────────── */

describe('PWA manifest', () => {
  it('returns correct manifest structure', async () => {
    vi.mocked(getBrand).mockResolvedValue(MOCK_BRAND);
    const m = await manifest();
    expect(m.name).toBe('TestCasino');
    expect(m.short_name).toBe('TestCasino');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.background_color).toBe('#0a0b14');
    expect(m.orientation).toBe('portrait');
  });

  it('uses brand primary_color as theme_color', async () => {
    vi.mocked(getBrand).mockResolvedValue(MOCK_BRAND);
    const m = await manifest();
    expect(m.theme_color).toBe('#ff6600');
  });

  it('includes icons when brand has logo_media_id', async () => {
    vi.mocked(getBrand).mockResolvedValue(MOCK_BRAND);
    const m = await manifest();
    expect(Array.isArray(m.icons)).toBe(true);
    expect((m.icons as { src: string }[]).length).toBeGreaterThan(0);
    expect((m.icons as { src: string }[])[0].src).toContain('/api/public/media/5');
  });

  it('has empty icons array when no logo', async () => {
    vi.mocked(getBrand).mockResolvedValueOnce({ ...MOCK_BRAND, logo_media_id: null });
    const m = await manifest();
    expect(m.icons).toHaveLength(0);
  });

  it('uses seo_description when available', async () => {
    vi.mocked(getBrand).mockResolvedValue(MOCK_BRAND);
    const m = await manifest();
    expect(m.description).toBe('Best online casino in Malaysia');
  });

  it('falls back to tagline when no seo_description', async () => {
    vi.mocked(getBrand).mockResolvedValueOnce({ ...MOCK_BRAND, seo_description: null });
    const m = await manifest();
    expect(m.description).toBe('最好的游戏平台');
  });

  it('has entertainment category', async () => {
    vi.mocked(getBrand).mockResolvedValue(MOCK_BRAND);
    const m = await manifest();
    expect(m.categories).toContain('entertainment');
  });
});

/* ── Page components export check ──────────────────────────── */

describe('Loading page', () => {
  it('exports a default function component', () => {
    expect(typeof Loading).toBe('function');
  });
});

describe('Error page', () => {
  it('exports a default function component', () => {
    expect(typeof Error).toBe('function');
  });
});

describe('Offline page', () => {
  it('exports a default function component', () => {
    expect(typeof OfflinePage).toBe('function');
  });
});
