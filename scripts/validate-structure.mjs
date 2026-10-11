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
if (!vercelConfig.crons?.some(job => job.path === '/api/cron-alertas')) fail('No está configurado el cron de alertas.');
for (const endpoint of ['api/gemini.js', 'api/geocodificar.js']) {
  const source = readFileSync(path.join(root, endpoint), 'utf8');
  if (!source.includes('req.method')) fail(`Falta validar el método HTTP en ${endpoint}.`);
}
const requiredModules = ['dashboard','espacio','colaboradores','sucursales','asistencia','licencias','vacaciones','papeletas','correos','amonestaciones','reportes','usuarios','auditoria','configcorreos','mapas','tareas','operaciones','calidad','notificaciones','integraciones'];
for (const moduleName of requiredModules) {
  if (!buttons.has(moduleName)) fail(`El módulo ${moduleName} no tiene botón de navegación.`);
  if (!views.has(moduleName)) fail(`El módulo ${moduleName} no tiene vista registrada.`);
}

const frontendFiles = ['index.html', ...jsFiles.map(file => path.relative(root, file)).filter(file => file.startsWith('js/'))];
for (const file of frontendFiles) {
  const content = readFileSync(path.join(root, file), 'utf8');
  if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) fail(`Posible clave privilegiada en frontend: ${file}`);
}

const loginRequiredIds = ['login-overlay', 'login-email', 'login-pass', 'login-remember', 'login-error', 'btn-login'];
for (const id of loginRequiredIds) {
  if (!html.includes(`id="${id}"`)) fail(`El login NOVA V3 no contiene el elemento requerido #${id}.`);
}
for (const marker of ['nova-v3-overlay', 'nova-v3-orbit-scene', 'nova-v3-auth', 'prefers-reduced-motion']) {
  if (!html.includes(marker)) fail(`Falta el componente visual/accessibilidad ${marker} del login NOVA V3.`);
}
if (!existsSync(path.join(root, 'doctor-simi-logo.jpg'))) fail('No existe el recurso local doctor-simi-logo.jpg del login.');
const appCore = readFileSync(path.join(root, 'js/app-core.js'), 'utf8');
for (const marker of ['syncRememberedLoginEmail', 'Verificando acceso', 'signInWithPassword']) {
  if (!appCore.includes(marker)) fail(`Falta la integración de autenticación esperada: ${marker}.`);
}


const workspaceCode = readFileSync(path.join(root, 'js/workspace.js'), 'utf8');
if (!workspaceCode.includes('rrhh_notas') || !workspaceCode.includes('rrhh_bitacora')) fail('Mi espacio debe guardar notas y bitácora en Supabase.');
if (!workspaceCode.includes('guardarNotaRRHH') || !workspaceCode.includes('guardarRegistroBitacoraRRHH')) fail('Mi espacio no expone los formularios de guardado.');
const organizationCode = readFileSync(path.join(root, 'js/module-organization.js'), 'utf8');
if (!organizationCode.includes('actualizarContextoModulo') || !organizationCode.includes('organizarNavegacionPermisos')) fail('La organización de módulos debe incluir contexto y agrupación por permisos.');
const mapCode = readFileSync(path.join(root, 'js/maps-communications.js'), 'utf8');
if (!mapCode.includes('router.project-osrm.org/route/v1/driving/') || !mapCode.includes('function restaurarMapa14')) fail('El mapa debe calcular rutas viales y permitir restaurar todas las farmacias.');
if (!html.includes('id="mapa14-mostrar-todas"') || !html.includes('id="mapa14-estadisticas"')) fail('Faltan los controles de limpiar filtro y resumen de distancia del mapa.');
if (!html.includes('id="col-filtro-estado"') || !html.includes('id="colab-kpi-grid"')) fail('El directorio de colaboradores necesita KPI y filtro de estado.');


const operationalSummary = readFileSync(path.join(root, 'js/operational-summary.js'), 'utf8');
for (const marker of ['dashboard-ops-cards', 'cargarResumenOperativoRRHH', 'talana-bot-control', 'solicitudes_dotacion', 'Promise.all']) {
  if (!operationalSummary.includes(marker)) fail("El resumen operativo no contiene la integración esperada: " + marker + ".");
}
for (const marker of [
  'id="dashboard-ops-cards"',
  'id="talana-bot-health"',
  'id="dotacion-filtro-buscar"',
  'id="dotacion-filtro-estado"',
  'id="dotacion-filtro-desde"',
  'id="dotacion-filtro-hasta"',
  'src="/js/operational-summary.js"',
  'rrhhModuleEnter',
  'prefers-reduced-motion'
]) {
  if (!html.includes(marker)) fail("Falta el componente operativo/responsive requerido: " + marker + ".");
}
const botCode = readFileSync(path.join(root, 'js/talana-bot.js'), 'utf8');
for (const marker of ['renderHealth', 'error_summary', 'reports_downloaded', 'reports_uploaded', 'admin_manual_run']) {
  if (!botCode.includes(marker)) fail("El panel del bot Talana no contiene diagnóstico esperado: " + marker + ".");
}
const coverageCode = readFileSync(path.join(root, 'js/chat-transfers.js'), 'utf8');
for (const marker of ['function renderSolicitudesDotacion', 'function filtrarSolicitudesDotacion', 'function limpiarFiltrosSolicitudesDotacion', 'solicitudesDotacionCache']) {
  if (!coverageCode.includes(marker)) fail("La vista de dotación no contiene filtro esperado: " + marker + ".");
}
const migrationDir = path.join(root, 'supabase/migrations');
const migrationNames = readdirSync(migrationDir);
for (const redundantMigration of ['20261011120000_talana_importer_privileges_and_key_contract.sql', '20261011080000_talana_importer_service_role_grants.sql']) {
  if (migrationNames.includes(redundantMigration)) fail('La migración Talana redundante sigue en el proyecto: ' + redundantMigration);
}
if (!migrationNames.includes('20261011073437_talana_importer_privileges_and_key_contract_20261011.sql')) fail('Falta alinear la migración del importador con la versión aplicada en Supabase.');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validación correcta: ${localScripts.length} scripts locales, ${jsFiles.length} archivos JS, ${buttons.size} módulos navegables y APIs protegidas.`);
