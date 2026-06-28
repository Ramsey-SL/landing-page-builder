#!/usr/bin/env node
/**
 * Production Lighthouse monitor — audits the LIVE deployed URLs and fails if any
 * score drops below 90. Used by the scheduled GitHub Action (and `npm run monitor`).
 *
 * URLs come from committed output/<slug>/deploy.json, or pass them as args:
 *   node tools/monitor.js https://sl-pnw-headwear.netlify.app
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit, scoresFromLhr, THRESHOLD, CATS } from '../src/audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function liveUrlsFromDeploys() {
  const outDir = join(ROOT, 'output');
  const urls = [];
  let slugs = [];
  try {
    slugs = await readdir(outDir);
  } catch {
    return urls;
  }
  for (const slug of slugs) {
    try {
      const meta = JSON.parse(await readFile(join(outDir, slug, 'deploy.json'), 'utf8'));
      if (meta.url) urls.push({ slug, url: meta.url });
    } catch {
      /* no deploy.json for this slug */
    }
  }
  return urls;
}

async function main() {
  const argUrls = process.argv.slice(2).filter((a) => a.startsWith('http')).map((url) => ({ slug: url, url }));
  const targets = argUrls.length ? argUrls : await liveUrlsFromDeploys();
  if (!targets.length) {
    console.error('✖ No URLs to monitor (no output/*/deploy.json and no URL args).');
    process.exit(1);
  }

  console.log(`Monitoring ${targets.length} live page(s), threshold ≥${THRESHOLD}\n`);
  let anyFail = false;
  for (const { url } of targets) {
    try {
      const scores = scoresFromLhr(await runAudit({ url }));
      const fails = CATS.filter((c) => scores[c] < THRESHOLD);
      if (fails.length) anyFail = true;
      const line = CATS.map((c) => `${c.split('-')[0]}=${scores[c]}`).join('  ');
      console.log(
        `${fails.length ? '✗ FAIL' : '✓ PASS'}  ${url}\n        ${line}${fails.length ? `   (below ${THRESHOLD}: ${fails.join(', ')})` : ''}\n`
      );
    } catch (e) {
      anyFail = true;
      console.log(`✗ ERROR ${url}\n        ${e.message}\n`);
    }
  }

  console.log(anyFail ? '✖ One or more pages failed the Lighthouse gate.' : '✓ All monitored pages ≥90.');
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
