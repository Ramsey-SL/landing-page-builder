#!/usr/bin/env node
/**
 * Fast smoke test — no browser, no network. Run in CI on every push.
 *   - src/render.js helper assertions (incl. hover swap + token stripping)
 *   - the recipe → renderRecipe pipeline produces a clean page offline
 *   - every config/<slug>.json parses and has the required shape
 *   - the template contains the tokens the renderer relies on
 *
 * Exits non-zero on the first failure.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeHtml,
  renderNav,
  renderProductGrid,
  renderSocial,
  renderTracking,
  renderFooterColumns,
  applyTemplate,
} from '../src/render.js';
import { configToBrand, deriveBrandFromContent } from '../src/brand.js';
import { contentModelToRecipe } from '../src/recipe.js';
import { renderRecipe } from '../src/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed++;
  else {
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}

// --- render.js helpers ---
check('escapeHtml escapes angle brackets & quotes', escapeHtml('<a "x">&\'') === '&lt;a &quot;x&quot;&gt;&amp;&#39;');

const applied = applyTemplate('A={{A}} B={{B}} U={{UNKNOWN}}', { A: '1', B: '2' });
check('applyTemplate replaces known tokens', applied.includes('A=1') && applied.includes('B=2'));
check('applyTemplate strips unknown tokens', !applied.includes('{{') && applied.includes('U='));

const dual = renderProductGrid([
  { name: 'Hat', price: '$10', href: '/p/hat', localImage: './assets/product-1.webp', localImageHover: './assets/product-1-hover.webp', imageAlt: 'Hat' },
]);
check('hover product renders dual media', dual.includes('card__media--dual') && dual.includes('card__img--hover'));
const single = renderProductGrid([{ name: 'Tee', price: '$5', href: '/p/tee', localImage: './assets/product-2.webp' }]);
check('non-hover product has no dual media', !single.includes('card__media--dual'));

check('nav renders mega menu', renderNav([{ label: 'Shop', href: '/s', groups: [{ heading: 'Apparel', links: [{ text: 'Tees', href: '/t' }] }] }]).includes('class="mega"'));
check('social renders aria-labelled svg', renderSocial([{ network: 'instagram', href: 'https://i/x' }]).includes('aria-label="instagram"'));
check('footer columns render', renderFooterColumns([{ heading: 'Info', links: [{ text: 'FAQ', href: '/faq' }] }]).includes('/faq'));

const tracking = renderTracking({ metaPixelId: '123', ga4Id: 'G-X', googleAdsId: 'AW-Y', klaviyoCompanyId: 'KZ' }, { enabled: ['google', 'meta', 'klaviyo'] });
check('tracking includes ids + deferral', tracking.includes('123') && tracking.includes('G-X') && tracking.includes('KZ') && tracking.includes('addEventListener'));
check('tracking empty when disabled', renderTracking({ metaPixelId: '123' }, { enabled: [] }) === '');

// --- template tokens ---
const template = await readFile(join(ROOT, 'templates', 'landing-page.html'), 'utf8');
for (const tok of ['{{PAGE_TITLE}}', '{{NAV}}', '{{MAIN}}', '{{FOOTER_COLUMNS}}', '{{TRACKING}}', '{{HERO_IMAGE_SRC}}', '{{TEAL}}', '{{FONT_FACE}}', '{{FONT_PRELOAD}}', '{{DISPLAY_STACK}}']) {
  check(`template contains ${tok}`, template.includes(tok));
}

// --- full recipe → render pipeline (offline, no network/sharp) ---
const fakeContent = {
  url: 'https://example.com/collections/demo',
  pageTitle: 'Demo — Brand',
  metaDescription: 'A demo collection.',
  collectionName: 'Demo',
  h1: ['Demo'],
  heroImage: { src: 'x', alt: 'Demo hero' },
  bodyText: ['Some descriptive copy about the demo collection that is long enough.'],
  productCards: [],
};
const fakeConfig = JSON.parse(await readFile(join(ROOT, 'config', (await readdir(join(ROOT, 'config'))).find((f) => f.endsWith('.json'))), 'utf8'));
const brand = configToBrand(fakeConfig, '<svg id="logo"></svg>');
const fakeAssets = {
  hero: { localImage: './assets/hero.webp', width: 1600, height: 600, alt: 'Demo hero' },
  products: [
    { name: 'Alpha Tee', price: '$20', href: '/p/alpha', localImage: './assets/product-1.webp', imageAlt: 'Alpha', width: 700, height: 700, localImageHover: './assets/product-1-hover.webp', hoverWidth: 700, hoverHeight: 700 },
    { name: 'Beta Hat', price: '$25', href: '/p/beta', localImage: './assets/product-2.webp', imageAlt: 'Beta', width: 700, height: 700 },
  ],
  ok: 2, total: 2, warnings: [],
};
const recipe = contentModelToRecipe(fakeContent, brand, fakeAssets);
check('recipe has 3 sections (hero/grid/promo)', recipe.sections.length === 3 && recipe.sections[0].type === 'hero');
const html = await renderRecipe(recipe, brand, { trackingEnabled: true });
check('rendered html has no leftover tokens', !/\{\{[A-Z0-9_]+\}\}/.test(html));
check('rendered html includes both products', html.includes('Alpha Tee') && html.includes('Beta Hat'));
check('rendered html includes hover swap for product 1', html.includes('product-1-hover.webp') && html.includes('card__media--dual'));
check('rendered html inlines the logo', html.includes('<svg id="logo">'));
check('rendered html includes the brand nav', html.includes('class="mega"') || html.includes('nav__link'));
check('rendered html has deferred tracking script', html.includes('<script>') && html.includes('addEventListener'));
check('rendered html sets brand teal', html.includes(brand.colors.teal));

// --- auto-derived brand (arbitrary URL, no curated config, system font) ---
const autoBrand = deriveBrandFromContent({
  pageTitle: 'Canvas Bags – Acme Goods',
  url: 'https://acme.example/collections/bags',
  collectionName: 'Canvas Bags',
  navLinks: [{ text: 'Shop', href: 'https://acme.example/collections/all' }, { text: 'About', href: 'https://acme.example/pages/about' }],
});
check('auto-brand derives name from title', autoBrand.name === 'Acme Goods');
check('auto-brand has no custom font', autoBrand.displayFontFile === '');
const autoRecipe = contentModelToRecipe(fakeContent, autoBrand, fakeAssets);
const autoHtml = await renderRecipe(autoRecipe, autoBrand, { trackingEnabled: false });
check('auto-brand html has no @font-face', !autoHtml.includes('@font-face'));
check('auto-brand html has no leftover tokens', !/\{\{[A-Z0-9_]+\}\}/.test(autoHtml));
check('auto-brand html still renders products', autoHtml.includes('Alpha Tee'));

// --- edit: applyPatch (pure, no API) ---
const { applyPatch } = await import('../src/edit.js');
const editRecipe = contentModelToRecipe(fakeContent, brand, fakeAssets);
const patched = applyPatch(editRecipe, brand, {
  summary: 'test',
  meta: { subheadline: 'New subhead' },
  newsletter: { bannerHeading: 'Get 25% Off' },
  colors: { accent: '#0a1f44', text: 'not-a-hex' },
  removeSections: ['promo'],
});
check('applyPatch updates meta subheadline', patched.recipe.meta.subheadline === 'New subhead');
check('applyPatch updates newsletter banner', patched.brand.newsletter.bannerHeading === 'Get 25% Off');
check('applyPatch accepts valid hex accent', patched.brand.colors.accent === '#0a1f44');
check('applyPatch rejects invalid hex', patched.brand.colors.text === brand.colors.text);
check('applyPatch removes promo section', !patched.recipe.sections.some((s) => s.type === 'promo'));
check('applyPatch never removes hero', patched.recipe.sections.some((s) => s.type === 'hero'));
check('applyPatch does not mutate original', editRecipe.meta.subheadline !== 'New subhead');

// --- config validation ---
const configDir = join(ROOT, 'config');
const configFiles = (await readdir(configDir)).filter((f) => f.endsWith('.json'));
check('at least one config exists', configFiles.length > 0);
for (const file of configFiles) {
  let cfg;
  try {
    cfg = JSON.parse(await readFile(join(configDir, file), 'utf8'));
  } catch {
    check(`${file} is valid JSON`, false);
    continue;
  }
  check(`${file}: brand.colors.teal`, !!cfg.brand?.colors?.teal);
  check(`${file}: brand.displayFontFile`, !!cfg.brand?.displayFontFile);
  check(`${file}: nav non-empty`, Array.isArray(cfg.nav) && cfg.nav.length > 0);
  check(`${file}: footer.columns array`, Array.isArray(cfg.footer?.columns));
  check(`${file}: tracking ids`, !!cfg.tracking?.metaPixelId && !!cfg.tracking?.ga4Id && !!cfg.tracking?.klaviyoCompanyId);
}

console.log(`\n${failures.length ? '✖' : '✓'} smoke: ${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
