-- erp/migrations/seeds/seed_partner_themes.sql
-- Phase M5-A — 8 Partner Builder Themes
-- All themes use --pb- prefix to avoid collision with website global theme
-- Run AFTER migration 072_partner_builder.sql

INSERT INTO partner_themes
  (name, slug, preview_color, preview_gradient, css_variables, sort_order)
VALUES

-- ── 01 Luxury Black Gold ────────────────────────────────────────────────────
(
  'Luxury Black Gold',
  'luxury-black-gold',
  '#d4a017',
  'linear-gradient(135deg,#0a0a0a 50%,#d4a017)',
  '{
    "--pb-bg-page":        "#0a0a0a",
    "--pb-bg-section":     "#111111",
    "--pb-bg-section-alt": "#0d0d0d",
    "--pb-bg-card":        "#1a1a1a",
    "--pb-bg-card-hover":  "#222222",
    "--pb-primary":        "#d4a017",
    "--pb-secondary":      "#b8860b",
    "--pb-accent":         "#f5c842",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#cccccc",
    "--pb-text-muted":     "#888888",
    "--pb-border":         "rgba(212,160,23,0.2)",
    "--pb-border-card":    "rgba(212,160,23,0.15)",
    "--pb-shadow":         "0 4px 24px rgba(212,160,23,0.15)",
    "--pb-btn-bg":         "#d4a017",
    "--pb-btn-text":       "#000000",
    "--pb-btn-hover":      "#b8860b",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  1
),

-- ── 02 MR Green ─────────────────────────────────────────────────────────────
(
  'MR Green',
  'mr-green',
  '#22c55e',
  'linear-gradient(135deg,#0d1f0d 50%,#22c55e)',
  '{
    "--pb-bg-page":        "#0d1a0d",
    "--pb-bg-section":     "#111f11",
    "--pb-bg-section-alt": "#0f1c0f",
    "--pb-bg-card":        "#1a2e1a",
    "--pb-bg-card-hover":  "#223a22",
    "--pb-primary":        "#22c55e",
    "--pb-secondary":      "#16a34a",
    "--pb-accent":         "#4ade80",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#d1fae5",
    "--pb-text-muted":     "#86efac",
    "--pb-border":         "rgba(34,197,94,0.2)",
    "--pb-border-card":    "rgba(34,197,94,0.15)",
    "--pb-shadow":         "0 4px 24px rgba(34,197,94,0.15)",
    "--pb-btn-bg":         "#22c55e",
    "--pb-btn-text":       "#000000",
    "--pb-btn-hover":      "#16a34a",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  2
),

-- ── 03 Blue Ocean ───────────────────────────────────────────────────────────
(
  'Blue Ocean',
  'blue-ocean',
  '#38bdf8',
  'linear-gradient(135deg,#0c1a2e 50%,#38bdf8)',
  '{
    "--pb-bg-page":        "#0c1a2e",
    "--pb-bg-section":     "#0f2040",
    "--pb-bg-section-alt": "#0d1c38",
    "--pb-bg-card":        "#152744",
    "--pb-bg-card-hover":  "#1d3258",
    "--pb-primary":        "#38bdf8",
    "--pb-secondary":      "#0ea5e9",
    "--pb-accent":         "#7dd3fc",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#e0f2fe",
    "--pb-text-muted":     "#7dd3fc",
    "--pb-border":         "rgba(56,189,248,0.2)",
    "--pb-border-card":    "rgba(56,189,248,0.15)",
    "--pb-shadow":         "0 4px 24px rgba(56,189,248,0.15)",
    "--pb-btn-bg":         "#38bdf8",
    "--pb-btn-text":       "#0c1a2e",
    "--pb-btn-hover":      "#0ea5e9",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  3
),

-- ── 04 Purple Neon ──────────────────────────────────────────────────────────
(
  'Purple Neon',
  'purple-neon',
  '#a855f7',
  'linear-gradient(135deg,#0d0020 50%,#a855f7)',
  '{
    "--pb-bg-page":        "#0d0020",
    "--pb-bg-section":     "#130030",
    "--pb-bg-section-alt": "#100028",
    "--pb-bg-card":        "#1c0040",
    "--pb-bg-card-hover":  "#240055",
    "--pb-primary":        "#a855f7",
    "--pb-secondary":      "#9333ea",
    "--pb-accent":         "#d8b4fe",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#f3e8ff",
    "--pb-text-muted":     "#c084fc",
    "--pb-border":         "rgba(168,85,247,0.25)",
    "--pb-border-card":    "rgba(168,85,247,0.2)",
    "--pb-shadow":         "0 4px 32px rgba(168,85,247,0.25)",
    "--pb-btn-bg":         "#a855f7",
    "--pb-btn-text":       "#ffffff",
    "--pb-btn-hover":      "#9333ea",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  4
),

