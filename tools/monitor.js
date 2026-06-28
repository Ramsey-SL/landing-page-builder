#!/usr/bin/env node
/**
 * Production Lighthouse monitor — audits the LIVE deployed URLs and fails if any
 * score drops below 90. Used by the scheduled GitHub Action (and runnable
 * locally via `npm run monitor`).
 *
 * URLs come from committed output/<slug>/deploy.json files, or pass them as args:
 *   node tools/monitor.js https://sl-pnw-headwear.netlify.app
 */
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THRESHOLD = 90;
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];

async function liveUrlsFromDeploys() {
  const outDir = join(ROOT, 'output');
  const urls = [];
  let slugs = [];
  try { slugs = await readdir(outDir); } catch { return urls; }
  for (const slug of slugs) {
    try {
      const meta = JSON.parse(await readFile(join(outDir, slug, 'deploy.json'), 'utf8'));
      if (meta.url) urls.push({ slug, url: meta.url });
    } catch { /* no deploy.json for this slug */ }
  }
  return urls;
}

async function auditUrl(browser, url) {
  const port = Number(new URL(browser.wsEndpoint()).port);
  const { lhr } = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: CATS,
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  });
  const scores = {};
  for (const c of CATS) scores[c] = Math.round((lhr.categories[c].score || 0) * 100);
  return scores;
}

async function main() {
  const argUrls = process.argv.slice(2).filter((a) => a.startsWith('http')).map((url) => ({ slug: url, url }));
  const targets = argUrls.length ? argUrls : await liveUrlsFromDeploys();
  if (!targets.length) {
    console.error('✖ No URLs to monitor (no output/*/deploy.json and no URL args).');
    process.exit(1);
  }

  console.log(`Monitoring ${targets.length} live page(s), threshold ≥${THRESHOLD}\n`);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  let anyFail = false;
  try {
    for (const { slug, url } of targets) {
      try {
        const s = await auditUrl(browser, url);
        const fails = CATS.filter((c) => s[c] < THRESHOLD);
        if (fails.length) anyFail = true;
        const line = CATS.map((c) => `${c.split('-')[0]}=${s[c]}`).join('  ');
        console.log(`${fails.length ? '✗ FAIL' : '✓ PASS'}  ${url}\n        ${line}${fails.length ? `   (below ${THRESHOLD}: ${fails.join(', ')})` : ''}\n`);
      } catch (e) {
        anyFail = true;
        console.log(`✗ ERROR ${url}\n        ${e.message}\n`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(anyFail ? '✖ One or more pages failed the Lighthouse gate.' : '✓ All monitored pages ≥90.');
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
