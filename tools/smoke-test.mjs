#!/usr/bin/env node
/**
 * Fast smoke test — no browser, no network. Run in CI on every push.
 *   - render.js helper assertions (incl. hover swap + token stripping)
 *   - every config/<slug>.json parses and has the required shape
 *   - the template contains the tokens build.js relies on
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
} from './render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) { passed++; } else { failures.push(name); console.error(`  ✗ ${name}`); }
}

// --- render.js helpers ---
check('escapeHtml escapes angle brackets & quotes', escapeHtml('<a "x">&\'') === '&lt;a &quot;x&quot;&gt;&amp;&#39;');

const tpl = 'A={{A}} B={{B}} U={{UNKNOWN}}';
const applied = applyTemplate(tpl, { A: '1', B: '2' });
check('applyTemplate replaces known tokens', applied.includes('A=1') && applied.includes('B=2'));
check('applyTemplate strips unknown tokens', !applied.includes('{{') && applied.includes('U='));

const dual = renderProductGrid([
  { name: 'Hat', price: '$10', href: '/p/hat', localImage: './assets/product-1.webp', localImageHover: './assets/product-1-hover.webp', imageAlt: 'Hat' },
]);
check('hover product renders dual media', dual.includes('card__media--dual') && dual.includes('card__img--hover'));
check('hover product escapes/links correctly', dual.includes('href="/p/hat"') && dual.includes('$10'));

const single = renderProductGrid([{ name: 'Tee', price: '$5', href: '/p/tee', localImage: './assets/product-2.webp' }]);
check('non-hover product has no dual media', !single.includes('card__media--dual') && !single.includes('card__img--hover'));

const nav = renderNav([{ label: 'Shop', href: '/shop', groups: [{ heading: 'Apparel', links: [{ text: 'Tees', href: '/tees' }] }] }]);
check('nav with groups renders mega menu', nav.includes('class="mega"') && nav.includes('Apparel') && nav.includes('/tees'));

const social = renderSocial([{ network: 'instagram', href: 'https://instagram.com/x' }]);
check('social renders inline svg with aria-label', social.includes('<svg') && social.includes('aria-label="instagram"'));

const foot = renderFooterColumns([{ heading: 'More Info', links: [{ text: 'FAQ', href: '/faq' }] }]);
check('footer columns render heading + links', foot.includes('More Info') && foot.includes('/faq'));

const tracking = renderTracking({ metaPixelId: '123', ga4Id: 'G-X', googleAdsId: 'AW-Y', klaviyoCompanyId: 'KZ' }, { enabled: ['google', 'meta', 'klaviyo'] });
check('tracking wraps in <script>', tracking.includes('<script>'));
check('tracking includes all enabled ids', tracking.includes('123') && tracking.includes('G-X') && tracking.includes('AW-Y') && tracking.includes('KZ'));
check('tracking is deferred (interaction-gated)', tracking.includes("addEventListener") && tracking.includes('scroll'));
check('tracking empty when nothing enabled', renderTracking({ metaPixelId: '123' }, { enabled: [] }) === '');

// --- template tokens ---
const template = await readFile(join(ROOT, 'templates', 'landing-page.html'), 'utf8');
for (const tok of ['{{PAGE_TITLE}}', '{{NAV}}', '{{PRODUCT_GRID}}', '{{FOOTER_COLUMNS}}', '{{TRACKING}}', '{{HERO_IMAGE_SRC}}', '{{TEAL}}', '{{DISPLAY_FONT_FILE}}']) {
  check(`template contains ${tok}`, template.includes(tok));
}

// --- config validation ---
const configDir = join(ROOT, 'config');
const configFiles = (await readdir(configDir)).filter((f) => f.endsWith('.json'));
check('at least one config/<slug>.json exists', configFiles.length > 0);
for (const file of configFiles) {
  let cfg;
  try { cfg = JSON.parse(await readFile(join(configDir, file), 'utf8')); }
  catch (e) { check(`${file} is valid JSON`, false); continue; }
  check(`${file}: brand.colors.teal`, !!cfg.brand?.colors?.teal);
  check(`${file}: brand.displayFontFile`, !!cfg.brand?.displayFontFile);
  check(`${file}: nav is a non-empty array`, Array.isArray(cfg.nav) && cfg.nav.length > 0);
  check(`${file}: footer.columns is an array`, Array.isArray(cfg.footer?.columns));
  check(`${file}: tracking ids present`, !!cfg.tracking?.metaPixelId && !!cfg.tracking?.ga4Id && !!cfg.tracking?.klaviyoCompanyId);
}

console.log(`\n${failures.length ? '✖' : '✓'} smoke: ${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
