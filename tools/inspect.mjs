// One-off recon: detect tracking pixels + capture nav/footer structure.
import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'https://thegreatpnw.com/collections/smokey-bear-pnw';

const TRACKER_HOSTS = [
  'connect.facebook.net', 'facebook.com/tr', 'klaviyo.com', 'klaviyo',
  'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
  'tiktok.com', 'analytics.tiktok', 'pinterest', 'pinimg', 'bing.com', 'bat.bing',
  'snapchat', 'sc-static', 'doubleclick', 'googleadservices', 'hotjar', 'clarity.ms',
  'shopify.com/monorail', 'shopifysvc', 'shopify-analytics', 'np.smartsend', 'attentivemobile',
  'postscript', 'gorgias', 'yotpo', 'okendo', 'rebuy', 'criteo', 'awin', 'impact',
];

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

const requests = new Set();
page.on('request', (r) => {
  const u = r.url();
  for (const h of TRACKER_HOSTS) if (u.includes(h)) { requests.add(h + '  ←  ' + u.slice(0, 110)); break; }
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const globals = await page.evaluate(() => {
  const w = window;
  return {
    'Meta Pixel (fbq)': typeof w.fbq !== 'undefined',
    'Klaviyo (_learnq)': typeof w._learnq !== 'undefined' || typeof w.klaviyo !== 'undefined',
    'Google Analytics (gtag/ga)': typeof w.gtag !== 'undefined' || typeof w.ga !== 'undefined',
    'GTM (dataLayer)': Array.isArray(w.dataLayer),
    'TikTok (ttq)': typeof w.ttq !== 'undefined',
    'Pinterest (pintrk)': typeof w.pintrk !== 'undefined',
    'Snap (snaptr)': typeof w.snaptr !== 'undefined',
    'Shopify analytics': typeof w.ShopifyAnalytics !== 'undefined' || typeof w.Shopify !== 'undefined',
  };
});

const scripts = await page.evaluate(() =>
  [...document.querySelectorAll('script[src]')].map((s) => s.src).filter(Boolean)
);

// Structure capture
const structure = await page.evaluate(() => {
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const header = document.querySelector('header');
  const footer = document.querySelector('footer') || document.querySelector('[class*="footer"]');

  const grab = (root) => {
    if (!root) return null;
    const links = [...root.querySelectorAll('a[href]')].map((a) => ({ t: txt(a), h: a.getAttribute('href') })).filter((x) => x.t);
    const headings = [...root.querySelectorAll('h2,h3,h4,[class*="title"]')].map(txt).filter(Boolean).slice(0, 20);
    const hasForm = !!root.querySelector('form');
    const social = [...root.querySelectorAll('a[href*="instagram"],a[href*="facebook"],a[href*="tiktok"],a[href*="twitter"],a[href*="youtube"],a[href*="pinterest"]')].map((a) => a.getAttribute('href'));
    return { linkCount: links.length, headings, hasForm, social, links: links.slice(0, 40) };
  };

  return { header: grab(header), footer: grab(footer) };
});

console.log('=== TRACKER GLOBALS DETECTED ===');
console.log(JSON.stringify(globals, null, 2));
console.log('\n=== TRACKER NETWORK REQUESTS ===');
console.log([...requests].sort().join('\n') || '(none)');
console.log('\n=== THIRD-PARTY SCRIPT SRCS (sample) ===');
console.log(scripts.filter((s) => !s.includes('thegreatpnw.com')).slice(0, 25).join('\n'));
console.log('\n=== HEADER STRUCTURE ===');
console.log(JSON.stringify(structure.header, null, 2));
console.log('\n=== FOOTER STRUCTURE ===');
console.log(JSON.stringify(structure.footer, null, 2));

await b.close();
