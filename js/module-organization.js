(function(){
"use strict";
var groups={
 dashboard:"INICIO Y PRODUCTIVIDAD",espacio:"INICIO Y PRODUCTIVIDAD",tareas:"INICIO Y PRODUCTIVIDAD",
 colaboradores:"PERSONAS Y ESTRUCTURA",sucursales:"PERSONAS Y ESTRUCTURA",usuarios:"PERSONAS Y ESTRUCTURA",
 asistencia:"ASISTENCIA Y BENEFICIOS",licencias:"ASISTENCIA Y BENEFICIOS",vacaciones:"ASISTENCIA Y BENEFICIOS",papeletas:"ASISTENCIA Y BENEFICIOS",
 amonestaciones:"COBERTURAS Y COMUNICACIÓN",traslados:"COBERTURAS Y COMUNICACIÓN",correos:"COBERTURAS Y COMUNICACIÓN",configcorreos:"COBERTURAS Y COMUNICACIÓN",chat:"COBERTURAS Y COMUNICACIÓN",
 reportes:"ANÁLISIS Y CONTROL",mapas:"ANÁLISIS Y CONTROL",inteligencia:"ANÁLISIS Y CONTROL",analista_ia:"ANÁLISIS Y CONTROL",operaciones:"ANÁLISIS Y CONTROL",calidad:"ANÁLISIS Y CONTROL",notificaciones:"ANÁLISIS Y CONTROL",integraciones:"ANÁLISIS Y CONTROL",auditoria:"ANÁLISIS Y CONTROL"
};
var names={
 dashboard:"Dashboard",espacio:"Mi espacio de trabajo",colaboradores:"Colaboradores",sucursales:"Sucursales",usuarios:"Usuarios y roles",asistencia:"Asistencia y atrasos",licencias:"Licencias y ausentismo",vacaciones:"Vacaciones",papeletas:"Papeletas y permisos",amonestaciones:"Coberturas",traslados:"Traslados de personal",correos:"Borradores de correo",configcorreos:"Correos de sucursales",chat:"Chat interno",tareas:"Tareas diarias",reportes:"Reportes",mapas:"Mapa y distancias",inteligencia:"Centro de inteligencia de asistencia",analista_ia:"Analista de RR. HH. con IA",operaciones:"Centro de operaciones",calidad:"Calidad de datos",notificaciones:"Notificaciones",integraciones:"Integraciones y monitoreo",auditoria:"Bitácora y auditoría"
};
function visibleButton(el){return !!el&&!el.classList.contains("hidden")&&!el.classList.contains("permission-hidden-2026");}
function organizeGroups(){
 var nav=document.querySelector("#sidebar nav");if(!nav)return;
 nav.querySelectorAll("[data-nav-group]").forEach(function(group){
  var has=false,node=group.nextElementSibling;
  while(node&&!node.hasAttribute("data-nav-group")){
   if(node.matches&&node.matches("button.menu-btn")&&visibleButton(node)){has=true;break;}
   node=node.nextElementSibling;
  }
  group.classList.toggle("hidden",!has);
 });
 var quickNote=document.getElementById("topbar-quick-note");
 if(quickNote&&typeof window.tienePermisoModulo==="function")quickNote.classList.toggle("hidden",!window.tienePermisoModulo("espacio"));
}
function updateContext(key){
 var view=document.getElementById("view-"+key);if(!view)return;
 if(key==="espacio")return;
 var rail=view.querySelector(":scope > .module-context-rail");
 if(!rail){rail=document.createElement("div");rail.className="module-context-rail";rail.setAttribute("aria-label","Ubicación dentro de la plataforma");view.insertBefore(rail,view.firstChild);}
 var category=groups[key]||"RECURSOS HUMANOS";
 var title=names[key]||key;
 rail.innerHTML='<span class="module-context-dot"></span><span>'+category+'</span><span class="module-context-sep">/</span><span class="module-context-name">'+title+'</span>';
}
function decorateSections(){
 document.querySelectorAll("section[id^='view-']").forEach(function(view){
  var key=view.id.replace("view-","");
  if(key==="generic"||key==="espacio")return;
  if(!view.querySelector(":scope > .module-context-rail"))updateContext(key);
 });
 organizeGroups();
 if(window.lucide&&window.lucide.createIcons)window.lucide.createIcons();
}
window.actualizarContextoModulo=updateContext;
window.organizarNavegacionPermisos=organizeGroups;
document.addEventListener("DOMContentLoaded",function(){decorateSections();});
})();