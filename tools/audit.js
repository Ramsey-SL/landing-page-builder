#!/usr/bin/env node
/**
 * Goal 4 — Lighthouse Validation (the phase gate)
 *
 * Usage: node tools/audit.js <slug> [--desktop] [--dir=<path>]
 *
 * Serves output/<slug>/ (or --dir) on a local port, runs Lighthouse headlessly
 * through Puppeteer's bundled Chrome, prints a score table, saves the full
 * report to output/<slug>/lighthouse.json, and exits 1 if any score < 90.
 */

import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const THRESHOLD = 90;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function startServer(rootDir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = normalize(join(rootDir, urlPath));
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export async function runAudit({ dir, desktop = false }) {
  const server = await startServer(dir);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const endpoint = new URL(browser.wsEndpoint());
    const options = {
      port: Number(endpoint.port),
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: desktop ? 'desktop' : 'mobile',
      screenEmulation: desktop
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    };
    if (desktop) {
      options.throttling = {
        rttMs: 40,
        throughputKbps: 10 * 1024,
        cpuSlowdownMultiplier: 1,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      };
    }

    const runnerResult = await lighthouse(url, options);
    return runnerResult.lhr;
  } finally {
    await browser.close();
    server.close();
  }
}

function scoreOf(lhr, cat) {
  return Math.round((lhr.categories[cat].score || 0) * 100);
}

function printTable(slug, lhr, formFactor) {
  const rows = [
    ['Performance', scoreOf(lhr, 'performance')],
    ['Accessibility', scoreOf(lhr, 'accessibility')],
    ['Best Practices', scoreOf(lhr, 'best-practices')],
    ['SEO', scoreOf(lhr, 'seo')],
  ];
  const allPass = rows.every(([, s]) => s >= THRESHOLD);
  console.log('\n==============================');
  console.log(`Lighthouse Audit: ${slug} (${formFactor})`);
  console.log('==============================');
  for (const [label, s] of rows) {
    const pad = label.padEnd(16);
    console.log(`${pad} ${String(s).padStart(3)}  →  ${s >= THRESHOLD ? 'PASS' : 'FAIL'}`);
  }
  console.log('==============================');
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log('==============================\n');
  return { allPass, rows };
}

// Surface the specific failing audits to make diagnosis fast.
function reportFailures(lhr) {
  const cats = ['performance', 'accessibility', 'best-practices', 'seo'];
  for (const cat of cats) {
    if (scoreOf(lhr, cat) >= THRESHOLD) continue;
    const refs = lhr.categories[cat].auditRefs;
    const failed = refs
      .map((r) => lhr.audits[r.id])
      .filter((a) => a && a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    if (failed.length) {
      console.log(`↳ Failing/weak audits in ${cat}:`);
      for (const a of failed.slice(0, 12)) {
        const disp = a.displayValue ? ` (${a.displayValue})` : '';
        console.log(`   • [${a.score}] ${a.title}${disp}`);
      }
      console.log('');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) fail('Usage: node tools/audit.js <slug> [--desktop] [--dir=<path>]');
  const desktop = args.includes('--desktop');
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const dir = dirArg ? normalize(dirArg.slice('--dir='.length)) : join(ROOT, 'output', slug);

  const lhr = await runAudit({ dir, desktop });
  const { allPass } = printTable(slug, lhr, desktop ? 'desktop' : 'mobile');
  if (!allPass) reportFailures(lhr);

  const outPath = join(ROOT, 'output', slug, 'lighthouse.json');
  await writeFile(outPath, JSON.stringify(lhr, null, 2), 'utf8');
  console.log(`Full report saved to ${outPath}`);

  process.exit(allPass ? 0 : 1);
}

// Only run as CLI when invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(e.stack || e.message));
}
