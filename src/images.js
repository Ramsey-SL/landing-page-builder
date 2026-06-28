/**
 * materializeAssets(content) -> Assets
 *
 * Downloads the hero + product images (and product hover images) and converts
 * them to WebP via sharp. Phase 0 sink = a local assets dir; a Cloudinary sink
 * comes in a later phase. Pure-ish: I/O to the given dir, returns records.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Download an image and write it as WebP at maxWidth; returns {width,height}. */
export async function toWebp(url, outPath, maxWidth) {
  const buf = await fetchBuffer(url);
  const info = await sharp(buf)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outPath);
  return { width: info.width, height: info.height };
}

/**
 * @param {import('./types.js').ContentModel} content
 * @param {{ assetsDir: string, maxProducts?: number, concurrency?: number }} opts
 * @returns {Promise<import('./types.js').Assets>}
 */
export async function materializeAssets(content, { assetsDir, maxProducts = 36, concurrency = 8 }) {
  await mkdir(assetsDir, { recursive: true });
  const warnings = [];

  // --- Hero ---
  let hero = null;
  if (content.heroImage?.src) {
    const dims = await toWebp(content.heroImage.src, join(assetsDir, 'hero.webp'), 1600);
    hero = { localImage: './assets/hero.webp', width: dims.width, height: dims.height, alt: content.heroImage.alt || '' };
  }

  // --- Products (concurrency-limited) ---
  const candidates = (content.productCards || []).filter((p) => p.imageSrc).slice(0, maxProducts);
  const products = new Array(candidates.length);
  let idx = 0;
  let ok = 0;

  async function worker() {
    while (idx < candidates.length) {
      const i = idx++;
      const p = candidates[i];
      const file = `product-${i + 1}.webp`;
      try {
        const dims = await toWebp(p.imageSrc, join(assetsDir, file), 700);
        const rec = {
          name: p.name,
          price: p.price,
          href: p.href,
          localImage: `./assets/${file}`,
          imageAlt: p.imageAlt || p.name,
          width: dims.width,
          height: dims.height,
        };
        if (p.imageSrcHover) {
          const hoverFile = `product-${i + 1}-hover.webp`;
          try {
            const hd = await toWebp(p.imageSrcHover, join(assetsDir, hoverFile), 700);
            rec.localImageHover = `./assets/${hoverFile}`;
            rec.hoverWidth = hd.width;
            rec.hoverHeight = hd.height;
          } catch (e) {
            warnings.push(`hover image failed for ${p.name}: ${e.message}`);
          }
        }
        products[i] = rec;
        ok++;
      } catch (e) {
        warnings.push(`skipped product ${i + 1} (${p.name}): ${e.message}`);
        products[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return { hero, products: products.filter(Boolean), ok, total: candidates.length, warnings };
}
