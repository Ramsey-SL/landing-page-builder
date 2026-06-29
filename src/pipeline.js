/**
 * runClonePipeline() — the full "clone a URL into a page" flow the worker runs.
 *
 *   scrape → materialize assets (WebP) → recipe → render → write → (audit)
 *
 * Brand resolution is the caller's job: pass a curated Brand, or omit it and we
 * auto-derive a basic one from the scrape (so any URL works). Any custom font
 * file must already be placed in <outDir>/assets by the caller; auto-derived
 * brands use a system font and need no files.
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { scrapePage } from './scrape.js';
import { materializeAssets } from './images.js';
import { deriveBrandFromContent } from './brand.js';
import { contentModelToRecipe } from './recipe.js';
import { renderRecipe } from './page.js';
import { runAudit, scoresFromLhr } from './audit.js';

/** Output-requirement checks (mirrors the build CLI). */
export function validateBuild(html, productCount) {
  return {
    'no cdn.shopify.com': !/cdn\.shopify\.com/i.test(html),
    'no external <script src>': !/<script[^>]+src=/i.test(html),
    'all <img> local': [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].every(([, s]) => s.startsWith('./assets/')),
    'has products': productCount > 0,
    'no leftover tokens': !/\{\{[A-Z0-9_]+\}\}/.test(html),
  };
}

/**
 * @param {{
 *   url?: string,
 *   content?: import('./types.js').ContentModel,
 *   brand?: import('./types.js').Brand,
 *   outDir: string,
 *   trackingEnabled?: boolean,
 *   audit?: boolean,
 *   desktop?: boolean,
 *   maxProducts?: number,
 *   browser?: import('puppeteer').Browser,
 *   onProgress?: (step: string, pct: number) => void
 * }} opts
 */
export async function runClonePipeline({
  url,
  content,
  brand,
  outDir,
  trackingEnabled = true,
  audit = false,
  desktop = false,
  maxProducts,
  browser,
  prepareAssets,
  captureSource = false,
  onProgress = () => {},
}) {
  const assetsDir = join(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  onProgress('scrape', 10);
  if (!content) {
    if (!url) throw new Error('runClonePipeline needs a url or content');
    content = await scrapePage(url, { browser, screenshot: captureSource });
  }

  // Save a snapshot of the source page for side-by-side comparison.
  let sourceScreenshot = null;
  if (content._screenshot) {
    await writeFile(join(assetsDir, 'source.jpg'), content._screenshot);
    sourceScreenshot = './assets/source.jpg';
    delete content._screenshot;
  }

  if (!brand) brand = deriveBrandFromContent(content);

  onProgress('assets', 40);
  const assets = await materializeAssets(content, { assetsDir, maxProducts });

  // Place brand-owned files (e.g. the display font) into the build before render.
  if (prepareAssets) await prepareAssets(assetsDir, brand);

  onProgress('render', 70);
  const recipe = contentModelToRecipe(content, brand, assets);
  const html = await renderRecipe(recipe, brand, { trackingEnabled });
  const indexPath = join(outDir, 'index.html');
  await writeFile(indexPath, html, 'utf8');

  const checks = validateBuild(html, assets.products.length);
  const sizeKB = (await stat(indexPath)).size / 1024;

  let scores = null;
  if (audit) {
    onProgress('audit', 82);
    scores = {
      mobile: scoresFromLhr(await runAudit({ dir: outDir, desktop: false })),
      desktop: scoresFromLhr(await runAudit({ dir: outDir, desktop: true })),
    };
  }

  onProgress('done', 100);
  return { content, brand, assets, recipe, html, indexPath, sizeKB, checks, scores, sourceScreenshot };
}
