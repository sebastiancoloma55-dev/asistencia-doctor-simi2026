import { readFileSync } from 'node:fs';

const fail = message => { console.error('SECURITY CHECK FAILED:', message); process.exitCode = 1; };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const vercel = JSON.parse(read('../vercel.json'));
const headers = new Map((vercel.headers || []).flatMap(rule => (rule.headers || []).map(h => [h.key.toLowerCase(), h.value])));
for (const key of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy', 'x-permitted-cross-domain-policies', 'x-dns-prefetch-control']) {
  if (!headers.has(key)) fail('Falta cabecera de seguridad Vercel: ' + key);
}
if (headers.get('x-content-type-options') !== 'nosniff') fail('X-Content-Type-Options debe ser nosniff.');
if (headers.get('x-frame-options') !== 'DENY') fail('X-Frame-Options debe ser DENY.');
if (!headers.has('content-security-policy')) fail('Falta Content-Security-Policy.');
if (!String(headers.get('content-security-policy') || '').includes("default-src 'self'")) fail('CSP debe restringir por defecto al mismo origen.');
const csp = String(headers.get('content-security-policy') || '');
if (/script-src[^;]*https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)(?:\s|;)/i.test(csp)) fail('CSP debe restringir CDN a paquetes y versiones concretos, no al host completo.');
if (/connect-src[^;]*https:\/\/\*\.supabase\.co/i.test(csp)) fail('CSP debe restringir Supabase al proyecto requerido, no a cualquier subdominio.');
if (!csp.includes('object-src \'none\'') || !csp.includes('frame-ancestors \'none\'')) fail('CSP debe bloquear objetos y framing.');

if ([...headers.keys()].includes('access-control-allow-origin')) fail('No publicar CORS global para la SPA; configurar CORS únicamente en una API que lo necesite.');
if (JSON.stringify(vercel).includes('"Access-Control-Allow-Origin": "*"')) fail('No se permite CORS con comodín.');
const rootRule = (vercel.headers || []).find(rule => rule.source === '/');
if (!rootRule?.headers?.some(h => h.key.toLowerCase() === 'cache-control' && /private, no-store/i.test(h.value))) {
  fail('La ruta raíz debe impedir el almacenamiento compartido mediante Cache-Control private, no-store.');
}
const apiRule = (vercel.headers || []).find(rule => rule.source === '/api/(.*)');
if (!apiRule?.headers?.some(h => h.key.toLowerCase() === 'cache-control' && /private, no-store/i.test(h.value))) {
  fail('Las API deben impedir el almacenamiento compartido mediante Cache-Control private, no-store.');
}

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
if (!/leaflet\.js[^>]*integrity="sha(?:256|384)-/.test(html)) fail('Leaflet JS debe incluir Subresource Integrity (SRI).');
if (!/leaflet\.css[^>]*integrity="sha256-/.test(html)) fail('Leaflet CSS debe incluir Subresource Integrity (SRI).');
const externalScripts = html.split('<script').slice(1).map(part => part.split('>')[0] + '>').filter(tag => tag.includes('src="https://') || tag.includes("src='https://"));
const externalScriptsWithoutSri = externalScripts.filter(tag => !/integrity=["']sha384-[A-Za-z0-9+/=]+["']/i.test(tag));
if (externalScriptsWithoutSri.length) {
  fail('Todos los scripts externos deben incluir un hash SRI SHA-384 generado durante el build; faltan en ' + externalScriptsWithoutSri.length + ' etiqueta(s).');
}
const externalScriptsWithoutCors = externalScripts.filter(tag => !/crossorigin=["']anonymous["']/i.test(tag));
if (externalScriptsWithoutCors.length) {
  fail('Todos los scripts externos protegidos con SRI deben incluir crossorigin="anonymous"; faltan en ' + externalScriptsWithoutCors.length + ' etiqueta(s).');
}
if (/script-src[^;]*'unsafe-inline'/i.test(csp) || /script-src[^;]*'unsafe-eval'/i.test(csp)) {
  console.warn('SECURITY FOLLOW-UP REQUIRED: CSP aún permite unsafe-inline/unsafe-eval; retirar después de migrar scripts y handlers inline.');
}

const serverAuth = read('../lib/server-auth.js');
for (const marker of ['auth.getUser(token)', 'profile.activo !== true', 'permissions.includes(permission)']) {
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


const userAdmin = read('../api/usuarios-auth.js');
for (const marker of ["Sesión no válida o expirada", "No se pudo completar la operación. Revisa los registros del servidor."]) {
  if (!userAdmin.includes(marker)) fail('La API de administración debe devolver errores genéricos al cliente: ' + marker);
}
if (userAdmin.includes('meError?.message') || userAdmin.includes('Error interno: ${error?.message')) {
  fail('La API de administración no debe exponer errores internos al cliente.');
}

const geocoder = read('../api/geocodificar.js');
for (const marker of ['CACHE_MAX_ENTRIES = 300', 'AbortSignal.timeout(8000)', 'oldestKey !== undefined']) {
  if (!geocoder.includes(marker)) fail('Falta protección de recursos en geocodificación: ' + marker);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Controles estáticos de seguridad correctos. La migración RLS aún requiere pruebas en staging.');
