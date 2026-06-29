/**
 * Publish job (MVP stub). Receives a claimed `jobs` row. Downloading the stored
 * build and deploying to Netlify is wired alongside the Phase 1 publish UI.
 */
import { updateJob } from '../lib/supabase.js';

export async function handlePublish(job) {
  // TODO: download builds/<orgId>/<versionId>/* from Storage, then deployDir().
  await updateJob(job.id, { state: 'failed', error: 'publish not implemented yet' });
}
