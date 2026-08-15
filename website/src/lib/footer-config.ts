import { z } from 'zod';

export const FOOTER_CONFIG_VERSION = 1 as const;

// Runtime schema — validates structural correctness of stored footer_config /
// footer_config_draft JSON. Mirrors website/src/lib/header-config.ts.
export const FooterItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  link_type: z.enum(['internal', 'external']),
  route: z.string(),
  open_in_new_tab: z.boolean().optional(),
  enabled: z.boolean(),
  sort_order: z.number(),
  icon_media_id: z.number().int().nullable().optional(),
  active_icon_media_id: z.number().int().nullable().optional(),
  default_icon_key: z.enum(['home', 'history', 'promotion', 'chat', 'profile', 'custom']),
});

export const FooterStyleSchema = z.object({
  variant: z.enum(['classic', 'glass', 'solid', 'gradient']).optional(),
  background: z.string().optional(),
  border: z.boolean().optional(),
  icon_size: z.number().optional(),
  text_size: z.number().optional(),
  spacing: z.string().optional(),
  height: z.number().optional(),
  opacity: z.number().optional(),
});

export const FooterConfigSchema = z.object({
  _version: z.number().int().min(1).optional(),
  items: z.array(FooterItemSchema),
  style: FooterStyleSchema,
});

export type FooterLinkType = 'internal' | 'external';
export type FooterDefaultIconKey = 'home' | 'history' | 'promotion' | 'chat' | 'profile' | 'custom';

export interface FooterItem {
  id: string;
  label: string;
  link_type: FooterLinkType;
  route: string;
  open_in_new_tab?: boolean;
  enabled: boolean;
  sort_order: number;
  icon_media_id?: number | null;
  active_icon_media_id?: number | null;
  default_icon_key: FooterDefaultIconKey;
}

export interface FooterStyle {
  variant?: 'classic' | 'glass' | 'solid' | 'gradient';
  background?: string;
  border?: boolean;
  icon_size?: number;
  text_size?: number;
  spacing?: string;
  height?: number;
  opacity?: number;
}

export interface FooterConfig {
  _version?: number;
  items: FooterItem[];
  style: FooterStyle;
}

// Parses a raw DB string and validates structural correctness via Zod.
// Returns null if the string is missing, invalid JSON, or fails schema validation
// — callers must fall back to the site's hardcoded default 5-tab footer on null.
export function parseFooterConfig(raw: string): FooterConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = FooterConfigSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data as FooterConfig;
  } catch {
    return null;
  }
}
