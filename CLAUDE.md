# CLAUDE.md — context for AI sessions

Read `README.md` first for the full picture. This file captures conventions and
gotchas so a future session (possibly on another machine) can continue smoothly.

## What this project is
A Shopify→Netlify landing-page cloner. Pipeline: `scrape.js` → `build.js` →
`audit.js` → `deploy.js`. Per-page data is scraped into `output/<slug>/source.json`;
per-page "chrome" (brand, nav, footer, tracking) is curated in `config/<slug>.json`;
non-regenerable brand assets (logo, font) live in `config/brand-assets/<slug>/`.

## Hard rules
- **Zero render-blocking JS.** The only script is the inline deferred-tracking
  loader (loads Meta/GA/Klaviyo after first interaction). Never add external
  `<script src>` to the static HTML or reference `cdn.shopify.com` — `build.js`
  validates against both.
- **Lighthouse 90+ is the deploy gate.** `deploy.js` refuses to publish if any of
  the four scores in `lighthouse.json` is < 90. Run `audit.js` after every build.
- **Don't commit secrets.** Netlify token is passed via `NETLIFY_AUTH_TOKEN` env
  only, never written to a file.
- Keep images local + WebP; product/hero images download fresh each build.

## Conventions
- Slugs: `<client>-<collection>`, e.g. `pnw-smokey-bear`. Netlify site = `sl-<slug>`.
- Same brand, new collection = copy that brand's `config/<slug>.json` and
  `config/brand-assets/<slug>/`, then re-scrape. Nav/footer/branding are identical
  across a brand's collections; only the scraped products/hero/title differ.
- `build.js` caps the grid at `MAX_PRODUCTS = 36`.

## Gotchas learned the hard way
- **Card detection must be theme-agnostic.** Don't key the product-card container
  off CSS class names — themes differ. `scrape.js` walks up to the largest
  ancestor that still contains exactly ONE product link. (A class-name regex once
  collapsed every card to the first product.)
- **`netlify deploy --json` throws a bogus 422.** Use plain `deploy` and parse the
  `Website URL:` line (already done in `deploy.js`).
- **`netlify sites:create` hangs on stdin** if a team prompt appears. Pass
  `--account-slug ramsey-o7de640` and run with stdin closed (`< /dev/null`).
- **Local machine (this Mac):** Homebrew is broken (`load_tab` error); Node is a
  manual install at `~/.local/node` symlinked into `/opt/homebrew/bin`. The harness
  PATH does not source `~/.zshenv`. `npm install` blocks postinstall scripts, but
  sharp (prebuilt) and puppeteer's cached Chrome still work.

## Accounts
- Netlify: ramsey@strategylabs.us, team **Fulcrum** (`ramsey-o7de640`).
- The Great PNW public tracking IDs are in `config/pnw-*.json`.
- Klaviyo connected to Claude = Uno Más (`UjAfaJ`), NOT PNW (`LKmnDZ`). Keep separate.
