#!/usr/bin/env node
/**
 * Goal 5 — Netlify Deploy
 *
 * Usage: node tools/deploy.js <slug>
 *
 * 1. Verifies output/<slug>/index.html exists.
 * 2. Verifies all four Lighthouse scores in lighthouse.json are >= 90.
 * 3. Creates (if needed) and deploys to a Netlify site named sl-<slug>.
 * 4. Confirms the live URL returns HTTP 200.
 * 5. Writes output/<slug>/deploy.json with { url, deployedAt, lighthouseScores }.
 *
 * Auth: requires either `netlify login` to have been run, or a
 * NETLIFY_AUTH_TOKEN environment variable.
 */

import { readFile, writeFile, access, rm, mkdir, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const NETLIFY = join(ROOT, 'node_modules', '.bin', 'netlify');
const THRESHOLD = 90;

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const slug = process.argv[2];
if (!slug) fail('Usage: node tools/deploy.js <slug>');

const outDir = join(ROOT, 'output', slug);
const siteName = `sl-${slug}`;

async function netlify(args, { allowFail = false } = {}) {
  try {
    const { stdout } = await execFileP(NETLIFY, args, {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 64,
      env: process.env,
    });
    return stdout;
  } catch (e) {
    if (allowFail) return e.stdout || '';
    throw new Error((e.stderr || e.stdout || e.message).toString().trim());
  }
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Stage a clean production folder with only index.html + assets/ (no scrape
// JSON, lighthouse reports, or dev artifacts get published).
async function stagePublishDir() {
  const pub = join(outDir, '.publish');
  await rm(pub, { recursive: true, force: true });
  await mkdir(pub, { recursive: true });
  await cp(join(outDir, 'index.html'), join(pub, 'index.html'));
  if (await exists(join(outDir, 'assets'))) {
    await cp(join(outDir, 'assets'), join(pub, 'assets'), { recursive: true });
  }
  return pub;
}

async function ensureAuthed() {
  const out = await netlify(['status', '--json'], { allowFail: true });
  if (/Not logged in/i.test(out) || !out.trim()) {
    // Fall back to plain status text check
    const txt = await netlify(['status'], { allowFail: true });
    if (/Not logged in/i.test(txt)) {
      fail(
        'Netlify is not authenticated.\n' +
          '  Fix: run `netlify login` once, or set NETLIFY_AUTH_TOKEN in the environment.'
      );
    }
  }
}

async function ensureSite() {
  // Look for an existing site by name.
  const listRaw = await netlify(['sites:list', '--json'], { allowFail: true });
  let sites = [];
  try {
    sites = JSON.parse(listRaw);
  } catch {
    /* ignore */
  }
  const found = Array.isArray(sites) && sites.find((s) => s.name === siteName);
  if (found) {
    console.log(`  ✓ Using existing site ${siteName} (${found.id})`);
    return found.id;
  }
  console.log(`  → Creating site ${siteName}...`);
  const createRaw = await netlify(['sites:create', '--name', siteName, '--json']);
  let site;
  try {
    site = JSON.parse(createRaw);
  } catch {
    fail(`Could not parse sites:create output:\n${createRaw}`);
  }
  console.log(`  ✓ Created site ${siteName} (${site.id})`);
  return site.id;
}

async function main() {
  // --- 1. index.html present? ---
  const indexPath = join(outDir, 'index.html');
  if (!(await exists(indexPath))) {
    fail(`${indexPath} not found — run build.js first.`);
  }

  // --- 2. Lighthouse scores all >= 90? ---
  const lhPath = join(outDir, 'lighthouse.json');
  if (!(await exists(lhPath))) {
    fail(`${lhPath} not found — run audit.js first.`);
  }
  const lhr = JSON.parse(await readFile(lhPath, 'utf8'));
  const scores = {
    performance: Math.round((lhr.categories.performance.score || 0) * 100),
    accessibility: Math.round((lhr.categories.accessibility.score || 0) * 100),
    'best-practices': Math.round((lhr.categories['best-practices'].score || 0) * 100),
    seo: Math.round((lhr.categories.seo.score || 0) * 100),
  };
  const failing = Object.entries(scores).filter(([, s]) => s < THRESHOLD);
  if (failing.length) {
    fail(
      `Refusing to deploy — these scores are below ${THRESHOLD}: ` +
        failing.map(([k, s]) => `${k}=${s}`).join(', ')
    );
  }
  console.log(`✓ Lighthouse gate ok: ${Object.entries(scores).map(([k, s]) => `${k}=${s}`).join(', ')}`);

  // --- 3. Auth + site + deploy ---
  await ensureAuthed();
  const siteId = await ensureSite();

  const publishDir = await stagePublishDir();
  console.log(`  → Deploying ${publishDir} to ${siteName}...`);
  // NOTE: `--json` on `deploy` can throw a 422 in this CLI version, so we parse
  // the human-readable output instead.
  const deployRaw = await netlify(['deploy', '--prod', '--dir', publishDir, '--site', siteId]);
  const m = deployRaw.match(/Website URL:\s*(https:\/\/\S+)/i) || deployRaw.match(/(https:\/\/[a-z0-9-]+\.netlify\.app)\b/i);
  const url = m ? m[1] : '';
  if (!url) fail(`No live URL found in deploy output:\n${deployRaw}`);

  // --- 4. Confirm HTTP 200 ---
  console.log(`  → Verifying ${url} ...`);
  let status = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      status = res.status;
      if (status === 200) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (status !== 200) fail(`Live URL did not return 200 (got ${status}): ${url}`);

  // --- 5. Save deploy metadata ---
  const meta = { url, deployedAt: new Date().toISOString(), lighthouseScores: scores, siteName, siteId };
  await writeFile(join(outDir, 'deploy.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log('\n==============================');
  console.log(`✓ Deployed: ${url}`);
  console.log(`  HTTP 200 confirmed`);
  console.log(`  Metadata: ${join(outDir, 'deploy.json')}`);
  console.log('==============================\n');
}

main().catch((e) => fail(e.stack || e.message));
