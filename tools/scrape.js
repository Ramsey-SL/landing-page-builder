#!/usr/bin/env node
/**
 * Goal 1 — Scraper / Content Extraction
 *
 * Usage: node tools/scrape.js <url> <slug>
 * Example: node tools/scrape.js https://thegreatpnw.com/collections/smokey-bear-pnw pnw-smokey-bear
 *
 * Uses Puppeteer to extract all meaningful content from a Shopify
 * collection/product page and writes it to output/<slug>/source.json.
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const [, , url, slug] = process.argv;
if (!url || !slug) {
  fail('Usage: node tools/scrape.js <url> <slug>');
}
try {
  new URL(url);
} catch {
  fail(`Invalid URL: ${url}`);
}

// Scroll the full page to force lazy-loaded images/sections to render.
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
}

async function main() {
  console.log(`→ Scraping ${url}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Trigger lazy-loaded images by scrolling the full page height.
    await autoScroll(page);
    await new Promise((r) => setTimeout(r, 1500));

    const data = await page.evaluate(() => {
      const abs = (u) => {
        if (!u) return '';
        try {
          return new URL(u, location.href).href;
        } catch {
          return '';
        }
      };

      // Resolve the best real image URL from an <img>, handling lazy-load attrs.
      const imgSrc = (img) => {
        const candidates = [
          img.currentSrc,
          img.getAttribute('src'),
          img.getAttribute('data-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-srcset'),
          img.getAttribute('srcset'),
        ].filter(Boolean);
        for (const c of candidates) {
          // srcset: take the first/largest entry's URL
          const first = c.split(',')[0].trim().split(/\s+/)[0];
          if (first && !first.startsWith('data:')) return abs(first);
        }
        return '';
      };

      const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const uniq = (arr) => [...new Set(arr)];

      // --- Headings ---
      let h1 = uniq([...document.querySelectorAll('h1')].map(txt).filter(Boolean));
      const h2 = uniq([...document.querySelectorAll('h2')].map(txt).filter(Boolean));
      const h3 = uniq([...document.querySelectorAll('h3')].map(txt).filter(Boolean));

      // --- Meta ---
      const pageTitle = document.title || '';
      const metaDescription =
        document.querySelector('meta[name="description"]')?.content?.trim() ||
        document.querySelector('meta[property="og:description"]')?.content?.trim() ||
        '';

      // --- All images (visible, real, reasonably sized) ---
      const allImgEls = [...document.querySelectorAll('img')];
      const allImages = [];
      const seenImg = new Set();
      for (const img of allImgEls) {
        const src = imgSrc(img);
        if (!src || seenImg.has(src)) continue;
        const rect = img.getBoundingClientRect();
        const w = img.naturalWidth || Math.round(rect.width) || 0;
        const h = img.naturalHeight || Math.round(rect.height) || 0;
        seenImg.add(src);
        allImages.push({
          src,
          alt: (img.getAttribute('alt') || '').trim(),
          width: w,
          height: h,
        });
      }

      // --- Hero image: largest image whose top is in the first viewport ---
      let heroImage = { src: '', alt: '' };
      let bestArea = 0;
      const vh = window.innerHeight;
      for (const img of allImgEls) {
        const src = imgSrc(img);
        if (!src) continue;
        const rect = img.getBoundingClientRect();
        const renderArea = rect.width * rect.height;
        const aboveFold = rect.top < vh && rect.top + rect.height > 0;
        // weight above-fold images, but allow large below-fold as fallback
        const score = aboveFold ? renderArea * 4 : renderArea;
        if (score > bestArea && rect.width > 80 && rect.height > 80) {
          bestArea = score;
          heroImage = { src, alt: (img.getAttribute('alt') || '').trim() };
        }
      }
      // Fallback to og:image if nothing usable found
      if (!heroImage.src) {
        const og = document.querySelector('meta[property="og:image"]')?.content;
        if (og) heroImage = { src: abs(og), alt: h1[0] || pageTitle };
      }

      // --- Navigation links ---
      const navContainer =
        document.querySelector('header nav') ||
        document.querySelector('nav[role="navigation"]') ||
        document.querySelector('header') ||
        document.querySelector('nav');
      const navLinks = [];
      const seenNav = new Set();
      if (navContainer) {
        for (const a of navContainer.querySelectorAll('a[href]')) {
          const text = txt(a);
          const href = abs(a.getAttribute('href'));
          if (!text || !href) continue;
          const key = text + '|' + href;
          if (seenNav.has(key)) continue;
          seenNav.add(key);
          navLinks.push({ text, href });
        }
      }

      // --- Product cards: anchor on links to /products/ ---
      const productCards = [];
      const seenProd = new Set();
      const productLinks = [...document.querySelectorAll('a[href*="/products/"]')];
      const priceRe = /(?:\$|USD\s*)\s?\d[\d.,]*/;
      // Product handle = the segment right after /products/ (dedup key).
      const handleOf = (h) => {
        const m = h.match(/\/products\/([^/?#]+)/);
        return m ? m[1] : h;
      };
      const stripQ = (s) => (s || '').split('?')[0];
      for (const a of productLinks) {
        const href = abs(a.getAttribute('href'));
        if (!href) continue;
        const handle = handleOf(href);
        if (seenProd.has(handle)) continue;

        // Skip product links that live in chrome (nav, mega-menu, footer, drawers)
        // rather than the collection grid.
        if (a.closest('header, footer, nav, [class*="megamenu"], [class*="mobile-nav"], [class*="site-nav"], [class*="drawer"], [class*="search"]'))
          continue;

        // Walk up to the LARGEST ancestor that still contains only this one
        // product (stop before an ancestor holding multiple products, e.g. the
        // grid). This is theme-agnostic — no reliance on specific class names.
        let card = a;
        let parent = a.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          const handles = new Set(
            [...parent.querySelectorAll('a[href*="/products/"]')]
              .map((x) => (x.getAttribute('href') || '').match(/\/products\/([^/?#]+)/))
              .filter(Boolean)
              .map((m) => m[1])
          );
          if (handles.size > 1) break;
          card = parent;
          parent = parent.parentElement;
        }

        // Collect distinct real images in the card: [0] = primary, [1] = hover.
        const distinct = [];
        const seenPath = new Set();
        for (const candidate of card.querySelectorAll('img')) {
          const s = imgSrc(candidate);
          if (!s) continue;
          if (/logo|icon|sprite|badge|payment/i.test(s)) continue;
          const key = stripQ(s);
          if (seenPath.has(key)) continue;
          seenPath.add(key);
          distinct.push({ src: s, alt: (candidate.getAttribute('alt') || '').trim() });
          if (distinct.length >= 2) break;
        }
        const imageSrc = distinct[0]?.src || '';
        const imageAlt = distinct[0]?.alt || '';
        const imageSrcHover = distinct[1]?.src || '';

        // Name: prefer a heading in the card, else the link text, else img alt
        let name =
          txt(card.querySelector('h2, h3, h4, .product-title, [class*="title"], [class*="name"]') || {}) ||
          txt(a) ||
          imageAlt;
        name = (name || '').slice(0, 200);

        // Price: search card text for a currency pattern
        const cardText = txt(card);
        const priceMatch = cardText.match(priceRe);
        const price = priceMatch ? priceMatch[0].replace(/\s+/g, '') : '';

        if (!name) continue;
        seenProd.add(handle);
        productCards.push({ name, price, imageSrc, imageAlt, imageSrcHover, href });
      }

      // --- CTA buttons ---
      const ctaButtons = [];
      const seenCta = new Set();
      const ctaSelector = [
        'button',
        'a.button',
        'a.btn',
        '[class*="btn"]',
        '[class*="button"]',
        'a[href*="/cart"]',
        'a[href*="/checkout"]',
        'input[type="submit"]',
        '[role="button"]',
      ].join(',');
      for (const el of document.querySelectorAll(ctaSelector)) {
        const text = txt(el) || el.getAttribute('aria-label') || el.value || '';
        const href = el.tagName === 'A' ? abs(el.getAttribute('href')) : '';
        const t = (text || '').trim();
        if (!t || t.length > 60) continue;
        const key = t + '|' + href;
        if (seenCta.has(key)) continue;
        seenCta.add(key);
        ctaButtons.push({ text: t, href });
      }

      // --- Collection name (multiple signals; the source page has no <h1>) ---
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim() || '';
      const breadcrumbActive = txt(
        document.querySelector(
          '.breadcrumb [aria-current], .breadcrumbs [aria-current], nav[aria-label*="readcrumb"] li:last-child'
        ) || {}
      );
      const collectionName =
        txt(document.querySelector('.collection-title, .collection__title, .collection-hero__title, [class*="collection"] h1') || {}) ||
        breadcrumbActive ||
        (ogTitle || pageTitle).split(/[|–\-—]/)[0].trim() ||
        h1[0];

      // The source page has no <h1> (a real SEO/a11y defect we are fixing in the
      // rebuild). Derive a proper h1 from the collection name so the rebuilt
      // page has a single, descriptive top-level heading.
      let h1Derived = false;
      if (h1.length === 0 && collectionName) {
        h1 = [collectionName];
        h1Derived = true;
      }

      // --- Body text: significant paragraphs ---
      const bodyText = uniq(
        [...document.querySelectorAll('p, .rte, [class*="description"]')]
          .map(txt)
          .filter((t) => t.length > 20)
      ).slice(0, 50);

      // --- Section order (heuristic) ---
      const sectionEls = [...document.querySelectorAll('section, [class*="section"], main > div')];
      const classify = (el) => {
        const c = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
        const inner = (el.textContent || '').toLowerCase();
        if (/hero|banner|slideshow/.test(c)) return 'hero';
        if (/collection|product-grid|product-list|grid|products/.test(c)) return 'products';
        if (/testimonial|review|rating/.test(c) || /review/.test(inner.slice(0, 200))) return 'testimonials';
        if (/footer/.test(c)) return 'footer';
        if (/header|nav/.test(c)) return 'header';
        if (/newsletter|signup|subscribe/.test(c)) return 'newsletter';
        if (/feature|benefit|value/.test(c)) return 'features';
        if (el.querySelector('a[href*="/products/"]')) return 'products';
        if (el.querySelector('img') && el.querySelector('h1,h2')) return 'content';
        return 'content';
      };
      const sectionOrder = [];
      for (const el of sectionEls) {
        const type = classify(el);
        if (sectionOrder[sectionOrder.length - 1] !== type) sectionOrder.push(type);
      }

      return {
        pageTitle,
        metaDescription,
        h1,
        h1Derived,
        h2,
        h3,
        heroImage,
        allImages,
        ctaButtons,
        navLinks,
        collectionName,
        productCards,
        bodyText,
        sectionOrder,
      };
    });

    const source = { url, slug, ...data, scrapedAt: new Date().toISOString() };

    const outDir = join(ROOT, 'output', slug);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, 'source.json');
    await writeFile(outPath, JSON.stringify(source, null, 2), 'utf8');

    // --- Report ---
    console.log(`\n✓ Wrote ${outPath}\n`);
    const counts = {
      h1: source.h1.length,
      h2: source.h2.length,
      h3: source.h3.length,
      allImages: source.allImages.length,
      ctaButtons: source.ctaButtons.length,
      navLinks: source.navLinks.length,
      productCards: source.productCards.length,
      bodyText: source.bodyText.length,
      sections: source.sectionOrder.length,
    };
    console.table(counts);
    console.log('heroImage:', source.heroImage.src ? source.heroImage.src.slice(0, 80) : '(none)');

    // Validate the success condition
    const required = { heroImage: source.heroImage.src, h1: source.h1, ctaButtons: source.ctaButtons, productCards: source.productCards };
    const empties = Object.entries(required).filter(([, v]) => !v || (Array.isArray(v) && v.length === 0));
    if (empties.length) {
      fail(`Required fields empty: ${empties.map(([k]) => k).join(', ')}`);
    }
    console.log('\n✓ Success condition met: heroImage, h1, ctaButtons, productCards all non-empty.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(e.stack || e.message));
