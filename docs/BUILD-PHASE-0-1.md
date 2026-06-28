# Build Breakdown — Phase 0 & Phase 1

Turns [PRODUCT-PLAN.md](PRODUCT-PLAN.md) into buildable work. Phase 0 makes the
current engine importable; Phase 1 ships the MVP web app (exact clone only) on
Loveable + Supabase + a managed Puppeteer worker.

Locked decisions: internal-first but multi-tenant; Loveable + Supabase; managed
container worker; host on brand domain (subdomain default, App Proxy later).

---

## Repo / system layout

This repo (`landing-page-builder`) becomes the **engine + worker + CLI**. The
Loveable app is a **separate** project; the two meet at the Supabase schema and
the job payload contract.

```
landing-page-builder/
  src/                      ← Phase 0: the importable engine (pure-ish, no process.exit)
    scrape.js               scrapePage(url) -> ContentModel
    analyze.js              analyzeReference(url) -> DesignModel   (used in Phase 3)
    images.js               materializeAssets(contentModel) -> AssetRecord[]  (download+WebP)
    render.js               renderRecipe(recipe, brand, assets) -> html
    audit.js                runAudit({ dir | url, desktop }) -> Scores
    recipe.js              contentModelToRecipe(content, brand) -> Recipe   (clone path)
    publish/
      netlify.js            publishNetlify(dir, siteName) -> { url }
      zip.js                exportZip(dir) -> buffer
    types.js                JSDoc typedefs (ContentModel, Recipe, Brand, ...)
  cli/                      ← thin wrappers over src/ (keep current UX working)
    scrape.js build.js audit.js deploy.js serve.js
  worker/                   ← Phase 1: long-running job runner (Dockerfile)
    index.js                queue loop
    handlers/clone.js publish.js
  supabase/
    migrations/0001_init.sql
  templates/ config/        ← unchanged for now
  docs/
```

CLI stays working (wrappers call `src/`), so nothing we shipped regresses.

---

## Phase 0 — Library-ize the engine

> **Status: DONE.** Engine lives in `src/` (scrape, images, recipe, sections,
> page/renderRecipe, audit, brand, publish/netlify, types). `tools/*` are thin
> CLIs over it; `tools/render.js` moved to `src/render.js`. Verified: PNW
> rebuilds identical (56.6 KB / 43.3 KB), distinct products + hover preserved,
> mobile Lighthouse 99/100/96/100, smoke 37/37.
> Deviations from the sketch below: CLIs stay in `tools/` (not `cli/`) to keep
> npm scripts/CI/docs stable; `renderRecipe` targets the single shell template
> for now (full section-library generalization is Phase 3); `publish/zip.js`
> deferred to the Phase 1 export feature.

**Goal:** every capability is an importable function returning data (no
`process.exit`, no `console.log` as control flow) so the worker can call it.

### Core data shapes (JSDoc typedefs in `src/types.js`)

```js
/** @typedef {Object} ContentModel   // output of scrapePage()
 *  url, pageTitle, metaDescription, collectionName, h1[],
 *  heroImage:{src,alt}, products:[{name,price,href,imageSrc,imageSrcHover,imageAlt}],
 *  navLinks[], bodyText[], sectionOrder[] */

/** @typedef {Object} Brand          // the reusable "chrome" (today's config)
 *  name, baseUrl, colors{teal,footer,body,text,accent}, displayFont,
 *  displayFontFile, logoSvg, nav[], categoryStrip[], footer{columns,social,copyright},
 *  newsletter{...}, tracking{metaPixelId,ga4Id,googleAdsId,klaviyoCompanyId} */

/** @typedef {Object} AssetSlot      // a content hole a recipe needs filled
 *  key, role (hero|gallery|feature|logo|...), description, wHint, hHint,
 *  fulfilledAssetId|null */

/** @typedef {Object} Section        // one block in a recipe
 *  type (hero|productGrid|pdpGallery|featureGrid|testimonial|newsletter|footer|...),
 *  props (content bindings), assetSlots:AssetSlot[] */

/** @typedef {Object} Recipe         // what a `version` stores
 *  sections:Section[], brandId, meta{title,description,canonical} */

/** @typedef {Object} AssetRecord    // a materialized image
 *  slotKey, localPath|cloudinaryId, url, width, height, alt */

/** @typedef {Object} Scores { performance, accessibility, bestPractices, seo } */
```

