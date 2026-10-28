import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const htmlPath = new URL('../index.html', import.meta.url);
let html = await readFile(htmlPath, 'utf8');
const tags = [...html.matchAll(/<script\b[^>]*\bsrc=(["'])(https:\/\/[^"']+)\1[^>]*>/gi)];
if (!tags.length) {
  console.log('SRI: no se encontraron scripts externos.');
  process.exit(0);
}

for (const match of tags) {
  const originalTag = match[0];
  const url = match[2];
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`SRI: no se pudo obtener ${url} (HTTP ${response.status}); se cancela el build.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const integrity = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
  let updatedTag = originalTag
    .replace(/\s+integrity=(["'])[^"']*\1/i, '')
    .replace(/\s+crossorigin=(["'])[^"']*\1/i, '');
  updatedTag = updatedTag.replace(/>$/, ` integrity="${integrity}" crossorigin="anonymous">`);
  html = html.replace(originalTag, updatedTag);
  console.log(`SRI actualizado: ${new URL(url).hostname} · ${url.split('/').slice(-2).join('/')}`);
}

await writeFile(htmlPath, html, 'utf8');
console.log(`SRI: integridad SHA-384 aplicada a ${tags.length} scripts externos.`);
