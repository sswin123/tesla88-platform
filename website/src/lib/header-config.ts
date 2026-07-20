import { z } from 'zod';
import type { HeaderWidget } from '../app/components/HeaderWidgets';

export const HEADER_CONFIG_VERSION = 1 as const;

// Runtime schema — validates structural correctness of stored header_config JSON.
// Widget settings use a loose record type; the application layer maintains the union.
export const HeaderConfigSchema = z.object({
  _version: z.number().int().min(1).optional(),
  layout: z.enum(['left-logo', 'center-logo', 'right-logo']),
  style: z.string(),
  sticky: z.boolean(),
  blur: z.boolean(),
  show_menu_button: z.boolean(),
  show_announcement: z.boolean(),
  show_logo: z.boolean(),
  show_brand_text: z.boolean(),
  show_profile_widget: z.boolean().default(true),
  show_header_widgets: z.boolean().default(true),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum(['social', 'button', 'language', 'partner', 'profile', 'divider']),
    enabled: z.boolean(),
    visibility: z.enum(['both', 'desktop', 'mobile']),
    settings: z.record(z.string(), z.unknown()),
  })),
});

// Canonical type — includes optional version field; widgets use the precise union type.
export interface HeaderConfig {
  _version?: number;
  layout: 'left-logo' | 'center-logo' | 'right-logo';
  style: string;
  sticky: boolean;
  blur: boolean;
  show_menu_button: boolean;
  show_announcement: boolean;
  show_logo: boolean;
  show_brand_text: boolean;
  show_profile_widget: boolean;
  show_header_widgets: boolean;
  widgets: HeaderWidget[];
}

// Parses a raw DB string and validates structural correctness via Zod.
// Returns null if the string is missing, invalid JSON, or fails schema validation.
export function parseHeaderConfig(raw: string): HeaderConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = HeaderConfigSchema.safeParse(parsed);
    if (!result.success) return null;
    // Schema validates outer structure; widget settings union is maintained at the component layer.
    return result.data as unknown as HeaderConfig;
  } catch {
    return null;
  }
}