### Tasks
- [ ] Extract `scrapePage(url)` from `tools/scrape.js` (return ContentModel; keep
      the theme-agnostic card walk + hover capture).
- [ ] Extract `runAudit({dir|url})` from `tools/audit.js` (already mostly a lib;
      add the URL mode from `monitor.js`, return Scores).
- [ ] Extract `materializeAssets()` from the image loop in `tools/build.js`
      (download → WebP via sharp → AssetRecord[]; pluggable sink: local dir **or**
      Cloudinary later).
- [ ] Make `render.js` recipe-driven: `renderRecipe(recipe, brand, assets)`. For
      the clone path add `contentModelToRecipe(content, brand)` that emits the
      current hero+grid+newsletter+footer sections (i.e. today's page expressed as
      a recipe). Section components = today's render helpers, refactored.
- [ ] `publish/netlify.js` (from `deploy.js`, minus the CLI/gate) + `publish/zip.js`.
- [ ] Rewrite `cli/*` as thin wrappers; keep `npm run scrape|build|audit|deploy`.
- [ ] Extend `tools/smoke-test.mjs` to unit-test the new `src/` functions.

**Acceptance:** `node cli/build.js pnw-smokey-bear` produces the same page as
today, but internally it's `scrapePage → contentModelToRecipe → materializeAssets
→ renderRecipe → runAudit`. Smoke tests green.

---

## Phase 1 — MVP web app (exact clone only)

Scope IN: accounts (multi-tenant), create project from URL, async clone job with
live progress, preview + Lighthouse scores, version history, export zip, publish
to a subdomain (Netlify), editable Brand. Scope OUT (later phases): inspired-by,
DAM, missing-assets, Shopify publish, billing.

### 1. Supabase schema (`supabase/migrations/0001_init.sql`)

MVP subset of §5, all org-scoped with RLS:

```sql
create table organizations (id uuid pk default gen_random_uuid(), name text, plan text default 'internal', created_at timestamptz default now());
create table memberships (org_id uuid references organizations, user_id uuid references auth.users, role text check (role in ('owner','editor','viewer')), primary key (org_id,user_id));
create table brands (id uuid pk default gen_random_uuid(), org_id uuid references organizations, name text, colors jsonb, fonts jsonb, logo_svg text, nav jsonb, category_strip jsonb, footer jsonb, newsletter jsonb, tracking jsonb, created_at timestamptz default now());
create table projects (id uuid pk default gen_random_uuid(), org_id uuid references organizations, name text, root_url text, brand_id uuid references brands, created_by uuid, created_at timestamptz default now());
create table versions (id uuid pk default gen_random_uuid(), project_id uuid references projects, parent_version_id uuid, type text default 'clone', reference_url text, status text default 'queued', recipe jsonb, scores jsonb, preview_url text, created_by uuid, created_at timestamptz default now());
create table jobs (id uuid pk default gen_random_uuid(), version_id uuid references versions, kind text, state text default 'queued', progress int default 0, logs text, error text, updated_at timestamptz default now());
create table assets (id uuid pk default gen_random_uuid(), org_id uuid references organizations, cloudinary_public_id text, url text, width int, height int, tags text[], category text, source text, alt text, created_at timestamptz default now());
create table deployments (id uuid pk default gen_random_uuid(), version_id uuid references versions, platform text, url text, state text, created_at timestamptz default now());
```
- [ ] RLS: a user sees rows whose `org_id` is in their memberships. Worker uses the
      **service role** key (bypasses RLS).
- [ ] Storage buckets: `builds` (HTML), `brand-assets` (logo/font). Product images
      → Cloudinary (or `builds` for MVP).
- [ ] Realtime enabled on `jobs` and `versions` (frontend subscribes to progress).

### 2. Job queue + worker (`worker/`, managed container)

- [ ] Queue: **pg-boss** on the Supabase Postgres (no extra infra). Job payload:
```json
{ "kind": "clone", "versionId": "...", "projectId": "...", "url": "https://...", "brandId": "...|null" }
```
- [ ] Worker loop: claim job → update `jobs.state/progress` (Realtime) → run engine
      → on success write `versions.recipe/scores/preview_url`, `status='ready'`.
- [ ] `handlers/clone.js`: `scrapePage(url)` → (auto-create Brand from scrape if
      none) → `contentModelToRecipe` → `materializeAssets` (sink: Cloudinary or
      Storage) → `renderRecipe` → write HTML to Storage → deploy preview
      (Netlify) → `runAudit(url)` → save scores.
- [ ] `handlers/publish.js`: publish a version to a target (Netlify subdomain for
      MVP) → write `deployments`.
- [ ] Dockerfile with Chrome deps (`puppeteer` + system libs); deploy to
      Railway/Render/Fly. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`,
      `CLOUDINARY_*`, `NETLIFY_AUTH_TOKEN`.
