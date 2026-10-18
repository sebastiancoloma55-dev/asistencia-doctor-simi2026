/* Enhancement visual basado en datos presentes en las tablas del módulo. No escribe ni modifica datos. */
(() => {
  'use strict';
  const targets = {
    sucursales: {labels:['Sucursales visibles','Activas','En revisión','Sin estado'],accent:['#0876ee','#12a875','#f59e0b','#9aaabd']},
    asistencia: {labels:['Registros visibles','Sin anomalía','Con atrasos','Otras alertas'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    licencias: {labels:['Registros visibles','Activas/vigentes','Pendientes','Cerradas/otras'],accent:['#0876ee','#12a875','#f59e0b','#9aaabd']},
    vacaciones: {labels:['Registros visibles','Aprobadas','Pendientes','Rechazadas/otras'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    envio_licencias: {labels:['Registros visibles','Enviadas','Pendientes','Con observaciones'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    amonestaciones: {labels:['Solicitudes visibles','Realizadas','En curso','Pendientes/otras'],accent:['#0876ee','#12a875','#14b8a6','#f59e0b']},
    traslados: {labels:['Solicitudes visibles','Finalizadas','En curso','Pendientes/otras'],accent:['#0876ee','#12a875','#14b8a6','#f59e0b']}
  };
  const clean = s => (s || '').replace(/\s+/g,' ').trim();
  const statusOf = row => clean(row.innerText || row.textContent).toLocaleLowerCase('es-CL');
  const getRows = section => {
    const table = section.querySelector('table');
    if (!table) return [];
    return [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length > 1 && !/sin registros|no hay datos|no se encontraron/i.test(statusOf(tr)));
  };
  function stats(rows) {
    const total=rows.length;
    let healthy=0,pending=0,alert=0,other=0;
    rows.forEach(row=>{
      const t=statusOf(row);
      if(/atraso|incompleta|sin marca|observaci[oó]n|rechazad|inactivo|error|alerta|incumpl|tempran/.test(t)) alert++;
      else if(/pendiente|en revisi[oó]n|en curso|por aprobar|por enviar|solicitad/.test(t)) pending++;
      else if(/activa|activo|vigente|aprobada|aprobado|realizada|finalizada|enviada|correcta|sin anomal[ií]a|ok/.test(t)) healthy++;
      else other++;
    });
    return [total,healthy,pending,alert || other];
  }
  function makeOverview(section, cfg) {
    const rows=getRows(section);
    if(!rows.length) return;
    let overview=section.querySelector(':scope > .ref-overview');
    if(!overview){
      overview=document.createElement('div');
      overview.className='ref-overview';
      overview.dataset.refGenerated='true';
      const cards=document.createElement('div'); cards.className='ref-kpis';
      const chart=document.createElement('div'); chart.className='ref-chart';
      chart.innerHTML='<div class="ref-chart-title">Distribución del registro</div><div class="ref-chart-subtitle">Cálculo sobre las filas visibles de la tabla actual</div><div class="ref-bars"></div>';
      overview.append(cards,chart);
      const firstTable=section.querySelector('table');
      const anchor=firstTable?.closest('.ui-card') || firstTable;
      if(anchor && anchor.parentElement) anchor.parentElement.insertBefore(overview,anchor);
      else section.appendChild(overview);
    }
    const cards=overview.querySelector('.ref-kpis');
    const chart=overview.querySelector('.ref-bars');
    const values=stats(rows);
    cards.innerHTML='';
    cfg.labels.forEach((label,i)=>{
      const card=document.createElement('article'); card.className='ref-kpi';
      card.style.setProperty('--ref-accent-strong',cfg.accent[i]||'#0876ee');
      card.style.setProperty('--ref-accent',(cfg.accent[i]||'#0876ee')+'30');
      card.innerHTML='<div class="ref-kpi-top"><span class="ref-kpi-dot"></span><span></span></div><div class="ref-kpi-value"></div><div class="ref-kpi-note">Según la tabla cargada</div>';
      card.querySelector('.ref-kpi-top span:last-child').textContent=label;
      card.querySelector('.ref-kpi-value').textContent=values[i].toLocaleString('es-CL');
      cards.appendChild(card);
    });
    chart.innerHTML='';
    const max=Math.max(1,...values.slice(1));
    ['Estado favorable','Pendiente / en curso','Alerta / otros'].forEach((label,i)=>{
      const count=values[i+1]||0;
      const row=document.createElement('div'); row.className='ref-bar-row';
      const name=document.createElement('span'); name.textContent=label;
      const track=document.createElement('div'); track.className='ref-bar-track';
      const fill=document.createElement('div'); fill.className='ref-bar-fill'; fill.style.width=(count/max*100)+'%'; fill.style.background=cfg.accent[i+1]||'#0876ee'; track.appendChild(fill);
      const n=document.createElement('span'); n.className='ref-bar-count'; n.textContent=count.toLocaleString('es-CL');
      row.append(name,track,n); chart.appendChild(row);
    });
  }
  function refresh(){
    Object.entries(targets).forEach(([id,cfg])=>{
      const section=document.getElementById('view-'+id);
      if(section && !section.classList.contains('hidden')) makeOverview(section,cfg);
      else if(section) {
        const rows=getRows(section);
        if(rows.length && section.querySelector('.ref-overview')) makeOverview(section,targets[id]);
      }
    });
  }
  function init(){
    refresh();
    const root=document.querySelector('main')||document.body;
    const observer=new MutationObserver(records=>{ if(records.every(record=>{const t=record.target;const el=t.nodeType===1?t:t.parentElement;return !!el?.closest('.ref-overview');})) return; if(!window.__simiRefEnhanceQueued){window.__simiRefEnhanceQueued=true;requestAnimationFrame(()=>{window.__simiRefEnhanceQueued=false;refresh();});}});
    observer.observe(root,{subtree:true,childList:true,characterData:true});
    document.addEventListener('click',e=>{if(e.target.closest('[onclick*="cambiarModulo"],.menu-btn,[data-module]'))setTimeout(refresh,80);},true);
    window.addEventListener('load',()=>setTimeout(refresh,400));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();