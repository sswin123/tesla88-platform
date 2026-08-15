import { z } from 'zod';

// Shared write-side validation schema for the Footer Builder — used by both
// PUT /api/website/footer-config (Save → draft) and
// POST /api/website/footer-config/publish (draft → live).
export const FooterItemWriteSchema = z.object({
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

export const FooterConfigWriteSchema = z.object({
  _version: z.number().int().min(1).optional(),
  items: z.array(FooterItemWriteSchema),
  style: z.object({
    variant: z.enum(['classic', 'glass', 'solid', 'gradient']).optional(),
    background: z.string().optional(),
    border: z.boolean().optional(),
    icon_size: z.number().optional(),
    text_size: z.number().optional(),
    spacing: z.string().optional(),
    height: z.number().optional(),
    opacity: z.number().optional(),
  }),
});

export const FOOTER_CONFIG_VERSION = 1 as const;
