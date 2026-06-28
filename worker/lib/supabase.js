/** Supabase service-role client (bypasses RLS — worker only). */
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

/** Patch the user-facing job status row (frontend subscribes via Realtime). */
export async function updateJob(jobId, patch) {
  await supabase.from('jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId);
}

export async function updateVersion(versionId, patch) {
  await supabase.from('versions').update(patch).eq('id', versionId);
}

/** Map a `brands` row to the engine's Brand shape. Returns null if no row. */
export async function loadBrand(brandId) {
  if (!brandId) return null;
  const { data } = await supabase.from('brands').select('*').eq('id', brandId).single();
  if (!data) return null;
  return {
    name: data.name,
    baseUrl: data.base_url || '',
    colors: data.colors,
    displayFont: data.display_font || '',
    displayFontFile: data.display_font_file || '',
    logoSvg: data.logo_svg || `<span class="logo-fallback">${data.name}</span>`,
    announcement: data.announcement || '',
    nav: data.nav || [],
    categoryStrip: data.category_strip || [],
    footer: data.footer || { columns: [], social: [], copyright: data.name },
    newsletter: data.newsletter || { heading: '', blurb: '', bannerHeading: '' },
    tracking: data.tracking || {},
  };
}
