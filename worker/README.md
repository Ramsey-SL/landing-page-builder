# Worker

Long-running job runner for the Landing Page Builder. **Polls the Supabase
`jobs` table** for queued work (atomic claim via the `claim_job` RPC) and runs
the engine in [`../src`](../src). No external queue — the frontend enqueues by
inserting a `jobs` row. Deploys to Railway (see below).

## What it does

- **clone** — loads the version's project (`root_url`, `brand_id`), runs
  `scrape → materialize assets (WebP) → recipe → render → audit` via
  `src/pipeline.js`, uploads the build to the `builds` Storage bucket, and sets
  `versions.preview_url / recipe / scores / status='ready'`. Brand comes from the
  `brands` row if the project has one, else it's auto-derived from the scrape.
- **publish** — stub for now (Netlify deploy of a stored build is next).

Progress is written to the `jobs` row (`step`, `progress`, `state`) as it runs,
so the frontend follows along via Supabase Realtime.

## Enqueue contract

The frontend inserts a `versions` row (`status='queued'`) and a `jobs` row
(`kind='clone'`, `state='queued'`, `version_id`, `org_id`). The worker claims it
and derives the URL/brand from the project. No Edge Function needed.

## Run locally

```bash
npm ci                       # repo root: engine deps (puppeteer/sharp/lighthouse)
cd worker && npm install     # @supabase/supabase-js
cp .env.example .env         # set SUPABASE_URL + SUPABASE_SERVICE_ROLE
npm start
```

## Deploy to Railway

1. New Railway project → Deploy from the GitHub repo `Ramsey-SL/landing-page-builder`.
2. In service **Settings → Build**, set **Builder = Dockerfile** (Dockerfile path
   `Dockerfile` at repo root). `railway.json` also declares this, but set it
   explicitly if Railway defaulted the service to Nixpacks on first deploy.
3. Set service variables:
   - `SUPABASE_URL=https://cowxmuzkitmtdabfzhfu.supabase.co`
   - `SUPABASE_SERVICE_ROLE=<service_role key from Supabase dashboard → Settings → API>`
   - `BUILDS_BUCKET=builds`
   - `WORKER_CONCURRENCY=2`
4. Deploy. Logs should show "Worker up… Waiting for jobs". Create a project in the
   web app and watch the version go queued → running → ready.

Scale by raising the instance count and/or `WORKER_CONCURRENCY` (each clone runs
headless Chrome — budget ~1–2 GB RAM per concurrent job).
