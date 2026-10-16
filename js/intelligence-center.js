/* Centro de inteligencia y búsqueda universal · Asistencia Doctor Simi
   Usa módulos autorizados visibles y métricas que ya entrega el sistema; no inventa datos. */
(function(){
'use strict';
const MODULES=[
 ['dashboard','Panel principal','layout-dashboard','Inicio'],
 ['tareas','Tareas diarias','list-checks','Asignación y seguimiento'],
 ['colaboradores','Colaboradores','users-round','Directorio de personas'],
 ['sucursales','Sucursales','store','Estructura de locales'],
 ['asistencia','Asistencia y turnos','calendar-check','Jornadas e incidencias'],
 ['licencias','Licencias médicas','file-heart','Licencias y ausentismos'],
 ['vacaciones','Vacaciones y permisos','palmtree','Solicitudes y aprobaciones'],
 ['papeletas','Papeletas de permisos','clipboard-check','Registro de permisos'],
 ['correos','Correos y comunicaciones','mail','Comunicaciones RR. HH.'],
 ['envio_licencias','Envío de licencias','send','Documentación de licencias'],
 ['amonestaciones','Amonestaciones','file-warning','Documentos disciplinarios'],
 ['inteligencia','Analista de RR. HH. con IA','sparkles','Consultas y análisis de asistencia'],
 ['reportes','Reportes y análisis','chart-no-axes-combined','Indicadores e informes'],
 ['usuarios','Usuarios y permisos','shield-check','Roles y accesos'],
 ['auditoria','Auditoría','scan-search','Trazabilidad'],
 ['ayuda','Centro de ayuda','life-buoy','Guías y soporte'],
 ['configcorreos','Configuración de correos','mail-cog','Ajustes de comunicación'],
 ['mapas','Mapa de sucursales','map-pinned','Ubicaciones'],
 ['espacio','Mi espacio de trabajo','notebook-pen','Notas y seguimientos'],
 ['operaciones','Operaciones','workflow','Gestión operativa'],
 ['calidad','Calidad','badge-check','Control y mejora'],
 ['notificaciones','Notificaciones','bell-ring','Avisos internos'],
 ['integraciones','Integraciones','blocks','Conexiones'],
 ['chat','Chat interno','messages-square','Conversaciones'],
 ['traslados','Traslados y coberturas','route','Coordinación entre sucursales']
];
let modal,input,results,status;
const normalize=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function allowedModule(id){
 const b=document.getElementById('btn-'+id);
 if(!b)return id==='dashboard';
 return !b.hidden&&!b.classList.contains('hidden')&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden';
}
function goModule(id){
 const b=document.getElementById('btn-'+id);
 if(b&&!b.hidden&&!b.classList.contains('hidden'))b.click();
 else if(typeof window.cambiarModulo==='function')window.cambiarModulo(id);
 closeSearch();
}
function ensureStyles(){
 if(document.getElementById('simi-intelligence-styles'))return;
 const s=document.createElement('style');s.id='simi-intelligence-styles';
 s.textContent=`
 #simi-global-search{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-start;justify-content:center;padding:12vh 18px 24px;background:rgba(9,27,45,.55);backdrop-filter:blur(7px)}
 #simi-global-search.open{display:flex;animation:simiSearchFade .16s ease-out}
 #simi-global-search .sgs-dialog{width:min(720px,100%);max-height:76vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #d7e4ef;border-radius:22px;background:#fff;box-shadow:0 28px 90px rgba(4,23,43,.3)}
 #simi-global-search .sgs-head{padding:22px 22px 16px;background:linear-gradient(120deg,#fff,#f0f8fc);border-bottom:1px solid #e1eaf2}
 #simi-global-search .sgs-input-wrap{display:flex;align-items:center;gap:12px;margin-top:16px;padding:0 14px;border:1px solid #c9dce9;border-radius:13px;background:white;box-shadow:0 0 0 4px rgba(7,140,168,.07)}
 #simi-global-search input{width:100%;height:49px!important;border:0!important;box-shadow:none!important;outline:none!important;background:transparent!important;font-size:14px!important}
 #simi-global-search .sgs-body{padding:12px;overflow:auto}
 #simi-global-search .sgs-section{padding:7px 8px 5px;color:#688096;font-size:9px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}
 #simi-global-search .sgs-result{display:flex;width:100%;align-items:center;gap:12px;padding:12px;border:1px solid transparent;border-radius:12px;background:white;text-align:left;transition:background .12s,border-color .12s}
 #simi-global-search .sgs-result:hover,#simi-global-search .sgs-result:focus-visible{outline:0;border-color:#cfe4ec;background:#f0f9fb}
 #simi-global-search .sgs-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border:1px solid #d5e8ee;border-radius:12px;background:#eaf7f9;color:#087f9b}
 #simi-global-search .sgs-icon svg{width:18px;height:18px}
 #simi-global-search .sgs-label{font-size:12px;font-weight:850;color:#17344e}
 #simi-global-search .sgs-desc{margin-top:3px;color:#718398;font-size:10px}
 #simi-global-search .sgs-shortcut{margin-left:auto;flex:0 0 auto;padding:4px 7px;border:1px solid #dce5ee;border-radius:6px;color:#60758a;font-size:9px;font-weight:800}
 #simi-global-search .sgs-empty{padding:28px 16px;text-align:center;color:#718398;font-size:12px}
 #simi-global-search .sgs-foot{display:flex;justify-content:space-between;gap:12px;padding:12px 20px;border-top:1px solid #e4ecf3;background:#f8fafc;color:#73869a;font-size:10px}
 .simi-priority-panel{border:1px solid #d6e5ef;border-radius:20px;background:linear-gradient(120deg,#fff,#f4f9fc);box-shadow:0 8px 22px rgba(17,47,75,.055);overflow:hidden}
 .simi-priority-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 22px;border-bottom:1px solid #e3edf4}
 .simi-priority-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px}
 .simi-priority-item{min-width:0;padding:13px;border:1px solid #e0e9f0;border-radius:14px;background:#fff;transition:transform .16s,box-shadow .16s,border-color .16s;display:flex;flex-direction:column;gap:10px}
 .simi-priority-item:hover{transform:translateY(-2px);border-color:#bcd8e5;box-shadow:0 9px 20px rgba(17,47,75,.08)}
 .simi-priority-main{display:grid;width:100%;grid-template-columns:35px minmax(0,1fr) auto;align-items:start;gap:10px;text-align:left;background:transparent;border:0;padding:0;color:inherit}
 .simi-priority-main:focus-visible,.simi-priority-task:focus-visible{outline:3px solid #8dd9e3;outline-offset:3px;border-radius:8px}
 .simi-priority-item .sp-number{display:block;margin:2px 0 0;font-size:24px;font-weight:950;letter-spacing:-.05em;color:#17344e}
 .simi-priority-task{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:31px;width:100%;padding:7px 9px;border:1px solid #cfe1eb;border-radius:9px;background:#f5fafc;color:#17435d;font-size:10px;font-weight:850}
 .simi-priority-task:hover{background:#eaf7fa;border-color:#9acbd8}
 .simi-priority-task svg{width:13px;height:13px}
 .simi-priority-item .sp-title{font-size:11px;font-weight:900;color:#17344e}
 .simi-priority-item .sp-detail{margin-top:5px;color:#718398;font-size:10px;line-height:1.5}
 .simi-priority-item .sp-icon{display:grid;place-items:center;width:35px;height:35px;border:1px solid #f3d8bc;border-radius:11px;background:#fff7ed;color:#b65a18}
 .simi-priority-item .sp-icon svg{width:17px;height:17px}
 .simi-priority-empty{padding:22px;color:#6b8195;font-size:12px}
 #simi-global-search-trigger{display:inline-flex;align-items:center;gap:9px;min-height:41px;padding:9px 13px;border:1px solid #cfdeeb;border-radius:12px;background:#fff;color:#294760;font-size:11px;font-weight:850;box-shadow:0 3px 8px rgba(16,44,70,.05)}
 #simi-global-search-trigger:hover{border-color:#9bcbd9;background:#f4fbfd}
 #simi-global-search-trigger kbd{padding:3px 6px;border:1px solid #dce5ee;border-radius:5px;background:#f7fafc;color:#6d8296;font-size:9px}
 @keyframes simiSearchFade{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
 @media(max-width:1100px){.simi-priority-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:600px){#simi-global-search{padding:5vh 9px 12px}#simi-global-search .sgs-dialog{border-radius:16px;max-height:88vh}#simi-global-search .sgs-head{padding:16px}.simi-priority-head{padding:15px}.simi-priority-grid{grid-template-columns:1fr;padding:10px}.simi-priority-main{grid-template-columns:38px minmax(0,1fr) auto}.simi-priority-task{grid-column:1/-1}.simi-priority-item .sp-number{margin:0}.simi-command-actions{flex-wrap:wrap}}
 @media(prefers-reduced-motion:reduce){#simi-global-search *,.simi-priority-item{animation:none!important;transition:none!important}}
 `;
 document.head.appendChild(s);
}
function createSearch(){
 if(document.getElementById('simi-global-search'))return;
 const host=document.createElement('div');host.id='simi-global-search';host.setAttribute('aria-hidden','true');
 host.innerHTML='<div class="sgs-dialog" role="dialog" aria-modal="true" aria-labelledby="sgs-title"><div class="sgs-head"><div style="display:flex;align-items:center;gap:10px"><span class="sgs-icon"><i data-lucide="search"></i></span><div><div id="sgs-title" style="font-size:16px;font-weight:950;color:#17344e">Búsqueda inteligente</div><div style="margin-top:3px;color:#718398;font-size:11px">Accede a módulos y encuentra contenido ya cargado</div></div><button type="button" id="sgs-close" aria-label="Cerrar búsqueda" style="margin-left:auto;border:1px solid #dbe5ed;border-radius:9px;padding:7px 10px;color:#61768a;font-size:11px;font-weight:800">ESC</button></div><div class="sgs-input-wrap"><i data-lucide="search" style="width:19px;height:19px;color:#078ca8;flex:none"></i><input id="sgs-query" type="search" placeholder="Buscar módulos, acciones o contenido de esta pantalla…" autocomplete="off" aria-label="Buscar módulos y contenido"></div></div><div class="sgs-body" id="sgs-results" role="listbox"><div class="sgs-empty">Escribe para buscar un módulo o una acción.</div></div><div class="sgs-foot"><span>↑ ↓ para navegar · Enter para abrir</span><span>La búsqueda respeta los módulos visibles para tu usuario</span></div></div>';
 document.body.appendChild(host);modal=host;input=host.querySelector('#sgs-query');results=host.querySelector('#sgs-results');
 host.querySelector('#sgs-close').addEventListener('click',closeSearch);
 host.addEventListener('mousedown',e=>{if(e.target===host)closeSearch();});
 input.addEventListener('input',renderResults);
 input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=[...results.querySelectorAll('button.sgs-result')];if(!items.length)return;let i=items.indexOf(document.activeElement);i=e.key==='ArrowDown'?Math.min(items.length-1,i+1):Math.max(0,i<=0?0:i-1);items[i].focus();}
  if(e.key==='Enter'){e.preventDefault();const focused=document.activeElement.closest('button.sgs-result');(focused||results.querySelector('button.sgs-result'))?.click();}
 });
 if(window.lucide?.createIcons)window.lucide.createIcons({root:host});
}
function openSearch(prefill=''){
 ensureStyles();createSearch();modal.classList.add('open');modal.setAttribute('aria-hidden','false');input.value=prefill;renderResults();setTimeout(()=>input.focus(),30);
}
function closeSearch(){if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}
function visibleModules(){return MODULES.filter(m=>allowedModule(m[0]));}
function currentContentResults(q){
 const section=[...document.querySelectorAll('main section[id^="view-"]')].find(s=>!s.classList.contains('hidden')&&getComputedStyle(s).display!=='none');
 if(!section||q.length<2)return [];
 const found=[],seen=new Set();
 const candidates=[...section.querySelectorAll('h1,h2,h3,h4,button,a,[role="button"],tbody tr')];
 for(const el of candidates){
  if(el.closest('#simi-global-search')||el.closest('#simi-command-center'))continue;
  const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<3||text.length>180||!normalize(text).includes(q)||seen.has(text))continue;
  if(el.closest('.hidden')||el.disabled||el.getAttribute('aria-hidden')==='true')continue;
  seen.add(text);
  found.push({label:text.slice(0,100),desc:'Contenido de la pantalla actual',icon:'file-search',kind:'content',el});
  if(found.length>=8)break;
 }
 return found;
}
function renderResults(){
 if(!results)return;
 const q=normalize(input.value),all=[];
 const modules=visibleModules();
 modules.forEach(m=>{if(!q||normalize(m[1]+' '+m[3]).includes(q))all.push({label:m[1],desc:m[3],icon:m[2],kind:'module',id:m[0]});});
 const actions=[
  {label:'Crear y asignar tarea',desc:'Abrir el formulario de tareas diarias',icon:'list-plus',kind:'action',action:'task',keywords:'nueva tarea asignar trabajo'},
  {label:'Crear una nota',desc:'Abrir tu espacio de trabajo',icon:'notebook-pen',kind:'action',action:'note',keywords:'nota recordatorio'},
  {label:'Actualizar resumen operativo',desc:'Volver a consultar los indicadores disponibles',icon:'refresh-cw',kind:'action',action:'refresh',keywords:'actualizar datos refrescar dashboard'}
 ];
 actions.forEach(a=>{if(!q||normalize(a.label+' '+a.keywords).includes(q))all.push(a);});
 const content=currentContentResults(q);
 const shown=[...all.slice(0,8),...content].slice(0,14);
 if(!q){results.innerHTML='<div class="sgs-section">Acceso rápido</div>'+all.slice(0,8).map(renderResult).join('')+'<div class="sgs-section">Consejo</div><div class="sgs-empty">Busca por nombre de módulo o por texto que ya esté cargado en la pantalla actual.</div>';bindResults();return;}
 if(!shown.length){results.innerHTML='<div class="sgs-empty">No encontramos coincidencias en los módulos autorizados ni en el contenido cargado de esta pantalla.</div>';return;}
 results.innerHTML='<div class="sgs-section">Resultados · '+shown.length+'</div>'+shown.map(renderResult).join('');bindResults();
}
function renderResult(r,i){
 const attrs=r.kind==='module'?'data-kind="module" data-id="'+escapeHtml(r.id)+'"':r.kind==='action'?'data-kind="action" data-action="'+escapeHtml(r.action)+'"':'data-kind="content" data-index="'+i+'"';
 return '<button type="button" class="sgs-result" role="option" '+attrs+'><span class="sgs-icon"><i data-lucide="'+escapeHtml(r.icon)+'"></i></span><span style="min-width:0;flex:1"><span class="sgs-label" style="display:block">'+escapeHtml(r.label)+'</span><span class="sgs-desc" style="display:block">'+escapeHtml(r.desc)+'</span></span><span class="sgs-shortcut">'+(r.kind==='module'?'Abrir':r.kind==='action'?'Acción':'Ver')+'</span></button>';
}
function bindResults(){
 results.querySelectorAll('button.sgs-result').forEach((b,i)=>b.addEventListener('click',()=>{
  const kind=b.dataset.kind;
  if(kind==='module'){goModule(b.dataset.id);return;}
  if(kind==='action'){closeSearch();runAction(b.dataset.action);return;}
  const q=normalize(input.value),items=currentContentResults(q),label=b.querySelector('.sgs-label')?.textContent,item=items.find(x=>x.label===label)||items[Number(b.dataset.index)||0];
  closeSearch();if(item?.el){item.el.scrollIntoView({behavior:'smooth',block:'center'});if(item.el.focus)item.el.focus({preventScroll:true});item.el.style.outline='3px solid rgba(7,140,168,.35)';setTimeout(()=>item.el.style.outline='',1300);}
 }));
 if(window.lucide?.createIcons)window.lucide.createIcons({root:results});
}
function openTaskForPriority(item){
 if(!allowedModule('tareas'))return;
 goModule('tareas');
 setTimeout(()=>{
  const title=document.getElementById('tarea-titulo'),description=document.getElementById('tarea-descripcion');
  if(title)title.value=('Seguimiento: '+item.title).slice(0,140);
  if(description)description.value='Origen: Centro de inteligencia RR. HH.\\nIndicador observado: '+item.number+' caso(s).\\nRecomendación: '+item.detail+'\\n\\nRevisar los registros de origen, confirmar los casos y documentar la resolución. No modificar datos automáticamente.';
  title?.focus();
  title?.scrollIntoView({behavior:'smooth',block:'center'});
 },350);
}
function runAction(action){
 if(action==='task'){goModule('tareas');setTimeout(()=>document.getElementById('tarea-titulo')?.focus(),350);}
 if(action==='note'){goModule('espacio');setTimeout(()=>document.getElementById('rrhh-nota-titulo')?.focus(),350);}
 if(action==='refresh'){if(typeof window.cargarResumenOperativoRRHH==='function')window.cargarResumenOperativoRRHH();if(typeof window.cargarResumenActualizaciones==='function')window.cargarResumenActualizaciones();if(typeof window.cargarPanelInteligenteOperativo==='function')window.cargarPanelInteligenteOperativo();}
}
function installTrigger(){
 const actions=document.querySelector('#simi-command-center .simi-command-actions');if(!actions||document.getElementById('simi-global-search-trigger'))return;
 const b=document.createElement('button');b.type='button';b.id='simi-global-search-trigger';b.innerHTML='<i data-lucide="search" style="width:16px;height:16px"></i><span>Buscar en la plataforma</span><kbd>Ctrl K</kbd>';b.addEventListener('click',()=>openSearch());actions.insertBefore(b,actions.firstChild);
 if(window.lucide?.createIcons)window.lucide.createIcons({root:b});
}
function buildPriorityPanel(){
 const cards=document.getElementById('dashboard-ops-cards'),updated=document.getElementById('dashboard-ops-updated');if(!cards)return;
 let panel=document.getElementById('simi-priority-panel');
 if(!panel){
  panel=document.createElement('section');panel.id='simi-priority-panel';panel.className='simi-priority-panel';
  panel.innerHTML='<div class="simi-priority-head"><div><span class="module-kicker"><i data-lucide="scan-search" class="h-3 w-3"></i> LECTURA OPERATIVA</span><h3 style="margin-top:9px;font-size:19px;font-weight:950;letter-spacing:-.04em;color:#17344e">Prioridades detectadas</h3><p style="margin-top:5px;font-size:11px;color:#718398">Recomendaciones basadas en los indicadores reales del resumen operativo.</p></div><span style="display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #dce7ef;border-radius:10px;background:#fff;color:#5c7388;font-size:10px;font-weight:850"><i data-lucide="activity" style="width:14px;height:14px;color:#078ca8"></i> Reglas operativas</span></div><div id="simi-priority-grid" class="simi-priority-grid"><div class="simi-priority-empty">Consultando indicadores para identificar prioridades…</div></div><div id="simi-priority-foot" style="padding:0 20px 15px;color:#8797a8;font-size:10px"></div>';
  const parent=cards.closest('.ui-card')||cards.parentElement;parent.insertAdjacentElement('afterend',panel);
 }
 const grid=panel.querySelector('#simi-priority-grid'),foot=panel.querySelector('#simi-priority-foot');
 const raw=[...cards.children].map(el=>(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
 const rules=[
  {match:/tareas? vencidas?|vencidas?/,title:'Tareas vencidas',detail:'Revisa el atraso, confirma el estado y acuerda el siguiente paso.',icon:'clock-alert',module:'tareas',priority:1},
  {match:/tareas? abiertas?|pendientes?/,title:'Trabajo pendiente',detail:'Prioriza las tareas abiertas y verifica sus fechas límite.',icon:'list-checks',module:'tareas',priority:2},
  {match:/avisos? sin leer|notificaciones? pendientes?/,title:'Avisos sin leer',detail:'Revisa los avisos pendientes para evitar que una gestión quede sin respuesta.',icon:'bell-ring',module:'notificaciones',priority:3},
  {match:/dotacion.*revisar|solicitudes?.*revisar/,title:'Solicitudes por revisar',detail:'Abre la gestión operativa y revisa las solicitudes que requieren decisión.',icon:'users-round',module:'operaciones',priority:4},
  {match:/importaciones? con errores/,title:'Importaciones con errores',detail:'Revisa las cargas recientes para corregir filas rechazadas o fallidas.',icon:'file-warning',module:'reportes',priority:4.5},
  {match:/errores?|fallas?|no disponible/,title:'Estado por verificar',detail:'Comprueba el origen del dato antes de tomar decisiones.',icon:'shield-alert',module:'dashboard',priority:5}
 ];
 const items=[];
 raw.forEach(text=>{
  const numMatch=text.match(/(?:^|\s)(\d[\d.,]*)\s*(?=\D|$)/);
  const number=numMatch?Number(numMatch[1].replace(/[.,]/g,'')):null;
  if(number===null||!Number.isFinite(number))return;
  for(const r of rules){
   if(r.match.test(text)&&number>0){items.push({...r,number,source:text});break;}
  }
 });
 const unique=items.filter((it,i,a)=>a.findIndex(x=>x.title===it.title)===i).sort((a,b)=>a.priority-b.priority).slice(0,4);
 if(!unique.length){
  const loading=raw.some(t=>/consultando|cargando/i.test(t));
  const error=raw.some(t=>/no disponible|error al consultar|sin conexión/i.test(t));
  grid.innerHTML='<div class="simi-priority-empty" style="grid-column:1/-1">'+(loading?'Los indicadores todavía se están cargando. Actualiza el resumen cuando termine la consulta.':error?'No es posible determinar prioridades hasta recuperar los indicadores. Revisa el estado del resumen operativo.':'No se detectaron alertas pendientes en los indicadores disponibles. Esto no sustituye la revisión de cada módulo.')+'</div>';
  foot.textContent=updated?.innerText?'Fuente: resumen operativo · '+updated.innerText:'Fuente: resumen operativo';return;
 }
 grid.innerHTML=unique.map((it,index)=>'<article class="simi-priority-item"><button type="button" class="simi-priority-main" data-priority-module="'+escapeHtml(it.module)+'" aria-label="Abrir módulo para revisar '+escapeHtml(it.title)+'"><span class="sp-icon"><i data-lucide="'+escapeHtml(it.icon)+'"></i></span><span style="min-width:0"><span class="sp-title" style="display:block">'+escapeHtml(it.title)+'</span><span class="sp-detail" style="display:block">'+escapeHtml(it.detail)+'</span></span><span class="sp-number">'+it.number.toLocaleString('es-CL')+'</span></button><button type="button" class="simi-priority-task" data-priority-task="'+index+'"><i data-lucide="list-plus"></i>Crear tarea de seguimiento</button></article>').join('');
 grid.querySelectorAll('[data-priority-module]').forEach(b=>b.addEventListener('click',()=>goModule(b.dataset.priorityModule)));
 grid.querySelectorAll('[data-priority-task]').forEach(b=>b.addEventListener('click',()=>{
  const item=unique[Number(b.dataset.priorityTask)];if(item)openTaskForPriority(item);
 }));
 foot.textContent='Detectado a partir de los indicadores actuales. La plataforma no modifica ni cierra registros automáticamente.'+(updated?.innerText?' · '+updated.innerText:'');
 if(window.lucide?.createIcons)window.lucide.createIcons({root:panel});
}
function decorateFreshness(){
 const list=document.getElementById('dashboard-freshness-list');if(!list)return;
 [...list.children].forEach(card=>{
  if(!card||card.dataset.simiFreshnessDecorated==='1')return;
  const text=(card.innerText||card.textContent||'').replace(/\s+/g,' ');
  const m=text.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if(!m)return;
  const date=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  if(!Number.isFinite(date.getTime()))return;
  const hours=(Date.now()-date.getTime())/3600000;
  if(hours<0||hours>24*365)return;
  const status=hours>=48?{label:'Revisar actualización',bg:'#fff2e8',fg:'#a24b0b',border:'#f4d0b2',icon:'clock-alert'}:hours>=24?{label:'Actualización de ayer',bg:'#fff9e8',fg:'#8a6410',border:'#f0e0a9',icon:'clock-3'}:{label:'Actualizada recientemente',bg:'#eaf8f2',fg:'#16734b',border:'#c4ead8',icon:'check-circle-2'};
  const badge=document.createElement('span');badge.style.cssText='display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:5px 8px;border:1px solid '+status.border+';border-radius:999px;background:'+status.bg+';color:'+status.fg+';font-size:9px;font-weight:850;line-height:1.2';
  badge.innerHTML='<i data-lucide="'+status.icon+'" style="width:12px;height:12px"></i>'+status.label;
  card.appendChild(badge);card.dataset.simiFreshnessDecorated='1';
 });
 if(window.lucide?.createIcons)window.lucide.createIcons({root:list});
}

function init(){
 ensureStyles();installTrigger();createSearch();buildPriorityPanel();decorateFreshness();
 const bar=document.getElementById('simi-command-center');if(bar&&!bar.dataset.simiSearchBound){bar.dataset.simiSearchBound='1';bar.addEventListener('click',e=>{const b=e.target.closest('[data-simi-action]');if(b&&b.dataset.simiAction==='refresh')setTimeout(buildPriorityPanel,500);});}
 const freshness=document.getElementById('dashboard-freshness-list');if(freshness)new MutationObserver(records=>{if(records.some(record=>record.target===freshness))decorateFreshness();}).observe(freshness,{childList:true});
 const ops=document.getElementById('dashboard-ops-cards');
 if(ops)new MutationObserver(()=>{clearTimeout(init._priorityTimer);init._priorityTimer=setTimeout(buildPriorityPanel,100);}).observe(ops,{childList:true,subtree:true,characterData:true});
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}
  if(e.key==='Escape'&&modal?.classList.contains('open'))closeSearch();
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.SimiIntelligenceCenter={openSearch,refreshPriorities:buildPriorityPanel};
})();
