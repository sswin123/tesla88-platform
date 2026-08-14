export interface NavItem {
  id: string;
  label: string;
  icon?: string;
  url: string;
  open: 'same' | 'new';
  children?: NavItem[];
}

export interface NavConfig {
  items: NavItem[];
}

export function parseNavConfig(raw: string): NavConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'items' in parsed &&
      Array.isArray((parsed as { items: unknown }).items)
    ) {
      return parsed as NavConfig;
    }
    return null;
  } catch {
    return null;
  }
}
