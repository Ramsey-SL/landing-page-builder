// One-off: upload PNW's font to Storage + seed a `brands` row for the dev org.
// Uses the publishable key (dev-open RLS). Run from repo root: node scripts/seed-pnw-brand.mjs
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://cowxmuzkitmtdabfzhfu.supabase.co';
const KEY = 'sb_publishable_UvG4sZiern39B36ESBmhLw_XpFHHPTb';
const ORG_ID = 'd28f5509-38cf-4d36-ade7-8c8717b1a1f9';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const config = JSON.parse(await readFile(join(ROOT, 'config', 'pnw-smokey-bear.json'), 'utf8'));
const logoSvg = await readFile(join(ROOT, 'config', 'brand-assets', 'pnw-smokey-bear', 'logo.svg'), 'utf8');
const fontBytes = await readFile(join(ROOT, 'config', 'brand-assets', 'pnw-smokey-bear', 'fjalla-one.woff2'));

// 1) upload font to brand-assets/pnw/fjalla-one.woff2
const fontPath = 'pnw/fjalla-one.woff2';
const up = await fetch(`${SUPABASE_URL}/storage/v1/object/brand-assets/${fontPath}`, {
  method: 'POST',
  headers: { ...H, 'content-type': 'font/woff2', 'x-upsert': 'true' },
  body: fontBytes,
});
if (!up.ok) throw new Error(`font upload failed: ${up.status} ${await up.text()}`);
const fontUrl = `${SUPABASE_URL}/storage/v1/object/public/brand-assets/${fontPath}`;
console.log('✓ font uploaded:', fontUrl);

// 2) seed brand row (delete any existing PNW brand for idempotency)
await fetch(`${SUPABASE_URL}/rest/v1/brands?org_id=eq.${ORG_ID}&name=eq.The%20Great%20PNW`, { method: 'DELETE', headers: H });

const brand = {
  org_id: ORG_ID,
  name: 'The Great PNW',
  base_url: config.brand.baseUrl,
  colors: config.brand.colors,
  display_font: config.brand.displayFont,
  display_font_file: config.brand.displayFontFile,
  display_font_url: fontUrl,
  logo_svg: logoSvg,
  announcement: config.announcement,
  nav: config.nav,
  category_strip: config.categoryStrip,
  footer: config.footer,
  newsletter: config.newsletter,
  tracking: config.tracking,
};

const ins = await fetch(`${SUPABASE_URL}/rest/v1/brands`, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(brand),
});
if (!ins.ok) throw new Error(`brand insert failed: ${ins.status} ${await ins.text()}`);
const [row] = await ins.json();
console.log('✓ brand seeded:', row.id, row.name, '| base_url:', row.base_url);
