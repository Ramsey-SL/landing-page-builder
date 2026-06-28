#!/usr/bin/env node
/**
 * CLI: node tools/scrape.js <url> <slug>
 * Thin wrapper over src/scrape.js — writes output/<slug>/source.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapePage } from '../src/scrape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const [, , url, slug] = process.argv;
if (!url || !slug) fail('Usage: node tools/scrape.js <url> <slug>');
try {
  new URL(url);
} catch {
  fail(`Invalid URL: ${url}`);
}

async function main() {
  console.log(`→ Scraping ${url}`);
  const content = await scrapePage(url);
  const source = { url, slug, ...content };

  const outDir = join(ROOT, 'output', slug);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'source.json');
  await writeFile(outPath, JSON.stringify(source, null, 2), 'utf8');

  console.log(`\n✓ Wrote ${outPath}\n`);
  console.table({
    h1: source.h1.length,
    h2: source.h2.length,
    h3: source.h3.length,
    allImages: source.allImages.length,
    ctaButtons: source.ctaButtons.length,
    navLinks: source.navLinks.length,
    productCards: source.productCards.length,
    bodyText: source.bodyText.length,
    sections: source.sectionOrder.length,
  });
  console.log('heroImage:', source.heroImage.src ? source.heroImage.src.slice(0, 80) : '(none)');

  const required = {
    heroImage: source.heroImage.src,
    h1: source.h1,
    ctaButtons: source.ctaButtons,
    productCards: source.productCards,
  };
  const empties = Object.entries(required).filter(([, v]) => !v || (Array.isArray(v) && v.length === 0));
  if (empties.length) fail(`Required fields empty: ${empties.map(([k]) => k).join(', ')}`);
  console.log('\n✓ Success condition met: heroImage, h1, ctaButtons, productCards all non-empty.');
}

main().catch((e) => fail(e.stack || e.message));