- [ ] Concurrency cap + per-job timeout + retry/backoff (jobs can fail on flaky
      scrapes — surface error to UI for a manual retry).

### 3. Loveable frontend (separate project, talks to Supabase)

Screens (each lists the Supabase action):

- [ ] **Auth** — Supabase Auth (email + Google). On first login, create an org +
      owner membership.
- [ ] **Dashboard** — list `projects` for the active org.
- [ ] **New Project** — form (name + root URL) → insert `projects` + first
      `versions(status=queued)` → enqueue `clone` job (via an Edge Function or
      direct queue insert).
- [ ] **Build progress** — subscribe to `jobs`/`versions` Realtime; show
      scrape→build→audit steps + progress.
- [ ] **Preview** — iframe the version `preview_url`; show Lighthouse scores;
      version switcher (list `versions` by project); buttons: Duplicate, Export,
      Publish.
- [ ] **Export / Publish** — download zip (Storage signed URL or Edge Function);
      Publish → enqueue `publish` job (Netlify subdomain) → show live URL +
      DNS/CNAME instructions for `lp.brand.com`.
- [ ] **Brand settings** — edit `brands` (colors, nav, footer, tracking IDs);
      re-render uses the updated brand.

### 4. Secrets / integrations (MVP)
- Worker holds Supabase service role, Cloudinary, and a single SL Netlify token.
- Per-brand publish targets (their own Netlify/DNS) come in a later phase; MVP can
  publish under our Netlify and hand the user a CNAME instruction.

### Phase 1 acceptance
A teammate signs in, pastes a Shopify collection URL, watches the job run, sees a
live preview scoring ≥90, switches between versions, exports a zip, and publishes
to a Netlify URL with CNAME instructions — all scoped to their org.

---

## Suggested sequencing

1. Phase 0 refactor + smoke tests (engine importable). ← do first, low risk
2. Supabase schema + RLS + a seed org.
3. Worker skeleton: one `clone` job end-to-end writing a `versions` row + preview.
4. Loveable: auth → new project → progress → preview (the happy path).
5. Export + Netlify publish + Brand settings.
6. Harden: retries, errors-to-UI, timeouts, concurrency.

After Phase 1 ships, Phase 2 (feedback loop + Shopify) and Phase 3 (inspired-by +
section recipes) build directly on the recipe model introduced in Phase 0.

---

## Risks to watch in Phase 0/1
- **Chrome in the container** — pin Puppeteer's Chrome + install system libs in the
  Dockerfile; smoke-test a headless launch on deploy.
- **Preview hosting choice** — Netlify-per-version is simplest for MVP; revisit if
  deploy counts/costs grow (could serve from Storage+CDN instead).
- **Brand auto-creation** — clone path should auto-derive a Brand from the scrape,
  then let the user refine it in Brand settings (don't block on manual config).
