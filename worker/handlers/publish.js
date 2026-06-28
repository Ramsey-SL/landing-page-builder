/**
 * Publish job (MVP: Netlify). Payload: { jobId, versionId, orgId, siteId }
 * Re-downloads the version's build from Storage and deploys it.
 *
 * Skeleton: the Netlify site lifecycle (create/lookup) lives in the CLI today;
 * for the worker we deploy to a provided siteId via src/publish/netlify.js.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateJob, updateVersion, supabase } from '../lib/supabase.js';
import { deployDir } from '../../src/publish/netlify.js';

export async function handlePublish(job) {
  const { jobId, versionId, orgId, siteId } = job.data;
  const stageDir = join(tmpdir(), 'lpb-publish', versionId);

  try {
    await updateJob(jobId, { state: 'running', step: 'stage', progress: 20 });

    // TODO: download builds/<orgId>/<versionId>/* from Storage into stageDir.
    // (Storage download helper to be added alongside the Phase 1 publish UI.)
    void supabase;
    void stageDir;

    await updateJob(jobId, { step: 'deploy', progress: 60 });
    const { url } = await deployDir({ dir: stageDir, siteId });

    await supabase.from('deployments').insert({ org_id: orgId, version_id: versionId, platform: 'netlify', url, state: 'live' });
    await updateVersion(versionId, { status: 'published' });
    await updateJob(jobId, { state: 'succeeded', step: 'done', progress: 100 });
  } catch (err) {
    await updateJob(jobId, { state: 'failed', error: String(err.message || err) });
    throw err;
  }
}
