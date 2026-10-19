import { readFileSync } from 'node:fs';

const fail = message => { console.error('SECURITY CHECK FAILED:', message); process.exitCode = 1; };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const vercel = JSON.parse(read('../vercel.json'));
const headers = new Map((vercel.headers || []).flatMap(rule => (rule.headers || []).map(h => [h.key.toLowerCase(), h.value])));
for (const key of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy']) {
  if (!headers.has(key)) fail('Falta cabecera de seguridad Vercel: ' + key);
}
if (headers.get('x-content-type-options') !== 'nosniff') fail('X-Content-Type-Options debe ser nosniff.');
if (headers.get('x-frame-options') !== 'DENY') fail('X-Frame-Options debe ser DENY.');

const migration = read('../supabase/migrations/20261019090000_owasp_rls_policy_hardening.sql');
for (const marker of [
  'drop policy if exists auditoria_eventos_select',
  'drop policy if exists auditoria_eventos_update',
  'create policy coberturas_select_authorized_2026',
  'create policy papeletas_select_authorized_2026',
  'create policy vacaciones_historico_select_authorized_2026',
  'public.usuario_tiene_alguno_permiso',
  'private.usuario_puede_ver_sucursal'
]) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) fail('La migración no contiene el control esperado: ' + marker);
}
if (/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(migration)) {
  fail('La migración no debe crear políticas RLS con condición true.');
}

const html = read('../index.html');
if (html.includes('lucide@latest')) fail('Lucide debe estar fijado a una versión concreta.');
if (html.includes('supabase-js@2"')) fail('Supabase JS debe estar fijado a una versión concreta.');
if (html.includes('https://cdn.tailwindcss.com"')) fail('Tailwind CDN debe estar fijado a una versión concreta.');

const serverAuth = read('../lib/server-auth.js');
for (const marker of ['auth.getUser(token)', 'profile.activo === false', 'permissions.includes(permission)']) {
  if (!serverAuth.includes(marker)) fail('Falta control de autorización en lib/server-auth.js: ' + marker);
}

const session = read('../api/sesion-global.js');
if (session.includes('sb_publishable_') || session.includes('zcfbglbhqhysnptkfwba.supabase.co')) {
  fail('La API de sesiones no debe incluir claves/URL del proyecto codificadas directamente.');
}
for (const marker of ['auth.getUser(token)', 'profile.activo !== true', 'String(profile.rol || \'\').toUpperCase() !== \'ADMIN\'']) {
  if (!session.includes(marker)) fail('Falta verificación de administrador en api/sesion-global.js: ' + marker);
}

for (const [file, marker] of [
  ['../api/gemini.js', "requireModuleAccess(req, 'reportes')"],
  ['../api/geocodificar.js', "requireModuleAccess(req, 'mapas')"],
  ['../api/cron-alertas.js', 'authorization !== `Bearer ${cronSecret}`']
]) {
  if (!read(file).includes(marker)) fail('Falta control esperado en ' + file + ': ' + marker);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Controles estáticos de seguridad correctos. La migración RLS aún requiere pruebas en staging.');
