/**
 * Clone job. Receives a claimed `jobs` row; loads the version's project to get
 * the URL + brand, runs the pipeline, uploads the build, marks the version ready.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { runClonePipeline } from '../../src/pipeline.js';
import { supabase, updateJob, updateVersion, loadBrand } from '../lib/supabase.js';
import { uploadDir } from '../lib/storage.js';

export async function handleClone(job) {
  const jobId = job.id;
  const versionId = job.version_id;
  const orgId = job.org_id;
  const outDir = join(tmpdir(), 'lpb', versionId);

  try {
    await updateJob(jobId, { step: 'load', progress: 3 });
    await updateVersion(versionId, { status: 'running' });

    const { data: version, error: vErr } = await supabase
      .from('versions')
      .select('project_id')
      .eq('id', versionId)
      .single();
    if (vErr || !version) throw new Error(`version not found: ${vErr?.message}`);

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('root_url, brand_id')
      .eq('id', version.project_id)
      .single();
    if (pErr || !project) throw new Error(`project not found: ${pErr?.message}`);

    const brand = await loadBrand(project.brand_id); // null → pipeline auto-derives

    const result = await runClonePipeline({
      url: project.root_url,
      brand,
      outDir,
      trackingEnabled: true,
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
    const msg = String(err.message || err);
    await updateVersion(versionId, { status: 'failed', error: msg });
    await updateJob(jobId, { state: 'failed', error: msg });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
