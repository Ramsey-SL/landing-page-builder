/**
 * Worker entrypoint. Boots pg-boss against the Supabase Postgres and processes
 * `clone` and `publish` jobs. The frontend enqueues jobs (via an Edge Function
 * or direct queue insert) and watches the `jobs`/`versions` tables via Realtime.
 */
import PgBoss from 'pg-boss';
import { handleClone } from './handlers/clone.js';
import { handlePublish } from './handlers/publish.js';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
  boss.on('error', (e) => console.error('[pg-boss]', e));
  await boss.start();

  // Each clone launches headless Chrome; keep concurrency modest.
  await boss.work('clone', { batchSize: 1, teamSize: CONCURRENCY, teamConcurrency: CONCURRENCY }, async ([job]) => {
    console.log(`[clone] ${job.id} version=${job.data.versionId}`);
    await handleClone(job);
  });

  await boss.work('publish', { batchSize: 1, teamSize: 1 }, async ([job]) => {
    console.log(`[publish] ${job.id} version=${job.data.versionId}`);
    await handlePublish(job);
  });

  console.log(`Worker up. Concurrency=${CONCURRENCY}. Waiting for clone/publish jobs…`);
}

main().catch((e) => {
  console.error('Worker failed to start:', e);
  process.exit(1);
});
