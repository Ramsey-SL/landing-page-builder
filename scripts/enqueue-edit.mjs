// Dev helper: enqueue a prompt edit on a parent version and poll until done.
// Usage: node scripts/enqueue-edit.mjs <parentVersionId> "<instruction>"
const SUPA = 'https://cowxmuzkitmtdabfzhfu.supabase.co';
const KEY = 'sb_publishable_UvG4sZiern39B36ESBmhLw_XpFHHPTb';
const ORG_ID = 'd28f5509-38cf-4d36-ade7-8c8717b1a1f9';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' };

const parentId = process.argv[2];
const instruction = process.argv[3];
if (!parentId || !instruction) {
  console.error('Usage: node scripts/enqueue-edit.mjs <parentVersionId> "<instruction>"');
  process.exit(1);
}

const get = async (q) => (await (await fetch(`${SUPA}/rest/v1/${q}`, { headers: H })).json());
const post = async (table, body) => {
  const r = await fetch(`${SUPA}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  return (await r.json())[0];
};

const [parent] = await get(`versions?id=eq.${parentId}&select=project_id,status`);
if (!parent) throw new Error('parent version not found');
console.log(`→ Editing parent ${parentId} (status=${parent.status})\n  "${instruction}"`);

const child = await post('versions', {
  org_id: ORG_ID,
  project_id: parent.project_id,
  parent_version_id: parentId,
  type: 'edit',
  status: 'queued',
  instruction,
});
await post('jobs', { org_id: ORG_ID, version_id: child.id, kind: 'edit', state: 'queued', progress: 0 });
console.log(`  child version: ${child.id}\n`);

const start = Date.now();
let last = '';
while (Date.now() - start < 280000) {
  await new Promise((r) => setTimeout(r, 4000));
  const [v] = await get(`versions?id=eq.${child.id}&select=status,preview_url,scores,error`);
  const [j] = await get(`jobs?version_id=eq.${child.id}&select=step,progress,state&order=updated_at.desc&limit=1`);
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
console.log('\n⏱ timed out (worker may still be deploying)');
