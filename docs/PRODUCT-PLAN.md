# Landing Page Builder — Product Plan

How we turn the current CLI (scrape → build → audit → deploy) into a hosted,
multi-user product with a UI, accounts, versioning, "inspired-by" generation,
missing-asset requests, a Cloudinary DAM, and publish/export to platforms like
Shopify.

> Status: planning. Grounded in the existing stack (Supabase, Loveable,
> Cloudinary / SL-DAM, Netlify, Shopify clients). Decisions still open are listed
> at the end.

---

## 1. Product in one paragraph

A user pastes a URL. We clone that page into a fast, accessible, on-brand static
landing page (today's engine). They preview it, leave feedback / make edits, and
iterate. When happy, they either **publish** it into their platform (Shopify
first) or **export** code + step-by-step instructions. Power feature: instead of
an exact clone, generate a **version "inspired by" a different reference URL** —
take the *structure and style* of an outside page (e.g. a Flagnor Fail PDP) and
pour in the *content* of the root page (e.g. Smokey Bear). When the inspiration
layout needs assets the root page doesn't have, we **request those assets** —
uploaded by the user or pulled from their **Cloudinary DAM**.

---

## 2. Core user flows

### A. Exact clone (today's engine, productized)
1. Paste source URL + name the project.
2. Job runs: scrape → build → audit. Live preview appears with Lighthouse scores.
3. User reviews, leaves feedback / edits → re-build → new version.
4. Publish (Shopify/Netlify) or export (zip + instructions).

### B. Inspired-by version (the up-level)
1. Start from a project (its content = "root", e.g. Smokey Bear).
2. Provide a **reference URL** to take design inspiration from (e.g. the
   Flagnor Fail backpack PDP).
3. Engine analyzes the reference's **section structure + style tokens**, maps the
   root content into that structure, and produces a new version.
4. **Missing-asset requests** are generated for slots the reference layout has but
   the root content can't fill (e.g. a PDP gallery wants 4–6 shots, lifestyle
   hero, feature icons). User fulfills them via upload or DAM.
5. Preview → feedback → publish/export, same as A.

> Guardrail (legal/ethical): "inspired-by" reuses **layout/structure/patterns**,
> never the reference's copyrighted images or copy. The reference's own assets are
> never copied into the user's page — that's exactly why missing slots become
> upload/DAM requests filled with the user's own assets.

### C. Feedback / iteration loop
Two complementary modes on the preview screen:
- **Direct edits** — inline editor for text, colors, image swaps, section
  reorder/remove (deterministic, instant).
