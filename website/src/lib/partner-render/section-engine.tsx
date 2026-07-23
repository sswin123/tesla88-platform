/**
 * Section Engine
 * ─────────────
 * Reads the ordered list of enabled sections and dispatches each one to the
 * correct component renderer. No if/else on template names — the layout_json
 * carries all variant information consumed by each renderer.
 */

import React from 'react';
import type { PartnerPageData, PartnerSection, LayoutJson } from './index';
import {
  renderHero,
  renderMarquee,
  renderPartners,
  renderPromotions,
  renderContact,
  renderFooter,
} from './component-renderer';

type ComponentFn = (ctx: {
  data:    PartnerPageData;
  section: PartnerSection;
  layout:  LayoutJson;
}) => React.ReactElement;

/* ─── Component Registry ─────────────────────────────────── */
const REGISTRY: Record<string, ComponentFn> = {
  hero:       renderHero,
  marquee:    renderMarquee,
  partners:   renderPartners,
  promotions: renderPromotions,
  contact:    renderContact,
  footer:     renderFooter,
};

/* ─── Section Renderer ───────────────────────────────────── */
export function renderSections(data: PartnerPageData): React.ReactElement[] {
  const layout = data.template.layout_json;

  return data.sections
    .map(section => {
      const renderer = REGISTRY[section.section_type];
      if (!renderer) return null;
      return (
        <React.Fragment key={section.id}>
          {renderer({ data, section, layout })}
        </React.Fragment>
      );
    })
    .filter((el): el is React.ReactElement => el !== null);
}
