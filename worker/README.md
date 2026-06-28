# Worker

Long-running job runner for the Landing Page Builder. Pulls `clone` and
`publish` jobs from a pg-boss queue (on the Supabase Postgres) and runs the
engine in [`../src`](../src). Deploys to a managed container host (Railway /
Render / Fly).

## What it does

- **clone** — `scrape → materialize assets (WebP) → recipe → render → audit`
  (via `src/pipeline.js`), uploads the build to the `builds` Storage bucket, and
  sets `versions.preview_url / recipe / scores / status='ready'`. Brand comes
  from the `brands` row if `brandId` is given, else it's auto-derived from the
  scrape.
- **publish** — deploys a stored build to Netlify (MVP) and records a
  `deployments` row.

Job status is mirrored into the `jobs` table as it runs, so the frontend can
follow progress via Supabase Realtime.

## Run locally

```bash
# from repo root: install engine deps (puppeteer/sharp/lighthouse)
npm ci
# worker deps
cd worker && npm install
cp .env.example .env   # fill in DATABASE_URL + SUPABASE_* (+ NETLIFY_AUTH_TOKEN)
npm start
```

Enqueue a clone job (from anything with DB access / an Edge Function):

```js
await boss.send('clone', {
  jobId, versionId, orgId,
  url: 'https://brand.com/collections/x',
  brandId: null,          // null → auto-derive brand
  trackingEnabled: true,
});
```

## Deploy

```bash
docker build -f worker/Dockerfile -t lpb-worker .   # context = repo root
# push to Railway/Render/Fly; set env from .env.example; scale 1+ instance.
```

## Status

Skeleton — code-complete and ready to wire once a Supabase project exists. The
engine half (`src/pipeline.js`) is tested end-to-end and already clones arbitrary
URLs to 90+ pages. `handlers/publish.js` still needs the Storage→stageDir
download helper (TODO marked inline).