- **Instructional edits** — a prompt box ("make the hero full-bleed", "punchier
  CTA copy", "move reviews above the grid") that an LLM turns into edit
  operations against the page recipe, then re-renders.
Every accepted change creates a new **version** (see §7).

---

## 3. System architecture

```
                         ┌────────────────────────────────────────┐
                         │  Web app (Loveable: React/Tailwind/shadcn)│
                         │  dashboard · builder · preview · editor   │
                         └───────────────┬───────────────────────────┘
                                         │ HTTPS / Supabase client
                         ┌───────────────▼───────────────┐
                         │  Supabase                       │
                         │  Auth · Postgres · Storage ·    │
                         │  Realtime (job status) · Edge fns│
                         └───────┬─────────────────┬───────┘
                 enqueue job     │                 │  read/write rows, files
                                 ▼                 │
                 ┌───────────────────────────┐     │
                 │  Job queue (pg-boss /      │     │
                 │  Supabase queue / Redis)   │     │
                 └───────────┬────────────────┘     │
                             ▼                       │
        ┌────────────────────────────────────────┐  │
        │  Worker service (Node + Puppeteer)      │  │
        │  long-running container (Railway/Render/ │  │
        │  Fly) — has headless Chrome             │  │
        │                                          │  │
        │  steps reuse today's tools:              │  │
        │   scrape · extract-design · render ·     │  │
        │   build(WebP via sharp) · audit(LH)      │  │
        └───────┬───────────────┬──────────────┬───┘
                │               │              │
                ▼               ▼              ▼
        ┌────────────┐   ┌────────────┐  ┌──────────────┐
        │ Cloudinary │   │ Object store│  │ Publish layer │
        │ (DAM +     │   │ (built HTML │  │ Shopify API · │
        │ image CDN) │   │ + assets)   │  │ Netlify · zip │
        └────────────┘   └────────────┘  └──────────────┘
```

**Why a separate worker:** scraping needs a real browser (Puppeteer/Chrome) and a
job takes ~30–120s. That can't live in the frontend or in lightweight serverless.
A long-running Node worker (the current `tools/` code, refactored into a library)
pulls jobs from a queue and writes results back. Frontend shows live progress via
Supabase Realtime (or polling).

**Cloning engine reuse:** today's pipeline maps almost 1:1 —
`scrape.js`→scrape step, `extract-design.mjs`/`inspect.mjs`→reference analysis,
`render.js`+template→render, `build.js`(sharp/WebP)→asset step, `audit.js`→audit,
`deploy.js`→one publish adapter. The per-client `config/<slug>.json` becomes a DB
row (a "build config" / page recipe) instead of a file.

---

## 4. Tech stack (mapped to what we already use)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Loveable** (React + Tailwind + shadcn) | already our build tool (Uno Más site); fast |
| Auth + DB + files + realtime | **Supabase** | one platform for accounts, Postgres, Storage, job status |
| Worker / browser | **Node + Puppeteer** on Railway/Render/Fly | needs persistent headless Chrome; reuses current code |
| Job queue | **pg-boss** (Postgres-backed) or Supabase Queues | no extra infra; visibility in DB |
| Images / DAM | **Cloudinary** + existing **SL-DAM** (`~/sl-dam`) | hosting, transforms, categorization already started |
| Preview hosting | per-version preview URL (object store + CDN, or Netlify) | shareable previews |
| Publish | Shopify Admin API, Netlify, zip export | meet users where they sell |
| Billing (later) | Stripe | plans + usage credits |

---

## 5. Data model (Postgres / Supabase)

```
organizations         id, name, plan, created_at
users                 id (supabase auth), email, name
memberships           org_id, user_id, role (owner/editor/viewer)

projects              id, org_id, name, root_url, brand_id, created_by
brands                id, org_id, name, colors_json, fonts_json, logo_asset_id,
                      nav_json, footer_json, tracking_json   ← the reusable "chrome"

versions              id, project_id, parent_version_id, type (clone|inspired),
                      reference_url, status (queued|running|ready|failed|published),
                      recipe_json, scores_json, preview_url, created_by, created_at
                      ← recipe_json = ordered sections + content mapping (see §6)

jobs                  id, version_id, kind (scrape|build|audit|publish),
                      state, progress, logs, error

assets                id, org_id, cloudinary_public_id, url, width, height,
                      tags[], category, source (upload|dam|scraped), alt
asset_requests        id, version_id, slot_key, description, w/h hint, status
                      (open|fulfilled|skipped), fulfilled_asset_id

integrations          id, org_id, platform (shopify|netlify|wordpress),
                      credentials_encrypted, status
deployments           id, version_id, target_integration_id, platform, url, state
feedback              id, version_id, author_id, kind (comment|edit-op|ai-instruction),
                      body_json, resolved
```

`brands` is the key reuse abstraction: a brand's nav/footer/colors/font/tracking
(today's `config/<slug>.json`) is captured once and reused across every project &
version for that brand — exactly how we reused PNW's chrome across Smokey Bear and
Headwear.

---

## 6. The rendering model: section recipes (not freeform AI HTML)

Today the template is fixed. To support arbitrary "inspired-by" layouts **without
sacrificing the Lighthouse/accessibility guarantees**, we move to a **section
library + page recipe**:

- **Section library** — a vetted set of accessible, zero-bloat components: hero
  (banner / split / full-bleed), product grid, PDP gallery, feature grid, spec
  table, testimonial, sticky add-to-cart, FAQ, newsletter, footer, etc. Each is a
  parameterized renderer (extends today's `render.js`).
- **Page recipe (JSON)** — an ordered list of section instances with their content
  bindings and required asset slots. This is what a `version` stores.

**The LLM's job is analysis, not HTML generation.** For inspired-by:
1. Run `extract-design`/`inspect` on the reference URL → detected section sequence
   + style tokens.
2. Claude maps detected sections → our library sections and binds root content
   into them, emitting a recipe + a list of **missing slots**.
3. The deterministic renderer builds the page from vetted components.

This gives AI-level flexibility with guaranteed clean, fast, accessible output —
the LLM never hand-writes markup that could tank scores or a11y.

---

## 7. Versioning

- A **project** owns a tree of **versions** (`parent_version_id`).
- Version 1 is usually the exact clone. Branches: "inspired by X", "headline test",
  "holiday variant". Each iteration (feedback applied) = a new child version.
- Each version is a full, immutable snapshot: recipe + resolved assets + scores +
  preview URL. Users can compare, roll back, duplicate, and publish any version.
- Publishing records a `deployment`; a project can have different versions live on
  different targets.

---

## 8. Missing assets + DAM (Cloudinary / SL-DAM)

When the recipe has slots the root content can't fill, we create `asset_requests`
(slot key, human description, dimension/orientation hint). The builder UI shows an
**"Assets needed" panel**. The user fulfills each slot by either:

- **Uploading** — pushed to Cloudinary with our naming/tag/folder conventions
  (already defined for the SL-DAM), then categorized.
- **Picking from the DAM** — browse/search existing Cloudinary assets (reuse
  `~/sl-dam`'s Cloudinary integration), filtered by suggested tags/orientation,
  and select to fill the slot.

Flow: recipe → unfilled slots block "publish" → user fills via upload/DAM → assets
bound into the recipe → re-render → publishable. The DAM connection is two-way:
new uploads enrich the library; existing libraries feed selection.

---

## 9. Publish & host on the brand's domain

Goal: the generated page should be able to live on the **brand's own URL** while
staying on our fast infra (off Shopify's heavy theme). Real options:

| # | Route | How | On main domain? | Keeps 90+? | Effort/Risk |
|---|-------|-----|-----------------|------------|-------------|
| 1 | **Subdomain → our host** | CNAME `lp.brand.com` → Netlify/our CDN | subdomain | ✅ | 🟢 low (DNS) |
| 2 | **Shopify App Proxy → our host** | Shopify app proxies `brand.com/a/landing/*` to us | ✅ apex path | ✅ | 🟡 med (build app) |
| 3 | **Native Shopify page/section** | Admin-API page or OS 2.0 section in theme | ✅ `/pages/x` | ❌ hard | 🟡–🔴 theme dev |
| 4 | **Reverse-proxy apex** | Cloudflare/edge fronts domain, routes `/lp/*` to us | ✅ apex path | ✅ | 🔴 high/fragile |
| 5 | **Separate campaign domain** | `getX.com` standalone | ❌ off-brand | ✅ | 🟢 low |

**Decision:** first-class support for **1 (subdomain)** and **2 (App Proxy)** —
subdomain for speed/simplicity, App Proxy for "must be on the apex, still hosted
by us." Offer **3** for brands who insist on fully-native (accepting the perf
tradeoff / a stripped theme layout). Skip **4** unless the brand already runs
Cloudflare. **5** for pure ad campaigns.

Notes:
- Option 1 needs cross-subdomain analytics config (Meta/GA domains).
- Option 2 is Shopify-sanctioned (storefront proxies a path to our server) — best
  same-domain answer without theme bloat; lives under a proxy subpath.
- Option 3 inherits theme + app-embed JS (the original perf killer) and Shopify
  sanitizes page-body HTML/JS (constrains our inline tracking).

**Commerce hand-off (any host):** make "Add to Cart" work on externally-hosted
pages via **Shopify cart permalinks** (`/cart/{variant}:{qty}`) or the
**Storefront API / Buy Button SDK**, handing off to Shopify checkout.

**Also:** Netlify (today) for hosted previews; generic **zip export** (HTML/CSS/
WebP) + per-platform **instructions doc** (Shopify, WordPress, Webflow,
Squarespace). Keep the deferred-pixel pattern; surface tracking IDs on export so
users confirm/replace per platform.

---

## 10. Accounts, multi-tenancy, billing

- Supabase Auth (email + Google/GitHub). Org → memberships → role-based access.
- Multi-tenant from day one (everything org-scoped) even if we launch internal —
  it's cheap to design in and avoids a rewrite.
- Usage model (later): credits per scrape/build/publish; plans via Stripe. Gate the
  expensive worker operations.

---

## 11. Phased roadmap

**Phase 0 — Library-ize the engine (prereq).**
Refactor `tools/` into an importable package: `clone(url)`, `analyze(url)`,
`render(recipe)`, `audit(dir|url)`, `publish(target)`. Same logic, callable by a
worker. (Low risk; we already have clean modules.)

**Phase 1 — MVP web app (exact clone only).**
Loveable UI + Supabase + one worker. Paste URL → job → preview with scores →
zip export + Netlify publish. Accounts, projects, version history. Ships the
current capability with a UI.

**Phase 2 — Feedback loop + Shopify publish.**
Inline editor + AI-instruction edits (new version per change). Shopify
integration (hosted-link + Admin-API page). Brand records (reuse chrome).

**Phase 3 — Inspired-by + section recipes.**
Section library, reference analysis → recipe, content mapping, version branching.
This is the differentiator.

**Phase 4 — Missing assets + DAM.**
Asset-request engine, Cloudinary upload with conventions, DAM browse/select
(SL-DAM integration), slot fulfillment gating publish.

**Phase 5 — Scale/monetize.**
Stripe plans + credits, team roles, more publish targets, weekly Lighthouse
monitoring per published page (extend today's `monitor.js`), analytics dashboard.

---

## 12. Key risks & decisions

- **Browser hosting cost/ops** — persistent Chrome workers cost more than
  serverless. Mitigate with a small autoscaling worker pool or a browser-as-a-
  service (Browserless) if we don't want to manage Chrome.
- **Scrape reliability** — bot-blocking, lazy content, theme variety. We already
  hit (and solved) theme-specific card detection; needs ongoing hardening + a
  manual-fix fallback in the UI.
- **Shopify HTML sanitization** — page-body restrictions may force a section/app
  approach for full fidelity; validate early in Phase 2.
- **Inspired-by quality** — guard with the section-recipe approach (no freeform
  AI HTML) + always re-audit ≥90 before a version is "ready".
- **Legal** — inspired-by must not copy the reference's assets/copy; enforced by
  the missing-asset request flow. Add explicit ToS.

---

## 13. Decisions (locked)

1. **Audience:** internal Strategy Labs tool first, but **multi-tenant from day
   one** (defer billing/onboarding polish).
2. **Frontend:** **Loveable + Supabase** (matches our stack).
3. **Publish/host:** pages must be able to live on the **brand's domain** — see
   §9. First-class: **subdomain (1)** and **Shopify App Proxy (2)**; native
   Shopify (3) as an option; commerce via cart permalinks / Storefront API.
4. **Worker hosting:** **managed container** (Railway/Render/Fly) running
   Node + Puppeteer.

### Still to decide later
- App Proxy vs subdomain as the *default* offered to a new brand.
- Which managed host specifically (Railway vs Render vs Fly) — pick at Phase 1.
- Stripe plan/credit model — Phase 5.
