(function () {
  'use strict';
  const AREAS = [
    'ADMINISTRACION','APERTURAS Y REMODELACIONES','ARRIENDOS Y PATENTES','AUDITORIA INTERNA',
    'BOTARGUEROS','CD CONCEPCION','CENTRAL','CEPIP Y CAMPAÑAS','COMPRAS','CONTABILIDAD',
    'CONTRALORIA','DIRECCION TECNICA','DISEÑO GRAFICO','DISTRIBUCION','FRANQUICIAS',
    'INSUMOS','MANTENCION','OPERACIONES','PREVENCION DE RIESGOS','RECURSOS HUMANOS',
    'SIMI - SAE','TECNOLOGIA','TRANSPORTES','VENTAS','VISITADORES MEDICOS'
  ];
  const TABLE = 'configuracion_correos_areas';
  const STORAGE_KEY = 'doctor-simi-configuracion-correos-areas-v1';
  const DEFAULT_BODY = 'Estimados/as de {AREA}:\n\nJunto con saludar, comparto la siguiente información para su revisión y gestión:\n\n[Escribe aquí el detalle de la comunicación]\n\nQuedo atento/a a sus comentarios.\n\n{FIRMA}';
  let configs = {};
  let cloudReady = false;
  let selectedArea = AREAS[0];
  const $ = id => document.getElementById(id);
  const text = value => String(value == null ? '' : value).trim();
  const escapeHtml = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function blank(area) {
    return { area, correo_para:'', correo_cc:'', asunto_plantilla:'Comunicación interna – ' + area, cuerpo_plantilla:DEFAULT_BODY.replaceAll('{AREA}',area).replaceAll('{FIRMA}','Saludos cordiales,\nFarmacias de Similares Chile S.A.'), firma:'Saludos cordiales,\nFarmacias de Similares Chile S.A.' };
  }
  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      AREAS.forEach(area => { configs[area] = {...blank(area), ...(value[area] || {})}; });
    } catch (_) { AREAS.forEach(area => { configs[area] = blank(area); }); }
  }
  function status(message, warning) {
    document.querySelectorAll('[data-area-mail-status]').forEach(el => {
      el.textContent = message;
      el.className = 'mt-2 text-xs ' + (warning ? 'text-amber-700' : 'text-emerald-700');
    });
  }
  function renderSelects() {
    const options = AREAS.map(a => '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>').join('');
    ['area-mail-config-area','area-mail-draft-area'].forEach(id => { const el=$(id); if(el) el.innerHTML=options; });
    if ($('area-mail-config-area')) $('area-mail-config-area').value = selectedArea;
    if ($('area-mail-draft-area')) $('area-mail-draft-area').value = selectedArea;
  }
  function configForm() {
    const c = configs[selectedArea] || blank(selectedArea);
    if ($('area-mail-to')) $('area-mail-to').value = c.correo_para || '';
    if ($('area-mail-cc')) $('area-mail-cc').value = c.correo_cc || '';
    if ($('area-mail-signature')) $('area-mail-signature').value = c.firma || '';
    if ($('area-mail-subject-template')) $('area-mail-subject-template').value = c.asunto_plantilla || '';
    if ($('area-mail-body-template')) $('area-mail-body-template').value = c.cuerpo_plantilla || '';
  }
  function draftForm() {
    const c = configs[selectedArea] || blank(selectedArea);
    if ($('area-mail-draft-to')) $('area-mail-draft-to').value = c.correo_para || '';
    if ($('area-mail-draft-cc')) $('area-mail-draft-cc').value = c.correo_cc || '';
    if ($('area-mail-draft-subject')) $('area-mail-draft-subject').value = (c.asunto_plantilla || ('Comunicación interna – ' + selectedArea)).replaceAll('{AREA}',selectedArea);
    const body = (c.cuerpo_plantilla || blank(selectedArea).cuerpo_plantilla).replaceAll('{AREA}',selectedArea).replaceAll('{FIRMA}',c.firma || 'Saludos cordiales,\nFarmacias de Similares Chile S.A.');
    if ($('area-mail-draft-body')) $('area-mail-draft-body').value = body;
  }
  function persistLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(configs)); return true; } catch (_) { return false; }
  }
  async function loadCloud() {
    const client = window._supabase;
    if (!client || !client.from) throw new Error('La conexión con Supabase todavía no está disponible.');
    const {data,error} = await client.from(TABLE).select('area,correo_para,correo_cc,asunto_plantilla,cuerpo_plantilla,firma,updated_at');
    if (error) throw error;
    const rows = data || [];
    AREAS.forEach(area => { configs[area] = blank(area); });
    rows.forEach(row => { if (AREAS.includes(row.area)) configs[row.area] = {...blank(row.area),...row}; });
    cloudReady = true;
    persistLocal();
  }
  async function saveConfig() {
    const area = $('area-mail-config-area')?.value || selectedArea;
    const payload = {
      area,
      correo_para: text($('area-mail-to')?.value),
      correo_cc: text($('area-mail-cc')?.value),
      asunto_plantilla: text($('area-mail-subject-template')?.value) || ('Comunicación interna – ' + area),
      cuerpo_plantilla: text($('area-mail-body-template')?.value),
      firma: text($('area-mail-signature')?.value),
      updated_by: null
    };
    const validateList = value => value.split(/[;,]+/).map(text).filter(Boolean);
    const emails = [...validateList(payload.correo_para),...validateList(payload.correo_cc)];
    const invalid = emails.filter(email => !/^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\].]{2,}$/.test(email));
    if (invalid.length) { status('Revisa las direcciones: ' + invalid.slice(0,3).join(', '), true); return; }
    configs[area] = {...payload, updated_at:new Date().toISOString()};
    const localSaved = persistLocal();
    try {
      const client = window._supabase;
      if (!client || !client.from) throw new Error('Supabase no está disponible');
      const {data:sessionData} = await client.auth.getUser();
      payload.updated_by = sessionData?.user?.email || null;
      const {error} = await client.from(TABLE).upsert(payload,{onConflict:'area'});
      if (error) throw error;
      cloudReady = true;
      status('Guardado en la base de datos. Los destinatarios quedarán disponibles en otros equipos y sesiones.',false);
    } catch (error) {
      cloudReady = false;
      status((localSaved ? 'Guardado en este navegador. Falta habilitar la tabla de configuración en Supabase para compartirlo con otros equipos. ' : 'No se pudo guardar la configuración. ') + (error?.message || ''),true);
    }
    draftForm();
  }
  async function openDraft() {
    const area = $('area-mail-draft-area')?.value || selectedArea;
    const c = configs[area] || blank(area);
    const to = text($('area-mail-draft-to')?.value || c.correo_para);
    const cc = text($('area-mail-draft-cc')?.value || c.correo_cc);
    const subject = text($('area-mail-draft-subject')?.value);
    const body = text($('area-mail-draft-body')?.value);
    const list = value => value.split(/[;,]+/).map(text).filter(Boolean);
    const recipients = [...list(to),...list(cc)];
    if (!recipients.length) { status('Primero configura y guarda al menos un destinatario para ' + area + '.',true); return; }
    const invalid = recipients.filter(email => !/^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\].]{2,}$/.test(email));
    if (invalid.length) { status('Hay direcciones inválidas: ' + invalid.join(', '),true); return; }
    const params = [];
    if (cc) params.push('cc=' + encodeURIComponent(cc.replaceAll(';',',')));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body) params.push('body=' + encodeURIComponent(body));
    const url = 'mailto:' + list(to).join(',') + (params.length ? '?' + params.join('&') : '');
    window.location.href = url;
    status('Borrador preparado para ' + area + '. Revísalo en tu aplicación de correo; no se envía automáticamente.',false);
  }
  function injectConfigPanel() {
    const section = $('view-configcorreos');
    if (!section || $('area-mail-config-panel')) return;
    const panel = document.createElement('div');
    panel.id='area-mail-config-panel';
    panel.className='ui-card border border-cyan-100 bg-white p-5';
    panel.innerHTML = '<div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><span class="module-kicker">CASA MATRIZ Y CENTRAL</span><h3 class="mt-2 text-lg font-extrabold text-slate-900">Destinatarios de correo por área</h3><p class="mt-1 max-w-3xl text-sm text-slate-600">Ingresa los destinatarios una sola vez. Al guardar, se reutilizarán en los borradores de esa área y no se mezclarán con los correos de sucursales.</p></div><span class="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">25 áreas</span></div><div class="grid grid-cols-1 gap-4 md:grid-cols-2"><label class="text-xs font-bold text-slate-600">Área<select id="area-mail-config-area" class="form-field mt-1"></select></label><label class="text-xs font-bold text-slate-600">Para · correo(s) principal(es)<input id="area-mail-to" class="form-field mt-1" placeholder="persona@empresa.cl; equipo@empresa.cl"></label><label class="text-xs font-bold text-slate-600 md:col-span-2">CC · copias<input id="area-mail-cc" class="form-field mt-1" placeholder="jefatura@empresa.cl; rrhh@empresa.cl"><span class="mt-1 block font-normal text-slate-400">Puedes ingresar varias direcciones separadas por punto y coma.</span></label><label class="text-xs font-bold text-slate-600 md:col-span-2">Asunto predeterminado<input id="area-mail-subject-template" class="form-field mt-1" placeholder="Comunicación interna – {AREA}"></label><label class="text-xs font-bold text-slate-600 md:col-span-2">Firma del área<textarea id="area-mail-signature" class="form-field mt-1" rows="2"></textarea></label><label class="text-xs font-bold text-slate-600 md:col-span-2">Plantilla de mensaje<textarea id="area-mail-body-template" class="form-field mt-1" rows="5"></textarea><span class="mt-1 block font-normal text-slate-400">Variables disponibles: {AREA} y {FIRMA}. Puedes dejar instrucciones genéricas y ajustar el contenido al preparar cada correo.</span></label></div><div class="mt-4 flex flex-wrap items-center gap-2"><button id="area-mail-save" type="button" class="corp-button"><i data-lucide="save" class="mr-1 inline h-4 w-4"></i>Guardar configuración del área</button><span class="text-xs text-slate-500">Cada área tiene su propia configuración.</span></div><p data-area-mail-status aria-live="polite" class="mt-2 text-xs text-slate-500">Cargando configuración guardada…</p>';
    const intro = section.querySelector('.module-intro');
    if (intro && intro.nextSibling) section.insertBefore(panel,intro.nextSibling); else section.prepend(panel);
    $('area-mail-config-area').addEventListener('change',()=>{selectedArea=$('area-mail-config-area').value;configForm();});
    $('area-mail-save').addEventListener('click',saveConfig);
  }
  function injectDraftPanel() {
    const section = $('view-correos');
    if (!section || $('area-mail-draft-panel')) return;
    const panel = document.createElement('div');
    panel.id='area-mail-draft-panel';
    panel.className='ui-card border border-cyan-100 bg-white p-5';
    panel.innerHTML = '<div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><span class="module-kicker">CASA MATRIZ Y CENTRAL</span><h3 class="mt-2 text-lg font-extrabold text-slate-900">Borrador de correo por área</h3><p class="mt-1 max-w-3xl text-sm text-slate-600">Usa destinatarios guardados para el área seleccionada. Este flujo es independiente de las incidencias de sucursales y nunca envía el correo automáticamente.</p></div><span class="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">Comunicación interna</span></div><div class="grid grid-cols-1 gap-4 md:grid-cols-2"><label class="text-xs font-bold text-slate-600">Área<select id="area-mail-draft-area" class="form-field mt-1"></select></label><label class="text-xs font-bold text-slate-600">Para<input id="area-mail-draft-to" class="form-field mt-1" readonly></label><label class="text-xs font-bold text-slate-600 md:col-span-2">CC<input id="area-mail-draft-cc" class="form-field mt-1" readonly></label><label class="text-xs font-bold text-slate-600 md:col-span-2">Asunto<input id="area-mail-draft-subject" class="form-field mt-1"></label><label class="text-xs font-bold text-slate-600 md:col-span-2">Mensaje<textarea id="area-mail-draft-body" class="form-field mt-1" rows="8"></textarea></label></div><div class="mt-4 flex flex-wrap gap-2"><button id="area-mail-open-draft" type="button" class="corp-button"><i data-lucide="mail" class="mr-1 inline h-4 w-4"></i>Abrir borrador en correo</button><button id="area-mail-refresh" type="button" class="corp-button-dark">Recargar destinatarios guardados</button><button id="area-mail-copy" type="button" class="rounded-lg border px-4 py-2 text-sm font-bold">Copiar mensaje</button></div><p data-area-mail-status aria-live="polite" class="mt-2 text-xs text-slate-500">Cargando configuración guardada…</p>';
    const intro = section.querySelector('.module-intro');
    if (intro && intro.nextSibling) section.insertBefore(panel,intro.nextSibling); else section.prepend(panel);
    $('area-mail-draft-area').addEventListener('change',()=>{selectedArea=$('area-mail-draft-area').value; $('area-mail-config-area').value=selectedArea;configForm();draftForm();});
    $('area-mail-open-draft').addEventListener('click',openDraft);
    $('area-mail-refresh').addEventListener('click',async()=>{try{await loadCloud();renderSelects();configForm();draftForm();status('Configuración recargada desde Supabase.',false);}catch(e){readLocal();renderSelects();configForm();draftForm();status('No se pudo consultar Supabase; se muestran los datos guardados en este navegador. '+(e?.message||''),true);}});
    $('area-mail-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('area-mail-draft-body').value);status('Mensaje copiado al portapapeles.',false);}catch(_){$('area-mail-draft-body').select();document.execCommand('copy');status('Mensaje seleccionado/copied. Puedes pegarlo en tu correo.',false);}});
  }
  async function initialize() {
    injectConfigPanel();
    injectDraftPanel();
    renderSelects();
    readLocal();
    configForm();
    draftForm();
    try {
      await loadCloud();
      renderSelects();
      configForm();
      draftForm();
      status('Configuración cargada desde Supabase. Los cambios guardados se comparten entre sesiones y equipos.',false);
    } catch (error) {
      status('Base de datos de configuración pendiente; por ahora se usa almacenamiento local de este navegador. ' + (error?.message || ''),true);
    }
  }
  document.addEventListener('DOMContentLoaded', initialize, {once:true});
  window.prepararCorreosAreas = async function(){ if(!Object.keys(configs).length) await initialize(); else { try { await loadCloud(); } catch (_) {} renderSelects(); draftForm(); } };
})();