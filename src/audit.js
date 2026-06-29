/**
 * runAudit({dir|url}) -> lhr
 *
 * Runs Lighthouse via Puppeteer's bundled Chrome. Pass `dir` to serve a local
 * build on an ephemeral port, or `url` to audit a live page directly. Returns
 * the raw Lighthouse result; callers format/score it.
 */
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

export const THRESHOLD = 90;
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];

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

/**
 * @param {{ dir?: string, url?: string, desktop?: boolean }} opts
 * @returns {Promise<object>} Lighthouse result object (lhr)
 */
export async function runAudit({ dir, url, desktop = false }) {
  if (!dir && !url) throw new Error('runAudit needs a dir or url');
  let server = null;
  let target = url;
  if (!url) {
    server = await startServer(dir);
    target = `http://127.0.0.1:${server.address().port}/`;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const options = {
      port: Number(new URL(browser.wsEndpoint()).port),
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATS,
      // Audit the page even when the origin returns a non-2xx status. Real
      // Shopify pages sometimes serve a full, renderable body with a 404 status
      // (a "soft 404"); without this Lighthouse aborts with ERRORED_DOCUMENT_REQUEST.
      ignoreStatusCode: true,
      formFactor: desktop ? 'desktop' : 'mobile',
      // Use a plain Chrome UA — Lighthouse otherwise appends "Chrome-Lighthouse",
      // which some bot-protection layers reject before the page can load.
      emulatedUserAgent: desktop
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
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
    const { lhr } = await lighthouse(target, options);
    // A genuine load failure leaves every category null; surface it so callers
    // can store null (→ "—") instead of a misleading 0/0/0/0.
    if (lhr.runtimeError) throw new Error(`audit failed: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
    return lhr;
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

/** @returns {import('./types.js').Scores} */
export function scoresFromLhr(lhr) {
  const s = {};
  for (const c of CATS) s[c] = Math.round((lhr.categories[c].score || 0) * 100);
  return s;
}

export { CATS };
