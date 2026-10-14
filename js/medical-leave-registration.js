/* Registro manual de licencias médicas. Independiente de public.licencias_medicas. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let colaborador = null;
  let sucursalManual = null;
  let iniciada = false;
  const db = () => {
    try { if (typeof _supabase !== 'undefined' && _supabase) return _supabase; } catch (_) {}
    return window._supabase || window.supabaseClient || null;
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isoHoy = () => {
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const x = Object.fromEntries(p.map(a=>[a.type,a.value]));
    return x.year+'-'+x.month+'-'+x.day;
  };
  function normalizarRut(v) { return String(v||'').toUpperCase().replace(/[^0-9K]/g,''); }
  function rutValido(v) {
    const r=normalizarRut(v);
    if(r.length<2||r.length>9) return false;
    const cuerpo=r.slice(0,-1), dv=r.slice(-1);
    if(!/^\d+$/.test(cuerpo)) return false;
    let suma=0,m=2;
    for(let i=cuerpo.length-1;i>=0;i--){suma+=Number(cuerpo[i])*m;m=m===7?2:m+1;}
    const n=11-(suma%11), calculado=n===11?'0':n===10?'K':String(n);
    return dv===calculado;
  }
  function candidatosRut(v) {
    const r=normalizarRut(v), cuerpo=r.slice(0,-1), dv=r.slice(-1);
    const conGuion=cuerpo+'-'+dv;
    const puntos=cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+dv;
    return [...new Set([r,conGuion,puntos])];
  }
  function formatoFecha(iso) {
    if(!iso) return '—';
    const p=String(iso).slice(0,10).split('-');
    return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:iso;
  }
  function formatoFechaCorreo(iso) { return formatoFecha(iso).replaceAll('/','-'); }
  function sumarFecha(iso,n) {
    if(!iso) return '';
    const d=new Date(iso+'T12:00:00Z');
    if(Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate()+n);
    return d.toISOString().slice(0,10);
  }
  function calcular() {
    const inicio=$('eml-inicio').value;
    const dias=Number($('eml-dias').value);
    const ok=inicio && Number.isInteger(dias) && dias>=1 && dias<=365;
    $('eml-termino').value=ok?sumarFecha(inicio,dias-1):'';
    $('eml-retorno').value=ok?sumarFecha(inicio,dias):'';
  }
  function mensaje(texto) { const el=$('eml-error');el.textContent=texto||'';el.classList.toggle('hidden',!texto); }
  function setEstado(texto) { $('eml-rut-estado').textContent=texto; }
  let sugerenciaTimer = null;
  function prepararPanelSugerencias() {
    const input = $('eml-rut');
    if (!input || $('eml-rut-sugerencias')) return;
    const wrap = input.parentElement;
    wrap.style.position = 'relative';
    const panel = document.createElement('div');
    panel.id = 'eml-rut-sugerencias';
    panel.className = 'autocomplete-panel hidden';
    panel.setAttribute('role','listbox');
    wrap.appendChild(panel);
  }
  function cerrarSugerencias() {
    const panel = $('eml-rut-sugerencias');
    if (panel) { panel.classList.add('hidden'); panel.replaceChildren(); }
  }
  function mostrarSugerencias(rows) {
    const panel = $('eml-rut-sugerencias');
    if (!panel) return;
    panel.replaceChildren();
    if (!rows.length) { cerrarSugerencias(); setEstado('No hay coincidencias para los dígitos ingresados. Puedes completar el RUT y pulsar Buscar.'); return; }
    rows.slice(0,12).forEach(row => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'autocomplete-item block w-full';
      b.setAttribute('role','option');
      const nombre = [row.nombres,row.apellidos].filter(Boolean).join(' ');
      b.textContent = (row.rut || '') + ' · ' + (nombre || 'Nombre no disponible') + (row.sucursal ? ' · ' + row.sucursal : '');
      b.addEventListener('click', () => { $('eml-rut').value = row.rut || ''; cerrarSugerencias(); buscarColaborador(); });
      panel.appendChild(b);
    });
    panel.classList.remove('hidden');
    setEstado(rows.length + ' coincidencia(s). Selecciona al colaborador correcto.');
  }
  async function sugerirColaboradores() {
    const client = db();
    const entrada = $('eml-rut').value.trim();
    const parcial = normalizarRut(entrada);
    colaborador = null;
    $('eml-colaborador-id').value = '';
    $('eml-nombre').value = ''; $('eml-cargo').value = ''; $('eml-sucursal').value = '';
    if (parcial.length < 3) { cerrarSugerencias(); setEstado('Ingresa al menos 3 dígitos del RUT para buscar coincidencias.'); return; }
    if (!client) { cerrarSugerencias(); setEstado('No está disponible la conexión con Supabase.'); return; }
    setEstado('Buscando coincidencias…');
    try {
      // Se busca por el fragmento y luego se filtra por inicio del RUT normalizado,
      // para admitir RUT escritos con puntos/guion sin mostrar coincidencias intermedias.
      const prefijos = new Set([parcial]);
      for (const largo of [7,8]) {
        const relleno = (parcial + '00000000').slice(0,largo);
        const formateado = relleno.replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.');
        let prefijo = '', digitos = 0;
        for (const ch of formateado) { prefijo += ch; if (/[0-9]/.test(ch)) digitos++; if (digitos >= parcial.length) break; }
        if (prefijo) prefijos.add(prefijo);
      }
      const filtros = [...prefijos].map(p => 'rut.ilike.' + p + '%').join(',');
      const {data,error} = await client.from('colaboradores')
        .select('id,rut,nombres,apellidos,cargo,sucursal,sucursal_id,estado')
        .or(filtros).limit(250);
      if (error) throw error;
      const rows = (data || []).filter(x => normalizarRut(x.rut).startsWith(parcial));
      if ($('eml-rut').value.trim() !== entrada) return;
      mostrarSugerencias(rows);
    } catch (e) {
      cerrarSugerencias();
      setEstado('No se pudo buscar. Verifica la sesión y los permisos de lectura de colaboradores.');
      console.error('[envio-licencias] búsqueda de RUT fallida', e);
    }
  }
  async function buscarColaborador() {
    const client=db(), entrada=$('eml-rut').value.trim();
    cerrarSugerencias();
    colaborador=null;
    $('eml-colaborador-id').value='';$('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';
    if(!client){setEstado('No está disponible la conexión con Supabase.');return;}
    if(!rutValido(entrada)){setEstado('Completa un RUT válido o selecciona una coincidencia de la lista.');return;}
    setEstado('Buscando colaborador…');
    try {
      const ors=candidatosRut(entrada).map(r=>'rut.eq.'+JSON.stringify(r)).join(',');
      let {data,error}=await client.from('colaboradores').select('id,rut,nombres,apellidos,cargo,sucursal,sucursal_id,estado').or(ors).limit(10);
      if(error) throw error;
      let matches=(data||[]).filter(x=>normalizarRut(x.rut)===normalizarRut(entrada));
      // Fallback para bases con formatos de RUT no uniformes.
      if(!matches.length){
        const n=normalizarRut(entrada);
        const fallback=await client.from('colaboradores').select('id,rut,nombres,apellidos,cargo,sucursal,sucursal_id,estado').ilike('rut','%'+n.slice(0,-1)+'%').limit(100);
        if(fallback.error) throw fallback.error;
        matches=(fallback.data||[]).filter(x=>normalizarRut(x.rut)===n);
      }
      if(matches.length!==1){setEstado(matches.length?'Hay más de una coincidencia exacta. Solicita revisión antes de registrar.':'No se encontró un colaborador con ese RUT. Verifica los dígitos y los permisos de lectura.');return;}
      colaborador=matches[0];
      sucursalManual=null;
      if(String(colaborador.estado||'activo').toLowerCase()!=='activo'){colaborador=null;setEstado('El colaborador figura inactivo. Verifica antes de registrar la licencia.');return;}
      let sucursal=colaborador.sucursal||'';
      if(colaborador.sucursal_id){
        const sr=await client.from('sucursales').select('nombre,correo_sucursal,correo_copia').eq('id',colaborador.sucursal_id).maybeSingle();
        if(!sr.error&&sr.data){sucursal=sr.data.nombre||sucursal;colaborador.sucursalCorreo=sr.data.correo_sucursal||null;colaborador.sucursalCopia=sr.data.correo_copia||null;sucursalManual=sr.data;}
      }
      colaborador.sucursalNombre=sucursal;
      $('eml-colaborador-id').value=colaborador.id;
      $('eml-nombre').value=[colaborador.nombres,colaborador.apellidos].filter(Boolean).join(' ');
      $('eml-cargo').value=colaborador.cargo||'';
      $('eml-sucursal').value=sucursal;
      $('eml-correo-para').value=colaborador.sucursalCorreo||'';$('eml-correo-cc').value=colaborador.sucursalCopia||'';
      setEstado('Colaborador encontrado. Revisa los datos antes de guardar.');
    } catch(e){setEstado('No se pudo consultar al colaborador. Verifica la sesión y los permisos de acceso.');console.error('[envio-licencias] búsqueda exacta fallida',e);}
  }

  async function resolverSucursal(nombre, id) {
    const client=db();
    if(!client||!String(nombre||'').trim())return null;
    let q=client.from('sucursales').select('id,nombre,correo_sucursal,correo_copia').limit(2);
    if(id) q=q.eq('id',id); else q=q.ilike('nombre',String(nombre).trim());
    const {data,error}=await q;
    if(error)throw error;
    const rows=data||[];
    return rows.length===1?rows[0]:null;
  }
  async function cargarDestinatariosSucursal() {
    if(!manualActivo())return;
    const nombre=$('eml-sucursal').value.trim();
    if(!nombre){sucursalManual=null;$('eml-correo-para').value='';$('eml-correo-cc').value='';return;}
    try {
      const suc=await resolverSucursal(nombre,null);
      sucursalManual=suc;
      if(suc){
        $('eml-sucursal').value=suc.nombre;
        $('eml-correo-para').value=suc.correo_sucursal||'';
        $('eml-correo-cc').value=suc.correo_copia||'';
        setEstado((suc.correo_sucursal||suc.correo_copia)?'Sucursal encontrada; destinatarios asignados cargados automáticamente.':'Sucursal encontrada, pero no tiene destinatarios configurados. Revisa la configuración de correos.');
      } else {
        $('eml-correo-para').value='';$('eml-correo-cc').value='';
        setEstado('No se encontró una sucursal exacta. Usa el nombre registrado en Sucursales para recuperar los destinatarios asignados.');
      }
    } catch(e){setEstado('No se pudieron cargar los destinatarios asignados de la sucursal.');}
  }

  function limpiarFormulario() {
    colaborador=null;sucursalManual=null;$('eml-rut').value='';$('eml-colaborador-id').value='';$('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';$('eml-correo-para').value='';$('eml-correo-cc').value='';
    $('eml-manual-toggle').checked=false;
    ['eml-nombre','eml-cargo','eml-sucursal'].forEach(id=>{$(id).readOnly=true;$(id).classList.add('bg-slate-50');});
    $('eml-inicio').value='';$('eml-dias').value='';$('eml-termino').value='';$('eml-retorno').value='';$('eml-observacion').value='';
    $('eml-correo-preview').classList.add('hidden');$('eml-correo-preview').replaceChildren();
    $('eml-fecha-registro').value=isoHoy();setEstado('Ingresa el RUT y busca al colaborador.');mensaje('');
  }

  function manualActivo() { return !!$('eml-manual-toggle')?.checked; }
  function datosActuales() {
    return { manual:manualActivo(), rut:$('eml-rut').value.trim(), nombre:$('eml-nombre').value.trim(),
      cargo:$('eml-cargo').value.trim(), sucursal:$('eml-sucursal').value.trim(),
      fechaRegistro:$('eml-fecha-registro').value, inicio:$('eml-inicio').value,
      dias:Number($('eml-dias').value), termino:$('eml-termino').value, retorno:$('eml-retorno').value,
      correoSucursal:$('eml-correo-para').value.trim(), correoCopia:$('eml-correo-cc').value.trim(),
      observacion:$('eml-observacion').value.trim() };
  }
  function plantillaCorreo(d) {
    const asunto='LICENCIA MÉDICA - '+(d.nombre||'Colaborador/a');
    const filas=[['Fecha de inicio de licencia',formatoFechaCorreo(d.inicio)],['Fecha de término de licencia',formatoFechaCorreo(d.termino)],['Fecha de retorno',formatoFechaCorreo(d.retorno)],['Total de días corridos',String(d.dias||'')]]
      .map(([k,v])=>'<tr><td style="padding:13px 15px;border:1px solid #d7deea;font-weight:700;color:#22324d;width:65%">'+esc(k)+'</td><td style="padding:13px 15px;border:1px solid #d7deea;color:#26364f">'+esc(v)+'</td></tr>').join('');
    const cuerpo='<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#26364f"><div style="max-width:760px;margin:24px auto;background:#fff;border:1px solid #d9e2ef"><div style="background:#174f95;padding:28px 20px;text-align:center;color:#fff"><img src="https://asistencia-doctor-simi2026.vercel.app/doctor-simi-logo.jpg" alt="Doctor Simi" width="86" height="86" style="display:block;object-fit:contain;width:86px;height:86px;margin:0 auto 12px;border-radius:50%;background:#fff;padding:4px"><div style="font-size:22px;font-weight:800;letter-spacing:.04em">FARMACIAS DOCTOR SIMI</div><div style="margin-top:8px;font-size:16px;font-weight:700;letter-spacing:.08em">LICENCIA MÉDICA</div></div><div style="padding:28px 24px"><p style="font-size:15px;font-weight:700;color:#1764b2">Estimados/as,</p><p style="font-size:14px;line-height:1.8">Se informa que el/la colaborador/a <strong>'+esc(d.nombre)+'</strong>, con RUT <strong>'+esc(d.rut)+'</strong>, '+(d.cargo?'cargo <strong>'+esc(d.cargo)+'</strong>, ':'')+'de la sucursal <strong>'+esc(d.sucursal)+'</strong>, registra una licencia médica. A continuación, se detallan las fechas para coordinación y seguimiento:</p><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:22px 0">'+filas+'</table><p style="font-size:14px;line-height:1.8">Se solicita confirmar el retorno del/de la trabajador/a en la fecha indicada y comunicar cualquier diferencia al equipo de Asistencia y Ausentismo.</p>'+(d.observacion?'<p style="font-size:13px;line-height:1.7"><strong>Observación administrativa:</strong> '+esc(d.observacion)+'</p>':'')+'<p style="font-size:14px;line-height:1.8;margin-top:28px">Saludos cordiales,</p></div><div style="background:#f8fafc;padding:22px 24px;text-align:center;color:#64748b;font-size:11px"><div style="font-weight:700;color:#42526b">Área de Asistencia y Ausentismo</div><div style="height:1px;background:#b8c5d6;margin:12px 0"></div>© 2026 Farmacias Dr. Simi. Todos los derechos reservados.</div></div></body></html>';
    return {asunto,cuerpo,to:d.correoSucursal||'',cc:d.correoCopia||''};
  }
  function mostrarVistaCorreo() {
    calcular(); const d=datosActuales();
    if(!rutValido(d.rut)||!d.nombre||!d.sucursal||!d.inicio||!Number.isInteger(d.dias)||d.dias<1||d.dias>365){mensaje('Para preparar el correo, completa un RUT válido, nombre, sucursal, fecha de inicio y días corridos.');return;}
    $('eml-correo-preview').innerHTML=plantillaCorreo(d).cuerpo;
    $('eml-correo-preview').classList.remove('hidden'); mensaje('');
  }
  function descargarCorreo() {
    calcular(); const d=datosActuales();
    if(!rutValido(d.rut)||!d.nombre||!d.sucursal||!d.inicio||!Number.isInteger(d.dias)||d.dias<1||d.dias>365){mensaje('Completa los datos obligatorios antes de descargar el borrador de Outlook.');return;}
    const mail=plantillaCorreo(d), clean=s=>String(s||'').replace(/[\r\n]/g,' ').replace(/[^\x20-\x7E]/g,'');
    const to=mail.to?'To: '+clean(mail.to)+'\r\n':'', cc=mail.cc?'Cc: '+clean(mail.cc)+'\r\n':'';
    const eml='MIME-Version: 1.0\r\n'+to+cc+'Subject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(mail.asunto)))+'?=\r\nX-Unsent: 1\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(unescape(encodeURIComponent(mail.cuerpo)));
    const url=URL.createObjectURL(new Blob([eml],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download='Borrador_Licencia_Medica_'+normalizarRut(d.rut)+'.eml';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},10000);
    if(window.mostrarToast)window.mostrarToast('Borrador .eml preparado. Ábrelo en Outlook y revisa destinatarios antes de enviar.','success');
  }

  async function guardar() {
    const client=db(), d=datosActuales(), manual=d.manual;
    if(!client){mensaje('No está disponible la conexión con Supabase.');return;}
    if(!d.fechaRegistro||!d.inicio||!Number.isInteger(d.dias)||d.dias<1||d.dias>365){mensaje('Completa la fecha de registro, el inicio y una cantidad de días corridos entre 1 y 365.');return;}
    if(d.fechaRegistro>isoHoy()){mensaje('La fecha de registro no puede ser futura.');return;}
    if(!rutValido(d.rut)||!d.nombre||!d.sucursal){mensaje('Completa un RUT chileno válido, nombre completo y sucursal.');return;}
    if(!manual&&(!colaborador||$('eml-colaborador-id').value!==colaborador.id||normalizarRut(colaborador.rut)!==normalizarRut(d.rut))){mensaje('Busca y confirma el colaborador, o activa el registro manual si no aparece en el maestro.');return;}
    const btn=$('eml-guardar');btn.disabled=true;btn.textContent='Validando y guardando…';mensaje('');
    try {
      const dup=await client.from('envio_licencias_medicas').select('id').eq('rut',d.rut).eq('fecha_inicio',d.inicio).eq('dias_corridos',d.dias).limit(1);
      if(dup.error)throw dup.error;
      if((dup.data||[]).length)throw new Error('Ya existe un registro para este RUT, fecha de inicio y cantidad de días. Revisa el registro existente para evitar duplicados.');
      const userRes=await client.auth.getUser(), user=userRes?.data?.user;
      const sucursalRes=manual?await resolverSucursal(d.sucursal,null):sucursalManual;
      if(manual&&!sucursalRes)throw new Error('La sucursal manual debe coincidir exactamente con una sucursal registrada para usar sus destinatarios asignados.');
      const correoPara=manual?(sucursalRes?.correo_sucursal||''):(colaborador?.sucursalCorreo||d.correoSucursal||'');
      const correoCc=manual?(sucursalRes?.correo_copia||''):(colaborador?.sucursalCopia||d.correoCopia||'');
      if(!correoPara&&!correoCc)throw new Error('La sucursal no tiene destinatarios de correo configurados. Revisa Sucursales antes de continuar.');
      const payload={fecha_registro:d.fechaRegistro,colaborador_id:manual?null:colaborador.id,rut:d.rut,nombre_colaborador:d.nombre,cargo:d.cargo||null,
        sucursal_id:manual?(sucursalRes?.id||null):(colaborador.sucursal_id||null),sucursal_nombre:manual?(sucursalRes?.nombre||d.sucursal):d.sucursal,
        correo_sucursal:correoPara||null,correo_copia:correoCc||null,
        fecha_inicio:d.inicio,dias_corridos:d.dias,observacion_administrativa:d.observacion||null,estado_correo:'guardada',created_by:user?.id||null};
      const ins=await client.from('envio_licencias_medicas').insert(payload).select('id').single();
      if(ins.error)throw ins.error;
      mensaje('');if(window.mostrarToast)window.mostrarToast('Registro guardado correctamente. No se envió ningún correo.','success');
      limpiarFormulario();await cargarLista();
    } catch(e){mensaje(e.message||'No se pudo guardar el registro.');}
    finally{btn.disabled=false;btn.innerHTML='<i data-lucide="save" class="mr-2 inline h-4 w-4"></i>Guardar registro';if(window.lucide)window.lucide.createIcons();}
  }

  function seleccionados() {
    return [...document.querySelectorAll('[data-eml-seleccionar]:checked')].map(x=>String(x.dataset.emlSeleccionar));
  }
  function actualizarSeleccion() {
    const ids=seleccionados(), todos=[...document.querySelectorAll('[data-eml-seleccionar]')];
    $('eml-seleccion-contador').textContent=ids.length+' seleccionada(s)';
    $('eml-descargar-zip').disabled=ids.length===0;
    $('eml-seleccionar-todos').checked=todos.length>0&&todos.every(x=>x.checked);
    $('eml-seleccionar-todos').indeterminate=ids.length>0&&ids.length<todos.length;
  }
  function csvCelda(v) { return '"'+String(v??'').replace(/"/g,'""')+'"'; }
  async function descargarZipMasivo() {
    const ids=seleccionados();
    if(!ids.length){mensaje('Selecciona al menos una licencia.');return;}
    if(typeof JSZip==='undefined'){mensaje('No se pudo cargar el generador ZIP. Recarga la página.');return;}
    const btn=$('eml-descargar-zip'), texto=btn.textContent;
    btn.disabled=true;btn.textContent='Preparando ZIP…';
    try {
      const {data,error}=await db().from('envio_licencias_medicas')
        .select('id,fecha_registro,rut,nombre_colaborador,cargo,sucursal_id,sucursal_nombre,correo_sucursal,correo_copia,observacion_administrativa,fecha_inicio,dias_corridos,fecha_termino,fecha_retorno,estado_correo')
        .in('id',ids);
      if(error)throw error;
      const rows=data||[];
      if(!rows.length)throw new Error('No se encontraron registros seleccionados. Actualiza la lista.');
      const zip=new JSZip(), folder=zip.folder('Borradores_licencias_medicas');
      const csv=[['RUT','Colaborador','Cargo','Sucursal','Fecha registro','Inicio','Término','Retorno','Días corridos','Para','CC','Estado']];
      for(const r of rows) {
        const suc=(r.correo_sucursal||r.correo_copia)?null:await resolverSucursal(r.sucursal_nombre,r.sucursal_id);
        const d={nombre:r.nombre_colaborador||'',rut:r.rut||'',cargo:r.cargo||'',sucursal:r.sucursal_nombre||'',fechaRegistro:r.fecha_registro,inicio:r.fecha_inicio,dias:Number(r.dias_corridos),termino:r.fecha_termino,retorno:r.fecha_retorno,correoSucursal:r.correo_sucursal||suc?.correo_sucursal||'',correoCopia:r.correo_copia||suc?.correo_copia||'',observacion:r.observacion_administrativa||''};
        if(!rutValido(d.rut)||!d.nombre||!d.sucursal||!d.inicio||!Number.isInteger(d.dias)||d.dias<1)throw new Error('Una de las licencias tiene datos obligatorios incompletos. Revisa los registros.');
        if(!d.correoSucursal&&!d.correoCopia)throw new Error('La sucursal '+d.sucursal+' no tiene destinatarios asignados. Configura sus correos antes de generar el ZIP.');
        const mail=plantillaCorreo(d);
        const clean=v=>String(v||'').replace(/[\r\n]/g,' ').replace(/[^\x20-\x7E]/g,'');
        const to=mail.to?'To: '+clean(mail.to)+'\r\n':'';
        const cc=mail.cc?'Cc: '+clean(mail.cc)+'\r\n':'';
        const eml='MIME-Version: 1.0\r\n'+to+cc+'Subject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(mail.asunto)))+'?=\r\nX-Unsent: 1\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(unescape(encodeURIComponent(mail.cuerpo)));
        const filename=String(d.inicio||'licencia')+'_'+normalizarRut(d.rut);
        folder.file(filename+'.eml',eml);
        folder.file(filename+'.html',mail.cuerpo);
        csv.push([d.rut,d.nombre,d.cargo,d.sucursal,d.fechaRegistro,d.inicio,d.termino,d.retorno,d.dias,d.correoSucursal,d.correoCopia,r.estado_correo||'guardada']);
      }
      zip.file('Control_de_licencias.csv','\uFEFF'+csv.map(row=>row.map(csvCelda).join(';')).join('\r\n'));
      zip.file('LEEME.txt','Se incluye un borrador .eml individual y una vista HTML por licencia, más un CSV de control. Los correos NO han sido enviados. Abre cada .eml en Outlook, revisa destinatarios y contenido y pulsa Enviar. No se incluyen documentos médicos adjuntos que no se hayan cargado al sistema.');
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      const url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url;a.download='Borradores_Licencias_'+isoHoy()+'.zip';a.style.display='none';document.body.appendChild(a);a.click();
      setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},10000);
      if(window.mostrarToast)window.mostrarToast('ZIP preparado con '+rows.length+' borrador(es). Los correos aún no han sido enviados.','success');
    } catch(e) { mensaje(e.message||'No se pudo generar el ZIP.'); }
    finally {btn.disabled=false;btn.textContent=texto;actualizarSeleccion();}
  }

  async function cargarLista() {
    const client=db(); if(!client){$('eml-lista-estado').textContent='Conexión con Supabase no disponible.';return;}
    $('eml-lista-estado').textContent='Cargando registros manuales…';
    try {
      const {data,error}=await client.from('envio_licencias_medicas').select('id,fecha_registro,rut,nombre_colaborador,cargo,sucursal_nombre,correo_sucursal,correo_copia,observacion_administrativa,fecha_inicio,dias_corridos,fecha_termino,fecha_retorno,estado_correo,created_at').order('created_at',{ascending:false}).limit(200);
      if(error)throw error;
      const rows=data||[];
      $('eml-lista-estado').textContent=rows.length+' registro(s) manual(es) recientes. Se muestran hasta 200.';
      $('eml-lista').innerHTML=rows.length?rows.map(r=>'<tr class="border-t border-slate-100"><td class="p-3"><input type="checkbox" class="h-4 w-4" data-eml-seleccionar="'+esc(r.id)+'" aria-label="Seleccionar licencia"></td><td class="p-3">'+esc(formatoFecha(r.fecha_registro))+'<div class="mt-1 text-[10px] text-slate-500">'+esc(r.created_at?new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}).format(new Date(r.created_at)):'')+'</div></td><td class="p-3">'+esc(r.nombre_colaborador||'—')+'<div class="text-[10px] text-slate-500">'+esc(r.rut||'')+'</div><div class="text-[10px] text-slate-500">'+esc(r.cargo||'')+'</div></td><td class="p-3">'+esc(r.sucursal_nombre||'—')+'</td><td class="p-3">'+esc(formatoFecha(r.fecha_inicio))+' – '+esc(formatoFecha(r.fecha_termino))+'<div class="text-[10px] text-slate-500">'+esc(r.dias_corridos)+' día(s) · retorno '+esc(formatoFecha(r.fecha_retorno))+'</div></td><td class="p-3"><span class="rounded-full bg-slate-100 px-2 py-1">'+esc(r.estado_correo||'guardada')+'</span></td><td class="p-3"><button type="button" class="rounded-lg border border-slate-200 px-2 py-1 font-semibold" data-eml-ver="'+esc(r.id)+'">Ver</button></td></tr>').join(''):'<tr><td colspan="7" class="p-6 text-center text-slate-400">Todavía no hay registros manuales.</td></tr>';
      $('eml-lista').querySelectorAll('[data-eml-ver]').forEach(b=>b.addEventListener('click',()=>verRegistro(rows.find(r=>String(r.id)===b.dataset.emlVer))));
      actualizarSeleccion();
    } catch(e){$('eml-lista-estado').textContent='No se pudieron cargar los registros. Comprueba que la migración esté aplicada y que tengas permiso.';$('eml-lista').innerHTML='<tr><td colspan="6" class="p-6 text-center text-rose-600">'+esc(e.message||'Error desconocido')+'</td></tr>';}
  }
  function verRegistro(r) {
    if(!r)return;
    const d={nombre:r.nombre_colaborador||'',rut:r.rut||'',cargo:r.cargo||'',sucursal:r.sucursal_nombre||'',inicio:r.fecha_inicio,dias:Number(r.dias_corridos),termino:r.fecha_termino,retorno:r.fecha_retorno,correoSucursal:r.correo_sucursal||'',correoCopia:r.correo_copia||'',observacion:r.observacion_administrativa||''};
    const mail=plantillaCorreo(d), overlay=document.createElement('div');
    overlay.className='fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.innerHTML='<div class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div class="flex items-center justify-between gap-3 border-b p-4"><div><h3 class="font-extrabold text-slate-900">Vista previa de licencia médica</h3><p class="text-xs text-slate-500">Borrador únicamente · no se envía automáticamente</p></div><button type="button" class="rounded-lg border px-3 py-2 text-sm font-bold" data-close>Cerrar</button></div><div class="p-4"><p class="mb-3 text-sm"><strong>Asunto:</strong> '+esc(mail.asunto)+'</p><div class="overflow-hidden rounded-xl border">'+mail.cuerpo+'</div><div class="mt-4 flex justify-end"><button type="button" class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white" data-download>Descargar .eml para Outlook</button></div></div></div>';
    document.body.appendChild(overlay);overlay.querySelector('[data-close]').addEventListener('click',()=>overlay.remove());overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    overlay.querySelector('[data-download]').addEventListener('click',()=>{const eml='MIME-Version: 1.0\\r\\n'+(mail.to?'To: '+String(mail.to).replace(/[\\r\\n]/g,' ')+'\\r\\n':'')+(mail.cc?'Cc: '+String(mail.cc).replace(/[\\r\\n]/g,' ')+'\\r\\n':'')+'Subject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(mail.asunto)))+'?=\\r\\nX-Unsent: 1\\r\\nContent-Type: text/html; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n'+btoa(unescape(encodeURIComponent(mail.cuerpo)));const url=URL.createObjectURL(new Blob([eml],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download='Borrador_Licencia_Medica_'+normalizarRut(d.rut)+'.eml';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},10000);});
  }
  function iniciar() {
    if(iniciada||!$('eml-guardar'))return;
    iniciada=true;
    prepararPanelSugerencias();
    $('eml-fecha-registro').value=isoHoy();
    ['eml-nombre','eml-cargo','eml-sucursal'].forEach(id=>{ $(id).readOnly=true; $(id).classList.add('bg-slate-50'); });
    // Delegación de eventos para que el cálculo funcione también en móviles.
    document.addEventListener('input',e=>{if(e.target && (e.target.id==='eml-inicio'||e.target.id==='eml-dias'))calcular();});
    document.addEventListener('change',e=>{if(e.target && (e.target.id==='eml-inicio'||e.target.id==='eml-dias'))calcular();});
    $('eml-inicio').addEventListener('input',calcular);
    $('eml-dias').addEventListener('input',calcular);
    $('eml-inicio').addEventListener('change',calcular);
    $('eml-dias').addEventListener('change',calcular);
    calcular();
    $('eml-buscar').addEventListener('click',buscarColaborador);
    $('eml-rut').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();buscarColaborador();}});
    $('eml-rut').addEventListener('input',()=>{
      if(manualActivo()){colaborador=null;$('eml-colaborador-id').value='';setEstado('Modo manual activo. Completa nombre y sucursal; el RUT debe ser válido.');return;}
      colaborador=null;
      $('eml-colaborador-id').value='';$('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';
      clearTimeout(sugerenciaTimer);
      sugerenciaTimer=setTimeout(()=>{ if(rutValido($('eml-rut').value.trim())) buscarColaborador(); else sugerirColaboradores(); },250);
    });
    document.addEventListener('click',e=>{if(!e.target.closest('#eml-rut')&&!e.target.closest('#eml-rut-sugerencias'))cerrarSugerencias();});
    $('eml-manual-toggle').addEventListener('change',()=>{
      const manual=manualActivo();colaborador=null;sucursalManual=null;$('eml-colaborador-id').value='';
      ['eml-nombre','eml-cargo','eml-sucursal'].forEach(id=>{const el=$(id);el.readOnly=!manual;el.classList.toggle('bg-slate-50',!manual);});
      $('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';$('eml-correo-para').value='';$('eml-correo-cc').value='';
      setEstado(manual?'Modo manual activo. Completa nombre y sucursal; los destinatarios se cargarán desde la configuración de esa sucursal.':'Busca al colaborador en el maestro.');
    });
    $('eml-sucursal').addEventListener('change',cargarDestinatariosSucursal);
    $('eml-sucursal').addEventListener('blur',cargarDestinatariosSucursal);
    $('eml-vista-correo').addEventListener('click',mostrarVistaCorreo);
    $('eml-descargar-correo').addEventListener('click',descargarCorreo);
    $('eml-guardar').addEventListener('click',guardar);
    $('eml-recargar').addEventListener('click',cargarLista);
    $('eml-seleccionar-todos').addEventListener('change',e=>{document.querySelectorAll('[data-eml-seleccionar]').forEach(c=>c.checked=e.target.checked);actualizarSeleccion();});
    $('eml-lista').addEventListener('change',e=>{if(e.target.matches('[data-eml-seleccionar]'))actualizarSeleccion();});
    $('eml-descargar-zip').addEventListener('click',descargarZipMasivo);
    document.addEventListener('click',e=>{const b=e.target.closest('#btn-envio_licencias');if(b)setTimeout(cargarLista,150);});
    cargarLista();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();