-- ── 05 Royal Red ────────────────────────────────────────────────────────────
(
  'Royal Red',
  'royal-red',
  '#ef4444',
  'linear-gradient(135deg,#1a0000 50%,#ef4444)',
  '{
    "--pb-bg-page":        "#1a0000",
    "--pb-bg-section":     "#200000",
    "--pb-bg-section-alt": "#1c0000",
    "--pb-bg-card":        "#2a0000",
    "--pb-bg-card-hover":  "#350000",
    "--pb-primary":        "#ef4444",
    "--pb-secondary":      "#dc2626",
    "--pb-accent":         "#fca5a5",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#fee2e2",
    "--pb-text-muted":     "#fca5a5",
    "--pb-border":         "rgba(239,68,68,0.2)",
    "--pb-border-card":    "rgba(239,68,68,0.15)",
    "--pb-shadow":         "0 4px 24px rgba(239,68,68,0.2)",
    "--pb-btn-bg":         "#ef4444",
    "--pb-btn-text":       "#ffffff",
    "--pb-btn-hover":      "#dc2626",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  5
),

-- ── 06 Orange Energy ────────────────────────────────────────────────────────
(
  'Orange Energy',
  'orange-energy',
  '#f97316',
  'linear-gradient(135deg,#1a0e00 50%,#f97316)',
  '{
    "--pb-bg-page":        "#1a0e00",
    "--pb-bg-section":     "#201200",
    "--pb-bg-section-alt": "#1c1000",
    "--pb-bg-card":        "#2a1800",
    "--pb-bg-card-hover":  "#352000",
    "--pb-primary":        "#f97316",
    "--pb-secondary":      "#ea580c",
    "--pb-accent":         "#fdba74",
    "--pb-text-primary":   "#ffffff",
    "--pb-text-secondary": "#ffedd5",
    "--pb-text-muted":     "#fdba74",
    "--pb-border":         "rgba(249,115,22,0.2)",
    "--pb-border-card":    "rgba(249,115,22,0.15)",
    "--pb-shadow":         "0 4px 24px rgba(249,115,22,0.2)",
    "--pb-btn-bg":         "#f97316",
    "--pb-btn-text":       "#ffffff",
    "--pb-btn-hover":      "#ea580c",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  6
),

-- ── 07 Dark Mode ────────────────────────────────────────────────────────────
(
  'Dark Mode',
  'dark-mode',
  '#6366f1',
  'linear-gradient(135deg,#111 50%,#6366f1)',
  '{
    "--pb-bg-page":        "#0f0f0f",
    "--pb-bg-section":     "#141414",
    "--pb-bg-section-alt": "#111111",
    "--pb-bg-card":        "#1c1c1c",
    "--pb-bg-card-hover":  "#242424",
    "--pb-primary":        "#6366f1",
    "--pb-secondary":      "#4f46e5",
    "--pb-accent":         "#a5b4fc",
    "--pb-text-primary":   "#f8fafc",
    "--pb-text-secondary": "#cbd5e1",
    "--pb-text-muted":     "#64748b",
    "--pb-border":         "rgba(255,255,255,0.08)",
    "--pb-border-card":    "rgba(255,255,255,0.06)",
    "--pb-shadow":         "0 4px 24px rgba(0,0,0,0.4)",
    "--pb-btn-bg":         "#6366f1",
    "--pb-btn-text":       "#ffffff",
    "--pb-btn-hover":      "#4f46e5",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  7
),

-- ── 08 White Minimal ────────────────────────────────────────────────────────
(
  'White Minimal',
  'white-minimal',
  '#111827',
  'linear-gradient(135deg,#fff 50%,#e5e7eb)',
  '{
    "--pb-bg-page":        "#ffffff",
    "--pb-bg-section":     "#f9fafb",
    "--pb-bg-section-alt": "#f3f4f6",
    "--pb-bg-card":        "#ffffff",
    "--pb-bg-card-hover":  "#f9fafb",
    "--pb-primary":        "#111827",
    "--pb-secondary":      "#374151",
    "--pb-accent":         "#6366f1",
    "--pb-text-primary":   "#111827",
    "--pb-text-secondary": "#374151",
    "--pb-text-muted":     "#9ca3af",
    "--pb-border":         "#e5e7eb",
    "--pb-border-card":    "#e5e7eb",
    "--pb-shadow":         "0 2px 12px rgba(0,0,0,0.08)",
    "--pb-btn-bg":         "#111827",
    "--pb-btn-text":       "#ffffff",
    "--pb-btn-hover":      "#374151",
    "--pb-radius":         "8px",
    "--pb-radius-card":    "12px",
    "--pb-radius-btn":     "6px"
  }',
  8
)

ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  preview_color    = EXCLUDED.preview_color,
  preview_gradient = EXCLUDED.preview_gradient,
  css_variables    = EXCLUDED.css_variables,
  sort_order       = EXCLUDED.sort_order;
