#!/usr/bin/env node
/**
 * CLI: node tools/build.js <slug> [--no-tracking]
 *
 * Thin wrapper: merges output/<slug>/source.json + config/<slug>.json, copies
 * brand assets, then runs the engine (materializeAssets → contentModelToRecipe →
 * renderRecipe) and writes output/<slug>/index.html.
 */
import { mkdir, readFile, writeFile, stat, copyFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../src/render.js';
import { configToBrand } from '../src/brand.js';
import { materializeAssets } from '../src/images.js';
import { contentModelToRecipe } from '../src/recipe.js';
import { renderRecipe } from '../src/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) fail('Usage: node tools/build.js <slug> [--no-tracking]');
const trackingEnabled = !args.includes('--no-tracking');

async function main() {
  const outDir = join(ROOT, 'output', slug);
  const assetsDir = join(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  let content;
  try {
    content = JSON.parse(await readFile(join(outDir, 'source.json'), 'utf8'));
  } catch {
    fail(`Cannot read output/${slug}/source.json — run scrape.js first.`);
  }
  let config;
  try {
    config = JSON.parse(await readFile(join(ROOT, 'config', `${slug}.json`), 'utf8'));
  } catch {
    fail(`Cannot read config/${slug}.json — required for the branded build.`);
  }

  console.log(`→ Building ${slug} (tracking: ${trackingEnabled ? 'on' : 'off'})`);

  // Brand assets: inline the logo, copy logo + font into the build.
  const brandDir = join(ROOT, 'config', 'brand-assets', slug);
  const logoFile = config.brand.logoFile;
  const fontFile = config.brand.displayFontFile;
  let logoSvg;
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

  // Engine pipeline.
  const brand = configToBrand(config, logoSvg);
  const assets = await materializeAssets(content, { assetsDir });
  if (assets.hero) console.log(`  ✓ hero.webp (${assets.hero.width}x${assets.hero.height})`);
  for (const w of assets.warnings) console.warn(`  ! ${w}`);
  console.log(`  ✓ ${assets.ok}/${assets.total} product images converted to WebP`);

  const recipe = contentModelToRecipe(content, brand, assets);
  const html = await renderRecipe(recipe, brand, { trackingEnabled });

  const indexPath = join(outDir, 'index.html');
  await writeFile(indexPath, html, 'utf8');

  // Validate output requirements.
  const sizeKB = (await stat(indexPath)).size / 1024;
  const checks = {
    'no cdn.shopify.com in static HTML': !/cdn\.shopify\.com/i.test(html),
    'no external <script src=> in static HTML': !/<script[^>]+src=/i.test(html),
    'all <img> local (./assets/)': [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].every(([, s]) => s.startsWith('./assets/')),
    'has product cards': assets.products.length > 0,
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
