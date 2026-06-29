// Dev helper: enqueue a clone (project+version+job) and poll until done.
// Usage: node scripts/enqueue-clone.mjs "<name>" "<url>"
const SUPA = 'https://cowxmuzkitmtdabfzhfu.supabase.co';
const KEY = 'sb_publishable_UvG4sZiern39B36ESBmhLw_XpFHHPTb';
const ORG_ID = 'd28f5509-38cf-4d36-ade7-8c8717b1a1f9';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' };

const name = process.argv[2] || 'PNW Headwear (e2e test)';
const url = process.argv[3] || 'https://thegreatpnw.com/collections/headwear';

const post = async (table, body) => {
  const r = await fetch(`${SUPA}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  return (await r.json())[0];
};
const get = async (q) => (await (await fetch(`${SUPA}/rest/v1/${q}`, { headers: H })).json());

console.log(`→ Enqueuing clone: ${name}\n  ${url}`);
const project = await post('projects', { org_id: ORG_ID, name, root_url: url });
const version = await post('versions', { org_id: ORG_ID, project_id: project.id, type: 'clone', status: 'queued' });
await post('jobs', { org_id: ORG_ID, version_id: version.id, kind: 'clone', state: 'queued', progress: 0 });
console.log(`  version: ${version.id}\n`);

const start = Date.now();
let last = '';
while (Date.now() - start < 280000) {
  await new Promise((r) => setTimeout(r, 4000));
  const [v] = await get(`versions?id=eq.${version.id}&select=status,preview_url,scores,error`);
  const [j] = await get(`jobs?version_id=eq.${version.id}&select=step,progress,state&order=updated_at.desc&limit=1`);
  const line = `[${Math.round((Date.now() - start) / 1000)}s] version=${v.status} job=${j?.state} step=${j?.step ?? '-'} ${j?.progress ?? 0}%`;
  if (line !== last) { console.log(line); last = line; }
  if (v.status === 'ready') {
    console.log(`\n✓ READY\n  preview: ${v.preview_url}\n  scores: ${JSON.stringify(v.scores)}`);
    process.exit(0);
  }
  if (v.status === 'failed') {
    console.log(`\n✖ FAILED: ${v.error}`);
    process.exit(1);
  }
}
console.log('\n⏱ timed out waiting (worker may still be processing)');
