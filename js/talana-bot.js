(() => {
  "use strict";
  const FN = "talana-bot-control";
  const el = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
  const labels = {queued:"En cola",running:"Ejecutando",success:"Correcto",partial:"Parcial",failed:"Fallido"};
  const dateTime = value => {
    if (!value) return "Fecha no disponible";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return date.toLocaleString("es-CL",{timeZone:"America/Santiago",dateStyle:"medium",timeStyle:"short"});
  };
  const formatDuration = run => {
    if (!run?.started_at || !run?.finished_at) return run?.status==="running" ? "En curso" : "Sin duración";
    const seconds = Math.max(0,Math.round((new Date(run.finished_at)-new Date(run.started_at))/1000));
    if (!Number.isFinite(seconds)) return "Sin duración";
    if (seconds < 60) return seconds+" s";
    const minutes=Math.floor(seconds/60),rest=seconds%60;
    return minutes+" min"+(rest?" "+rest+" s":"");
  };
  function toast(message,type="info"){
    if (typeof window.mostrarToast==="function") window.mostrarToast(message,type,8000);
    else window.alert(message);
  }
  async function call(action, extra = {}) {
    if (typeof _supabase === "undefined" || !_supabase?.functions) throw new Error("No se encuentra el cliente de Supabase.");
    const {data,error}=await _supabase.functions.invoke(FN,{body:{action,...extra}});
    if(error){
      let detail="";
      try {
        const response=error.context?.clone?error.context.clone():error.context;
        if(response?.json){const body=await response.json();detail=body?.error||body?.message||"";}
      } catch (_) {}
      throw new Error(detail||error.message||"No se pudo conectar con la función de Supabase.");
    }
    if(data?.error) throw new Error(data.error);
    return data;
  }
  function statusLabel(status){return labels[status]||status||"Sin estado";}
  function statusTone(status){
    if(status==="success")return "text-emerald-700";
    if(status==="partial"||status==="failed")return "text-rose-700";
    if(status==="running")return "text-blue-700";
    return "text-amber-700";
  }
  function renderHealth(runs,files){
    const host=el("talana-bot-health");
    if(!host)return;
    host.replaceChildren();
    const last=runs[0]||null;
    let consecutiveFailures=0;
    for(const run of runs){
      if(["failed","partial"].includes(String(run.status||"").toLowerCase()))consecutiveFailures++;
      else break;
    }
    const lastRunFiles=last?files.filter(file=>String(file.run_id||"")===String(last.id||"")):[];
    const reportTypes=new Set(lastRunFiles.map(file=>String(file.report_type||"").trim()).filter(Boolean));
    const metrics=[
      {label:"Última ejecución",value:last?statusLabel(last.status):"Sin ejecuciones",detail:last?dateTime(last.started_at):"Todavía no hay historial",tone:last?statusTone(last.status):"text-slate-500"},
      {label:"Reportes descargados / importados",value:last?(Number(last.reports_downloaded||0)+" / "+Number(last.reports_uploaded||0)):"—",detail:last?"Datos registrados en la última ejecución":"Se mostrará al ejecutar el bot",tone:last&&["failed","partial"].includes(last.status)?"text-rose-700":"text-slate-900"},
      {label:"Archivos de la última ejecución",value:last?String(lastRunFiles.length):"—",detail:last?(reportTypes.size+" tipo(s) de reporte recibidos"):"Sin archivos vinculados a una ejecución",tone:"text-slate-900"},
      {label:"Fallos parciales / consecutivos",value:String(consecutiveFailures),detail:consecutiveFailures?"El historial empieza con ejecuciones fallidas o parciales.":"No hay fallos consecutivos al inicio del historial.",tone:consecutiveFailures?"text-rose-700":"text-emerald-700"}
    ];
    metrics.forEach(metric=>{
      const card=document.createElement("div");
      card.className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
      const small=document.createElement("div");
      small.className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500";
      small.textContent=metric.label;
      const strong=document.createElement("div");
      strong.className="mt-2 break-words text-xl font-black "+metric.tone;
      strong.textContent=metric.value;
      const detail=document.createElement("p");
      detail.className="mt-1 break-words text-[11px] leading-5 text-slate-500";
      detail.textContent=metric.detail;
      card.append(small,strong,detail);host.append(card);
    });
    if(last?.error_summary){
      const error=document.createElement("div");
      error.className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800";
      const title=document.createElement("b");title.className="block mb-1";title.textContent="Último error registrado";
      const detail=document.createElement("p");detail.className="m-0 whitespace-pre-wrap break-words";detail.textContent=String(last.error_summary);
      error.append(title,detail);host.append(error);
    }
  }
  function setStatus(message,state){
    const node=el("talana-bot-status");
    if(!node)return;
    node.textContent=message;
    node.dataset.state=state||"info";
    node.className="mt-3 text-sm "+(state==="error"?"text-rose-700":state==="ok"?"text-emerald-700":"text-slate-600");
  }
  async function cargarPanelBotTalana(){
    const box=el("talana-bot-panel");
    if(!box)return;
    if(window.cargarActualizacionesFuentes)window.cargarActualizacionesFuentes().catch(()=>{});
    if(typeof esAdminPrincipalActual==="function"&&!esAdminPrincipalActual()){
      box.classList.add("hidden");return;
    }
    box.classList.remove("hidden");
    const status=el("talana-bot-status"),runsHost=el("talana-bot-runs"),filesHost=el("talana-bot-files");
    setStatus("Consultando estado y últimos reportes…","info");
    if(runsHost)runsHost.textContent="Consultando historial…";
    if(filesHost)filesHost.textContent="Consultando archivos…";
    try{
      const data=await call("admin_get");
      const config=data.config||{},runs=Array.isArray(data.runs)?data.runs:[],files=Array.isArray(data.files)?data.files:[];
      if(el("talana-bot-enabled"))el("talana-bot-enabled").checked=!!config.enabled;
      if(el("talana-bot-interval"))el("talana-bot-interval").value="60";
      if(el("talana-bot-mode"))el("talana-bot-mode").value=config.run_mode||"both";
      setStatus(
        (config.enabled?"Automatización habilitada":"Automatización pausada")+" · cada "+Number(config.interval_minutes||60)+" minutos · "+(config.updated_at?"configurada "+dateTime(config.updated_at):"configuración sin fecha"),
        "ok"
      );
      renderHealth(runs,files);
      if(runsHost){
        runsHost.innerHTML=runs.map(run=>{
          return '<div class="border-b py-3">'+
            '<div class="flex flex-wrap items-center justify-between gap-2"><b class="'+statusTone(run.status)+'">'+escapeHtml(statusLabel(run.status))+'</b><span class="text-[10px] text-slate-400">'+escapeHtml(formatDuration(run))+'</span></div>'+
            '<div class="mt-1 text-xs text-slate-500">'+escapeHtml(run.trigger_type==="manual"?"Manual":"Automática")+' · '+escapeHtml(dateTime(run.started_at))+' · Descargados '+escapeHtml(Number(run.reports_downloaded||0))+' / importados '+escapeHtml(Number(run.reports_uploaded||0))+'</div>'+
            (run.error_summary?'<div class="mt-1 whitespace-pre-wrap break-words text-xs text-rose-700">'+escapeHtml(run.error_summary)+'</div>':'')+
            '</div>';
        }).join("")||'<p class="py-3 text-sm text-slate-500">Sin ejecuciones todavía. Antes de activar la programación, completa una prueba manual autorizada.</p>';
      }
      if(filesHost){
        filesHost.innerHTML=files.map(file=>
          '<div class="flex flex-wrap items-center justify-between gap-2 border-b py-3"><div class="min-w-0"><b class="block break-all text-sm">'+escapeHtml(file.file_name)+'</b><div class="text-xs text-slate-500">'+escapeHtml(file.report_type)+' · '+escapeHtml((Number(file.size_bytes||0)/1024).toFixed(1))+' KB<br><span class="mt-1 block">Subido: '+escapeHtml(dateTime(file.uploaded_at))+'</span></div></div><button type="button" class="corp-button" data-file="'+escapeHtml(file.id)+'">Descargar</button></div>'
        ).join("")||'<p class="py-3 text-sm text-slate-500">Sin archivos subidos.</p>';
        filesHost.querySelectorAll("[data-file]").forEach(button=>button.addEventListener("click",async()=>{
          button.disabled=true;
          try{
            const result=await call("admin_download",{file_id:button.dataset.file});
            if(!result.url)throw new Error("Supabase no devolvió un enlace temporal de descarga.");
            const link=document.createElement("a");
            link.href=result.url;link.target="_blank";link.rel="noopener noreferrer";link.download=result.file_name||"reporte";
            document.body.append(link);link.click();link.remove();
          }catch(error){toast(error.message||"No se pudo descargar el archivo.","error");}
          finally{button.disabled=false;}
        }));
      }
    }catch(error){
      setStatus("No disponible: "+(error.message||"No se pudo consultar el estado del bot."),"error");
      if(runsHost)runsHost.innerHTML='<p class="text-sm text-rose-700">No se pudo cargar el historial. Revisa la sesión y la función de Supabase.</p>';
      if(filesHost)filesHost.innerHTML='<p class="text-sm text-rose-700">No se pudieron consultar los reportes privados.</p>';
      renderHealth([],[]);
      const host=el("talana-bot-health");
      if(host){const warning=document.createElement("p");warning.className="col-span-full text-xs text-rose-700";warning.textContent=error.message||"No se pudo consultar el estado del bot.";host.append(warning);}
    }
  }
  async function save(){
    const button=el("talana-bot-save");if(!button)return;
    button.disabled=true;
    try{
      await call("admin_update",{enabled:!!el("talana-bot-enabled")?.checked,interval_minutes:Number(el("talana-bot-interval")?.value||60),run_mode:el("talana-bot-mode")?.value||"both"});
      await cargarPanelBotTalana();
      toast("Configuración del bot guardada.","success");
    }catch(error){setStatus("No se pudo guardar: "+(error.message||"Error desconocido"),"error");toast(error.message||"No se pudo guardar la configuración.","error");}
    finally{button.disabled=false;}
  }
  async function run(){
    const button=el("talana-bot-run");if(!button)return;
    if(typeof window.confirm==="function"&&!window.confirm("Se enviará una solicitud de ejecución manual a GitHub Actions. ¿Quieres continuar?"))return;
    button.disabled=true;
    setStatus("Enviando ejecución manual a GitHub Actions…","info");
    try{
      const result=await call("admin_manual_run");
      setStatus(result.message||"Ejecución manual enviada. Revisa el historial para confirmar su término.","ok");
      toast("Solicitud de ejecución enviada. La finalización se confirmará en el historial.","success");
      await cargarPanelBotTalana();
    }catch(error){
      setStatus("No se pudo iniciar la ejecución: "+(error.message||"Error desconocido"),"error");
      toast(error.message||"No se pudo iniciar el bot.","error");
    }finally{button.disabled=false;}
  }
  window.cargarPanelBotTalana=cargarPanelBotTalana;
  document.addEventListener("DOMContentLoaded",()=>{
    el("talana-bot-save")?.addEventListener("click",save);
    el("talana-bot-run")?.addEventListener("click",run);
    el("talana-bot-refresh")?.addEventListener("click",cargarPanelBotTalana);
  });
})();