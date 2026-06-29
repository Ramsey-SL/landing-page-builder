/**
 * Worker entrypoint. Polls the Supabase `jobs` table for queued work and runs
 * the engine in src/. Simple claim-and-process loop (atomic via the claim_job
 * RPC) — no external queue. Frontend enqueues by inserting a `jobs` row.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, BUILDS_BUCKET, WORKER_CONCURRENCY.
 */
import { supabase } from './lib/supabase.js';
import { handleClone } from './handlers/clone.js';
import { handlePublish } from './handlers/publish.js';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;
const POLL_MS = Number(process.env.WORKER_POLL_MS) || 3000;
const HANDLERS = { clone: handleClone, publish: handlePublish };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;

async function claim(kind) {
  const { data, error } = await supabase.rpc('claim_job', { p_kind: kind });
  if (error) {
    console.error(`[claim ${kind}]`, error.message);
    return null;
  }
  return data && data.id ? data : null;
}

async function tick() {
  while (active < CONCURRENCY) {
    // Prefer clone jobs, then publish.
    const job = (await claim('clone')) || (await claim('publish'));
    if (!job) break;
    active++;
    const handler = HANDLERS[job.kind];
    console.log(`[job ${job.id}] kind=${job.kind} version=${job.version_id}`);
    Promise.resolve()
      .then(() => handler(job))
      .catch((e) => console.error(`[job ${job.id}] failed:`, e.message))
      .finally(() => {
        active--;
      });
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE are required');
  }
  console.log(`Worker up. Concurrency=${CONCURRENCY}, poll=${POLL_MS}ms. Waiting for jobs…`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error('[tick]', e.message);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error('Worker failed to start:', e);
  process.exit(1);
});
