// Deep design + structure extraction for a high-fidelity clone.
// Outputs design.json into output/<slug>/ and screenshots for visual reference.
import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = process.argv[2] || 'https://thegreatpnw.com/collections/smokey-bear-pnw';
const slug = process.argv[3] || 'pnw-smokey-bear';
const OUT = join('/Users/ramsey/shopify-page-cloner/output', slug);
await mkdir(OUT, { recursive: true });

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const design = await page.evaluate(() => {
  const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : '');
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };

  // --- Announcement bar (top strip) ---
  const annEl = document.querySelector('[class*="announcement"],[class*="topbar"],[class*="promo-bar"],[class*="ticker"]');
  const announcement = annEl ? {
    text: txt(annEl).slice(0, 200),
    bg: cs(annEl, 'background-color'),
    color: cs(annEl, 'color'),
  } : null;

  // --- Logo ---
  const header = document.querySelector('header') || document.querySelector('[class*="header"]');
  let logo = null;
  const logoImg = header?.querySelector('img');
  if (logoImg) {
    logo = {
      src: abs(logoImg.currentSrc || logoImg.src || logoImg.getAttribute('data-src')),
      alt: logoImg.getAttribute('alt') || 'Logo',
      width: logoImg.naturalWidth, height: logoImg.naturalHeight,
    };
  }

  // --- Primary nav tree (top-level -> children) ---
  const nav = header?.querySelector('nav, [class*="nav"], [class*="menu"]');
  const topItems = nav ? [...nav.children].flatMap((c) => c.tagName === 'UL' ? [...c.children] : [c]) : [];
  const navTree = [];
  const navRoot = nav?.querySelector('ul') || nav;
  if (navRoot) {
    for (const li of [...navRoot.children]) {
      const a = li.querySelector(':scope > a, a');
      if (!a) continue;
      const label = txt(a).split('\n')[0].trim();
      if (!label) continue;
      const href = abs(a.getAttribute('href') || '#');
      // children: links inside submenu/megamenu of this li
      const childLinks = [...li.querySelectorAll('a')].slice(1).map((x) => ({ text: txt(x), href: abs(x.getAttribute('href')) })).filter((x) => x.text && x.text !== label);
      // group children under their column headings if present
      const groups = [...li.querySelectorAll('[class*="col"],[class*="group"],[class*="column"]')].map((col) => ({
        heading: txt(col.querySelector('[class*="title"],h2,h3,h4,strong')) || '',
        links: [...col.querySelectorAll('a')].map((x) => ({ text: txt(x), href: abs(x.getAttribute('href')) })).filter((x) => x.text),
      })).filter((g) => g.links.length);
      navTree.push({ label, href, childLinks: childLinks.slice(0, 40), groups: groups.slice(0, 8) });
    }
  }

  // --- Footer columns ---
  const footer = document.querySelector('footer') || document.querySelector('[class*="footer"]');
  const footerCols = [];
  if (footer) {
    const blocks = [...footer.querySelectorAll('[class*="block"],[class*="col"],[class*="menu"],[class*="group"]')];
    const seen = new Set();
    for (const blk of blocks) {
      const heading = txt(blk.querySelector('h2,h3,h4,[class*="title"],[class*="heading"]'));
      const links = [...blk.querySelectorAll('a')].map((a) => ({ text: txt(a), href: abs(a.getAttribute('href')) })).filter((l) => l.text && !/instagram|facebook|youtube|tiktok|twitter|pinterest/i.test(l.href));
      if (heading && links.length && !seen.has(heading)) {
        seen.add(heading);
        footerCols.push({ heading, links: links.slice(0, 12) });
      }
    }
  }
  const social = footer ? [...footer.querySelectorAll('a[href*="instagram"],a[href*="facebook"],a[href*="youtube"],a[href*="tiktok"],a[href*="twitter"],a[href*="pinterest"]')]
    .map((a) => ({ network: (a.href.match(/instagram|facebook|youtube|tiktok|twitter|pinterest/i) || [''])[0].toLowerCase(), href: a.href }))
    .filter((s, i, arr) => arr.findIndex((y) => y.network === s.network) === i) : [];

  // newsletter
  const nlForm = footer?.querySelector('form');
  const newsletter = nlForm ? {
    heading: txt(footer.querySelector('h2,h3,[class*="title"]')) || 'Sign up & save',
    placeholder: nlForm.querySelector('input[type="email"],input[type="text"]')?.getAttribute('placeholder') || 'Email',
  } : null;

  // --- Brand styling (computed) ---
  const body = document.body;
  const sampleBtn = document.querySelector('button, .btn, [class*="button"], a[href*="cart"]');
  const sampleH = document.querySelector('h2,h3');
  const productTitle = document.querySelector('[class*="product"] [class*="title"], [class*="card"] [class*="title"]');

  const styling = {
    bodyFont: cs(body, 'font-family'),
    headingFont: cs(sampleH, 'font-family'),
    bodyColor: cs(body, 'color'),
    bodyBg: cs(body, 'background-color'),
    headerBg: cs(header, 'background-color'),
    headerColor: cs(header, 'color'),
    footerBg: cs(footer, 'background-color'),
    footerColor: cs(footer, 'color'),
    btn: sampleBtn ? {
      bg: cs(sampleBtn, 'background-color'), color: cs(sampleBtn, 'color'),
      radius: cs(sampleBtn, 'border-radius'), font: cs(sampleBtn, 'font-family'),
      weight: cs(sampleBtn, 'font-weight'), transform: cs(sampleBtn, 'text-transform'),
      letterSpacing: cs(sampleBtn, 'letter-spacing'), border: cs(sampleBtn, 'border'),
    } : null,
    productTitle: productTitle ? { size: cs(productTitle, 'font-size'), weight: cs(productTitle, 'font-weight'), transform: cs(productTitle, 'text-transform') } : null,
  };

  // web fonts referenced
  const fontFiles = [...document.styleSheets].flatMap((ss) => {
    try { return [...ss.cssRules].filter((r) => r.constructor.name === 'CSSFontFaceRule').map((r) => ({ family: r.style.getPropertyValue('font-family'), src: r.style.getPropertyValue('src').slice(0, 200) })); }
    catch { return []; }
  }).slice(0, 20);

  return { announcement, logo, navTree, footerCols, social, newsletter, styling, fontFiles };
});

await writeFile(join(OUT, 'design.json'), JSON.stringify(design, null, 2));

// Screenshots for visual reference
await page.screenshot({ path: join(OUT, 'ref-top.png') });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: join(OUT, 'ref-footer.png') });

console.log('design.json written. Summary:');
console.log('announcement:', design.announcement?.text);
console.log('logo:', design.logo?.src, design.logo?.width + 'x' + design.logo?.height);
console.log('navTree top items:', design.navTree.map((n) => n.label));
console.log('footer cols:', design.footerCols.map((c) => c.heading));
console.log('social:', design.social.map((s) => s.network));
console.log('styling:', JSON.stringify(design.styling, null, 2));
console.log('fontFiles:', design.fontFiles.map((f) => f.family));

await b.close();
