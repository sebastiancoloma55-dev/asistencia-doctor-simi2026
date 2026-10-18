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
    let overview=section.querySelector('.ref-overview');
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
  function enhanceUsers(){
    const section=document.getElementById('view-usuarios');
    if(!section || section.querySelector('.ref-user-wizard')) return;
    const formCard=section.querySelector('.ui-card.grid.grid-cols-1');
    if(!formCard) return;
    const wizard=document.createElement('div'); wizard.className='ref-user-wizard';
    wizard.innerHTML='<div class="ref-user-step is-done"><span>✓</span><div><b>Persona</b><small>Selecciona o crea el usuario</small></div></div><div class="ref-user-step is-active"><span>2</span><div><b>Rol y funciones</b><small>Define sus permisos</small></div></div><div class="ref-user-step"><span>3</span><div><b>Sucursales autorizadas</b><small>Indica el alcance</small></div></div><div class="ref-user-step"><span>4</span><div><b>Revisar y guardar</b><small>Confirma la configuración</small></div></div>';
    formCard.parentElement.insertBefore(wizard,formCard);
    const addHeading=(selector,text,groupSelector)=>{
      const el=formCard.querySelector(selector);
      const group=groupSelector?formCard.querySelector(groupSelector):(el?.parentElement);
      if(group && !group.previousElementSibling?.classList.contains('ref-user-section-title')){
        const h=document.createElement('div');h.className='ref-user-section-title';h.textContent=text;group.parentElement.insertBefore(h,group);
      }
    };
    addHeading('#usr-email','1. Selecciona la persona');
    addHeading('#usr-permisos','2. Elige los permisos incluidos en este perfil','.sm\\:col-span-3.space-y-3');
    addHeading('#usr-supervisores','3. Define el alcance por sucursal y supervisor','.sm\\:col-span-3.grid.grid-cols-1');
    addHeading('#usr-puede-asignar','4. Revisa las capacidades adicionales','.sm\\:col-span-3.grid.grid-cols-2');
    const select=section.querySelector('#usr-rol');
    if(select && !section.querySelector('.ref-role-cards')){
      const cards=document.createElement('div');cards.className='ref-role-cards';
      [...select.options].forEach((option,index)=>{
        if(!option.value) return;
        const b=document.createElement('button');b.type='button';b.className='ref-role-card';b.dataset.value=option.value;
        const icon=['♛','▦','⌂','◉'][index%4];
        const title=document.createElement('b');title.textContent=option.textContent;
        const desc=document.createElement('small');desc.textContent=['Acceso y administración según las políticas del sistema.','Gestión operativa de recursos humanos.','Carga y actualización de información autorizada.','Consulta de información sin operaciones sensibles.'][index%4];
        const mark=document.createElement('span');mark.className='ref-role-mark';mark.textContent=icon;
        b.append(mark,title,desc);
        b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));cards.querySelectorAll('.ref-role-card').forEach(x=>x.classList.toggle('selected',x===b));});
        cards.appendChild(b);
      });
      select.insertAdjacentElement('afterend',cards);
      const sync=()=>cards.querySelectorAll('.ref-role-card').forEach(x=>x.classList.toggle('selected',x.dataset.value===select.value));
      select.addEventListener('change',sync);sync();
    }
  }
  function enhancePapeletas(){
    const section=document.getElementById('view-papeletas');
    const form=section?.querySelector('#form-papeleta');
    if(!form || section.querySelector('.ref-papeleta-layout')) return;
    const layout=document.createElement('div');layout.className='ref-papeleta-layout';
    const preview=document.createElement('aside');preview.className='ref-papeleta-preview';
    preview.innerHTML='<div class="ref-paper"><div class="ref-paper-brand"><span class="ref-paper-logo">DS</span><span><b>FARMACIAS DOCTOR SIMI</b><small>RECURSOS HUMANOS</small></span></div><div class="ref-paper-line"></div><h4>PAPELETA DE PERMISO</h4><div class="ref-paper-row"><span>Colaborador</span><b data-pap-preview="nombre">Pendiente de seleccionar</b></div><div class="ref-paper-row"><span>RUT</span><b data-pap-preview="rut">—</b></div><div class="ref-paper-row"><span>Sucursal</span><b data-pap-preview="sucursal">—</b></div><div class="ref-paper-row"><span>Tipo de permiso</span><b data-pap-preview="tipo">—</b></div><div class="ref-paper-row"><span>Período</span><b data-pap-preview="periodo">—</b></div><div class="ref-paper-lines"><i></i><i></i><i></i></div><div class="ref-paper-signatures"><span>Firma colaborador</span><span>Recursos Humanos</span></div></div><div class="ref-pap-preview-note"><b>Vista previa del documento</b><span>Los campos se actualizan con los datos ingresados. El PDF oficial se genera desde el formulario.</span></div>';
    form.parentElement.insertBefore(layout,form);layout.append(form,preview);
    const read=id=>{const el=section.querySelector('#'+id);return el?(el.selectedOptions?.[0]?.textContent||el.value||'').trim():'—';};
    const update=()=>{
      const name=read('pap-nombre');const rut=read('pap-rut');const branch=read('pap-sucursal');const type=read('pap-tipo');
      const start=read('pap-inicio');const end=read('pap-fin');
      const values={nombre:name||read('pap-buscar')||'Pendiente de seleccionar',rut:rut||'—',sucursal:branch||'—',tipo:type||'—',periodo:(start&&start!=='—'?start:'—')+' a '+(end&&end!=='—'?end:'—')};
      Object.entries(values).forEach(([key,value])=>{const node=preview.querySelector('[data-pap-preview="'+key+'"]');if(node)node.textContent=value;});
    };
    form.addEventListener('input',update);form.addEventListener('change',update);update();
  }
  function enhanceSucursales(){
    const section=document.getElementById('view-sucursales');
    if(!section) return;
    let layout=section.querySelector('.ref-sucursal-layout');
    if(!layout){
      const overview=section.querySelector('.ref-overview');
      const table=section.querySelector('table');
      const tableCard=table?.closest('.ui-card');
      if(!overview||!tableCard||overview===tableCard) return;
      layout=document.createElement('div');layout.className='ref-sucursal-layout';
      const left=document.createElement('div');left.className='ref-sucursal-main';
      const side=document.createElement('aside');side.className='ref-sucursal-side';
      side.innerHTML='<section class="ref-chart"><div class="ref-chart-title">Ubicación de sucursales</div><div class="ref-chart-subtitle">Puntos basados en coordenadas registradas</div><div id="ref-sucursal-map" class="ref-sucursal-map"><span>Preparando mapa…</span></div><div id="ref-sucursal-map-note" class="ref-map-note">Los marcadores requieren coordenadas guardadas en el directorio.</div></section><section class="ref-chart"><div class="ref-chart-title">Distribución territorial</div><div class="ref-chart-subtitle">Conteo por región según los datos disponibles</div><div id="ref-sucursal-regions" class="ref-bars"><div class="ref-empty-chart">Consultando sucursales…</div></div></section>';
      const parent=overview.parentElement;
      parent.insertBefore(layout,overview);layout.append(left,side);left.append(overview,tableCard);
    }
    if(layout.dataset.loaded==='true') return;
    layout.dataset.loaded='true';
    const mapNode=section.querySelector('#ref-sucursal-map');
    const note=section.querySelector('#ref-sucursal-map-note');
    const regionsNode=section.querySelector('#ref-sucursal-regions');
    const draw=async()=>{
      if(typeof _supabase==='undefined'){if(note)note.textContent='El cliente de datos no está disponible en esta vista.';return;}
      try{
        const {data,error}=await _supabase.from('sucursales').select('id,nombre,direccion,comuna,region,latitud,longitud,geolocalizacion,activa').limit(1000);
        if(error) throw error;
        const rows=data||[];
        const grouped={};
        rows.forEach(x=>{const region=clean(x.region||x.comuna||'Sin región');grouped[region]=(grouped[region]||0)+1;});
        const sorted=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,6);
        if(regionsNode){
          regionsNode.innerHTML='';
          const max=Math.max(1,...sorted.map(x=>x[1]));
          sorted.forEach(([label,count])=>{
            const row=document.createElement('div');row.className='ref-bar-row';
            const name=document.createElement('span');name.textContent=label;
            const track=document.createElement('div');track.className='ref-bar-track';
            const fill=document.createElement('div');fill.className='ref-bar-fill';fill.style.width=(count/max*100)+'%';track.appendChild(fill);
            const n=document.createElement('span');n.className='ref-bar-count';n.textContent=count.toLocaleString('es-CL');
            row.append(name,track,n);regionsNode.appendChild(row);
          });
          if(!sorted.length)regionsNode.innerHTML='<div class="ref-empty-chart">No hay regiones disponibles en los registros.</div>';
        }
        const points=rows.map(x=>{
          let lat=Number(x.latitud),lon=Number(x.longitud);
          if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)){
            const raw=String(x.geolocalizacion||'').replace(/[()]/g,'');
            const m=raw.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
            if(m){lat=Number(m[1]);lon=Number(m[2]);}
          }
          return {x,lat,lon};
        }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&(p.lat!==0||p.lon!==0));
        if(typeof L==='undefined'||!mapNode){if(note)note.textContent='No fue posible inicializar el mapa en este navegador.';return;}
        mapNode.innerHTML='';
        const map=L.map(mapNode,{scrollWheelZoom:false,zoomControl:true}).setView([-33.45,-70.66],5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
        points.forEach(({x,lat,lon})=>L.circleMarker([lat,lon],{radius:5,color:'#0876ee',weight:2,fillColor:'#19a8a5',fillOpacity:.85}).addTo(map).bindPopup('<b>'+String(x.nombre||'Sucursal').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</b><br>'+String([x.direccion,x.comuna].filter(Boolean).join(', ')).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
        if(points.length)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[18,18],maxZoom:10});
        else map.setView([-33.45,-70.66],5);
        if(note)note.textContent=points.length+' sucursales con coordenadas válidas de '+rows.length+' registros consultados.';
        setTimeout(()=>map.invalidateSize(),120);
      }catch(e){if(note)note.textContent='No se pudo cargar el mapa o la distribución: '+(e?.message||'error de consulta');if(regionsNode)regionsNode.innerHTML='<div class="ref-empty-chart">No fue posible consultar la distribución.</div>';}
    };
    draw();
  }
  function refresh(){
    enhanceSucursales();
    enhanceUsers();
    enhancePapeletas();
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