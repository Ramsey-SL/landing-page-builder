/**
 * Inspired-by job: reimagine a parent version in the style of a reference URL.
 * Scrapes the reference for its palette/structure, derives a template, applies
 * it to the parent's {recipe, brand}, and re-renders reusing the parent's
 * already-uploaded assets (same approach as the edit handler).
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { scrapePage } from '../../src/scrape.js';
import { templateFromReference, applyInspiration } from '../../src/inspired.js';
import { renderRecipe } from '../../src/page.js';
import { runAudit, scoresFromLhr } from '../../src/audit.js';
import { supabase, updateJob, updateVersion } from '../lib/supabase.js';
import { uploadDir } from '../lib/storage.js';

export async function handleInspired(job) {
  const jobId = job.id;
  const versionId = job.version_id;
  const orgId = job.org_id;
  const outDir = join(tmpdir(), 'lpb-inspired', versionId);

  try {
    await updateJob(jobId, { step: 'load', progress: 8 });
    await updateVersion(versionId, { status: 'running' });

    const { data: version } = await supabase
      .from('versions')
      .select('project_id, parent_version_id, reference_url')
      .eq('id', versionId)
      .single();
    if (!version?.parent_version_id) throw new Error('inspired requires a parent_version_id');
    if (!version.reference_url) throw new Error('inspired requires a reference_url');

    const { data: parent } = await supabase
      .from('versions')
      .select('recipe, brand, preview_url, source_preview_url, source_scores, asset_base_url')
      .eq('id', version.parent_version_id)
      .single();
    if (!parent?.recipe || !parent?.brand) throw new Error('parent recipe/brand missing');

    await updateJob(jobId, { step: 'analyze', progress: 35 });
    const ref = await scrapePage(version.reference_url, { timeout: 60000 });
    const template = templateFromReference(ref);

    await updateJob(jobId, { step: 'render', progress: 60 });
    const { recipe, brand } = applyInspiration(parent.recipe, parent.brand, template);
    let html = await renderRecipe(recipe, brand, { trackingEnabled: true });
    // Reuse the ORIGINAL clone's uploaded assets (inherited base), so a chain of
    // inspired/edit versions never points at an empty folder.
    const assetBase = parent.asset_base_url || (parent.preview_url || '').replace(/index\.html$/, '');
    if (assetBase) html = html.split('"./assets/').join(`"${assetBase}assets/`);

    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), html, 'utf8');

    await updateJob(jobId, { step: 'audit', progress: 80 });
    let scores = null;
    try {
      scores = {
        mobile: scoresFromLhr(await runAudit({ dir: outDir, desktop: false })),
        desktop: scoresFromLhr(await runAudit({ dir: outDir, desktop: true })),
      };
    } catch (e) {
      console.warn(`[inspired] audit failed: ${e.message}`);
    }

    await updateJob(jobId, { step: 'upload', progress: 92 });
    const previewUrl = await uploadDir({
      dir: outDir,
      bucket: process.env.BUILDS_BUCKET || 'builds',
      prefix: `${orgId}/${versionId}`,
    });

    await updateVersion(versionId, {
      status: 'ready',
      recipe,
      brand,
      scores,
      preview_url: previewUrl,
      source_preview_url: parent.source_preview_url,
      source_scores: parent.source_scores,
      asset_base_url: assetBase,
      error: null,
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
