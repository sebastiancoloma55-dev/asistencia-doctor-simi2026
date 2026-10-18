/* Enhancement visual basado en datos presentes en las tablas del módulo. No escribe ni modifica datos. */
(() => {
  'use strict';
  const targets = {
    sucursales: {labels:['Total de sucursales','Activas','Inactivas','Sin estado'],accent:['#0876ee','#12a875','#e44e63','#9aaabd']},
    asistencia: {labels:['Registros visibles','Sin anomalía','Con atrasos','Otras alertas'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    licencias: {labels:['Registros visibles','Activas/vigentes','Pendientes','Cerradas/otras'],accent:['#0876ee','#12a875','#f59e0b','#9aaabd']},
    vacaciones: {labels:['Registros visibles','Aprobadas','Pendientes','Rechazadas/otras'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    envio_licencias: {labels:['Registros visibles','Enviadas','Pendientes','Con observaciones'],accent:['#0876ee','#12a875','#f59e0b','#e44e63']},
    traslados: {labels:['Solicitudes visibles','Finalizadas','En curso','Pendientes/otras'],accent:['#0876ee','#12a875','#14b8a6','#f59e0b']}
  };
  const clean = s => (s || '').replace(/\s+/g,' ').trim();
  const statusOf = row => clean(row.innerText || row.textContent).toLocaleLowerCase('es-CL');
  const getRows = section => {
    const table = section.querySelector('table');
    if (!table) return [];
    return [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length > 1 && !/sin registros|no hay datos|no se encontraron/i.test(statusOf(tr)));
  };
  function stats(rows, headers=[]) {
    const total=rows.length;
    const statusIndex=headers.findIndex(x=>/estado|status|situaci[oó]n|resultado|vigencia/.test(x));
    let healthy=0,pending=0,alert=0,unknown=0;
    rows.forEach(row=>{
      const cells=[...row.querySelectorAll('td')];
      const t=clean(statusIndex>=0?cells[statusIndex]?.innerText:'').toLocaleLowerCase('es-CL');
      if(!t){unknown++;return;}
      if(/atraso|incompleta|sin marca|observaci[oó]n|rechazad|inactivo|error|alerta|incumpl|tempran|vencid|caducad/.test(t)) alert++;
      else if(/pendiente|en revisi[oó]n|en curso|por aprobar|por enviar|solicitad|borrador/.test(t)) pending++;
      else if(/activa|activo|vigente|aprobada|aprobado|realizada|finalizada|enviada|correcta|sin anomal[ií]a|resuelta|completad|autorizad|ok/.test(t)) healthy++;
      else unknown++;
    });
    return [total,healthy,pending,alert+unknown];
  }
  function makeOverview(section, cfg) {
    const isBranches=section.id==='view-sucursales';
    let overview=section.querySelector('.ref-overview');
    if(!overview){
      overview=document.createElement('div');
      overview.className='ref-overview';
      overview.dataset.refGenerated='true';
      const cards=document.createElement('div');cards.className='ref-kpis';
      overview.append(cards);
      if(!isBranches){
        const chart=document.createElement('div');chart.className='ref-chart';
        chart.innerHTML='<div class="ref-chart-title">Distribución del registro</div><div class="ref-chart-subtitle">Cálculo sobre las filas visibles de la tabla actual</div><div class="ref-bars"></div>';
        overview.appendChild(chart);
      }
      const intro=section.querySelector(':scope > .module-intro')||section.querySelector(':scope > .ui-card');
      if(intro)intro.insertAdjacentElement('afterend',overview);else section.insertBefore(overview,section.firstElementChild);
    }
    const cards=overview.querySelector('.ref-kpis');
    if(isBranches){
      if(!overview.dataset.refBranchPending){
        cards.innerHTML='';
        cfg.labels.forEach((label,i)=>{
          const card=document.createElement('article');card.className='ref-kpi';
          card.style.setProperty('--ref-accent-strong',cfg.accent[i]||'#0876ee');
          card.style.setProperty('--ref-accent',(cfg.accent[i]||'#0876ee')+'30');
          card.innerHTML='<div class="ref-kpi-top"><span class="ref-kpi-dot"></span><span></span></div><div class="ref-kpi-value">—</div><div class="ref-kpi-note">Consultando Supabase…</div>';
          card.querySelector('.ref-kpi-top span:last-child').textContent=label;cards.appendChild(card);
        });
        overview.dataset.refBranchPending='true';
      }
      return;
    }
    const rows=getRows(section);
    if(!rows.length)return;
    const chart=overview.querySelector('.ref-bars');
    const headers=[...(section.querySelector('table thead')?.querySelectorAll('th')||[])].map(x=>clean(x.innerText).toLocaleLowerCase('es-CL'));
    const values=stats(rows,headers);
    cards.innerHTML='';
    cfg.labels.forEach((label,i)=>{
      const card=document.createElement('article');card.className='ref-kpi';
      card.style.setProperty('--ref-accent-strong',cfg.accent[i]||'#0876ee');
      card.style.setProperty('--ref-accent',(cfg.accent[i]||'#0876ee')+'30');
      card.innerHTML='<div class="ref-kpi-top"><span class="ref-kpi-dot"></span><span></span></div><div class="ref-kpi-value"></div><div class="ref-kpi-note">Según la tabla cargada</div>';
      card.querySelector('.ref-kpi-top span:last-child').textContent=label;
      card.querySelector('.ref-kpi-value').textContent=values[i].toLocaleString('es-CL');
      cards.appendChild(card);
    });
    if(chart){
      chart.innerHTML='';
      const max=Math.max(1,...values.slice(1));
      ['Estado favorable','Pendiente / en curso','Alerta / otros'].forEach((label,i)=>{
        const count=values[i+1]||0;
        const row=document.createElement('div');row.className='ref-bar-row';
        const name=document.createElement('span');name.textContent=label;
        const track=document.createElement('div');track.className='ref-bar-track';
        const fill=document.createElement('div');fill.className='ref-bar-fill';fill.style.width=(count/max*100)+'%';fill.style.background=cfg.accent[i+1]||'#0876ee';track.appendChild(fill);
        const n=document.createElement('span');n.className='ref-bar-count';n.textContent=count.toLocaleString('es-CL');
        row.append(name,track,n);chart.appendChild(row);
      });
    }
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
    if(layout.dataset.loaded==='true'){if(!section.classList.contains('hidden'))setTimeout(()=>layout._refMap?.invalidateSize(),120);return;}
    layout.dataset.loaded='true';
    const mapNode=section.querySelector('#ref-sucursal-map');
    const note=section.querySelector('#ref-sucursal-map-note');
    const regionsNode=section.querySelector('#ref-sucursal-regions');
    const draw=async()=>{
      if(typeof _supabase==='undefined'){if(note)note.textContent='El cliente de datos no está disponible en esta vista.';return;}
      try{
        const {data,error,count}=await _supabase.from('sucursales').select('id,nombre,direccion,comuna,region,latitud,longitud,geolocalizacion,activa',{count:'exact'}).range(0,4999);
        if(error) throw error;
        const rows=data||[];
        const totalCount=Number.isFinite(count)?count:rows.length;
        const inactiveRows=rows.filter(x=>x.activa===false||x.activa===0||['false','0','inactivo','inactiva','no'].includes(String(x.activa??'').toLocaleLowerCase('es-CL')));
        const activeCount=Math.max(0,Math.min(totalCount,rows.length-inactiveRows.length));
        const inactiveCount=inactiveRows.length;
        const unknownCount=Math.max(0,totalCount-rows.length);
        const branchOverview=section.querySelector('.ref-overview');
        const branchCards=branchOverview?.querySelectorAll('.ref-kpi');
        if(branchCards?.length>=4){
          const vals=[totalCount,activeCount,inactiveCount,unknownCount];
          vals.forEach((value,i)=>{const node=branchCards[i]?.querySelector('.ref-kpi-value');if(node)node.textContent=value.toLocaleString('es-CL');});
          const labels=['Total de sucursales','Activas','Inactivas','Sin estado'];
          labels.forEach((label,i)=>{const node=branchCards[i]?.querySelector('.ref-kpi-top span:last-child');if(node)node.textContent=label;});
          const note=branchCards[0]?.querySelector('.ref-kpi-note');if(note)note.textContent='Total informado por Supabase';
          const activeNote=branchCards[1]?.querySelector('.ref-kpi-note');if(activeNote)activeNote.textContent='Sin estado inactivo explícito';
          const inactiveNote=branchCards[2]?.querySelector('.ref-kpi-note');if(inactiveNote)inactiveNote.textContent='Según campo activa de Supabase';
          const unknownNote=branchCards[3]?.querySelector('.ref-kpi-note');if(unknownNote)unknownNote.textContent='Sin estado explícito';
        }
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
        const map=L.map(mapNode,{scrollWheelZoom:false,zoomControl:true}).setView([-33.45,-70.66],5);layout._refMap=map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
        points.forEach(({x,lat,lon})=>{
          const marker=L.circleMarker([lat,lon],{radius:5,color:'#0876ee',weight:2,fillColor:'#19a8a5',fillOpacity:.85}).addTo(map);
          const escape=v=>String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          marker.bindPopup('<b>'+escape(x.nombre||'Sucursal')+'</b><br>'+escape([x.direccion,x.comuna].filter(Boolean).join(', ')));
        });
        if(points.length)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[18,18],maxZoom:10});
        else map.setView([-33.45,-70.66],5);
        if(note)note.textContent=points.length+' sucursales con coordenadas válidas de '+rows.length+' registros consultados.';
        setTimeout(()=>map.invalidateSize(),120);
      }catch(e){if(note)note.textContent='No se pudo cargar el mapa o la distribución: '+(e?.message||'error de consulta');if(regionsNode)regionsNode.innerHTML='<div class="ref-empty-chart">No fue posible consultar la distribución.</div>';}
    };
    draw();
  }

  // Rediseños estructurales para los módulos de la referencia 9.
  function enhanceReportes(){
    const section=document.getElementById('view-reportes');
    if(!section || section.dataset.refReportes==='true') return;
    const intro=section.querySelector('.module-intro');
    const filterCard=section.querySelector('#rep-desde')?.closest('.ui-card');
    if(!intro || !filterCard) return;
    section.dataset.refReportes='true';
    section.classList.add('ref-reportes-page');
    const board=document.createElement('div'); board.className='ref-reportes-board';
    board.innerHTML='<article class="ref-report-kpi"><span class="ref-report-icon">▤</span><small>Informes seleccionados</small><strong data-report-value="selected">—</strong><span>Según las casillas activas</span></article><article class="ref-report-kpi"><span class="ref-report-icon amber">⇩</span><small>Formato de salida</small><strong data-report-value="format">Excel</strong><span>Editable antes de descargar</span></article><article class="ref-report-kpi"><span class="ref-report-icon teal">▣</span><small>Alcance de sucursales</small><strong data-report-value="branch">Todas</strong><span>Según el filtro actual</span></article><article class="ref-report-kpi"><span class="ref-report-icon violet">◷</span><small>Período consultado</small><strong data-report-value="period">Sin definir</strong><span>Rango seleccionado</span></article>';
    intro.insertAdjacentElement('afterend',board);
    const update=()=>{
      const selected=section.querySelectorAll('.rep-tipo:checked').length;
      const format=section.querySelector('#rep-formato');
      const branch=section.querySelector('#rep-sucursal');
      const from=section.querySelector('#rep-desde')?.value;
      const to=section.querySelector('#rep-hasta')?.value;
      board.querySelector('[data-report-value="selected"]').textContent=selected.toLocaleString('es-CL');
      board.querySelector('[data-report-value="format"]').textContent=format?.selectedOptions?.[0]?.textContent?.replace(/\\s+/g,' ').trim()||'Excel';
      board.querySelector('[data-report-value="branch"]').textContent=branch?.value?(branch.selectedOptions?.[0]?.textContent||'Seleccionada').trim():'Todas';
      const fmt=v=>v?new Date(v+'T12:00:00').toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
      board.querySelector('[data-report-value="period"]').textContent=(from||to)?fmt(from)+' – '+fmt(to):'Sin definir';
    };
    section.addEventListener('change',e=>{if(e.target.matches('.rep-tipo,#rep-formato,#rep-sucursal,#rep-desde,#rep-hasta'))update();});
    update();
  }
  function enhanceMapas(){
    const section=document.getElementById('view-mapas');
    if(!section || section.dataset.refMapas==='true') return;
    const canvas=section.querySelector('.map-canvas-shell');
    const card=canvas?.closest('.ui-card');
    if(!canvas||!card) return;
    section.dataset.refMapas='true';
    section.classList.add('ref-mapas-page');
    const summary=canvas.querySelector(':scope > .mb-3');
    const heading=canvas.querySelector('.map-canvas-heading');
    const frame=canvas.querySelector('#mapa14-frame');
    const stats=canvas.querySelector('#mapa14-estadisticas');
    const steps=canvas.querySelector('#mapa14-pasos');
    const footer=canvas.querySelector('.map-canvas-footer');
    const routeSide=document.createElement('aside'); routeSide.className='ref-map-route-side';
    routeSide.innerHTML='<div class="ref-map-result-title"><span>↗</span><div><b>Resultado de la ruta</b><small>Estimación según el recorrido consultado</small></div></div><div class="ref-map-route-placeholder">Selecciona una sucursal de origen y otra de destino; luego pulsa <b>Ver ruta</b>.</div>';
    if(stats) routeSide.appendChild(stats);
    if(steps) routeSide.appendChild(steps);
    const frameWrap=document.createElement('div'); frameWrap.className='ref-map-frame-wrap';
    if(heading) frameWrap.appendChild(heading);
    if(frame) frameWrap.appendChild(frame);
    if(footer) frameWrap.appendChild(footer);
    const grid=document.createElement('div'); grid.className='ref-map-results-grid';
    grid.append(frameWrap,routeSide);
    if(summary) canvas.insertBefore(grid,summary); else canvas.appendChild(grid);
    const sync=()=>{
      const text=section.querySelector('#mapa14-resumen')?.textContent||'';
      const placeholder=routeSide.querySelector('.ref-map-route-placeholder');
      if(placeholder && text.trim() && !/selecciona origen|selecciona.*destino/i.test(text)) placeholder.textContent=text.trim();
      routeSide.classList.toggle('has-route',!!stats&&!stats.classList.contains('hidden'));
    };
    const observer=new MutationObserver(sync);
    observer.observe(section,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
    sync();
  }
  function enhanceOperationsLayout(){
    const section=document.getElementById('view-operaciones');
    if(!section||section.dataset.refOps==='true') return;
    section.dataset.refOps='true'; section.classList.add('ref-operations-page');
    const kpis=section.querySelector('#ops-kpis');
    if(kpis) kpis.classList.add('ref-ops-kpis');
    const panels=section.querySelectorAll(':scope > .grid');
    panels.forEach((panel,i)=>panel.classList.add(i===0?'ref-ops-priority-grid':'ref-ops-secondary-grid'));
  }
  function enhanceQualityLayout(){
    const section=document.getElementById('view-calidad');
    if(!section||section.dataset.refQuality==='true') return;
    section.dataset.refQuality='true'; section.classList.add('ref-quality-page');
    const kpis=section.querySelector('#calidad-kpis');
    if(kpis) kpis.classList.add('ref-quality-kpis');
    const grids=section.querySelectorAll(':scope > .grid');
    grids.forEach(el=>el.classList.add('ref-quality-panels'));
  }
  function enhanceNotificationsLayout(){
    const section=document.getElementById('view-notificaciones');
    if(!section||section.dataset.refNotifications==='true') return;
    section.dataset.refNotifications='true'; section.classList.add('ref-notifications-page');
    const kpis=section.querySelector('#notif-kpis');
    if(kpis) kpis.classList.add('ref-notif-kpis');
    const list=section.querySelector('#notif-lista');
    if(list) list.classList.add('ref-notif-list');
  }
  function enhanceIntegrationsLayout(){
    const section=document.getElementById('view-integraciones');
    if(!section||section.dataset.refIntegrations==='true') return;
    section.dataset.refIntegrations='true'; section.classList.add('ref-integrations-page');
    const kpis=section.querySelector('#integ-kpis');
    if(kpis) kpis.classList.add('ref-integ-kpis');
    const list=section.querySelector('#integ-lista');
    if(list) list.classList.add('ref-integ-list');
    const bot=section.querySelector('#talana-bot-panel');
    if(bot) bot.classList.add('ref-talana-bot');
  }


  function enhanceTableAnalytics(activeSection){
    const ids=['asistencia','licencias','vacaciones','envio_licencias','traslados','auditoria','reportes'];
    ids.forEach(id=>{
      const section=document.getElementById('view-'+id);
      if(activeSection && section!==activeSection) return;
      const table=section?.querySelector('table');
      if(!section||!table) return;
      const rows=getRows(section);
      if(!rows.length) return;
      const headers=[...(table.querySelectorAll('thead th'))].map(x=>clean(x.innerText).toLocaleLowerCase('es-CL'));
      const statusIndex=headers.findIndex(x=>/estado|status|situaci[oó]n|resultado/.test(x));
      const branchIndex=headers.findIndex(x=>/sucursal|local|unidad|dependencia/.test(x));
      const typeIndex=headers.findIndex(x=>/tipo|anomal[ií]a|motivo|categor[ií]a/.test(x));
      const signature=rows.length+'|'+rows.slice(0,100).map(r=>clean(r.innerText)).join('¦');
      let panel=section.querySelector('.ref-secondary-charts');
      if(!panel){
        panel=document.createElement('div');panel.className='ref-secondary-charts';
        panel.innerHTML='<section class="ref-chart"><div class="ref-chart-title">Distribución por estado</div><div class="ref-chart-subtitle">Según los registros visibles y los filtros aplicados</div><div class="ref-bars" data-chart="states"></div></section><section class="ref-chart"><div class="ref-chart-title">Sucursales / categorías con más registros</div><div class="ref-chart-subtitle">Se calcula a partir de las columnas disponibles</div><div class="ref-bars" data-chart="branches"></div></section>';
        const overview=section.querySelector('.ref-overview');
        const anchor=overview||table.closest('.ui-card')||table;
        anchor?.insertAdjacentElement('afterend',panel);
      }
      if(panel.dataset.signature===signature) return;
      panel.dataset.signature=signature;
      const aggregate=(idx,fallback)=>{
        const counts={};
        rows.forEach(r=>{
          const cells=[...r.querySelectorAll('td')];
          let key=idx>=0?clean(cells[idx]?.innerText):'';
          if(!key) key=fallback(r);
          if(!key) key='Sin clasificar';
          counts[key]=(counts[key]||0)+1;
        });
        return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
      };
      const status=aggregate(statusIndex,r=>statusIndex<0?'Sin columna de estado':'Sin estado');
      const branch=aggregate(branchIndex,r=>{
        const cells=[...r.querySelectorAll('td')];
        const text=clean(r.innerText);
        return typeIndex>=0?clean(cells[typeIndex]?.innerText):(cells.length>1?clean(cells[1]?.innerText.split('\n')[0]):text.split(' ').slice(0,2).join(' '));
      });
      const draw=(node,data)=>{
        if(!node)return;
        node.innerHTML='';
        if(!data.length){node.innerHTML='<div class="ref-empty-chart">No hay registros para mostrar con los filtros actuales.</div>';return;}
        const max=Math.max(1,...data.map(x=>x[1]));
        data.forEach(([label,count],i)=>{
          const row=document.createElement('div');row.className='ref-bar-row';
          const name=document.createElement('span');name.className='ref-bar-label';name.textContent=label;
          const track=document.createElement('div');track.className='ref-bar-track';
          const fill=document.createElement('div');fill.className='ref-bar-fill';fill.style.width=(count/max*100)+'%';
          const colors=['#19a8a5','#0876ee','#16a879','#f0ad37','#8b68d8'];fill.style.background=colors[i%colors.length];
          track.appendChild(fill);const n=document.createElement('span');n.className='ref-bar-count';n.textContent=count.toLocaleString('es-CL');
          row.append(name,track,n);node.appendChild(row);
        });
      };
      draw(panel.querySelector('[data-chart="states"]'),status);
      draw(panel.querySelector('[data-chart="branches"]'),branch);
    });
  }

  function enhanceCoverageLayout(){
    const section=document.getElementById('view-amonestaciones');
    if(!section||section.dataset.refCoverageLayout==='true')return;
    const title=section.querySelector('.module-title-coberturas');
    const alertForm=section.querySelector('#form-alerta-dotacion')?.closest('.ui-card');
    const alerts=section.querySelector('#tabla-alertas-dotacion')?.closest('.ui-card');
    const kpis=section.querySelector('#cob-pendientes')?.closest('.grid');
    const history=section.querySelector('#tabla-coberturas')?.closest('.ui-card');
    if(!title||!alertForm||!alerts||!kpis||!history)return;
    section.dataset.refCoverageLayout='true';
    section.classList.add('ref-coverage-page');
    kpis.classList.add('ref-coverage-kpis');
    title.insertAdjacentElement('afterend',kpis);
    const workspace=document.createElement('div');workspace.className='ref-coverage-workspace';
    const formColumn=document.createElement('div');formColumn.className='ref-coverage-form-column';
    const alertsColumn=document.createElement('div');alertsColumn.className='ref-coverage-alerts-column';
    title.insertAdjacentElement('afterend',workspace);
    title.insertAdjacentElement('afterend',kpis);
    workspace.append(formColumn,alertsColumn);
    formColumn.append(alertForm);
    alertsColumn.append(alerts);
    const assign=section.querySelector('#form-cobertura');
    if(assign)assign.classList.add('ref-coverage-assignment');
    const stats=section.querySelector('#cob-pendientes')?.closest('.grid');
    const statePanel=document.createElement('section');statePanel.className='ref-coverage-state-panel ui-card';
    statePanel.innerHTML='<div class="ref-chart-title">Resumen de cobertura</div><div class="ref-chart-subtitle">Estados actualizados desde las solicitudes registradas</div><div class="ref-coverage-state-track"><span data-coverage-state="pending"></span><span data-coverage-state="progress"></span><span data-coverage-state="done"></span></div><div class="ref-coverage-state-legend"><span><i class="pending"></i>Pendientes <b data-coverage-count="pending">—</b></span><span><i class="progress"></i>En curso <b data-coverage-count="progress">—</b></span><span><i class="done"></i>Realizadas <b data-coverage-count="done">—</b></span></div>';
    alertsColumn.appendChild(statePanel);
    const update=()=>{
      const vals=[
        Number(section.querySelector('#cob-pendientes')?.textContent)||0,
        Number(section.querySelector('#cob-curso')?.textContent)||0,
        Number(section.querySelector('#cob-realizadas')?.textContent)||0
      ];
      const total=Math.max(1,vals.reduce((a,b)=>a+b,0));
      ['pending','progress','done'].forEach((key,i)=>{
        const el=statePanel.querySelector('[data-coverage-count="'+key+'"]');
        const bar=statePanel.querySelector('[data-coverage-state="'+key+'"]');
        if(el)el.textContent=vals[i].toLocaleString('es-CL');
        if(bar)bar.style.width=(vals[i]/total*100)+'%';
      });
    };
    const observer=new MutationObserver(update);
    ['cob-pendientes','cob-curso','cob-realizadas'].forEach(id=>{const el=section.querySelector('#'+id);if(el)observer.observe(el,{childList:true,characterData:true,subtree:true});});
    update();
    if(history)history.classList.add('ref-coverage-history');
  }

  function enhanceModuleShells(){
    const shells={
      'view-dashboard':'ref-dashboard-page','view-espacio':'ref-space-page','view-tareas':'ref-tasks-page',
      'view-colaboradores':'ref-collaborators-page','view-sucursales':'ref-branches-page',
      'view-asistencia':'ref-attendance-page','view-licencias':'ref-leaves-page','view-vacaciones':'ref-vacations-page',
      'view-papeletas':'ref-permission-slips-page','view-correos':'ref-email-drafts-page','view-envio_licencias':'ref-medical-mail-page',
      'view-amonestaciones':'ref-warnings-page','view-reportes':'ref-reports-page','view-usuarios':'ref-users-page',
      'view-auditoria':'ref-audit-page','view-ayuda':'ref-help-page','view-configcorreos':'ref-branch-mail-page',
      'view-mapas':'ref-routes-page','view-operaciones':'ref-ops-page','view-calidad':'ref-data-quality-page',
      'view-notificaciones':'ref-notifications-shell','view-integraciones':'ref-integrations-shell','view-chat':'ref-chat-page','view-traslados':'ref-transfers-page'
    };
    Object.entries(shells).forEach(([id,cls])=>document.getElementById(id)?.classList.add(cls));
    const employee=document.getElementById('view-colaboradores');
    if(employee){
      const modal=document.getElementById('modal-colaborador');
      modal?.classList.add('ref-employee-history-modal');
      const hist=employee.querySelector('#hist-colaborador-body')?.closest('.ui-card');
      hist?.classList.add('ref-employee-history-panel');
    }
    const attendance=document.getElementById('view-asistencia');
    if(attendance){
      attendance.querySelectorAll('#stat-sin-marcas,#stat-incompletas,#stat-atrasos,#stat-tempranas,#stat-sin-turno-marcas').forEach(el=>el.closest('.ui-card,article,[role="button"]')?.classList.add('ref-anomaly-metric'));
    }
    const vacations=document.getElementById('view-vacaciones');
    if(vacations) vacations.querySelectorAll('#vac-stat-vigentes,#vac-stat-proximas,#vac-stat-caducadas,#vac-stat-alertas').forEach(el=>el.closest('.ui-card,article,[role="button"]')?.classList.add('ref-vacation-metric'));
  }

  function enhanceHistoryToggles(){
    const config={
      'view-licencias':'Historial de licencias médicas',
      'view-vacaciones':'Historial de vacaciones',
      'view-envio_licencias':'Registros manuales',
      'view-papeletas':'Papeletas generadas'
    };
    Object.entries(config).forEach(([id,label])=>{
      const section=document.getElementById(id);
      if(!section||section.dataset.refHistoryToggle==='true')return;
      const tables=[...section.querySelectorAll('table')];
      if(!tables.length)return;
      const table=tables[tables.length-1];
      const wrap=table.closest('.overflow-x-auto')||table.parentElement;
      if(!wrap||wrap===section)return;
      section.dataset.refHistoryToggle='true';
      const controls=document.createElement('div');
      controls.className='ref-history-toggle-row';
      const title=document.createElement('span');title.textContent=label;
      const button=document.createElement('button');button.type='button';button.className='ref-history-toggle';button.textContent='Mostrar historial';
      wrap.hidden=true;wrap.classList.add('ref-history-table');
      button.addEventListener('click',()=>{
        const open=wrap.hidden;
        wrap.hidden=!open;
        button.textContent=open?'Ocultar historial':'Mostrar historial';
        button.setAttribute('aria-expanded',String(open));
      });
      controls.append(title,button);
      wrap.insertAdjacentElement('beforebegin',controls);
    });
  }

  function refresh(){
    enhanceModuleShells();
    enhanceHistoryToggles();
    enhanceCoverageLayout();
    enhanceReportes();
    enhanceMapas();
    enhanceOperationsLayout();
    enhanceQualityLayout();
    enhanceNotificationsLayout();
    enhanceIntegrationsLayout();
    enhanceSucursales();
    enhanceUsers();
    enhancePapeletas();
    // Solo Sucursales necesita KPIs estructurales nuevos. Los demás módulos ya tienen
    // indicadores conectados a sus propias consultas; duplicarlos con conteos de filas visibles
    // generaba cifras engañosas y rompía el ancho de las columnas.
    const branches=document.getElementById('view-sucursales');
    if(branches&&!branches.querySelector('.ref-overview')) makeOverview(branches,targets.sucursales);
  }
  function init(){
    refresh();
    const root=document.querySelector('main')||document.body;
    // Vigilar solo cambios de navegación; observar cada cambio de texto/tabla bloqueaba la navegación.
    const observer=new MutationObserver(records=>{
      if(!records.some(record=>record.target?.id?.startsWith('view-')||record.target?.closest?.('section[id^="view-"]'))) return;
      if(!window.__simiRefEnhanceQueued){window.__simiRefEnhanceQueued=true;requestAnimationFrame(()=>{window.__simiRefEnhanceQueued=false;refresh();});}
    });
    observer.observe(root,{subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',e=>{if(e.target.closest('[onclick*="cambiarModulo"],.menu-btn,[data-module]'))setTimeout(refresh,80);},true);
    window.addEventListener('load',()=>setTimeout(refresh,400));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();