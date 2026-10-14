/* Envío de licencias médicas: filtro por creación real en Supabase (hora Chile). */
(function () {
  const $ = id => document.getElementById(id);
  let registros = [];
  let sucursales = [];
  let seleccion = new Set();

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
      const sucPromise = db.from('sucursales').select('nombre,correo_sucursal,correo_copia,activa').eq('activa',true).limit(1000);
      const todos = [];
      for (let desde=0; ; desde+=1000) {
        const {data,error} = await db.from('licencias_medicas')
          .select('id,rut,nombre,cargo,sucursal,fecha_inicio,fecha_fin,dias_ausencia,created_at')
          .order('created_at',{ascending:false}).range(desde,desde+999);
        if (error) throw error;
        todos.push(...(data||[]));
        if (!data || data.length < 1000) break;
      }
      const sucRes = await sucPromise;
      if (sucRes.error) throw sucRes.error;
      registros=todos; sucursales=sucRes.data||[];
      $('lic-correo-estado').textContent='Datos reales cargados. Se usa exclusivamente created_at para determinar el período.';
      seleccion=new Set(licenciasEnPeriodo().map(r=>String(r.id)));
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
    for (const [nombre,casos] of grupos) {
      const s=porNombre.get(nombre.trim().toLowerCase());
      const para=s?.correo_sucursal||'';
      if (!para) {sinCorreo.push(nombre);continue;}
      const p=periodo();
      const asunto='Gestión de licencias médicas ingresadas · '+nombre+' · '+p.desde+' al '+p.hasta;
      // Minimización de datos: no incluir diagnóstico ni motivo médico.
      const cuerpo='Estimado equipo de '+nombre+':\n\nJunto con saludar, informamos que se registraron '+casos.length+' licencia(s) médica(s) en el sistema durante el período '+p.desde+' al '+p.hasta+'.\n\nPor favor, revisar y gestionar los registros que correspondan:\n\n'+casos.map((r,i)=>(i+1)+'. '+(r.nombre||'Sin nombre')+' | RUT: '+(r.rut||'—')+' | Período: '+(r.fecha_inicio||'—')+' al '+(r.fecha_fin||'—')+' | Días: '+(r.dias_ausencia??'—')).join('\n')+'\n\nEste correo fue preparado como borrador para revisión. No constituye confirmación de envío.\n\nSaludos cordiales,\nGestión de Asistencia\nRecursos Humanos\nFarmacias de Similares Chile S.A.';
      borradores.push({nombre,para,cc:s?.correo_copia||'',asunto,cuerpo,total:casos.length});
    }
    if (!borradores.length) {alert('Las sucursales seleccionadas no tienen correo configurado. No se generaron borradores.');return;}
    const resumen='Se prepararán '+borradores.length+' borrador(es) para '+elegidas.length+' licencia(s).'+(sinCorreo.length?'\nSin correo configurado: '+sinCorreo.join(', '):'')+'\n\n¿Continuar?';
    if(!confirm(resumen))return;
    borradores.forEach((b,i)=>{
      const url='mailto:'+encodeURIComponent(b.para)+'?cc='+encodeURIComponent(b.cc)+'&subject='+encodeURIComponent(b.asunto)+'&body='+encodeURIComponent(b.cuerpo);
      if(i===0) window.location.href=url;
      else setTimeout(()=>window.open(url,'_blank','noopener'),i*500);
    });
    $('lic-correo-estado').textContent='Se solicitó abrir '+borradores.length+' borrador(es) en el cliente de correo. Revisa Outlook y envía manualmente; la plataforma no confirma el envío.';
    alert('Se solicitaron '+borradores.length+' borrador(es). Outlook o el navegador puede requerir permitir ventanas emergentes. Verifica cada borrador antes de enviarlo.');
  }
  function iniciar() {
    if (!$('lic-correo-periodo') || $('lic-correo-periodo').dataset.ready==='1') return;
    $('lic-correo-periodo').dataset.ready='1';
    $('lic-correo-periodo').value='hoy';
    $('lic-correo-periodo').addEventListener('change',()=>{const c=$('lic-correo-periodo').value==='custom';$('lic-correo-fechas-custom').classList.toggle('hidden',!c);pintar();});
    ['lic-correo-desde','lic-correo-hasta'].forEach(id=>$(id).addEventListener('change',pintar));
    $('lic-correo-todos').addEventListener('click',()=>{seleccion=new Set(licenciasEnPeriodo().map(r=>String(r.id)));pintar();});
    $('lic-correo-ninguno').addEventListener('click',()=>{seleccion.clear();pintar();});
    $('lic-correo-recargar').addEventListener('click',cargar);
    $('lic-correo-preparar').addEventListener('click',preparar);
    document.addEventListener('click',e=>{if(e.target.closest('[onclick*="cambiarModulo(\'correos\')"],[onclick*="cambiarModulo(\"correos\")"]'))setTimeout(cargar,250);});
    cargar();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();