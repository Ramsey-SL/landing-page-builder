/**
 * Brand = the reusable "chrome". Phase 0 source is config/<slug>.json (which has
 * a nested `brand` plus top-level announcement/nav/footer/etc.); flatten it into
 * the Brand shape the renderer expects. In Phase 1 this comes from the DB.
 */
import { escapeHtml } from './render.js';

/**
 * @param {object} config  Parsed config/<slug>.json
 * @param {string} logoSvg Inlined SVG markup (or a fallback span)
 * @returns {import('./types.js').Brand}
 */
export function configToBrand(config, logoSvg) {
  return {
    name: config.brand.name,
    baseUrl: config.brand.baseUrl,
    colors: config.brand.colors,
    displayFont: config.brand.displayFont,
    displayFontFile: config.brand.displayFontFile,
    logoSvg,
    announcement: config.announcement || '',
    nav: config.nav || [],
    categoryStrip: config.categoryStrip || [],
    footer: config.footer || { columns: [], social: [], copyright: config.brand.name },
    newsletter: config.newsletter || { heading: '', blurb: '', bannerHeading: '' },
    tracking: config.tracking || {},
  };
}

/**
 * Derive a basic, functional Brand from a scrape when there's no curated config.
 * No custom logo/font (system font, text wordmark) and no tracking — enough to
 * produce a clean, fast page for an arbitrary URL. Users refine it later.
 * @param {import('./types.js').ContentModel} content
 * @returns {import('./types.js').Brand}
 */
export function deriveBrandFromContent(content) {
  const parts = (content.pageTitle || '').split(/[|–\-—]/).map((s) => s.trim()).filter(Boolean);
  const name = parts[parts.length - 1] || content.collectionName || 'Store';
  let baseUrl = '';
  try {
    baseUrl = new URL(content.url).origin;
  } catch {
    /* leave blank */
  }

  const navLinks = content.navLinks || [];
  const nav = [];
  const seen = new Set();
  for (const l of navLinks) {
    const label = (l.text || '').trim();
    if (!label || label.length > 24 || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    nav.push({ label, href: l.href, groups: [] });
    if (nav.length >= 6) break;
  }

  const categoryStrip = navLinks
    .filter((l) => /\/collections\//.test(l.href || ''))
    .slice(0, 10)
    .map((l) => ({ text: (l.text || '').trim(), href: l.href }))
    .filter((c) => c.text);

  return {
    name,
    baseUrl,
    colors: { teal: '#1a1a1a', footer: '#111111', body: '#ffffff', text: '#111111', accent: '#1a1a1a' },
    displayFont: '',
    displayFontFile: '',
    logoSvg: `<span class="logo-fallback">${escapeHtml(name)}</span>`,
    announcement: '',
    nav,
    categoryStrip,
    footer: { columns: [], social: [], copyright: name },
    newsletter: { heading: 'Sign Up & Save', blurb: 'Subscribe for new releases and offers.', bannerHeading: 'Join Our List' },
    tracking: {},
  };
}
