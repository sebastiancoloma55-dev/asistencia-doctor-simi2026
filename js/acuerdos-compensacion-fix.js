/* Fix robusto de búsqueda y vista previa de Acuerdos de compensación. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const normalize = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const rutNormalize = v => String(v ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  const nameOf = c => [c.nombres, c.apellidos].filter(Boolean).join(' ').trim()
    || c.nombre_completo || c.nombreCompleto || c.nombre || c.full_name || c.name || '';
  const rutOf = c => c.rut || c.RUT || c.run || c.documento || '';
  const roleOf = c => c.cargo || c.Cargo || c.cargo_contractual || c.puesto || c.role || '';
  const hireOf = c => c.fecha_ingreso || c.fecha_contratacion || c.fecha_inicio_contrato || c.fecha_inicio || c.fechaIngreso || '';
  let cache = null, loading = null, timer = null, selected = null;

  function setStatus(message) {
    const el = $('ac-busqueda-estado');
    if (el) el.textContent = message;
  }
  function showResults(rows, message) {
    const panel = $('ac-resultados');
    if (!panel) return;
    panel.replaceChildren();
    if (message) {
      const p = document.createElement('div');
      p.className = 'p-3 text-sm text-slate-600';
      p.textContent = message;
      panel.appendChild(p);
    } else {
      rows.forEach(c => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'autocomplete-item';
        button.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;border-bottom:1px solid #e5edf5;background:#fff;color:#12385f;cursor:pointer;';
        const title = document.createElement('strong');
        title.textContent = nameOf(c) || 'Nombre no registrado';
        const detail = document.createElement('span');
        detail.style.cssText = 'display:block;margin-top:3px;font-size:11px;color:#60758b;';
        detail.textContent = [rutOf(c), roleOf(c), c.sucursal || c.Sucursal].filter(Boolean).join(' · ');
        button.append(title, detail);
        button.addEventListener('click', () => select(c));
        panel.appendChild(button);
      });
    }
    panel.classList.remove('hidden');
    setStatus(message || rows.length + ' coincidencia(s). Selecciona al colaborador correcto.');
  }
  async function getEmployees() {
    if (cache) return cache;
    if (loading) return loading;
    let client;
    try { client = typeof _supabase !== 'undefined' ? _supabase : window.supabaseClient; } catch (_) { client = window.supabaseClient; }
    if (!client) throw new Error('No está disponible la conexión con Supabase.');
    loading = (async () => {
      const all = [];
      const pageSize = 1000;
      for (let start = 0; start < 30000; start += pageSize) {
        const result = await client.from('colaboradores').select('*').range(start, start + pageSize - 1);
        if (result.error) throw result.error;
        const page = result.data || [];
        all.push(...page);
        if (page.length < pageSize) break;
      }
      cache = all;
      return all;
    })().catch(error => { loading = null; throw error; });
    return loading;
  }
  async function search() {
    const input = $('ac-buscar');
    const q = String(input?.value || '').trim();
    if (!input || !$('ac-resultados')) return;
    if (q.length < 2) {
      $('ac-resultados').classList.add('hidden');
      $('ac-resultados').replaceChildren();
      setStatus('Ingresa al menos 2 caracteres.');
      return;
    }
    setStatus(cache ? 'Buscando en la nómina…' : 'Conectando con la nómina…');
    try {
      const all = await getEmployees();
      if (String(input.value || '').trim() !== q) return;
      const needle = normalize(q), rutNeedle = rutNormalize(q);
      const rows = all.filter(c => {
        const state = normalize(c.estado ?? c.estatus ?? c.vigente ?? '');
        if (/inactivo|desvinculado|finiquitado|no vigente/.test(state)) return false;
        const name = normalize([c.nombres, c.apellidos, c.nombre_completo, c.nombreCompleto, c.nombre, c.full_name, c.name].filter(Boolean).join(' '));
        const rut = rutNormalize(rutOf(c));
        return name.includes(needle) || (rutNeedle.length >= 2 && rut.includes(rutNeedle));
      }).slice(0, 30);
      showResults(rows, rows.length ? '' : 'No encontramos coincidencias. Prueba con el nombre completo o el RUT sin puntos.');
    } catch (error) {
      console.error('Acuerdos: error consultando colaboradores', error);
      showResults([], 'No se pudo consultar la nómina: ' + (error.message || 'verifica sesión y permisos de lectura en Supabase.'));
    }
  }
  function dateFormat(value, long) {
    if (!value) return '';
    const d = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-CL', long ? {day:'2-digit',month:'long',year:'numeric',timeZone:'America/Santiago'} : {day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Santiago'}).replaceAll('/', '-');
  }
  function select(c) {
    selected = c;
    $('ac-nombre').value = nameOf(c);
    $('ac-rut').value = rutOf(c);
    $('ac-cargo').value = roleOf(c);
    $('ac-ingreso').value = dateFormat(hireOf(c), true) || 'No registrada';
    $('ac-buscar').value = [nameOf(c), rutOf(c)].filter(Boolean).join(' · ');
    $('ac-resultados').classList.add('hidden');
    setStatus('Colaborador seleccionado desde la nómina.');
    preview();
  }
  function preview() {
    const vals = {
      'fecha-acuerdo': $('ac-fecha-acuerdo')?.value || '',
      desde: $('ac-desde')?.value || '',
      hasta: $('ac-hasta')?.value || '',
      dias: $('ac-dias')?.value || '1',
      descanso: $('ac-descanso')?.value || '',
      nombre: $('ac-nombre')?.value || '',
      rut: $('ac-rut')?.value || '',
      cargo: $('ac-cargo')?.value || '',
      ingreso: selected ? hireOf(selected) : ''
    };
    const placeholders = {'fecha-acuerdo':'[FECHA DEL ACUERDO]',desde:'[INICIO]',hasta:'[TÉRMINO]',descanso:'[FECHA DE DESCANSO]',nombre:'[NOMBRE DEL TRABAJADOR]',rut:'[RUT]',cargo:'[CARGO]',ingreso:'[FECHA DE INGRESO]',dias:'1'};
    Object.keys(vals).forEach(key => {
      let value = vals[key];
      if (key === 'fecha-acuerdo' || key === 'ingreso') value = dateFormat(value, true);
      else if (['desde','hasta','descanso'].includes(key)) value = dateFormat(value, false);
      document.querySelectorAll('[data-ac-out="' + key + '"]').forEach(el => el.textContent = value || placeholders[key] || '');
    });
    document.querySelectorAll('[data-ac-out="tabla-dias"]').forEach(el => el.textContent = (vals.dias || '1') + ' (' + (dateFormat(vals.descanso, false) || '[FECHA DE DESCANSO]') + ')');
    const ok = Boolean(selected && vals['fecha-acuerdo'] && vals.desde && vals.hasta && vals.descanso && vals.hasta >= vals.desde && Number.isInteger(Number(vals.dias)) && Number(vals.dias) >= 1);
    const status = $('ac-validacion');
    if (status) {
      status.className = ok ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800' : 'helper-note';
      status.textContent = !selected ? 'Selecciona un colaborador de la nómina.' : !vals['fecha-acuerdo'] || !vals.desde || !vals.hasta || !vals.descanso ? 'Completa todas las fechas requeridas.' : vals.hasta < vals.desde ? 'La fecha de término no puede ser anterior a la fecha de inicio.' : ok ? 'Datos completos. Revisa el documento antes de imprimir.' : 'Revisa los campos obligatorios.';
    }
    return ok;
  }
  function injectStyles() {
    if ($('ac-final-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'ac-final-fix-style';
    style.textContent = `
      #ac-resultados{position:absolute;z-index:100;top:100%;left:0;right:0;max-height:300px;overflow:auto;border:1px solid #cbdced;border-radius:12px;background:#fff;box-shadow:0 12px 30px rgba(8,47,85,.16)}
      #ac-resultados.hidden{display:none!important}
      #view-acuerdos-compensacion .grid.xl\\:grid-cols-\\[minmax\\(320px\\,390px\\)_minmax\\(0\\,1fr\\)\\]{align-items:start}
      #ac-documento{width:100%;max-width:216mm;margin:0 auto;color:#111;font-family:Arial,Helvetica,sans-serif}
      #ac-documento .ac-page{box-sizing:border-box;width:216mm;height:279mm;min-height:279mm;max-height:279mm;overflow:hidden;padding:11mm 13mm 9mm;margin:0 auto 18px;background:#fff;box-shadow:0 3px 16px rgba(15,23,42,.13);font-size:9pt;line-height:1.28;color:#111}
      #ac-documento .ac-doc-header{position:relative;min-height:20mm;margin-bottom:3mm;padding-top:1mm;text-align:center}
      #ac-documento .ac-doc-logo{position:absolute;left:0;top:0;width:19mm;height:19mm;object-fit:contain}
      #ac-documento .ac-doc-header h2{font-size:14pt;font-weight:700;margin:0;text-align:center}
      #ac-documento .ac-doc-p{font-size:9pt;line-height:1.28;margin:0 0 2.2mm;text-align:justify}
      #ac-documento .ac-page h3{font-size:9pt;line-height:1.15;margin:2.2mm 0 1mm;font-weight:700;text-decoration:underline}
      #ac-documento .ac-identification{width:100%;border-collapse:collapse;margin:2mm 0}
      #ac-documento .ac-identification td{padding:1mm;font-size:8.8pt;border-bottom:1px solid #dce7f3}
      #ac-documento .ac-worked-table{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:8pt;text-align:center}
      #ac-documento .ac-worked-table th,#ac-documento .ac-worked-table td{padding:1.2mm;border:1px solid #cbdced}
      #ac-documento .ac-page-two .ac-doc-p{font-size:8.5pt;line-height:1.22;margin-bottom:1.8mm}
      #ac-documento .ac-page-two h3{font-size:8.7pt;margin:1.8mm 0 .8mm}
      #ac-documento .ac-page-two .ac-representation{margin-top:2mm}
      #ac-documento .ac-signatures{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:3mm 0 0;align-items:end;text-align:center}
      #ac-documento .ac-signature-block{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;gap:1mm;text-align:center;font-size:8pt}
      #ac-documento .ac-signature-block img{width:27mm;height:17mm;object-fit:contain;margin:0 auto .5mm}
      #ac-documento .ac-worker-blank{height:17mm;width:100%}
      #ac-documento .ac-signature-line{width:100%;border-top:1px solid #111;margin-bottom:1mm}
      #ac-documento .ac-signature-block strong{font-size:8pt;line-height:1.15}
      #ac-documento .ac-page-one::after,#ac-documento .ac-page-two::after{display:block;font-size:7pt;color:#6b7280;text-align:right;padding-top:2mm;margin-top:2mm;border-top:1px solid #e5e7eb}
      #ac-documento .ac-page-one::after{content:'ACUERDO DE COMPENSACIÓN · PÁGINA 1 DE 2'}
      #ac-documento .ac-page-two::after{content:'ACUERDO DE COMPENSACIÓN · PÁGINA 2 DE 2'}
      @media(max-width:900px){#ac-documento{width:100%;max-width:100%}#ac-documento .ac-page{width:100%;height:auto;min-height:0;max-height:none;overflow:visible;padding:24px 20px;margin-bottom:14px}#ac-documento .ac-doc-logo{width:54px;height:54px}#ac-documento .ac-doc-header{min-height:60px;padding-top:8px}#ac-documento .ac-page-two .ac-signatures{gap:12px}#ac-documento .ac-signature-block img{width:100px;height:62px}#ac-documento .ac-worker-blank{height:62px}}
      @media print{
        @page{size:letter;margin:0}
        html,body{width:216mm!important;margin:0!important;padding:0!important;background:#fff!important}
        body *{visibility:hidden!important}
        #view-acuerdos-compensacion,#view-acuerdos-compensacion *{visibility:visible!important}
        #sidebar,main>header,#view-acuerdos-compensacion>.module-intro,#view-acuerdos-compensacion>.grid>section:first-child,#simi-context-assistant,.simi-surprise-toast{display:none!important}
        #view-acuerdos-compensacion{display:block!important;position:absolute!important;left:0!important;top:0!important;width:216mm!important;margin:0!important;padding:0!important;background:#fff!important}
        #view-acuerdos-compensacion>.grid{display:block!important;margin:0!important;padding:0!important}
        #view-acuerdos-compensacion>.grid>section{display:block!important;width:100%!important;max-width:none!important}
        #view-acuerdos-compensacion>.grid>section:last-child{display:block!important}
        #view-acuerdos-compensacion .ui-card,#view-acuerdos-compensacion .bg-slate-100{border:0!important;box-shadow:none!important;background:#fff!important;padding:0!important}
        #ac-documento{display:block!important;width:216mm!important;max-width:216mm!important;margin:0!important;padding:0!important}
        #ac-documento .ac-page{display:block!important;box-sizing:border-box!important;width:216mm!important;height:279mm!important;min-height:279mm!important;max-height:279mm!important;overflow:hidden!important;margin:0!important;padding:10mm 13mm 8mm!important;box-shadow:none!important;break-inside:avoid!important;page-break-inside:avoid!important}
        #ac-documento .ac-page-one{break-after:page!important;page-break-after:always!important}
        #ac-documento .ac-page-two{break-before:avoid!important;page-break-before:avoid!important;break-after:auto!important;page-break-after:auto!important}
        #ac-documento .ac-doc-p{font-size:8.5pt!important;line-height:1.2!important;margin-bottom:1.7mm!important}
        #ac-documento .ac-page h3{font-size:8.5pt!important;margin:1.8mm 0 .8mm!important}
        #ac-documento .ac-page-two .ac-doc-p{font-size:8.1pt!important;line-height:1.15!important;margin-bottom:1.4mm!important}
        #ac-documento .ac-page-two h3{font-size:8.3pt!important;margin:1.5mm 0 .7mm!important}
        #ac-documento .ac-page-two .ac-signatures{margin-top:2mm!important;gap:7mm!important;break-inside:avoid!important;page-break-inside:avoid!important}
        #ac-documento .ac-page-two .ac-signature-block img{width:24mm!important;height:14mm!important}
        #ac-documento .ac-page-two .ac-worker-blank{height:14mm!important}
        #ac-documento .ac-page-two .ac-signature-block strong{font-size:7.5pt!important}
        #ac-documento .ac-page-one::after,#ac-documento .ac-page-two::after{display:none!important;content:none!important}
      }`;
    document.head.appendChild(style);
  }
  function init() {
    if (!$('view-acuerdos-compensacion') || !$('ac-buscar')) return;
    injectStyles();
    const input = $('ac-buscar');
    if (input.dataset.acFinalFix === '1') return;
    input.dataset.acFinalFix = '1';
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 160); });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) search(); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') $('ac-resultados')?.classList.add('hidden'); });
    ['ac-fecha-acuerdo','ac-desde','ac-hasta','ac-dias','ac-descanso'].forEach(id => $(id)?.addEventListener('input', preview));
    document.querySelectorAll('#view-acuerdos-compensacion button[onclick*="imprimirAcuerdoCompensacion"]').forEach(b => {
      b.addEventListener('click', e => { if (!preview()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    });
    const firma = $('ac-firma-img');
    if (firma) {
      fetch('/firma-empleador.jpg.b64', {cache:'no-store'}).then(r => { if (!r.ok) throw new Error('No se encontró el archivo de firma institucional'); return r.text(); })
        .then(data => { const clean = data.trim(); if (clean.length > 1000 && /^[A-Za-z0-9+/]+={0,2}$/.test(clean)) firma.src = 'data:image/jpeg;base64,' + clean; })
        .catch(err => console.warn('Firma institucional no disponible:', err));
    }
    preview();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
  const observer = new MutationObserver(() => { if ($('view-acuerdos-compensacion') && $('ac-buscar') && !$('ac-buscar').dataset.acFinalFix) init(); });
  observer.observe(document.documentElement, {childList:true,subtree:true});
})();