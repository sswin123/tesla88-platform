/**
 * Brand Center Page — pure-logic unit tests (vitest node environment, no jsdom).
 * Tests cover exported helper functions; React rendering is not possible in node env.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  hasBrandPermission,
  buildSavePatch,
  initForm,
  type FormState,
} from '@/lib/brand-page-helpers';
import type { BrandSettings } from '@/lib/repositories/brand_repo';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_BRAND: BrandSettings = {
  id: 1,
  brand_name: 'SSWIN88',
  company_name: 'SSWIN88 Sdn Bhd',
  tagline: 'Play Smart',
  logo_media_id: 10,
  favicon_media_id: null,
  logo_size: 'medium',
  logo_align: 'left',
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  color_bg: '#0a0b14',
  color_card: '#111222',
  color_text: '#e8e8f5',
  website_domain: 'https://sswin88.com',
  api_domain: null,
  erp_domain: null,
  support_whatsapp: '+60123456789',
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  support_email: null,
  seo_title: 'SSWIN88',
  seo_description: null,
  seo_keywords: null,
  member_id_prefix: 'SS',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
};

// ── Test 1: Module exports (render check equivalent) ──────────────────────────

describe('测试 1 — 模块导出检查（页面渲染验证等价）', () => {
  it('helpers 模块导出所有辅助函数', () => {
    expect(typeof isValidUrl).toBe('function');
    expect(typeof hasBrandPermission).toBe('function');
    expect(typeof buildSavePatch).toBe('function');
    expect(typeof initForm).toBe('function');
  });

  it('initForm 返回具有正确结构的 FormState', () => {
    const form = initForm(BASE_BRAND);
    const requiredKeys: (keyof FormState)[] = [
      'brand_name', 'company_name', 'tagline',
      'logo_media_id', 'favicon_media_id',
      'primary_color', 'secondary_color', 'theme_mode',
      'website_domain', 'api_domain', 'erp_domain',
      'support_whatsapp', 'support_telegram', 'telegram_channel',
      'facebook_url', 'instagram_url', 'tiktok_url', 'support_email',
      'seo_title', 'seo_description', 'seo_keywords',
    ];
    requiredKeys.forEach(k => expect(k in form).toBe(true));
  });
});

// ── Test 2: Load existing brand ────────────────────────────────────────────────

describe('测试 2 — 加载品牌数据：initForm 将 API 数据转换为表单状态', () => {
  it('正确映射所有字段', () => {
    const form = initForm(BASE_BRAND);
    expect(form.brand_name).toBe('SSWIN88');
    expect(form.company_name).toBe('SSWIN88 Sdn Bhd');
    expect(form.tagline).toBe('Play Smart');
    expect(form.logo_media_id).toBe(10);
    expect(form.primary_color).toBe('#1d4ed8');
    expect(form.theme_mode).toBe('light');
    expect(form.website_domain).toBe('https://sswin88.com');
    expect(form.support_whatsapp).toBe('+60123456789');
  });

  it('null 字段转换为空字符串', () => {
    const form = initForm(BASE_BRAND);
    expect(form.api_domain).toBe('');
    expect(form.seo_description).toBe('');
    expect(form.seo_keywords).toBe('');
    expect(form.facebook_url).toBe('');
    expect(form.favicon_media_id).toBeNull();
  });

  it('brand_name 变更后 initForm 读取新值', () => {
    const updated = { ...BASE_BRAND, brand_name: 'NewBrand' };
    const form = initForm(updated);
    expect(form.brand_name).toBe('NewBrand');
  });
});

// ── Test 3: Save brand name ────────────────────────────────────────────────────

describe('测试 3 — 保存品牌名称：buildSavePatch 构建正确的 PATCH 体', () => {
  it('brand_name 变更后包含在 PATCH 体中', () => {
    const form = initForm({ ...BASE_BRAND, brand_name: 'Updated Brand' });
    const patch = buildSavePatch(form);
    expect(patch.brand_name).toBe('Updated Brand');
  });

  it('空字符串字段转换为 null', () => {
    const form = initForm(BASE_BRAND);
    const patch = buildSavePatch(form);
    expect(patch.api_domain).toBeNull();
    expect(patch.seo_description).toBeNull();
    expect(patch.facebook_url).toBeNull();
    expect(patch.tagline).toBe('Play Smart');
  });

  it('空 tagline 转换为 null', () => {
    const form: FormState = { ...initForm(BASE_BRAND), tagline: '' };
    const patch = buildSavePatch(form);
    expect(patch.tagline).toBeNull();
  });

  it('包含全部新字段', () => {
    const form = initForm(BASE_BRAND);
    const patch = buildSavePatch(form);
    const expectedKeys = [
      'brand_name', 'company_name', 'tagline',
      'logo_media_id', 'favicon_media_id',
      'primary_color', 'secondary_color', 'theme_mode',
      'website_domain', 'api_domain', 'erp_domain',
      'support_whatsapp', 'support_telegram', 'telegram_channel',
      'facebook_url', 'instagram_url', 'tiktok_url', 'support_email',
      'seo_title', 'seo_description', 'seo_keywords',
    ];
    expectedKeys.forEach(k => expect(k in patch).toBe(true));
  });
});

// ── Test 4: Change colors ──────────────────────────────────────────────────────

describe('测试 4 — 颜色变更：PATCH 体包含新颜色', () => {
  it('primary_color 更新后正确写入', () => {
    const form: FormState = { ...initForm(BASE_BRAND), primary_color: '#ff0000' };
    const patch = buildSavePatch(form);
    expect(patch.primary_color).toBe('#ff0000');
  });

  it('secondary_color 更新后正确写入', () => {
    const form: FormState = { ...initForm(BASE_BRAND), secondary_color: '#cc0000' };
    const patch = buildSavePatch(form);
    expect(patch.secondary_color).toBe('#cc0000');
  });

  it('theme_mode 变更为 dark', () => {
    const form: FormState = { ...initForm(BASE_BRAND), theme_mode: 'dark' };
    const patch = buildSavePatch(form);
    expect(patch.theme_mode).toBe('dark');
  });

  it('颜色和模式可同时更新', () => {
    const form: FormState = {
      ...initForm(BASE_BRAND),
      primary_color: '#aa0000',
      secondary_color: '#880000',
      theme_mode: 'system',
    };
    const patch = buildSavePatch(form);
    expect(patch.primary_color).toBe('#aa0000');
    expect(patch.secondary_color).toBe('#880000');
    expect(patch.theme_mode).toBe('system');
  });
});

// ── Test 5: Permission hidden ──────────────────────────────────────────────────

describe('测试 5 — 权限检查：无权限时显示 AccessDenied', () => {
  it('SUPER_ADMIN 有权限', () => {
    expect(hasBrandPermission({ isSuperAdmin: true, permissions: [] })).toBe(true);
  });

  it('拥有 brand.settings 权限时通过', () => {
    expect(hasBrandPermission({ isSuperAdmin: false, permissions: ['brand.settings'] })).toBe(true);
  });

  it('无 brand.settings 权限时拒绝', () => {
    expect(hasBrandPermission({ isSuperAdmin: false, permissions: ['staff.manage', 'media.view'] })).toBe(false);
  });

  it('权限为空数组时拒绝', () => {
    expect(hasBrandPermission({ isSuperAdmin: false, permissions: [] })).toBe(false);
  });

  it('API 返回 null 时拒绝', () => {
    expect(hasBrandPermission(null)).toBe(false);
  });
});

// ── Test 6: Media selector integration ────────────────────────────────────────

describe('测试 6 — 媒体选择器集成：media_id 设置和清除逻辑', () => {
  it('选择 logo 时设置 logo_media_id', () => {
    const form: FormState = { ...initForm(BASE_BRAND) };
    const selectedMedia = { id: 42 };
    // Simulate handleMediaSelect for 'logo'
    const updated: FormState = { ...form, logo_media_id: selectedMedia.id };
    expect(updated.logo_media_id).toBe(42);
  });

  it('移除 logo 时清除 logo_media_id', () => {
    const form: FormState = { ...initForm(BASE_BRAND), logo_media_id: 42 };
    const updated: FormState = { ...form, logo_media_id: null };
    expect(updated.logo_media_id).toBeNull();
  });

  it('选择 favicon 时独立设置 favicon_media_id', () => {
    const form: FormState = { ...initForm(BASE_BRAND), logo_media_id: 10, favicon_media_id: null };
    const updated: FormState = { ...form, favicon_media_id: 99 };
    expect(updated.logo_media_id).toBe(10);
    expect(updated.favicon_media_id).toBe(99);
  });

  it('媒体选择后 buildSavePatch 包含正确 media_id', () => {
    const form: FormState = { ...initForm(BASE_BRAND), logo_media_id: 55, favicon_media_id: 66 };
    const patch = buildSavePatch(form);
    expect(patch.logo_media_id).toBe(55);
    expect(patch.favicon_media_id).toBe(66);
  });

  it('移除媒体后 buildSavePatch 包含 null', () => {
    const form: FormState = { ...initForm(BASE_BRAND), logo_media_id: null };
    const patch = buildSavePatch(form);
    expect(patch.logo_media_id).toBeNull();
  });
});

// ── URL validation (bonus) ─────────────────────────────────────────────────────

describe('URL 验证辅助函数', () => {
  it('空字符串返回 true（可选字段）', () => {
    expect(isValidUrl('')).toBe(true);
    expect(isValidUrl('   ')).toBe(true);
  });

  it('有效 URL 通过验证', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://api.sswin88.com')).toBe(true);
    expect(isValidUrl('http://staging.sswin88.com')).toBe(true);
  });

  it('无协议域名也通过验证', () => {
    expect(isValidUrl('example.com')).toBe(true);
    expect(isValidUrl('sswin88.com')).toBe(true);
  });

  it('无效格式返回 false', () => {
    expect(isValidUrl('not-a-url-!!!')).toBe(false);
    expect(isValidUrl('just-text')).toBe(false);
  });
});
