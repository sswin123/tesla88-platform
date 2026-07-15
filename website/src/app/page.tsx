import pool from '@/lib/db';
import HeroBanner from './components/homepage/HeroBanner';
import MarqueeSection from './components/homepage/MarqueeSection';
import QuickMenuSection from './components/homepage/QuickMenuSection';
import PromotionsSection from './components/homepage/PromotionsSection';
import ProvidersSection from './components/homepage/ProvidersSection';
import MemberZoneSection from './components/homepage/MemberZoneSection';
import LiveTransaction from './components/LiveTransaction';
import GameLobby from './components/GameLobby';
import GameLobbySection from './components/homepage/GameLobbySection';
import GenericSection from './components/homepage/GenericSection';
import AnnouncementSection from './components/homepage/AnnouncementSection';
import JackpotSection from './components/homepage/JackpotSection';
import FloatingButtonSection from './components/homepage/FloatingButtonSection';
import NoticePopup from './components/homepage/NoticePopup';

export const dynamic = 'force-dynamic';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SectionType =
  | 'hero' | 'marquee' | 'quick_menu' | 'promotions' | 'providers'
  | 'live_tx' | 'member_zone' | 'custom_html' | 'game_lobby'
  | 'cta_card' | 'announcement' | 'notice_popup' | 'jackpot'
  | 'footer_banner' | 'floating_button';

interface HomepageSection {
  id: number;
  section_type: SectionType;
  name: string;
  config: Record<string, unknown>;
  display_order: number;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function getHomepageSections(): Promise<HomepageSection[]> {
  try {
    const { rows } = await pool.query<HomepageSection>(
      `SELECT id, section_type, name, config, display_order
       FROM homepage_sections
       WHERE is_enabled = TRUE
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at   IS NULL OR end_at   >  NOW())
       ORDER BY display_order ASC, id ASC`
    );
    return rows;
  } catch {
    return [];
  }
}

// ─── Section renderer ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = any;

function renderSection(section: HomepageSection): React.ReactNode {
  const cfg: Cfg = section.config;

  switch (section.section_type) {

    // ── Specialised components ────────────────────────────────────────────────

    case 'hero':
      return <HeroBanner key={section.id} config={cfg} />;

    case 'marquee':
      return <MarqueeSection key={section.id} config={cfg} />;

    case 'quick_menu':
      return <QuickMenuSection key={section.id} config={cfg} />;

    case 'promotions':
      return <PromotionsSection key={section.id} config={cfg} />;

    case 'providers':
      return <ProvidersSection key={section.id} config={cfg} />;

    case 'live_tx':
      return (
        <LiveTransaction
          key={section.id}
          maxRows={Number(cfg.limit) || 8}
          theme={String(cfg.theme || 'classic_purple')}
          customTheme={cfg.custom_theme as Record<string, string> | undefined}
          fontStyle={String(cfg.font_style || 'default')}
          dataSource={(cfg.data_source as 'real' | 'smart_mix' | 'auto_generated') || 'smart_mix'}
          generationProfile={(cfg.generation_profile as 'conservative' | 'normal' | 'high_roller' | 'vip' | 'random' | 'custom_range') || 'normal'}
          customDepMin={Number(cfg.custom_dep_min) || 50}
          customDepMax={Number(cfg.custom_dep_max) || 2000}
          customWthMin={Number(cfg.custom_wth_min) || 100}
          customWthMax={Number(cfg.custom_wth_max) || 5000}
          depositChance={Number(cfg.deposit_chance) || 70}
          withdrawChance={Number(cfg.withdraw_chance) || 25}
          depositIntervalMin={Number(cfg.deposit_interval_min) || 6}
          depositIntervalMax={Number(cfg.deposit_interval_max) || 12}
          withdrawIntervalMin={Number(cfg.withdraw_interval_min) || 15}
          withdrawIntervalMax={Number(cfg.withdraw_interval_max) || 45}
          providerSource={(cfg.provider_source as 'website_providers' | 'custom_list') || 'website_providers'}
          customProviders={(cfg.custom_providers as string[]) || []}
          activitySpeed={(cfg.activity_speed as 'slow' | 'normal' | 'fast') || 'normal'}
          animationStyle={(cfg.animation_style as 'none' | 'slide_in' | 'fade_in' | 'bounce') || 'fade_in'}
          amountStyle={(cfg.amount_style as 'full' | 'range' | 'hidden') || 'full'}
          providerStyle={(cfg.provider_style as 'badge' | 'text' | 'chip') || 'badge'}
          timestampStyle={(cfg.timestamp_style as 'relative' | 'absolute' | 'hidden') || 'relative'}
          indicatorStyle={(cfg.indicator_style as 'dot' | 'pulse_dot' | 'ring' | 'text_only') || 'pulse_dot'}
        />
      );

    case 'member_zone':
      return <MemberZoneSection key={section.id} config={cfg} />;

    case 'game_lobby':
      return <GameLobbySection key={section.id} config={cfg as import('./components/homepage/GameLobbySection').GameLobbyConfig} />;

    // ── Lightweight specialised components ────────────────────────────────────

    case 'announcement':
      return <AnnouncementSection key={section.id} config={cfg} />;

    case 'jackpot':
      return <JackpotSection key={section.id} config={cfg} />;

    // ── Generic renderer (covers cta_card, footer_banner, custom_html, etc.) ─

    case 'custom_html':
    case 'cta_card':
    case 'footer_banner':
      return <GenericSection key={section.id} config={cfg} />;

    // ── Rendered separately outside main flow (see below) ─────────────────────
    case 'notice_popup':
    case 'floating_button':
      return null;

    default:
      return <GenericSection key={section.id} config={cfg} />;
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const sections = await getHomepageSections();

  // Collect overlay sections (rendered outside the normal scroll flow)
  const popups   = sections.filter(s => s.section_type === 'notice_popup');
  const floaters = sections.filter(s => s.section_type === 'floating_button');

  // Main sections (skip game_lobby — always appended at end unless explicitly in CMS)
  const hasGameLobby = sections.some(s => s.section_type === 'game_lobby');
  const mainSections = sections.filter(
    s => s.section_type !== 'notice_popup' && s.section_type !== 'floating_button'
  );

  return (
    <>
      {/* Main content */}
      <div className="flex flex-col gap-2">
        {mainSections.map(s => renderSection(s))}

        {/* Game Lobby always shown if not already a CMS section */}
        {!hasGameLobby && <GameLobbySection config={{}} />}
      </div>

      {/* Overlay: popup notices */}
      {popups.map(s => (
        <NoticePopup key={s.id} sectionId={s.id} config={s.config as Cfg} />
      ))}

      {/* Overlay: floating buttons */}
      {floaters.map(s => (
        <FloatingButtonSection key={s.id} config={s.config as Cfg} />
      ))}
    </>
  );
}
