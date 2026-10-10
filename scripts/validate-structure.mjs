import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';

const root = process.cwd();
const fail = message => { console.error('VALIDATION FAILED:', message); process.exitCode = 1; };
const htmlPath = path.join(root, 'index.html');
if (!existsSync(htmlPath)) throw new Error('No se encontró index.html.');
const html = readFileSync(htmlPath, 'utf8');

const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1])
  .filter(src => src.startsWith('/') && !src.startsWith('//'));
for (const src of localScripts) {
  const file = path.join(root, src.replace(/^\//, ''));
  if (!existsSync(file)) fail(`El script local ${src} no existe.`);
}

let inlineNumber = 0;
for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
  inlineNumber += 1;
  try { new Script(match[2], { filename: `index.inline-${inlineNumber}.js` }); }
  catch (error) { fail(`JavaScript inline ${inlineNumber}: ${error.message}`); }
}

const jsFiles = [];
for (const dir of ['js', 'api', 'lib', 'scripts']) {
  const full = path.join(root, dir);
  if (!existsSync(full)) continue;
  for (const file of readdirSync(full, { withFileTypes: true })) {
    if (file.isFile() && /\.(js|mjs)$/.test(file.name)) jsFiles.push(path.join(full, file.name));
  }
}
for (const file of jsFiles) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { fail(`Sintaxis en ${path.relative(root, file)}: ${error.stderr?.toString() || error.message}`); }
}

const navHtml = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || '';
const buttons = new Set([...navHtml.matchAll(/id=["']btn-([^"']+)["']/g)].map(match => match[1]));
const views = new Set([...html.matchAll(/id=["']view-([^"']+)["']/g)].map(match => match[1]).filter(id => id !== 'generic'));
for (const id of buttons) if (!views.has(id)) fail(`El botón btn-${id} no tiene view-${id}.`);
for (const id of views) if (!buttons.has(id)) fail(`La vista view-${id} no tiene botón de navegación.`);

const coreConfig = readFileSync(path.join(root, 'js/app-config.js'), 'utf8');
for (const moduleName of ['operaciones', 'calidad', 'notificaciones', 'integraciones']) {
  if (!coreConfig.includes(`'${moduleName}'`)) fail(`El módulo ${moduleName} no está registrado en la configuración.`);
}
const gemini = readFileSync(path.join(root, 'api/gemini.js'), 'utf8');
const geo = readFileSync(path.join(root, 'api/geocodificar.js'), 'utf8');
if (!gemini.includes("requireModuleAccess(req, 'reportes')")) fail('La API de IA no valida el permiso reportes.');
if (!geo.includes("requireModuleAccess(req, 'mapas')")) fail('La API de geocodificación no valida el permiso mapas.');
const userAuth = readFileSync(path.join(root, 'api/usuarios-auth.js'), 'utf8');
if (!userAuth.includes('Acceso restringido al administrador principal')) fail('La API de administración no restringe el acceso al administrador principal.');
const cron = readFileSync(path.join(root, 'api/cron-alertas.js'), 'utf8');
if (!cron.includes('authorization !== `Bearer ${cronSecret}`')) fail('El cron de alertas no valida CRON_SECRET.');
const vercelConfig = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (!vercelConfig.crons?.some(job => job.path === '/api/cron-alertas' && job.schedule === '0 * * * *')) fail('El cron de alertas debe ejecutarse cada hora.');
for (const endpoint of ['api/gemini.js', 'api/geocodificar.js']) {
  const source = readFileSync(path.join(root, endpoint), 'utf8');
  if (!source.includes('req.method')) fail(`Falta validar el método HTTP en ${endpoint}.`);
}
const requiredModules = ['dashboard','colaboradores','sucursales','asistencia','licencias','vacaciones','papeletas','correos','coberturas','reportes','usuarios','auditoria','configcorreos','mapas','tareas','operaciones','calidad','notificaciones','integraciones'];
for (const moduleName of requiredModules) {
  if (!buttons.has(moduleName)) fail(`El módulo ${moduleName} no tiene botón de navegación.`);
  if (!views.has(moduleName)) fail(`El módulo ${moduleName} no tiene vista registrada.`);
}

const frontendFiles = ['index.html', ...jsFiles.map(file => path.relative(root, file)).filter(file => file.startsWith('js/'))];
for (const file of frontendFiles) {
  const content = readFileSync(path.join(root, file), 'utf8');
  if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) fail(`Posible clave privilegiada en frontend: ${file}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validación correcta: ${localScripts.length} scripts locales, ${jsFiles.length} archivos JS, ${buttons.size} módulos navegables y APIs protegidas.`);
