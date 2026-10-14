/* Envío de licencias médicas: filtro por creación real en Supabase (hora Chile). */
(function () {
  const $ = id => document.getElementById(id);
  let registros = [];
  let sucursales = [];
  let seleccion = new Set();
  const STORAGE_KEY = 'rrhh_licencias_borrador_solicitado_v1';
  function idsPreparados() { try { return new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]').map(String)); } catch (_) { return new Set(); } }
  function guardarIdsPreparados(ids) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch (_) {} }
  function correoValido(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }

  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function hoyChile() {
    const p = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v = Object.fromEntries(p.map(x => [x.type,x.value]));
    return v.year + '-' + v.month + '-' + v.day;
  }
  function sumarDias(iso, n) {
    const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
    return d.toISOString().slice(0,10);
  }
  function inicioChileUTC(iso) {
    let d = new Date(iso + 'T00:00:00Z');
    for (let i=0;i<3;i++) {
      const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
      const v = Object.fromEntries(p.map(x=>[x.type,x.value]));
      const visto = Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second);
      const objetivo = Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10),0,0,0);
      d = new Date(d.getTime() + objetivo - visto);
    }
    return d.toISOString();
  }
  function fechaChile(ts) {
    if (!ts) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}).format(new Date(ts));
  }
  function periodo() {
    const tipo = $('lic-correo-periodo')?.value || 'hoy';
    const hoy = hoyChile();
    if (tipo === 'custom') return {desde:$('lic-correo-desde').value, hasta:$('lic-correo-hasta').value};
    const dias = tipo === 'ayer' ? 1 : tipo === '3' ? 3 : tipo === '7' ? 7 : tipo === '30' ? 30 : 1;
    return {desde: sumarDias(hoy, -(dias-1) - (tipo==='ayer'?1:0)), hasta: tipo==='ayer' ? sumarDias(hoy,-1) : hoy};
  }
  function licenciasEnPeriodo() {
    const p = periodo();
    if (!p.desde || !p.hasta || p.hasta < p.desde) return [];
    return registros.filter(r => {
      if (!r.created_at) return false;
      const f = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.created_at));
      return f >= p.desde && f <= p.hasta;
    }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }
  function pintar() {
    const encontrados = licenciasEnPeriodo();
    seleccion = new Set(encontrados.filter(x => seleccion.has(String(x.id))).map(x=>String(x.id)));
    if (!$('lic-correo-tabla')) return;
    $('lic-correo-total').textContent = encontrados.length.toLocaleString('es-CL');
    $('lic-correo-sucursales-total').textContent = new Set(encontrados.map(x=>x.sucursal||'Sin sucursal')).size.toLocaleString('es-CL');
    $('lic-correo-seleccionadas').textContent = seleccion.size.toLocaleString('es-CL');
    $('lic-correo-tabla').innerHTML = encontrados.length ? encontrados.map(r => {
      const id=String(r.id), checked=seleccion.has(id);
      return '<tr class="border-t border-slate-100"><td class="p-3"><input type="checkbox" aria-label="Seleccionar licencia" data-lic-id="'+esc(id)+'" '+(checked?'checked':'')+'></td><td class="p-3">'+esc(r.nombre||'Sin nombre')+'<div class="text-[11px] text-slate-500">'+esc(r.rut||'')+'</div></td><td class="p-3">'+esc(r.cargo||'Sin cargo')+'</td><td class="p-3">'+esc(r.sucursal||'Sin sucursal')+'</td><td class="p-3">'+esc(r.fecha_inicio||'—')+' / '+esc(r.fecha_fin||'—')+'</td><td class="p-3">'+esc(r.dias_ausencia ?? '—')+'</td><td class="p-3">'+esc(fechaChile(r.created_at))+'</td></tr>';
    }).join('') : '<tr><td colspan="7" class="p-8 text-center text-slate-500">No hay licencias ingresadas en el período seleccionado.</td></tr>';
    $('lic-correo-tabla').querySelectorAll('[data-lic-id]').forEach(c=>c.addEventListener('change',()=>{c.checked?seleccion.add(c.dataset.licId):seleccion.delete(c.dataset.licId);pintar();}));
    const grupos = new Set(encontrados.filter(r=>seleccion.has(String(r.id))).map(r=>r.sucursal||'Sin sucursal'));
    $('lic-correo-resumen-sucursales').innerHTML = grupos.size ? [...grupos].sort().map(n=>'<span class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">'+esc(n)+'</span>').join(' ') : '<span class="text-xs text-slate-500">Selecciona licencias para ver las sucursales incluidas.</span>';
    $('lic-correo-seleccionadas').textContent = seleccion.size.toLocaleString('es-CL');
  }
  async function cargar() {
    const estado=$('lic-correo-estado');
    if (!window._supabase && typeof _supabase === 'undefined') { estado.textContent='No está disponible la conexión con Supabase.'; return; }
    const db = typeof _supabase !== 'undefined' ? _supabase : window._supabase;
    estado.textContent='Consultando licencias reales en Supabase…';
    try {
      const p=periodo();
      if(!p.desde||!p.hasta||p.hasta<p.desde) throw new Error('El rango de fechas no es válido.');
      const desdeUTC=inicioChileUTC(p.desde);
      const hastaUTC=inicioChileUTC(sumarDias(p.hasta,1));
      const sucPromise = db.from('sucursales').select('nombre,correo_sucursal,correo_copia,activa').eq('activa',true).limit(1000);
      const todos = [];
      for (let offset=0; ; offset+=1000) {
        const {data,error} = await db.from('licencias_medicas')
          .select('id,rut,nombre,cargo,sucursal,fecha_inicio,fecha_fin,dias_ausencia,created_at')
          .gte('created_at',desdeUTC).lt('created_at',hastaUTC)
          .order('created_at',{ascending:false}).range(offset,offset+999);
        if (error) throw error;
        todos.push(...(data||[]));
        if (!data || data.length < 1000) break;
      }
      const sucRes = await sucPromise;
      if (sucRes.error) throw sucRes.error;
      registros=todos; sucursales=sucRes.data||[];
      $('lic-correo-estado').textContent='Datos reales cargados para '+p.desde+' al '+p.hasta+' (hora de Chile), filtrados por fecha de ingreso.';
      seleccion=new Set(registros.map(r=>String(r.id)));
      pintar();
    } catch(e) {
      estado.textContent='No se pudieron consultar los registros: '+(e.message||'error de conexión');
      $('lic-correo-tabla').innerHTML='<tr><td colspan="7" class="p-8 text-center text-rose-600">No se pudo cargar la información. No se generaron borradores.</td></tr>';
    }
  }
  function preparar() {
    const elegidas=licenciasEnPeriodo().filter(r=>seleccion.has(String(r.id)));
    if (!elegidas.length) { alert('Selecciona al menos una licencia.'); return; }
    const porNombre=new Map(sucursales.map(s=>[String(s.nombre||'').trim().toLowerCase(),s]));
    const grupos=new Map();
    elegidas.forEach(r=>{const nombre=r.sucursal||'Sin sucursal'; if(!grupos.has(nombre))grupos.set(nombre,[]);grupos.get(nombre).push(r);});
    const sinCorreo=[];
    const borradores=[];
    const yaPreparadas=idsPreparados();
    const omitidasDuplicadas=[];
    for (const [nombre,casosOriginales] of grupos) {
      const casos=casosOriginales.filter(r=>!yaPreparadas.has(String(r.id)));
      if(!casos.length){omitidasDuplicadas.push(nombre);continue;}
      const s=porNombre.get(nombre.trim().toLowerCase());
      let para=String(s?.correo_sucursal||'').trim();
      if (!para) {
        const manual=prompt('La sucursal "'+nombre+'" no tiene correo configurado. Ingresa el destinatario oficial para este borrador (o cancela para omitirla):','');
        if(manual===null){sinCorreo.push(nombre);continue;}
        para=manual.trim();
      }
      if(!correoValido(para)){sinCorreo.push(nombre+' (correo no válido)');continue;}
      const p=periodo();
      const asunto='Gestión de licencias médicas ingresadas · '+nombre+' · '+p.desde+' al '+p.hasta;
      // Minimización de datos: no incluir diagnóstico ni motivo médico.
      const cuerpo='Estimado equipo de '+nombre+':\n\nJunto con saludar, informamos que se registraron '+casos.length+' licencia(s) médica(s) en el sistema durante el período '+p.desde+' al '+p.hasta+'.\n\nPor favor, revisar y gestionar los registros que correspondan:\n\n'+casos.map((r,i)=>(i+1)+'. '+(r.nombre||'Sin nombre')+' | RUT: '+(r.rut||'—')+' | Período: '+(r.fecha_inicio||'—')+' al '+(r.fecha_fin||'—')+' | Días: '+(r.dias_ausencia??'—')).join('\n')+'\n\nEste correo fue preparado como borrador para revisión. No constituye confirmación de envío.\n\nSaludos cordiales,\nGestión de Asistencia\nRecursos Humanos\nFarmacias de Similares Chile S.A.';
      borradores.push({nombre,para,cc:s?.correo_copia||'',asunto,cuerpo,total:casos.length});
    }
    if (!borradores.length) {
      alert(omitidasDuplicadas.length
        ? 'No se generaron borradores nuevos: las licencias seleccionadas ya se procesaron en esta pestaña o no tienen un destinatario válido. Recarga solo si necesitas reiniciar esta sesión.'
        : 'No se generaron borradores. Verifica que las sucursales tengan correo configurado o ingresa un correo oficial válido.');
      return;
    }
    const resumen='Se preparará una lista de '+borradores.length+' borrador(es) para revisar antes de abrirlos:\n\n'+borradores.map(b=>'• '+b.nombre+' → Para: '+b.para+(b.cc?' | CC: '+b.cc:'')+' ('+b.total+' licencia(s))').join('\n')+(sinCorreo.length?'\n\nOmitidas por falta de correo válido: '+sinCorreo.join(', '):'')+(omitidasDuplicadas.length?'\n\nOmitidas por posible duplicado en esta pestaña: '+omitidasDuplicadas.join(', '):'')+'\n\nNo se enviará ningún correo automáticamente. ¿Continuar?';
    if(!confirm(resumen))return;
    const host=$('lic-correo-borradores-lista');
    if(!host)return;
    host.innerHTML=borradores.map((b,i)=>{
      const ids=grupos.get(b.nombre).filter(r=>!yaPreparadas.has(String(r.id))).map(r=>String(r.id));
      return '<article class="ui-card border border-slate-200 p-4" data-draft-index="'+i+'"><div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1"><h4 class="font-extrabold text-slate-900">'+esc(b.nombre)+'</h4><p class="mt-1 break-all text-xs text-slate-600">Para: '+esc(b.para)+'</p>'+(b.cc?'<p class="mt-1 break-all text-xs text-slate-600">CC: '+esc(b.cc)+'</p>':'')+'<p class="mt-1 text-xs text-slate-500">'+b.total+' licencia(s) · '+esc(b.asunto)+'</p></div><button type="button" class="lic-correo-abrir rounded-lg bg-sky-700 px-4 py-3 text-xs font-bold text-white" data-draft-index="'+i+'">Abrir borrador en Outlook</button></div><details class="mt-3"><summary class="cursor-pointer text-xs font-bold text-slate-700">Revisar contenido del correo</summary><pre class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs">'+esc(b.cuerpo)+'</pre></details><p class="mt-2 text-[11px] text-amber-700">La plataforma solo solicita abrir el borrador. Confirma en Outlook si se abrió y envíalo manualmente.</p></article>';
    }).join('');
    const botones=[...host.querySelectorAll('.lic-correo-abrir')];
    botones.forEach(btn=>btn.addEventListener('click',()=>{
      const b=borradores[Number(btn.dataset.draftIndex)];
      if(!b)return;
      const ids=idsPreparados();
      if(b.idsSolicitados){alert('Ya se solicitó abrir este borrador en esta pestaña.');return;}
      const url='mailto:'+encodeURIComponent(b.para)+'?cc='+encodeURIComponent(b.cc)+'&subject='+encodeURIComponent(b.asunto)+'&body='+encodeURIComponent(b.cuerpo);
      // Un clic explícito por sucursal evita que el navegador bloquee una cadena de ventanas emergentes.
      window.location.href=url;
      b.idsSolicitados=true;
      const nuevas=grupos.get(b.nombre).filter(r=>!ids.has(String(r.id)));
      nuevas.forEach(r=>ids.add(String(r.id)));
      guardarIdsPreparados(ids);
      btn.disabled=true;
      btn.textContent='Apertura solicitada';
      btn.classList.add('opacity-60','cursor-not-allowed');
      $('lic-correo-estado').textContent='Se solicitó abrir el borrador de '+b.nombre+'. Esto no confirma que Outlook lo haya abierto ni que se haya enviado.';
    }));
    host.scrollIntoView({behavior:'smooth',block:'start'});
    $('lic-correo-estado').textContent='Borradores preparados para revisión. Revisa destinatario, copia y contenido; pulsa el botón de cada sucursal para solicitar la apertura.';

  }
  function iniciar() {
    if (!$('lic-correo-periodo') || $('lic-correo-periodo').dataset.ready==='1') return;
    $('lic-correo-periodo').dataset.ready='1';
    $('lic-correo-periodo').value='hoy';
    $('lic-correo-periodo').addEventListener('change',()=>{const c=$('lic-correo-periodo').value==='custom';$('lic-correo-fechas-custom').classList.toggle('hidden',!c);if(!c)cargar();});
    ['lic-correo-desde','lic-correo-hasta'].forEach(id=>$(id).addEventListener('change',()=>{if($('lic-correo-periodo').value==='custom')cargar();}));
    $('lic-correo-todos').addEventListener('click',()=>{seleccion=new Set(licenciasEnPeriodo().map(r=>String(r.id)));pintar();});
    $('lic-correo-ninguno').addEventListener('click',()=>{seleccion.clear();pintar();});
    $('lic-correo-recargar').addEventListener('click',cargar);
    $('lic-correo-preparar').addEventListener('click',preparar);
    document.addEventListener('click',e=>{if(e.target.closest('[onclick*="cambiarModulo(\'correos\')"],[onclick*="cambiarModulo(\"correos\")"]'))setTimeout(cargar,250);});
    cargar();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();