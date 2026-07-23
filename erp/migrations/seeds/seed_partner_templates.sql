-- erp/migrations/seeds/seed_partner_templates.sql
-- Phase M5-A — 12 Partner Builder Templates (v1)
-- Run AFTER migration 072_partner_builder.sql

INSERT INTO partner_templates
  (name, slug, version, description, layout_json, default_theme_slug, tags, sort_order)
VALUES

-- ── 01 OPULUX Luxury ────────────────────────────────────────────────────────
(
  'OPULUX Luxury',
  'luxury-black-gold',
  'v1',
  'Premium black & gold VIP casino partner page. Large fullscreen hero, 3-column card grid, spacious dark layout.',
  '{
    "heroStyle":   "fullscreen",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "dark",
    "spacing":     "spacious",
    "defaultSections": ["hero","brands","promotion","faq","telegram_cta","footer"]
  }',
  'luxury-black-gold',
  ARRAY['luxury','dark','vip','gold','premium'],
  1
),

-- ── 02 MR GROUP ─────────────────────────────────────────────────────────────
(
  'MR Group',
  'mr-group-green',
  'v1',
  'Green casino group landing page. 2-column card grid with Telegram CTA focus. Perfect for MR Group style operators.',
  '{
    "heroStyle":   "half",
    "headerStyle": "split",
    "cardStyle":   "grid-2",
    "footerStyle": "dark",
    "spacing":     "normal",
    "defaultSections": ["hero","brands","telegram_cta","faq","footer"]
  }',
  'mr-green',
  ARRAY['green','grid','telegram','group'],
  2
),

-- ── 03 MENANG ───────────────────────────────────────────────────────────────
(
  'Menang',
  'menang',
  'v1',
  'Large hero with promotion focus. Cream/gold palette. Ideal for operators running heavy bonus campaigns.',
  '{
    "heroStyle":   "fullscreen",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "light",
    "spacing":     "spacious",
    "defaultSections": ["hero","promotion","brands","countdown","footer"]
  }',
  'luxury-black-gold',
  ARRAY['hero','promotion','bonus','cream'],
  3
),

-- ── 04 Casino Neon ──────────────────────────────────────────────────────────
(
  'Casino Neon',
  'casino-neon',
  'v1',
  'Cyberpunk purple neon dark theme. Glowing card effects, fullscreen video-ready hero. High-energy gaming vibe.',
  '{
    "heroStyle":   "fullscreen",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "dark",
    "spacing":     "normal",
    "defaultSections": ["hero","brands","statistics","faq","footer"]
  }',
  'purple-neon',
  ARRAY['neon','cyberpunk','purple','dark','glow'],
  4
),

-- ── 05 Premium White ────────────────────────────────────────────────────────
(
  'Premium White',
  'premium-white',
  'v1',
  'Apple-inspired minimal white layout. Clean typography, subtle shadows. Perfect for premium brand positioning.',
  '{
    "heroStyle":   "banner",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "light",
    "spacing":     "spacious",
    "defaultSections": ["hero","intro","brands","faq","footer"]
  }',
  'white-minimal',
  ARRAY['white','minimal','apple','clean','premium'],
  5
),

-- ── 06 Modern Gradient ──────────────────────────────────────────────────────
(
  'Modern Gradient',
  'modern-gradient',
  'v1',
  'Contemporary gradient background with rounded cards and soft shadows. Modern SaaS-inspired aesthetic.',
  '{
    "heroStyle":   "half",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "dark",
    "spacing":     "normal",
    "defaultSections": ["hero","brands","statistics","testimonials","footer"]
  }',
  'blue-ocean',
  ARRAY['gradient','modern','rounded','saas','colorful'],
  6
),

