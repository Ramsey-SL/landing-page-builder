/**
 * Netlify publish adapter.
 *
 * deployDir() runs `netlify deploy --prod` for a prepared directory and returns
 * the live URL. NOTE: `--json` throws a spurious 422 in the current CLI version,
 * so we parse the human-readable output. Auth via NETLIFY_AUTH_TOKEN in env or a
 * prior `netlify login`. Site creation / the Lighthouse gate stay in the CLI.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NETLIFY_BIN = join(ROOT, 'node_modules', '.bin', 'netlify');

/**
 * @param {{ dir: string, siteId: string, env?: object }} opts
 * @returns {Promise<{ url: string, raw: string }>}
 */
export async function deployDir({ dir, siteId, env = process.env }) {
  const { stdout } = await execFileP(
    NETLIFY_BIN,
    ['deploy', '--prod', '--dir', dir, '--site', siteId],
    { cwd: ROOT, maxBuffer: 1024 * 1024 * 64, env }
  );
  const m =
    stdout.match(/Website URL:\s*(https:\/\/\S+)/i) ||
    stdout.match(/(https:\/\/[a-z0-9-]+\.netlify\.app)\b/i);
  if (!m) throw new Error(`No live URL found in deploy output:\n${stdout}`);
  return { url: m[1], raw: stdout };
}
