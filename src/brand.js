/**
 * Brand = the reusable "chrome". Phase 0 source is config/<slug>.json (which has
 * a nested `brand` plus top-level announcement/nav/footer/etc.); flatten it into
 * the Brand shape the renderer expects. In Phase 1 this comes from the DB.
 */

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
