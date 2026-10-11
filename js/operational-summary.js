(function(){
  "use strict";
  const ADMIN_EMAIL = "scoloma@farmaciasdoctorsimi.cl";
  const $ = id => document.getElementById(id);
  const fmtDate = value => {
    if (!value) return "Sin ejecución registrada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return date.toLocaleString("es-CL", {timeZone:"America/Santiago", dateStyle:"medium", timeStyle:"short"});
  };
  function client(){
    try { if (typeof _supabase !== "undefined" && _supabase && _supabase.auth) return _supabase; } catch (_) {}
    if (window._supabase && window._supabase.auth) return window._supabase;
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    return null;
  }
  function hasPermission(module){
    try { if (typeof esAdminPrincipalActual === "function" && esAdminPrincipalActual()) return true; } catch (_) {}
    try { if (typeof tienePermisoModulo === "function") return !!tienePermisoModulo(module); } catch (_) {}
    try { if (typeof window.tienePermisoModulo === "function") return !!window.tienePermisoModulo(module); } catch (_) {}
    return false;
  }
  function adminProfile(email){
    try { if (typeof esAdminPrincipalActual === "function" && esAdminPrincipalActual()) return true; } catch (_) {}
    return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
  }
  function statusText(status){
    return ({queued:"En cola",running:"Ejecutando",success:"Correcto",partial:"Parcial",failed:"Fallido"})[status] || status || "Sin estado";
  }
  function makeCard(item){
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ops-summary-tile" + (item.alert ? " is-alert" : "") + (item.unavailable ? " is-unavailable" : "");
    button.disabled = !item.module || item.unavailable;
    button.setAttribute("aria-label", item.label + ": " + String(item.value) + ". " + item.detail);
    const icon = document.createElement("span");
    icon.className = "ops-summary-icon";
    const glyph = document.createElement("i");
    glyph.setAttribute("data-lucide", item.icon);
    icon.append(glyph);
    const copy = document.createElement("span");
    copy.className = "ops-summary-copy";
    const label = document.createElement("small");
    label.textContent = item.label;
    const value = document.createElement("strong");
    value.textContent = String(item.value);
    const detail = document.createElement("span");
    detail.textContent = item.detail || "";
    copy.append(label, value, detail);
    const arrow = document.createElement("span");
    arrow.className = "ops-summary-arrow";
    const arrowIcon = document.createElement("i");
    arrowIcon.setAttribute("data-lucide", item.module ? "arrow-up-right" : "lock-keyhole");
    arrow.append(arrowIcon);
    button.append(icon, copy, arrow);
    if (item.module) button.addEventListener("click", function(){
      if (typeof window.cambiarModulo === "function") window.cambiarModulo(item.module);
      else if (typeof cambiarModulo === "function") cambiarModulo(item.module);
    });
    return button;
  }
  function render(items, note){
    const host = $("dashboard-ops-cards");
    const stamp = $("dashboard-ops-updated");
    if (!host) return;
    host.replaceChildren();
    items.forEach(item => host.append(makeCard(item)));
    if (stamp) stamp.textContent = note || ("Actualizado: " + fmtDate(new Date().toISOString()) + " · hora de Chile");
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }
  async function metric(label, icon, module, queryFactory, emptyDetail){
    if (!hasPermission(module)) return {label,icon,module:null,value:"—",detail:"Este módulo no está habilitado para tu perfil.",unavailable:true};
    try {
      const query = queryFactory();
      const result = await query;
      if (result.error) throw result.error;
      const value = Number(result.count ?? 0);
      return {label,icon,module,value:value.toLocaleString("es-CL"),detail:emptyDetail(value),alert:value>0};
    } catch (error) {
      return {label,icon,module,value:"No disponible",detail:String(error && error.message || "Revisa sesión o permisos de datos."),unavailable:true};
    }
  }
  let resumenOcupado = false, resumenPendiente = false;
  async function cargarResumenOperativoRRHH(){
    const host = $("dashboard-ops-cards");
    if (!host) return;
    if (resumenOcupado) { resumenPendiente = true; return; }
    resumenOcupado = true;
    const c = client();
    if (!c) {
      render([{label:"Estado operativo",icon:"cloud-off",module:null,value:"Sin conexión",detail:"No se encuentra el cliente de Supabase.",unavailable:true}],"No se pudo iniciar la consulta.");
      resumenOcupado = false;
      return;
    }
    host.innerHTML = '<div class="ops-summary-loading"><span class="space-loader-ring"></span><span>Consultando tareas, alertas y bot…</span></div>';
    try {
      const sessionResult = await c.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const user = sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
      if (!user) {
        render([{label:"Estado operativo",icon:"lock-keyhole",module:null,value:"Inicia sesión",detail:"Accede para consultar tus alertas autorizadas.",unavailable:true}],"Sesión no disponible.");
        return;
      }
      const now = new Date().toISOString();
      const [tasksOpen,tasksLate,coverage] = await Promise.all([
        metric("Tareas abiertas","list-checks","tareas",()=>c.from("tareas").select("id",{count:"exact",head:true}).in("estado",["PENDIENTE","EN_PROCESO","COMPLETADA_POR_VALIDAR","DEVUELTA"]),n=>n===0?"No hay tareas pendientes.":"Pendientes, en proceso o por validar."),
        metric("Tareas vencidas","clock-alert","tareas",()=>c.from("tareas").select("id",{count:"exact",head:true}).lt("fecha_limite",now).not("estado","in",'("APROBADA","CANCELADA")'),n=>n===0?"Sin vencimientos atrasados.":"Requieren seguimiento prioritario."),
        metric("Dotación por revisar","users-round","traslados",()=>c.from("solicitudes_dotacion").select("id",{count:"exact",head:true}).eq("estado","PENDIENTE"),n=>n===0?"No hay solicitudes pendientes.":"Solicitudes de sucursales pendientes de revisión.")
      ]);
      const [notifications,bot] = await Promise.all([
        (async function(){
          if (!hasPermission("notificaciones")) return {label:"Avisos sin leer",icon:"bell-ring",module:null,value:"—",detail:"Notificaciones no habilitadas para tu perfil.",unavailable:true};
          try {
            const profile = await c.from("usuarios_roles").select("id").eq("email",String(user.email||"").trim().toLowerCase()).maybeSingle();
            if (profile.error) throw profile.error;
            if (!profile.data) throw new Error("No se encontró el perfil activo del usuario.");
            const nr = await c.from("notificaciones").select("id",{count:"exact",head:true}).eq("usuario_rol_id",profile.data.id).eq("leida",false);
            if (nr.error) throw nr.error;
            const n = Number(nr.count || 0);
            return {label:"Avisos sin leer",icon:"bell-ring",module:"notificaciones",value:n.toLocaleString("es-CL"),detail:n===0?"Bandeja al día.":"Notificaciones pendientes de lectura.",alert:n>0};
          } catch (error) {
            return {label:"Avisos sin leer",icon:"bell-ring",module:"notificaciones",value:"No disponible",detail:String(error && error.message || "No se pudo consultar la bandeja."),unavailable:true};
          }
        })(),
        (async function(){
          if (!adminProfile(user.email)) return {label:"Bot Talana",icon:"workflow",module:null,value:"Restringido",detail:"Solo la administración principal puede consultar la ejecución del bot.",unavailable:true};
          try {
            const response = await c.functions.invoke("talana-bot-control",{body:{action:"admin_get"}});
            if (response.error) throw response.error;
            if (response.data && response.data.error) throw new Error(response.data.error);
            const runs = response.data && Array.isArray(response.data.runs) ? response.data.runs : [];
            const latest = runs[0];
            return latest
              ? {label:"Bot Talana",icon:"workflow",module:"integraciones",value:statusText(latest.status),detail:fmtDate(latest.started_at)+" · descargados "+Number(latest.reports_downloaded||0)+", cargados "+Number(latest.reports_uploaded||0),alert:["failed","partial"].includes(String(latest.status||"").toLowerCase()),unavailable:false}
              : {label:"Bot Talana",icon:"workflow",module:"integraciones",value:"Sin ejecuciones",detail:"No hay ejecuciones registradas en el historial.",unavailable:false};
          } catch (error) {
            return {label:"Bot Talana",icon:"workflow",module:"integraciones",value:"No disponible",detail:String(error && error.message || "No se pudo consultar el estado del bot."),unavailable:true};
          }
        })()
      ]);
      render([tasksOpen,tasksLate,coverage,notifications,bot]);
    } catch (error) {
      render([{label:"Estado operativo",icon:"cloud-off",module:null,value:"Error",detail:String(error && error.message || "No se pudo consultar Supabase."),unavailable:true}],"No se pudo actualizar el resumen.");
    } finally {
      resumenOcupado = false;
      if (resumenPendiente) {
        resumenPendiente = false;
        window.setTimeout(cargarResumenOperativoRRHH, 60);
      }
    }
  }
  window.cargarResumenOperativoRRHH = cargarResumenOperativoRRHH;
  document.addEventListener("DOMContentLoaded",function(){
    cargarResumenOperativoRRHH();
    const c=client();
    if(c && c.auth) {
      c.auth.onAuthStateChange(function(event,session){
        if(["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED"].includes(event) && session) window.setTimeout(cargarResumenOperativoRRHH,350);
        if(event==="SIGNED_OUT") render([{label:"Estado operativo",icon:"lock-keyhole",module:null,value:"Inicia sesión",detail:"Las alertas se consultan al iniciar sesión.",unavailable:true}],"Sesión cerrada.");
      });
    }
    document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")cargarResumenOperativoRRHH();});
  });
})();