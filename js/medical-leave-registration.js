/* Registro manual de licencias médicas. Independiente de public.licencias_medicas. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let colaborador = null;
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
      if(String(colaborador.estado||'activo').toLowerCase()!=='activo'){colaborador=null;setEstado('El colaborador figura inactivo. Verifica antes de registrar la licencia.');return;}
      let sucursal=colaborador.sucursal||'';
      if(colaborador.sucursal_id){
        const sr=await client.from('sucursales').select('nombre,correo_sucursal,correo_copia').eq('id',colaborador.sucursal_id).maybeSingle();
        if(!sr.error&&sr.data){sucursal=sr.data.nombre||sucursal;colaborador.sucursalCorreo=sr.data.correo_sucursal||null;colaborador.sucursalCopia=sr.data.correo_copia||null;}
      }
      colaborador.sucursalNombre=sucursal;
      $('eml-colaborador-id').value=colaborador.id;
      $('eml-nombre').value=[colaborador.nombres,colaborador.apellidos].filter(Boolean).join(' ');
      $('eml-cargo').value=colaborador.cargo||'';
      $('eml-sucursal').value=sucursal;
      setEstado('Colaborador encontrado. Revisa los datos antes de guardar.');
    } catch(e){setEstado('No se pudo consultar al colaborador. Verifica la sesión y los permisos de acceso.');console.error('[envio-licencias] búsqueda exacta fallida',e);}
  }
  function limpiarFormulario() {
    colaborador=null;
    $('eml-rut').value='';$('eml-colaborador-id').value='';$('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';
    $('eml-inicio').value='';$('eml-dias').value='';$('eml-termino').value='';$('eml-retorno').value='';$('eml-observacion').value='';
    $('eml-fecha-registro').value=isoHoy();setEstado('Ingresa el RUT y busca al colaborador.');mensaje('');
  }
  async function guardar() {
    const client=db();
    if(!client){mensaje('No está disponible la conexión con Supabase.');return;}
    if(!colaborador||$('eml-colaborador-id').value!==colaborador.id){mensaje('Primero busca y confirma un colaborador válido por RUT.');return;}
    const fechaRegistro=$('eml-fecha-registro').value, inicio=$('eml-inicio').value, dias=Number($('eml-dias').value);
    if(!fechaRegistro||!inicio||!Number.isInteger(dias)||dias<1||dias>365){mensaje('Completa la fecha de registro, el inicio de licencia y una cantidad de días enteros entre 1 y 365.');return;}
    if(fechaRegistro>isoHoy()){mensaje('La fecha de registro manual no puede ser futura.');return;}
    if(!rutValido(colaborador.rut)||normalizarRut(colaborador.rut)!==normalizarRut($('eml-rut').value)){mensaje('El RUT del colaborador no coincide con el RUT validado. Vuelve a buscarlo.');return;}
    const termino=sumarFecha(inicio,dias-1), retorno=sumarFecha(inicio,dias);
    if(!termino||!retorno){mensaje('No se pudieron calcular las fechas. Revisa el inicio de la licencia.');return;}
    const btn=$('eml-guardar');btn.disabled=true;btn.textContent='Validando y guardando…';mensaje('');
    try {
      const dup=await client.from('envio_licencias_medicas').select('id').eq('colaborador_id',colaborador.id).eq('fecha_inicio',inicio).eq('dias_corridos',dias).limit(1);
      if(dup.error)throw dup.error;
      if((dup.data||[]).length){throw new Error('Ya existe un registro manual para este colaborador con la misma fecha de inicio y cantidad de días. Revisa la lista antes de duplicarlo.');}
      const userRes=await client.auth.getUser();
      const user=userRes?.data?.user;
      const payload={
        fecha_registro:fechaRegistro,colaborador_id:colaborador.id,rut:colaborador.rut,
        nombre_colaborador:[colaborador.nombres,colaborador.apellidos].filter(Boolean).join(' '),
        cargo:colaborador.cargo||null,sucursal_id:colaborador.sucursal_id||null,
        sucursal_nombre:colaborador.sucursalNombre||colaborador.sucursal||null,
        correo_sucursal:colaborador.sucursalCorreo||null,correo_copia:colaborador.sucursalCopia||null,
        fecha_inicio:inicio,dias_corridos:dias,fecha_termino:termino,fecha_retorno:retorno,
        observacion_administrativa:$('eml-observacion').value.trim()||null,
        estado_correo:'guardada',created_by:user?.id||null
      };
      const ins=await client.from('envio_licencias_medicas').insert(payload).select('id').single();
      if(ins.error)throw ins.error;
      mensaje('');
      if(window.mostrarToast)window.mostrarToast('Registro manual guardado correctamente. No se envió ningún correo.','success');
      limpiarFormulario();await cargarLista();
    } catch(e){mensaje(e.message||'No se pudo guardar el registro.');}
    finally{btn.disabled=false;btn.innerHTML='<i data-lucide="save" class="mr-2 inline h-4 w-4"></i>Guardar registro';if(window.lucide)window.lucide.createIcons();}
  }
  async function cargarLista() {
    const client=db(); if(!client){$('eml-lista-estado').textContent='Conexión con Supabase no disponible.';return;}
    $('eml-lista-estado').textContent='Cargando registros manuales…';
    try {
      const {data,error}=await client.from('envio_licencias_medicas').select('id,fecha_registro,rut,nombre_colaborador,cargo,sucursal_nombre,fecha_inicio,dias_corridos,fecha_termino,fecha_retorno,estado_correo,created_at').order('created_at',{ascending:false}).limit(200);
      if(error)throw error;
      const rows=data||[];
      $('eml-lista-estado').textContent=rows.length+' registro(s) manual(es) recientes. Se muestran hasta 200.';
      $('eml-lista').innerHTML=rows.length?rows.map(r=>'<tr class="border-t border-slate-100"><td class="p-3">'+esc(formatoFecha(r.fecha_registro))+'<div class="mt-1 text-[10px] text-slate-500">'+esc(r.created_at?new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}).format(new Date(r.created_at)):'')+'</div></td><td class="p-3">'+esc(r.nombre_colaborador||'—')+'<div class="text-[10px] text-slate-500">'+esc(r.rut||'')+'</div><div class="text-[10px] text-slate-500">'+esc(r.cargo||'')+'</div></td><td class="p-3">'+esc(r.sucursal_nombre||'—')+'</td><td class="p-3">'+esc(formatoFecha(r.fecha_inicio))+' – '+esc(formatoFecha(r.fecha_termino))+'<div class="text-[10px] text-slate-500">'+esc(r.dias_corridos)+' día(s) · retorno '+esc(formatoFecha(r.fecha_retorno))+'</div></td><td class="p-3"><span class="rounded-full bg-slate-100 px-2 py-1">'+esc(r.estado_correo||'guardada')+'</span></td><td class="p-3"><button type="button" class="rounded-lg border border-slate-200 px-2 py-1 font-semibold" data-eml-ver="'+esc(r.id)+'">Ver</button></td></tr>').join(''):'<tr><td colspan="6" class="p-6 text-center text-slate-400">Todavía no hay registros manuales.</td></tr>';
      $('eml-lista').querySelectorAll('[data-eml-ver]').forEach(b=>b.addEventListener('click',()=>verRegistro(rows.find(r=>String(r.id)===b.dataset.emlVer))));
    } catch(e){$('eml-lista-estado').textContent='No se pudieron cargar los registros. Comprueba que la migración esté aplicada y que tengas permiso.';$('eml-lista').innerHTML='<tr><td colspan="6" class="p-6 text-center text-rose-600">'+esc(e.message||'Error desconocido')+'</td></tr>';}
  }
  function verRegistro(r) {
    if(!r)return;
    alert('Registro manual\n\nColaborador: '+(r.nombre_colaborador||'—')+'\nRUT: '+(r.rut||'—')+'\nCargo: '+(r.cargo||'—')+'\nSucursal: '+(r.sucursal_nombre||'—')+'\nInicio: '+formatoFecha(r.fecha_inicio)+'\nDías corridos: '+r.dias_corridos+'\nTérmino: '+formatoFecha(r.fecha_termino)+'\nRetorno: '+formatoFecha(r.fecha_retorno)+'\nEstado: '+(r.estado_correo||'guardada')+'\n\nEl formato de correo se incorporará cuando sea proporcionado. No se envió ningún correo.');
  }
  function iniciar() {
    if(iniciada||!$('eml-guardar'))return;
    iniciada=true;
    prepararPanelSugerencias();
    $('eml-fecha-registro').value=isoHoy();
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
      colaborador=null;
      $('eml-colaborador-id').value='';$('eml-nombre').value='';$('eml-cargo').value='';$('eml-sucursal').value='';
      clearTimeout(sugerenciaTimer);
      sugerenciaTimer=setTimeout(sugerirColaboradores,250);
    });
    document.addEventListener('click',e=>{if(!e.target.closest('#eml-rut')&&!e.target.closest('#eml-rut-sugerencias'))cerrarSugerencias();});
    $('eml-guardar').addEventListener('click',guardar);
    $('eml-recargar').addEventListener('click',cargarLista);
    document.addEventListener('click',e=>{const b=e.target.closest('#btn-envio_licencias');if(b)setTimeout(cargarLista,150);});
    cargarLista();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();