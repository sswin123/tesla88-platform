import { describe, it, expect } from 'vitest';
import { resolveModuleFromPath, isValidModule, isValidPage, VALID_MODULES, VALID_PAGES } from '@/lib/staff-module-map';

describe('resolveModuleFromPath', () => {
  it('resolves the dashboard root', () => {
    expect(resolveModuleFromPath('/')).toEqual({ module: 'dashboard', page: 'view' });
  });

  it('resolves member pages', () => {
    expect(resolveModuleFromPath('/members')).toEqual({ module: 'member', page: 'list' });
    expect(resolveModuleFromPath('/members/42')).toEqual({ module: 'member', page: 'list' });
  });

  it('resolves the live monitor page distinctly from the generic staff prefix', () => {
    expect(resolveModuleFromPath('/staff/live-monitor')).toEqual({ module: 'staff', page: 'view' });
    expect(resolveModuleFromPath('/staff/attendance')).toEqual({ module: 'attendance', page: 'list' });
  });

  it('resolves livechat quick-replies distinctly from the generic livechat prefix', () => {
    expect(resolveModuleFromPath('/livechat/quick-replies')).toEqual({ module: 'livechat', page: 'settings' });
    expect(resolveModuleFromPath('/livechat')).toEqual({ module: 'livechat', page: 'list' });
  });

  it('falls back to dashboard/view for unknown paths', () => {
    expect(resolveModuleFromPath('/some-unmapped-page')).toEqual({ module: 'dashboard', page: 'view' });
  });
});

describe('whitelist guards', () => {
  it('accepts every module resolveModuleFromPath can produce', () => {
    for (const m of VALID_MODULES) expect(isValidModule(m)).toBe(true);
    expect(isValidModule('not-a-real-module')).toBe(false);
  });

  it('accepts every page resolveModuleFromPath can produce', () => {
    for (const p of VALID_PAGES) expect(isValidPage(p)).toBe(true);
    expect(isValidPage('not-a-real-page')).toBe(false);
  });
});
