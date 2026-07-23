import type { Metadata } from 'next';
import type { PartnerSite } from './index';

export function generatePartnerMetadata(
  site: PartnerSite,
  baseUrl: string,
): Metadata {
  const title       = site.meta_title       ?? site.name;
  const description = site.meta_description ?? `${site.name} — Official Partner Page`;
  const canonical   = `/p/${site.slug}`;
  const pageUrl     = `${baseUrl}${canonical}`;

  return {
    title,
    description,
    keywords:      [site.name, 'online casino', 'partner', 'bonus', 'promotion'],
    metadataBase:  new URL(baseUrl),
    alternates:    { canonical },
    openGraph: {
      type:        'website',
      url:          pageUrl,
      title,
      description,
      siteName:     site.name,
      locale:       'en_MY',
      images:       site.logo_url ? [{ url: site.logo_url, alt: site.name }] : [],
    },
    twitter: {
      card:         'summary',
      title,
      description,
      images:       site.logo_url ? [site.logo_url] : [],
    },
    robots: {
      index:        true,
      follow:       true,
      googleBot: {
        index:      true,
        follow:     true,
        'max-image-preview': 'large',
      },
    },
  };
}
