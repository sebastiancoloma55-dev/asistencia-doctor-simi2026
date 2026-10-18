(function(){
"use strict";
var colors=["amarillo","menta","celeste","lila","rosa","neutro"];
var categories=["General","Seguimiento","Asistencia","Licencias","Cobertura","Sucursal","Reunión","Urgente"];
var logCategories=["Gestión","Incidencia","Seguimiento","Decisión","Reunión","Cobertura","Asistencia","Licencias","Otro"];
var modules=[["general","Gestión general"],["dashboard","Dashboard"],["espacio","Mi espacio"],["colaboradores","Colaboradores"],["sucursales","Sucursales"],["asistencia","Asistencia"],["licencias","Licencias"],["vacaciones","Vacaciones"],["papeletas","Papeletas"],["correos","Borradores de correo"],["amonestaciones","Coberturas"],["reportes","Reportes"],["usuarios","Usuarios y roles"],["auditoria","Auditoría"],["configcorreos","Correos sucursales"],["mapas","Mapa y distancias"],["tareas","Tareas diarias"],["operaciones","Centro de operaciones"],["calidad","Calidad de datos"],["notificaciones","Notificaciones"],["integraciones","Integraciones"],["chat","Chat interno"],["traslados","Traslados"]];
var state={notes:[],logs:[],userId:null,notesError:null,logsError:null,filter:"ACTIVAS",search:"",logSearch:"",tab:"notas"};
var $=function(id){return document.getElementById(id);};
var esc=function(v){if(typeof window.escaparHTML==="function")return window.escaparHTML(String(v==null?"":v));return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
var toast=function(m,t){if(typeof window.mostrarToast==="function")window.mostrarToast(m,t||"info",6000);else console.log(m);};
var client=function(){
 if(window._supabase&&window._supabase.auth)return window._supabase;
 if(window.supabaseClient&&window.supabaseClient.auth)return window.supabaseClient;
 // app-core.js crea _supabase como binding global de un script clásico;
 // los bindings const/let no siempre aparecen como window._supabase.
 try{if(typeof _supabase!=="undefined"&&_supabase&&_supabase.auth)return _supabase;}catch(e){}
 try{if(typeof supabase!=="undefined"&&supabase&&supabase.auth)return supabase;}catch(e){}
 return null;
};
function userSession(){var c=client();if(!c||!c.auth)throw new Error("No se encuentra autenticación. Inicia sesión nuevamente.");return c.auth.getSession().then(function(r){if(r.error)throw r.error;if(!r.data.session||!r.data.session.user)throw new Error("La sesión expiró. Vuelve a entrar.");return {client:c,user:r.data.session.user};});}
function fmtDate(v){if(!v)return "Sin fecha límite";var d=new Date(v);if(isNaN(d.getTime()))return "Sin fecha límite";return new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeZone:"America/Santiago"}).format(d);}
function fmtClock(v){if(!v)return "";var d=new Date(v);if(isNaN(d.getTime()))return "";return new Intl.DateTimeFormat("es-CL",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santiago"}).format(d);}
function localInput(v){var d=v?new Date(v):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function icons(){if(window.lucide&&window.lucide.createIcons)window.lucide.createIcons();}
function renderRecentActivity(){
 var box=$("space-recent-activity");if(!box)return;
 var items=state.logs.slice().sort(function(a,b){return new Date(b.ocurrio_en)-new Date(a.ocurrio_en);}).slice(0,3);
 if(!items.length){box.innerHTML='<div class="space-activity-empty">'+(state.logsError?'No se pudo cargar la actividad reciente.':'Todavía no hay gestiones registradas en tu bitácora.')+'</div>';return;}
 var activityIcons=["file-text","check-circle-2","users"];
 box.innerHTML=items.map(function(l,i){var when=l.ocurrio_en?new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Santiago"}).format(new Date(l.ocurrio_en)):"";return '<article class="space-activity-item"><span class="space-activity-icon"><i data-lucide="'+activityIcons[i]+'"></i></span><div><b>'+esc(l.titulo||l.categoria||"Gestión registrada")+'</b><p>'+esc(l.detalle||l.modulo||"Actividad de RR. HH.")+'</p><small>'+esc(when)+'</small></div></article>';}).join("");
}
function toggleNuevaNotaEspacio(){var form=document.querySelector("#view-espacio .space-compose-card");if(!form)return;form.classList.toggle("hidden");if(!form.classList.contains("hidden")){form.scrollIntoView({behavior:"smooth",block:"start"});var title=$("rrhh-nota-titulo");if(title)title.focus();}}
window.toggleNuevaNotaEspacio=toggleNuevaNotaEspacio;
function metrics(){
 var active=state.notes.filter(function(n){return n.estado==="ACTIVA";}).length;
 var pinned=state.notes.filter(function(n){return n.fijada&&n.estado==="ACTIVA";}).length;
 var now=new Date();var horizon=new Date(now.getTime()+7*86400000);var overdue=state.notes.filter(function(n){var d=n.vence_en?new Date(n.vence_en):null;return n.estado==="ACTIVA"&&d&&d>=now&&d<=horizon;}).length;
 var week=Date.now()-7*86400000;
 var logsWeek=state.logs.filter(function(l){return new Date(l.ocurrio_en).getTime()>=week;}).length;
 var activeValue=state.notesError?"Error":active;
 var pinnedValue=state.notesError?"Error":pinned;var pendingTasks=document.getElementById("tk-pendiente");var taskValue=pendingTasks?pendingTasks.textContent.trim():"—";
 var overdueValue=state.notesError?"Error":overdue;
 var logsValue=state.logsError?"Error":logsWeek;
 renderRecentActivity();\n var box=$("space-metrics");
 if(box){
  var vals=[["Notas activas",activeValue,"sticky-note","teal"],["Tareas pendientes",taskValue,"clipboard-check","violet"],["Próximos vencimientos",overdueValue,"calendar-days","amber"],["Gestiones recientes",logsValue,"clock-arrow-down","blue"]];
  box.innerHTML=vals.map(function(x){return '<div class="space-metric space-metric-'+x[3]+'"><span class="space-metric-icon"><i data-lucide="'+x[2]+'"></i></span><span class="space-metric-copy"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></span></div>';}).join("");
 }
 var dash=$("dashboard-space-summary");
 if(dash){
  dash.innerHTML='<div class="dash-space-intro"><div><span class="dash-space-kicker">TU MESA DE TRABAJO</span><h3>Lo que tienes entre manos</h3><p>Notas, recordatorios y gestiones sin perder el hilo.</p></div><button type="button" onclick="cambiarModulo(\'espacio\')" class="dash-space-open">Abrir mi espacio <i data-lucide="arrow-up-right"></i></button></div><div class="dash-space-stat-grid"><div><span class="dash-space-stat-icon"><i data-lucide="sticky-note"></i></span><span><b>'+activeValue+'</b><small>Notas activas</small></span></div><div><span class="dash-space-stat-icon"><i data-lucide="pin"></i></span><span><b>'+pinnedValue+'</b><small>Notas fijadas</small></span></div><div><span class="dash-space-stat-icon"><i data-lucide="clock-alert"></i></span><span><b>'+overdueValue+'</b><small>Fuera de plazo</small></span></div><div><span class="dash-space-stat-icon"><i data-lucide="clock-arrow-down"></i></span><span><b>'+logsValue+'</b><small>Gestiones recientes</small></span></div></div>';
  var errors=[];
  if(state.notesError)errors.push('Notas: '+state.notesError);
  if(state.logsError)errors.push('Bitácora: '+state.logsError);
  if(errors.length)dash.insertAdjacentHTML('beforeend','<div class="dash-space-error"><i data-lucide="circle-alert"></i><span><b>No se pudo consultar parte de la información</b><small>'+esc(errors.join(' · '))+'</small></span><button type="button" onclick="cambiarModulo(\'espacio\')">Revisar</button></div>');
 }
 icons();
}
function renderNotes(){
 var box=$("rrhh-notas-lista");if(!box)return;
 var search=state.search.trim().toLowerCase();
 var items=state.notes.filter(function(n){if(state.filter==="TODAS")return true;if(state.filter==="COMPARTIDAS")return n.visibilidad==="COMPARTIDA";if(state.filter==="RESUELTAS")return n.estado==="RESUELTA";if(state.filter==="ARCHIVADAS")return n.estado==="ARCHIVADA";return n.estado==="ACTIVA";});
 if(search)items=items.filter(function(n){return (n.titulo+" "+n.contenido+" "+n.categoria+" "+n.created_by_email).toLowerCase().includes(search);});
 items.sort(function(a,b){return Number(b.fijada)-Number(a.fijada)||new Date(b.updated_at||b.created_at)-new Date(a.updated_at||a.created_at);});
 var count=$("rrhh-notas-count");if(count)count.textContent=items.length+" "+(items.length===1?"nota":"notas");
 if(!items.length){box.innerHTML='<div class="space-empty-state"><span><i data-lucide="notebook-pen"></i></span><h4>Tu tablero está despejado</h4><p>Crea una nota rápida para recordar una gestión, una llamada pendiente o algo que necesites retomar.</p><button type="button" onclick="document.getElementById(\'rrhh-nota-titulo\').focus()">Crear la primera nota</button></div>';icons();return;}
 box.innerHTML=items.map(function(n){
  var shared=n.visibilidad==="COMPARTIDA",color=colors.indexOf(n.color)>=0?n.color:"amarillo",creator=n.created_by_email?n.created_by_email.split("@")[0]:"Equipo RR. HH.";
  var status=n.estado==="RESUELTA"?'<span class="space-status space-status-done">Resuelta</span>':n.estado==="ARCHIVADA"?'<span class="space-status">Archivada</span>':n.vence_en&&new Date(n.vence_en)<new Date()?'<span class="space-status space-status-late">Vencida</span>':'<span class="space-status space-status-open">Activa</span>';
  var puedeGestionarNota=n.user_id===state.userId||!!(window.esAdminPrincipalActual&&window.esAdminPrincipalActual());
  var actions=puedeGestionarNota?(n.estado==="ACTIVA"?'<button type="button" class="space-note-action" title="'+(n.fijada?"Desfijar nota":"Fijar nota")+'" onclick="alternarFijadoNotaRRHH(\''+n.id+'\','+(!n.fijada)+')"><i data-lucide="'+(n.fijada?"pin-off":"pin")+'"></i></button><button type="button" class="space-note-action" title="Marcar resuelta" onclick="cambiarEstadoNotaRRHH(\''+n.id+'\',\'RESUELTA\')"><i data-lucide="check"></i></button><button type="button" class="space-note-action" title="Archivar" onclick="cambiarEstadoNotaRRHH(\''+n.id+'\',\'ARCHIVADA\')"><i data-lucide="archive"></i></button>':'<button type="button" class="space-note-action" title="Reactivar" onclick="cambiarEstadoNotaRRHH(\''+n.id+'\',\'ACTIVA\')"><i data-lucide="rotate-ccw"></i></button>'):'<span class="space-readonly-note" title="Solo el creador o el administrador pueden modificarla"><i data-lucide="lock-keyhole"></i></span>';
  var deleteAction=puedeGestionarNota?'<button type="button" class="space-note-action space-note-delete" title="Eliminar nota" onclick="eliminarNotaRRHH(\''+n.id+'\')"><i data-lucide="trash"></i></button>':'';

  var editAction=puedeGestionarNota?'<button type="button" class="space-note-action" title="Editar nota" onclick="editarNotaRRHH(\''+n.id+'\')"><i data-lucide="pencil-line"></i></button>':'';
  return '<article class="space-note space-note-'+color+' '+(n.fijada?"is-pinned ":"")+(n.estado!=="ACTIVA"?"is-muted":"")+'"><div class="space-note-top"><span class="space-note-category">'+esc(n.categoria||"General")+'</span><div class="space-note-actions">'+editAction+actions+deleteAction+'</div></div><h4>'+esc(n.titulo)+'</h4><p class="space-note-content">'+(esc(n.contenido).replace(/\n/g,"<br>")||'<span class="space-note-placeholder">Sin descripción adicional.</span>')+'</p><div class="space-note-foot"><span class="space-note-owner"><i data-lucide="'+(shared?"users":"lock-keyhole")+'"></i>'+(shared?"Compartida":"Personal")+' · '+esc(creator)+'</span>'+(n.vence_en?'<span class="space-note-due '+(new Date(n.vence_en)<new Date()&&n.estado==="ACTIVA"?"is-late":"")+'"><i data-lucide="calendar-clock"></i>'+esc(fmtDate(n.vence_en))+'</span>':"")+'</div><div class="space-note-bottom">'+status+'<small>Actualizada '+esc(fmtDate(n.updated_at||n.created_at))+'</small></div></article>';
 }).join("");
 icons();
}
function renderLogs(){
 var box=$("rrhh-bitacora-lista");if(!box)return;
 var search=state.logSearch.trim().toLowerCase();
 var items=state.logs.slice().filter(function(l){return !search||(l.titulo+" "+l.detalle+" "+l.categoria+" "+l.modulo+" "+l.sucursal+" "+l.created_by_email).toLowerCase().includes(search);});
 var count=$("rrhh-bitacora-count");if(count)count.textContent=items.length+" "+(items.length===1?"registro":"registros");
 if(!items.length){box.innerHTML='<div class="space-empty-state"><span><i data-lucide="clock-arrow-down"></i></span><h4>La bitácora comienza contigo</h4><p>Registra una gestión, incidencia o decisión y tendrás el historial ordenado por fecha.</p></div>';icons();return;}
 var tone={"Gestión":"#0f9f92","Incidencia":"#e66c55","Seguimiento":"#7c6ee6","Decisión":"#c28b26","Reunión":"#3478d4","Cobertura":"#cf5a7e","Asistencia":"#0c9aaf","Licencias":"#8b70c9","Otro":"#7c8b9b"};
 box.innerHTML='<div class="space-timeline">'+items.map(function(l){
  var mod=(modules.find(function(m){return m[0]===l.modulo;})||[l.modulo,l.modulo])[1];
  var day=new Intl.DateTimeFormat("es-CL",{day:"2-digit",month:"short",timeZone:"America/Santiago"}).format(new Date(l.ocurrio_en));
  return '<article class="space-timeline-entry"><span class="space-timeline-dot" style="--timeline-tone:'+(tone[l.categoria]||"#0f9f92")+'"></span><div class="space-timeline-date"><b>'+esc(day)+'</b><small>'+esc(fmtClock(l.ocurrio_en))+'</small></div><div class="space-timeline-main"><div class="space-timeline-head"><span class="space-log-category">'+esc(l.categoria)+'</span><span class="space-log-module">'+esc(mod)+'</span><span class="space-status">'+(l.visibilidad==="COMPARTIDA"?"Equipo":"Personal")+'</span></div><h4>'+esc(l.titulo)+'</h4><p>'+esc(l.detalle).replace(/\n/g,"<br>")+'</p><div class="space-timeline-meta"><span><i data-lucide="user-round"></i>'+esc(l.created_by_email||"Equipo RR. HH.")+'</span>'+(l.sucursal?'<span><i data-lucide="map-pin"></i>'+esc(l.sucursal)+'</span>':"")+'</div></div></article>';
 }).join("")+'</div>';icons();
}
async function cargarEspacioTrabajo(){
 var box=$("rrhh-notas-lista"),logBox=$("rrhh-bitacora-lista");if(!box)return;
 box.innerHTML='<div class="space-loading"><span class="space-loader-ring"></span><p>Organizando tu espacio de trabajo…</p></div>';
 try{
  var ss=await userSession();
  var res=await Promise.all([
   ss.client.from("rrhh_notas").select("*").order("fijada",{ascending:false}).order("updated_at",{ascending:false}).limit(250),
   ss.client.from("rrhh_bitacora").select("*").order("ocurrio_en",{ascending:false}).limit(350)
  ]);
  state.userId=ss.user.id;
  state.notesError=res[0].error?String(res[0].error.message||res[0].error):null;
  state.logsError=res[1].error?String(res[1].error.message||res[1].error):null;
  state.notes=res[0].error?[]:(res[0].data||[]);
  state.logs=res[1].error?[]:(res[1].data||[]);
  metrics();
  if(state.notesError)box.innerHTML='<div class="space-error"><i data-lucide="cloud-off"></i><div><b>No se pudieron cargar las notas</b><p>'+esc(state.notesError)+'</p><small>Los contadores se marcan como Error hasta resolver el acceso a Supabase.</small></div><button type="button" onclick="cargarEspacioTrabajo()">Reintentar</button></div>';
  else renderNotes();
  if(logBox){
   if(state.logsError)logBox.innerHTML='<div class="space-error"><i data-lucide="cloud-off"></i><div><b>No se pudo cargar la bitácora</b><p>'+esc(state.logsError)+'</p></div><button type="button" onclick="cargarEspacioTrabajo()">Reintentar</button></div>';
   else renderLogs();
  }
  if(state.notesError||state.logsError)toast('Mi espacio se cargó parcialmente. Revisa los avisos de conexión y permisos.','warning',9000);
 }catch(e){
  state.notesError=String(e.message||e);state.logsError=String(e.message||e);state.notes=[];state.logs=[];
  metrics();
  box.innerHTML='<div class="space-error"><i data-lucide="cloud-off"></i><div><b>No se pudo cargar el espacio</b><p>'+esc(e.message||"Error de conexión")+'</p><small>Comprueba tu sesión y permisos de acceso en Supabase.</small></div><button type="button" onclick="cargarEspacioTrabajo()">Reintentar</button></div>';
  if(logBox)logBox.innerHTML='<div class="space-error"><i data-lucide="cloud-off"></i><div><b>Bitácora no disponible</b><p>Revisa la conexión y vuelve a intentar.</p></div></div>';
  toast("No se pudo cargar Mi espacio: "+(e.message||"Error de conexión"),"error");icons();
 }
}
async function cargarResumenEspacioDashboard(){
 var dash=$("dashboard-space-summary");if(!dash)return;
 var canAccess=!!(window.esAdminPrincipalActual&&window.esAdminPrincipalActual())||!!(window.tienePermisoModulo&&(window.tienePermisoModulo("espacio")||window.tienePermisoModulo("tareas")));
 if(!canAccess){dash.classList.add("hidden");return;}
 dash.classList.remove("hidden");
 try{
  var ss=await userSession();
  var res=await Promise.all([
   ss.client.from("rrhh_notas").select("id,fijada,estado,vence_en,visibilidad"),
   ss.client.from("rrhh_bitacora").select("id,ocurrio_en")
  ]);
  state.userId=ss.user.id;
  state.notesError=res[0].error?String(res[0].error.message||res[0].error):null;
  state.logsError=res[1].error?String(res[1].error.message||res[1].error):null;
  state.notes=res[0].error?[]:(res[0].data||[]);
  state.logs=res[1].error?[]:(res[1].data||[]);
  metrics();
 }catch(e){
  state.notesError=String(e.message||e);state.logsError=String(e.message||e);
  state.notes=[];state.logs=[];metrics();
 }
}
async function guardarNotaRRHH(event){
 event.preventDefault();var form=event.currentTarget,title=$("rrhh-nota-titulo").value.trim(),content=$("rrhh-nota-contenido").value.trim();
 if(!title)return toast("Escribe un título para la nota.","warning");
 try{var s=await userSession(),vis=$("rrhh-nota-visibilidad").value==="COMPARTIDA"?"COMPARTIDA":"PERSONAL",due=$("rrhh-nota-vence").value,row={user_id:s.user.id,created_by_email:s.user.email||"",titulo:title,contenido:content,categoria:categories.indexOf($("rrhh-nota-categoria").value)>=0? $("rrhh-nota-categoria").value:"General",color:colors.indexOf($("rrhh-nota-color").value)>=0? $("rrhh-nota-color").value:"amarillo",fijada:$("rrhh-nota-fijada").checked,visibilidad:vis,estado:"ACTIVA",vence_en:due?new Date(due).toISOString():null,updated_at:new Date().toISOString()};var out=await s.client.from("rrhh_notas").insert([row]);if(out.error)throw out.error;form.reset();$("rrhh-nota-color").value="amarillo";$("rrhh-nota-visibilidad").value="PERSONAL";await cargarEspacioTrabajo();await cargarResumenEspacioDashboard();toast("Nota guardada en la nube.","success");await registrarEvento("NOTA_CREADA",title);}
 catch(e){toast("No se pudo guardar la nota: "+(e.message||"Error"),"error");}
}
function editarNotaRRHH(id){
 var n=state.notes.find(function(x){return x.id===id;});if(!n)return;
 var canManage=n.user_id===state.userId||!!(window.esAdminPrincipalActual&&window.esAdminPrincipalActual());
 if(!canManage)return toast("Solo el creador o el administrador pueden modificar esta nota.","warning");
 $("rrhh-edit-nota-id").value=n.id;$("rrhh-edit-nota-titulo").value=n.titulo||"";$("rrhh-edit-nota-contenido").value=n.contenido||"";
 $("rrhh-edit-nota-categoria").value=categories.indexOf(n.categoria)>=0?n.categoria:"General";
 $("rrhh-edit-nota-color").value=colors.indexOf(n.color)>=0?n.color:"amarillo";
 $("rrhh-edit-nota-vence").value=n.vence_en?localInput(n.vence_en):"";
 $("rrhh-edit-nota-visibilidad").value=n.visibilidad==="COMPARTIDA"?"COMPARTIDA":"PERSONAL";
 $("rrhh-edit-nota-fijada").checked=!!n.fijada;
 var modal=$("rrhh-modal-editar-nota");modal.classList.remove("hidden");$("rrhh-edit-nota-titulo").focus();icons();
}
function cerrarEdicionNotaRRHH(){var modal=$("rrhh-modal-editar-nota");if(modal)modal.classList.add("hidden");}
async function guardarEdicionNotaRRHH(event){
 event.preventDefault();var id=$("rrhh-edit-nota-id").value,n=state.notes.find(function(x){return x.id===id;});
 if(!n)return cerrarEdicionNotaRRHH();
 if(!(n.user_id===state.userId||!!(window.esAdminPrincipalActual&&window.esAdminPrincipalActual())))return toast("No tienes permiso para editar esta nota.","warning");
 var title=$("rrhh-edit-nota-titulo").value.trim();if(!title)return toast("El título no puede quedar vacío.","warning");
 var due=$("rrhh-edit-nota-vence").value;
 var payload={titulo:title,contenido:$("rrhh-edit-nota-contenido").value.trim(),categoria:categories.indexOf($("rrhh-edit-nota-categoria").value)>=0? $("rrhh-edit-nota-categoria").value:"General",color:colors.indexOf($("rrhh-edit-nota-color").value)>=0? $("rrhh-edit-nota-color").value:"amarillo",vence_en:due?new Date(due).toISOString():null,visibilidad:$("rrhh-edit-nota-visibilidad").value==="COMPARTIDA"?"COMPARTIDA":"PERSONAL",fijada:$("rrhh-edit-nota-fijada").checked,updated_at:new Date().toISOString()};
 try{var ss=await userSession(),r=await ss.client.from("rrhh_notas").update(payload).eq("id",id);if(r.error)throw r.error;cerrarEdicionNotaRRHH();await cargarEspacioTrabajo();await cargarResumenEspacioDashboard();toast("Nota actualizada en la nube.","success");await registrarEvento("NOTA_EDITADA",title);}
 catch(e){toast("No se pudo editar la nota: "+(e.message||"Error"),"error");}
}
async function actualizarNota(id,payload,message){
 try{var s=await userSession(),r=await s.client.from("rrhh_notas").update(Object.assign({},payload,{updated_at:new Date().toISOString()})).eq("id",id);if(r.error)throw r.error;await cargarEspacioTrabajo();await cargarResumenEspacioDashboard();toast(message,"success");}
 catch(e){toast("No se pudo actualizar la nota: "+(e.message||"Error"),"error");}
}
function alternarFijadoNotaRRHH(id,pinned){return actualizarNota(id,{fijada:!!pinned},pinned?"Nota fijada.":"Nota desfijada.");}
function cambiarEstadoNotaRRHH(id,status){if(["ACTIVA","RESUELTA","ARCHIVADA"].indexOf(status)<0)return;return actualizarNota(id,{estado:status},status==="RESUELTA"?"Nota resuelta.":status==="ARCHIVADA"?"Nota archivada.":"Nota reactivada.");}
async function eliminarNotaRRHH(id){
 var n=state.notes.find(function(x){return x.id===id;});if(!n||!window.confirm('¿Eliminar la nota "'+n.titulo+'"? Esta acción no se puede deshacer.'))return;
 try{var s=await userSession(),r=await s.client.from("rrhh_notas").delete().eq("id",id);if(r.error)throw r.error;await cargarEspacioTrabajo();await cargarResumenEspacioDashboard();toast("Nota eliminada.","success");}
 catch(e){toast("No se pudo eliminar la nota: "+(e.message||"Error"),"error");}
}
async function guardarRegistroBitacoraRRHH(event){
 event.preventDefault();var form=event.currentTarget,title=$("rrhh-log-titulo").value.trim(),detail=$("rrhh-log-detalle").value.trim();
 if(!title||!detail)return toast("Completa el título y el detalle de la gestión.","warning");
 try{var s=await userSession(),occurred=$("rrhh-log-fecha").value,row={user_id:s.user.id,created_by_email:s.user.email||"",titulo:title,detalle:detail,categoria:logCategories.indexOf($("rrhh-log-categoria").value)>=0? $("rrhh-log-categoria").value:"Gestión",modulo:modules.some(function(m){return m[0]===$("rrhh-log-modulo").value;})? $("rrhh-log-modulo").value:"general",sucursal:$("rrhh-log-sucursal").value.trim(),ocurrio_en:occurred?new Date(occurred).toISOString():new Date().toISOString(),visibilidad:$("rrhh-log-visibilidad").value==="COMPARTIDA"?"COMPARTIDA":"PERSONAL"};var out=await s.client.from("rrhh_bitacora").insert([row]);if(out.error)throw out.error;form.reset();$("rrhh-log-fecha").value=localInput();$("rrhh-log-visibilidad").value="PERSONAL";await cargarEspacioTrabajo();await cargarResumenEspacioDashboard();toast("Gestión registrada en la bitácora.","success");await registrarEvento("BITACORA_CREADA",title);}
 catch(e){toast("No se pudo registrar la gestión: "+(e.message||"Error"),"error");}
}
async function registrarEvento(action,detail){try{var s=await userSession();await s.client.from("auditoria_eventos").insert([{usuario_email:s.user.email||"",modulo:"espacio",accion:action,detalle:detail}]);}catch(e){}}
function setTab(tab){state.tab=tab==="bitacora"?"bitacora":"notas";document.querySelectorAll("[data-space-tab]").forEach(function(b){var active=b.dataset.spaceTab===state.tab;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});$("rrhh-space-panel-notas").classList.toggle("hidden",state.tab!=="notas");$("rrhh-space-panel-bitacora").classList.toggle("hidden",state.tab!=="bitacora");}
function setFilter(v){state.filter=["TODAS","COMPARTIDAS","RESUELTAS","ARCHIVADAS"].indexOf(v)>=0?v:"ACTIVAS";document.querySelectorAll("[data-note-filter]").forEach(function(b){b.classList.toggle("is-active",b.dataset.noteFilter===state.filter);});renderNotes();}
document.addEventListener("DOMContentLoaded",function(){
 var date=$("rrhh-log-fecha");if(date&&!date.value)date.value=localInput();
 document.querySelectorAll("[data-space-tab]").forEach(function(b){b.addEventListener("click",function(){setTab(b.dataset.spaceTab);});});
 document.querySelectorAll("[data-note-filter]").forEach(function(b){b.addEventListener("click",function(){setFilter(b.dataset.noteFilter);});});
 $("rrhh-nota-buscar")&&$("rrhh-nota-buscar").addEventListener("input",function(e){state.search=e.target.value;renderNotes();});
 $("rrhh-bitacora-buscar")&&$("rrhh-bitacora-buscar").addEventListener("input",function(e){state.logSearch=e.target.value;renderLogs();});
 setTab("notas");
});
window.cargarEspacioTrabajo=cargarEspacioTrabajo;
window.cargarResumenEspacioDashboard=cargarResumenEspacioDashboard;
window.guardarNotaRRHH=guardarNotaRRHH;
window.editarNotaRRHH=editarNotaRRHH;
window.cerrarEdicionNotaRRHH=cerrarEdicionNotaRRHH;
window.guardarEdicionNotaRRHH=guardarEdicionNotaRRHH;
window.guardarRegistroBitacoraRRHH=guardarRegistroBitacoraRRHH;
window.alternarFijadoNotaRRHH=alternarFijadoNotaRRHH;
window.cambiarEstadoNotaRRHH=cambiarEstadoNotaRRHH;
window.eliminarNotaRRHH=eliminarNotaRRHH;
})();