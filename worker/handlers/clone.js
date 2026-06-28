/**
 * Clone job: scrape a URL → build a page → upload it → mark the version ready.
 * Payload: { jobId, versionId, orgId, url, brandId, trackingEnabled }
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { runClonePipeline } from '../../src/pipeline.js';
import { updateJob, updateVersion, loadBrand } from '../lib/supabase.js';
import { uploadDir } from '../lib/storage.js';

export async function handleClone(job) {
  const { jobId, versionId, orgId, url, brandId, trackingEnabled = true } = job.data;
  const outDir = join(tmpdir(), 'lpb', versionId);

  try {
    await updateJob(jobId, { state: 'running', step: 'scrape', progress: 5 });
    await updateVersion(versionId, { status: 'running' });

    const brand = await loadBrand(brandId); // null → pipeline auto-derives

    const result = await runClonePipeline({
      url,
      brand,
      outDir,
      trackingEnabled,
      audit: true,
      onProgress: (step, pct) => updateJob(jobId, { step, progress: pct }),
    });

    await updateJob(jobId, { step: 'upload', progress: 92 });
    const previewUrl = await uploadDir({
      dir: outDir,
      bucket: process.env.BUILDS_BUCKET || 'builds',
      prefix: `${orgId}/${versionId}`,
    });

    await updateVersion(versionId, {
      status: 'ready',
      recipe: result.recipe,
      scores: result.scores,
      preview_url: previewUrl,
    });
    await updateJob(jobId, { state: 'succeeded', step: 'done', progress: 100 });
  } catch (err) {
    await updateVersion(versionId, { status: 'failed', error: String(err.message || err) });
    await updateJob(jobId, { state: 'failed', error: String(err.message || err) });
    throw err; // let pg-boss record the failure / retry policy decide
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
