/**
 * scrapePage(url) -> ContentModel
 *
 * Extracts meaningful content from a Shopify collection/product page using
 * Puppeteer. Pure data out — no file writing, no process.exit (the CLI/worker
 * handle I/O and exit codes). Throws on failure.
 */
import puppeteer from 'puppeteer';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

/**
 * @param {string} url
 * @param {{ timeout?: number, browser?: import('puppeteer').Browser }} [opts]
 *   Pass an existing `browser` to reuse it across jobs (the worker does this).
 * @returns {Promise<import('./types.js').ContentModel>}
 */
export async function scrapePage(url, { timeout = 60000, browser: provided } = {}) {
  new URL(url); // throws on invalid URL

  const browser =
    provided ||
    (await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }));

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

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

      // --- All images ---
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
        allImages.push({ src, alt: (img.getAttribute('alt') || '').trim(), width: w, height: h });
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
        const score = aboveFold ? renderArea * 4 : renderArea;
        if (score > bestArea && rect.width > 80 && rect.height > 80) {
          bestArea = score;
          heroImage = { src, alt: (img.getAttribute('alt') || '').trim() };
        }
      }
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

      // --- Product cards ---
      const productCards = [];
      const seenProd = new Set();
      const productLinks = [...document.querySelectorAll('a[href*="/products/"]')];
      const priceRe = /(?:\$|USD\s*)\s?\d[\d.,]*/;
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

        if (
          a.closest(
            'header, footer, nav, [class*="megamenu"], [class*="mobile-nav"], [class*="site-nav"], [class*="drawer"], [class*="search"]'
          )
        )
          continue;

        // Walk up to the largest ancestor that still contains only this product.
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

        let name =
          txt(card.querySelector('h2, h3, h4, .product-title, [class*="title"], [class*="name"]') || {}) ||
          txt(a) ||
          imageAlt;
        name = (name || '').slice(0, 200);

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

      // --- Collection name ---
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim() || '';
      const breadcrumbActive = txt(
        document.querySelector(
          '.breadcrumb [aria-current], .breadcrumbs [aria-current], nav[aria-label*="readcrumb"] li:last-child'
        ) || {}
      );
      const collectionName =
        txt(
          document.querySelector(
            '.collection-title, .collection__title, .collection-hero__title, [class*="collection"] h1'
          ) || {}
        ) ||
        breadcrumbActive ||
        (ogTitle || pageTitle).split(/[|–\-—]/)[0].trim() ||
        h1[0];

      let h1Derived = false;
      if (h1.length === 0 && collectionName) {
        h1 = [collectionName];
        h1Derived = true;
      }

      // --- Body text ---
      const bodyText = uniq(
        [...document.querySelectorAll('p, .rte, [class*="description"]')].map(txt).filter((t) => t.length > 20)
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

    return { url, ...data, scrapedAt: new Date().toISOString() };
  } finally {
    if (!provided) await browser.close();
  }
}
