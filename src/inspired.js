/**
 * "Inspired-by": restyle a cloned page to adopt a REFERENCE site's look —
 * its palette plus a coherent layout treatment (section variants) — while
 * keeping the clone's own content. Reuses the scrape (palette + structure) and
 * the section-variant layer; deterministic and pure, so it's cheap and testable.
 *
 * MVP scope: full visual style (colors) + layout treatment (hero/promo variants,
 * optional category row). True structural transfer (section order/types lifted
 * from the reference) is a later iteration.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

function lum(hex) {
  if (!HEX.test(hex)) return null;
  return parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
}
const isDark = (hex) => {
  const l = lum(hex);
  return l != null && l < 600;
};

/**
 * Derive a style/layout template from a scraped reference page.
 * @param {import('./types.js').ContentModel} ref
 */
export function templateFromReference(ref) {
  const p = ref.palette || {};
  // Primary ("teal") must be dark enough for the white header/announcement text.
  const primary = [p.header, p.accent, p.footer].find(isDark) || '#1a1a1a';
  const footer = isDark(p.footer) ? p.footer : isDark(p.header) ? p.header : '#111111';
  const body = HEX.test(p.body) ? p.body : '#ffffff';
  const text = HEX.test(p.text) ? p.text : '#111111';
  const accent = HEX.test(p.accent) ? p.accent : primary;

  return {
    colors: { teal: primary, footer, body, text, accent },
    // A reference with prominent category cards → favor a category row when our
    // content has collections; a bold hero overlay + carded newsletter read as a
    // distinct reinterpretation.
    heroVariant: 'overlay',
    promoVariant: 'card',
    useCollectionRow: (ref.collectionLinks || []).length >= 2,
    referenceName: ref.siteName || ref.collectionName || '',
  };
}

/**
 * Apply a template to a {recipe, brand}. Pure — returns new copies.
 * @param {import('./types.js').Recipe} recipe
 * @param {import('./types.js').Brand} brand
 * @param {ReturnType<typeof templateFromReference>} template
 */
export function applyInspiration(recipe, brand, template) {
  const r = structuredClone(recipe);
  const b = structuredClone(brand);

  if (template.colors) b.colors = { ...b.colors, ...template.colors };

  for (const s of r.sections) {
    if (s.type === 'hero' && template.heroVariant) s.variant = template.heroVariant;
    if (s.type === 'promo' && template.promoVariant) s.variant = template.promoVariant;
  }

  return {
    recipe: r,
    brand: b,
    summary: template.referenceName
      ? `Reimagined in the style of ${template.referenceName}.`
      : 'Reimagined from a reference site.',
  };
}