-- ── 07 Telegram Focus ───────────────────────────────────────────────────────
(
  'Telegram Focus',
  'telegram-focus',
  'v1',
  'Single-column CTA landing page optimised for Telegram conversion. Minimal distractions, maximum click-through.',
  '{
    "heroStyle":   "minimal",
    "headerStyle": "minimal",
    "cardStyle":   "list",
    "footerStyle": "minimal",
    "spacing":     "compact",
    "defaultSections": ["hero","telegram_cta","brands","whatsapp_cta","footer"]
  }',
  'blue-ocean',
  ARRAY['telegram','cta','conversion','single-column','simple'],
  7
),

-- ── 08 Affiliate Pro ────────────────────────────────────────────────────────
(
  'Affiliate Pro',
  'affiliate-pro',
  'v1',
  'Commission-focused affiliate recruitment page. Highlight referral tiers, earnings potential, and join flow.',
  '{
    "heroStyle":   "half",
    "headerStyle": "split",
    "cardStyle":   "grid-2",
    "footerStyle": "dark",
    "spacing":     "normal",
    "defaultSections": ["hero","statistics","brands","timeline","telegram_cta","footer"]
  }',
  'royal-red',
  ARRAY['affiliate','commission','referral','recruit','tiers'],
  8
),

-- ── 09 Infinite Grid ────────────────────────────────────────────────────────
(
  'Infinite Grid',
  'infinite-grid',
  'v1',
  'Dense 4-column card grid supporting 10, 20, or 100+ brand logos. Optimised for large partner directories.',
  '{
    "heroStyle":   "banner",
    "headerStyle": "minimal",
    "cardStyle":   "grid-4",
    "footerStyle": "dark",
    "spacing":     "compact",
    "defaultSections": ["hero","brands","telegram_cta","footer"]
  }',
  'dark-mode',
  ARRAY['grid','infinite','dense','directory','large'],
  9
),

-- ── 10 Timeline ─────────────────────────────────────────────────────────────
(
  'Timeline',
  'timeline',
  'v1',
  'Step-by-step onboarding landing page. Register → Deposit → Claim Bonus → Play. Ideal for new player acquisition.',
  '{
    "heroStyle":   "half",
    "headerStyle": "centered",
    "cardStyle":   "grid-3",
    "footerStyle": "dark",
    "spacing":     "spacious",
    "defaultSections": ["hero","timeline","brands","faq","telegram_cta","footer"]
  }',
  'orange-energy',
  ARRAY['timeline','steps','onboarding','funnel','new-player'],
  10
),

-- ── 11 Video Landing ────────────────────────────────────────────────────────
(
  'Video Landing',
  'video-landing',
  'v1',
  'Full-screen background video hero with overlay CTA. High-impact cinematic entrance for premium brands.',
  '{
    "heroStyle":   "video",
    "headerStyle": "fullwidth",
    "cardStyle":   "grid-3",
    "footerStyle": "dark",
    "spacing":     "spacious",
    "defaultSections": ["video_banner","brands","statistics","telegram_cta","footer"]
  }',
  'dark-mode',
  ARRAY['video','cinematic','fullscreen','modern','animated'],
  11
),

-- ── 12 Gaming Expo ──────────────────────────────────────────────────────────
(
  'Gaming Expo',
  'gaming-expo',
  'v1',
  'Large card hover effects, neon accents, game-provider showcase style. Designed for gaming-first operators.',
  '{
    "heroStyle":   "fullscreen",
    "headerStyle": "fullwidth",
    "cardStyle":   "grid-4",
    "footerStyle": "dark",
    "spacing":     "normal",
    "defaultSections": ["hero","brands","promotion","statistics","countdown","footer"]
  }',
  'purple-neon',
  ARRAY['gaming','expo','hover','cards','neon'],
  12
)

ON CONFLICT (slug, version) DO UPDATE SET
  name               = EXCLUDED.name,
  description        = EXCLUDED.description,
  layout_json        = EXCLUDED.layout_json,
  default_theme_slug = EXCLUDED.default_theme_slug,
  tags               = EXCLUDED.tags,
  sort_order         = EXCLUDED.sort_order;
