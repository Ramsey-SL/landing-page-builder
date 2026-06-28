/** Upload a built directory (index.html + assets/) to a public Storage bucket. */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { supabase } from './supabase.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * Upload everything under `dir` to `bucket/prefix/...`. Returns the public URL
 * of the prefix's index.html.
 */
export async function uploadDir({ dir, bucket, prefix }) {
  for await (const file of walk(dir)) {
    const rel = relative(dir, file).split('\\').join('/');
    const key = `${prefix}/${rel}`;
    const body = await readFile(file);
    const { error } = await supabase.storage.from(bucket).upload(key, body, {
      contentType: MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      upsert: true,
    });
    if (error) throw new Error(`upload ${key}: ${error.message}`);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(`${prefix}/index.html`);
  return data.publicUrl;
}
