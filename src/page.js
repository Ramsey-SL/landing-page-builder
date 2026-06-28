/**
 * renderRecipe(recipe, brand, opts) -> html
 *
 * Assembles the final HTML: brand chrome (head/header/footer/tracking) from the
 * shell template + a <main> built from the recipe's sections. Pure string out
 * (reads the bundled template only). Phase 0 targets the single shell template;
 * Phase 3 generalizes the shell + section library for arbitrary layouts.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyTemplate,
  escapeHtml,
  renderNav,
  renderMobileNav,
  renderCategoryStrip,
  renderFooterColumns,
  renderSocial,
  renderTracking,
} from './render.js';
import { SECTION_RENDERERS } from './sections.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = join(ROOT, 'templates', 'landing-page.html');

/**
 * @param {import('./types.js').Recipe} recipe
 * @param {import('./types.js').Brand} brand
 * @param {{ trackingEnabled?: boolean, template?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function renderRecipe(recipe, brand, { trackingEnabled = true, template } = {}) {
  const shell = template || (await readFile(TEMPLATE_PATH, 'utf8'));

  const main = recipe.sections
    .map((s) => {
      const fn = SECTION_RENDERERS[s.type];
      if (!fn) throw new Error(`Unknown section type: ${s.type}`);
      return fn(s, recipe.meta);
    })
    .join('\n\n    ');

  const heroSection = recipe.sections.find((s) => s.type === 'hero');
  const heroSrc = heroSection?.hero?.localImage || './assets/hero.webp';
  const c = brand.colors;

  const vars = {
    PAGE_TITLE: escapeHtml(recipe.meta.pageTitle),
    META_DESCRIPTION: escapeHtml(recipe.meta.metaDescription),
    CANONICAL_URL: escapeHtml(recipe.meta.canonicalUrl),
    BASE_URL: escapeHtml(brand.baseUrl),
    HERO_IMAGE_SRC: heroSrc,
    LOGO_SVG: brand.logoSvg,
    LOGO_ALT: escapeHtml(`${brand.name} home`),
    ANNOUNCEMENT: escapeHtml(brand.announcement || ''),
    NAV: renderNav(brand.nav),
    MOBILE_NAV: renderMobileNav(brand.nav),
    CATEGORY_STRIP: renderCategoryStrip(brand.categoryStrip),
    MAIN: main,
    FOOTER_COLUMNS: renderFooterColumns(brand.footer.columns),
    SOCIAL: renderSocial(brand.footer.social),
    NEWSLETTER_HEADING: escapeHtml(brand.newsletter.heading),
    NEWSLETTER_BLURB: escapeHtml(brand.newsletter.blurb),
    COPYRIGHT: escapeHtml(brand.footer.copyright || brand.name),
    YEAR: new Date().getFullYear(),
    TEAL: c.teal,
    FOOTER_COLOR: c.footer,
    BODY_COLOR: c.body,
    TEXT_COLOR: c.text,
    ACCENT_COLOR: c.accent,
    DISPLAY_FONT: brand.displayFont,
    DISPLAY_FONT_FILE: brand.displayFontFile,
    TRACKING: trackingEnabled ? renderTracking(brand.tracking, { enabled: ['google', 'meta', 'klaviyo'] }) : '',
  };

  return applyTemplate(shell, vars);
}
