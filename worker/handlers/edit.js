/**
 * Edit job: apply a plain-language tweak to a parent version → new version.
 * Reuses the parent's already-uploaded assets (no re-scrape / re-download) by
 * rewriting the relative ./assets/ paths to the parent's absolute Storage URLs.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { renderRecipe } from '../../src/page.js';
import { runAudit, scoresFromLhr } from '../../src/audit.js';
import { applyEditInstruction } from '../../src/edit.js';
import { supabase, updateJob, updateVersion, loadBrand, findBrandByDomain } from '../lib/supabase.js';
import { uploadDir } from '../lib/storage.js';

export async function handleEdit(job) {
  const jobId = job.id;
  const versionId = job.version_id;
  const orgId = job.org_id;
  const outDir = join(tmpdir(), 'lpb-edit', versionId);

  try {
    await updateJob(jobId, { step: 'load', progress: 8 });
    await updateVersion(versionId, { status: 'running' });

    const { data: version } = await supabase
      .from('versions')
      .select('project_id, parent_version_id, instruction')
      .eq('id', versionId)
      .single();
    if (!version?.parent_version_id) throw new Error('edit requires a parent_version_id');
    if (!version.instruction) throw new Error('edit requires an instruction');

    const { data: parent } = await supabase
      .from('versions')
      .select('recipe, brand, preview_url, source_preview_url, source_scores, asset_base_url, project_id')
      .eq('id', version.parent_version_id)
      .single();
    if (!parent?.recipe) throw new Error('parent recipe missing');

    // Brand: prefer the parent's stored snapshot; else re-resolve.
    let brand = parent.brand;
    if (!brand) {
      const { data: project } = await supabase.from('projects').select('root_url, brand_id').eq('id', version.project_id).single();
      brand = (await loadBrand(project?.brand_id)) || (await findBrandByDomain(orgId, project?.root_url || ''));
    }
    if (!brand) throw new Error('no brand available for edit');

    await updateJob(jobId, { step: 'plan', progress: 35 });
    const { recipe, brand: editedBrand } = await applyEditInstruction({
      recipe: parent.recipe,
      brand,
      instruction: version.instruction,
    });

    await updateJob(jobId, { step: 'render', progress: 65 });
    let html = await renderRecipe(recipe, editedBrand, { trackingEnabled: true });
    // Point asset references at the ORIGINAL clone's uploaded assets (inherited
    // base), so a chain of edits/inspired versions never points at an empty folder.
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
      console.warn(`[edit] audit failed: ${e.message}`);
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
      brand: editedBrand,
      scores,
      preview_url: previewUrl,
      source_preview_url: parent.source_preview_url,
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
