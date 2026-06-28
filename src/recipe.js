/**
 * contentModelToRecipe(content, brand, assets) -> Recipe
 *
 * Expresses today's clone layout (hero → product grid → promo) as an ordered
 * section recipe. This is the structure a `version` stores; Phase 3 ("inspired
 * by") will produce richer recipes from a reference page's analysis.
 */

/**
 * @param {import('./types.js').ContentModel} content
 * @param {import('./types.js').Brand} brand
 * @param {import('./types.js').Assets} assets
 * @returns {import('./types.js').Recipe}
 */
export function contentModelToRecipe(content, brand, assets) {
  const collection = content.collectionName || content.h1?.[0] || brand.name;
  const h1 = `${collection} Collection — ${brand.name}`;
  const subheadline =
    content.metaDescription ||
    content.bodyText?.find((t) => t.length > 30) ||
    `Shop the ${collection} collection.`;
  const pageTitle = content.pageTitle || `${collection} — ${brand.name}`;
  const metaDescription =
    content.metaDescription || `Shop the ${collection} collection at ${brand.name}.`;

  const hero = assets.hero
    ? { ...assets.hero, alt: content.heroImage?.alt || `${collection} collection` }
    : { localImage: './assets/hero.webp', width: 1600, height: 600, alt: `${collection} collection` };

  return {
    meta: {
      pageTitle,
      metaDescription: metaDescription.slice(0, 300),
      canonicalUrl: content.url || brand.baseUrl,
      collectionName: collection,
      h1,
      subheadline: subheadline.slice(0, 200),
    },
    sections: [
      { type: 'hero', hero },
      { type: 'productGrid', products: assets.products },
      { type: 'promo', newsletter: brand.newsletter },
    ],
  };
}
