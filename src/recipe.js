/**
 * contentModelToRecipe(content, brand, assets) -> Recipe
 *
 * Turns a scraped page into an ordered section recipe (the structure a `version`
 * stores). Collection/product pages keep the proven hero → grid → promo layout.
 * Richer pages (homepages) are reconstructed from the captured structure:
 * hero → intro copy → category row → product grid → narrative → newsletter.
 */

function pageKind(url) {
  let path = '/';
  try {
    path = new URL(url).pathname;
  } catch {}
  if (/\/collections\/[^/]+/.test(path)) return 'collection';
  if (/\/products\/[^/]+/.test(path)) return 'product';
  return 'home';
}

// A product-section heading from the scraped h2s, else a sensible default.
function productHeading(content) {
  const h = (content.h2 || []).find((t) => /new|featured|just in|shop|best|popular|trending|bestsell/i.test(t));
  return (h || 'Featured Products').slice(0, 80);
}

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

  const meta = {
    pageTitle,
    metaDescription: metaDescription.slice(0, 300),
    canonicalUrl: content.url || brand.baseUrl,
    collectionName: collection,
    h1,
    subheadline: subheadline.slice(0, 200),
  };

  const kind = pageKind(content.url || '');
  const collections = assets.collections || [];
  const blocks = content.contentBlocks || [];

  // Collection / product pages: the proven, grid-focused layout (unchanged).
  if (kind !== 'home') {
    return {
      meta,
      sections: [
        { type: 'hero', hero },
        { type: 'productGrid', products: assets.products },
        { type: 'promo', newsletter: brand.newsletter },
      ],
    };
  }

  // Homepage: rebuild from the captured structure so more of the original
  // design (category rows, narrative bands) survives the clone.
  const sections = [{ type: 'hero', hero }];
  if (blocks[0]) sections.push({ type: 'richText', title: blocks[0].heading, text: blocks[0].text, cta: blocks[0].cta });
  if (collections.length >= 2) sections.push({ type: 'collectionRow', title: 'Shop by Category', collections });
  if (assets.products?.length) {
    sections.push({ type: 'productGrid', title: productHeading(content), text: '', products: assets.products });
  }
  for (const b of blocks.slice(1)) sections.push({ type: 'richText', title: b.heading, text: b.text, cta: b.cta });
  sections.push({ type: 'promo', newsletter: brand.newsletter });

  return { meta, sections };
}
