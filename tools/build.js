#!/usr/bin/env node
/**
 * Goal 3 — Content Injection Build Script (high-fidelity clone)
 *
 * Usage: node tools/build.js <slug> [--no-tracking]
 *
 * Merges:
 *   - output/<slug>/source.json      (auto-scraped products / hero / meta)
 *   - config/<slug>.json             (curated chrome: nav, footer, brand, tracking)
 * Downloads + converts images to WebP, copies brand assets (logo, font),
 * injects everything into templates/landing-page.html, and writes
 * output/<slug>/index.html.
 */

import sharp from 'sharp';
import { mkdir, readFile, writeFile, stat, copyFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderNav,
  renderMobileNav,
  renderCategoryStrip,
  renderProductGrid,
  renderFooterColumns,
  renderSocial,
  renderTracking,
  applyTemplate,
  escapeHtml,
} from './render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) fail('Usage: node tools/build.js <slug> [--no-tracking]');
const trackingEnabled = !args.includes('--no-tracking');

const MAX_PRODUCTS = 36;

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function toWebp(url, outPath, maxWidth) {
  const buf = await fetchBuffer(url);
  const info = await sharp(buf).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 80 }).toFile(outPath);
  return { width: info.width, height: info.height };
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const outDir = join(ROOT, 'output', slug);
  const assetsDir = join(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  // --- Load inputs ---
  let source;
  try { source = JSON.parse(await readFile(join(outDir, 'source.json'), 'utf8')); }
  catch { fail(`Cannot read output/${slug}/source.json — run scrape.js first.`); }

  let config;
  try { config = JSON.parse(await readFile(join(ROOT, 'config', `${slug}.json`), 'utf8')); }
  catch { fail(`Cannot read config/${slug}.json — required for the branded build.`); }

  console.log(`→ Building ${slug} (tracking: ${trackingEnabled ? 'on' : 'off'})`);

  // --- Copy brand assets (logo + font) ---
  const brandDir = join(ROOT, 'config', 'brand-assets', slug);
  const logoFile = config.brand.logoFile;
  const fontFile = config.brand.displayFontFile;
  let logoSvg = '';
  if (await exists(join(brandDir, logoFile))) {
    logoSvg = await readFile(join(brandDir, logoFile), 'utf8');
    await copyFile(join(brandDir, logoFile), join(assetsDir, logoFile));
  } else {
    logoSvg = `<span class="logo-fallback">${escapeHtml(config.brand.name)}</span>`;
  }
  if (await exists(join(brandDir, fontFile))) {
    await copyFile(join(brandDir, fontFile), join(assetsDir, fontFile));
  } else {
    fail(`Missing brand font: config/brand-assets/${slug}/${fontFile}`);
  }

  // --- Hero image ---
  let heroDims = { width: 1600, height: 600 };
  if (source.heroImage?.src) {
    try {
      heroDims = await toWebp(source.heroImage.src, join(assetsDir, 'hero.webp'), 1600);
      console.log(`  ✓ hero.webp (${heroDims.width}x${heroDims.height})`);
    } catch (e) { fail(`Failed to download hero image: ${e.message}`); }
  }

  // --- Product images ---
  const candidates = (source.productCards || []).filter((p) => p.imageSrc).slice(0, MAX_PRODUCTS);
  const products = new Array(candidates.length);
  let idx = 0, ok = 0;
  async function worker() {
    while (idx < candidates.length) {
      const i = idx++;
      const p = candidates[i];
      const file = `product-${i + 1}.webp`;
      try {
        const dims = await toWebp(p.imageSrc, join(assetsDir, file), 700);
        const rec = { name: p.name, price: p.price, href: p.href, localImage: `./assets/${file}`, imageAlt: p.imageAlt || p.name, width: dims.width, height: dims.height };
        // Secondary hover image (front -> alt view), if the card had one.
        if (p.imageSrcHover) {
          const hoverFile = `product-${i + 1}-hover.webp`;
          try {
            const hd = await toWebp(p.imageSrcHover, join(assetsDir, hoverFile), 700);
            rec.localImageHover = `./assets/${hoverFile}`;
            rec.hoverWidth = hd.width;
            rec.hoverHeight = hd.height;
          } catch (e) { console.warn(`  ! hover image failed for ${p.name}: ${e.message}`); }
        }
        products[i] = rec;
        ok++;
      } catch (e) { console.warn(`  ! skipped product ${i + 1} (${p.name}): ${e.message}`); products[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  const builtProducts = products.filter(Boolean);
  console.log(`  ✓ ${ok}/${candidates.length} product images converted to WebP`);

  // --- Assemble vars ---
  const collection = source.collectionName || source.h1?.[0] || config.brand.name;
  const h1 = `${collection} Collection — ${config.brand.name}`;
  const subheadline = source.metaDescription || source.bodyText?.find((t) => t.length > 30) || `Shop the ${collection} collection.`;
  const pageTitle = source.pageTitle || `${collection} — ${config.brand.name}`;
  const metaDescription = source.metaDescription || `Shop the ${collection} collection at ${config.brand.name}.`;
  const c = config.brand.colors;

  const template = await readFile(join(ROOT, 'templates', 'landing-page.html'), 'utf8');

  const vars = {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(metaDescription.slice(0, 300)),
    CANONICAL_URL: escapeHtml(source.url || config.brand.baseUrl),
    BASE_URL: escapeHtml(config.brand.baseUrl),
    HERO_IMAGE_SRC: './assets/hero.webp',
    HERO_IMAGE_ALT: escapeHtml(source.heroImage?.alt || `${collection} collection`),
    HERO_IMAGE_WIDTH: heroDims.width,
    HERO_IMAGE_HEIGHT: heroDims.height,
    H1_TEXT: escapeHtml(h1),
    COLLECTION_NAME: escapeHtml(collection),
    SUBHEADLINE_TEXT: escapeHtml(subheadline.slice(0, 200)),
    LOGO_SVG: logoSvg,
    LOGO_ALT: escapeHtml(`${config.brand.name} home`),
    ANNOUNCEMENT: escapeHtml(config.announcement || ''),
    NAV: renderNav(config.nav),
    MOBILE_NAV: renderMobileNav(config.nav),
    CATEGORY_STRIP: renderCategoryStrip(config.categoryStrip),
    PRODUCT_GRID: renderProductGrid(builtProducts),
    FOOTER_COLUMNS: renderFooterColumns(config.footer.columns),
    SOCIAL: renderSocial(config.footer.social),
    NEWSLETTER_HEADING: escapeHtml(config.newsletter.heading),
    NEWSLETTER_BLURB: escapeHtml(config.newsletter.blurb),
    NEWSLETTER_BANNER_HEADING: escapeHtml(config.newsletter.bannerHeading),
    COPYRIGHT: escapeHtml(config.footer.copyright || config.brand.name),
    YEAR: new Date().getFullYear(),
    TEAL: c.teal,
    FOOTER_COLOR: c.footer,
    BODY_COLOR: c.body,
    TEXT_COLOR: c.text,
    ACCENT_COLOR: c.accent,
    DISPLAY_FONT: config.brand.displayFont,
    DISPLAY_FONT_FILE: fontFile,
    TRACKING: trackingEnabled
      ? renderTracking(config.tracking, { enabled: ['google', 'meta', 'klaviyo'] })
      : '',
  };

  const html = applyTemplate(template, vars);
  const indexPath = join(outDir, 'index.html');
  await writeFile(indexPath, html, 'utf8');

  // --- Validate ---
  const sizeKB = (await stat(indexPath)).size / 1024;
  const checks = {
    'no cdn.shopify.com in static HTML': !/cdn\.shopify\.com/i.test(html),
    'no external <script src=> in static HTML': !/<script[^>]+src=/i.test(html),
    'all <img> local (./assets/)': [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].every(([, s]) => s.startsWith('./assets/')),
    'has product cards': builtProducts.length > 0,
    'no leftover tokens': !/\{\{[A-Z0-9_]+\}\}/.test(html),
  };

  console.log(`\n✓ Wrote ${indexPath} (${sizeKB.toFixed(1)} KB)\n`);
  let allOk = true;
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? '✓' : '✗'} ${name}`);
    if (!pass) allOk = false;
  }
  console.log(`  ${sizeKB < 50 ? '✓' : 'ℹ'} HTML size ${sizeKB.toFixed(1)} KB ${sizeKB < 50 ? '(<50KB)' : '(>50KB — high-fidelity build)'}`);
  if (!allOk) fail('One or more output requirements failed.');
  console.log('\n✓ Build success.');
}

main().catch((e) => fail(e.stack || e.message));
