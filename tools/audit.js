#!/usr/bin/env node
/**
 * CLI: node tools/audit.js <slug> [--desktop] [--dir=<path>]
 * Thin wrapper over src/audit.js — prints the score table, saves lighthouse.json,
 * exits 1 if any score < 90.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit, scoresFromLhr, THRESHOLD, CATS } from '../src/audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const LABELS = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best Practices', seo: 'SEO' };

function printTable(slug, scores, formFactor) {
  const allPass = CATS.every((c) => scores[c] >= THRESHOLD);
  console.log('\n==============================');
  console.log(`Lighthouse Audit: ${slug} (${formFactor})`);
  console.log('==============================');
  for (const c of CATS) {
    console.log(`${LABELS[c].padEnd(16)} ${String(scores[c]).padStart(3)}  →  ${scores[c] >= THRESHOLD ? 'PASS' : 'FAIL'}`);
  }
  console.log('==============================');
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log('==============================\n');
  return allPass;
}

function reportFailures(lhr, scores) {
  for (const cat of CATS) {
    if (scores[cat] >= THRESHOLD) continue;
    const failed = lhr.categories[cat].auditRefs
      .map((r) => lhr.audits[r.id])
      .filter((a) => a && a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    if (failed.length) {
      console.log(`↳ Failing/weak audits in ${cat}:`);
      for (const a of failed.slice(0, 12)) console.log(`   • [${a.score}] ${a.title}${a.displayValue ? ` (${a.displayValue})` : ''}`);
      console.log('');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) fail('Usage: node tools/audit.js <slug> [--desktop] [--dir=<path>]');
  const desktop = args.includes('--desktop');
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const dir = dirArg ? normalize(dirArg.slice('--dir='.length)) : join(ROOT, 'output', slug);

  const lhr = await runAudit({ dir, desktop });
  const scores = scoresFromLhr(lhr);
  const allPass = printTable(slug, scores, desktop ? 'desktop' : 'mobile');
  if (!allPass) reportFailures(lhr, scores);

  const outPath = join(ROOT, 'output', slug, 'lighthouse.json');
  await writeFile(outPath, JSON.stringify(lhr, null, 2), 'utf8');
  console.log(`Full report saved to ${outPath}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => fail(e.stack || e.message));
