/* Módulo integrado: Acuerdos de compensación. Usa la sesión Supabase existente. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let searchTimer = null;
  let selectedEmployee = null;
  const dateFields = ['fecha-acuerdo','desde','hasta','dias','descanso','nombre','rut','cargo','ingreso'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function formatDate(value) {
    if (!value) return '';
    const d = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'long',year:'numeric'}).replace(/ de ([a-záéíóúñ])/g,(_,m)=>' de '+m.toUpperCase());
  }
  function formatShortDate(value) {
    if (!value) return '[FECHA DE DESCANSO]';
    const d=new Date(String(value).length===10?value+'T12:00:00':value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric'}).replaceAll('/','-');
  }
  function isoToday() {
    const d = new Date();
    return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }
  function employeeName(c) {
    const full = [c.nombres,c.apellidos].filter(Boolean).join(' ').trim();
    return full || c.nombre_completo || c.nombre || c.nombreCompleto || '';
  }
  function employeeHireDate(c) {
    return c.fecha_ingreso || c.fecha_contratacion || c.fecha_inicio_contrato || c.fecha_inicio || c.fechaIngreso || '';
  }
  function renderResults(rows, message) {
    const panel=$('ac-resultados'),status=$('ac-busqueda-estado');
    if (!panel || !status) return;
    panel.replaceChildren();
    if (message) {
      const div=document.createElement('div');div.className='p-3 text-xs text-slate-500';div.textContent=message;panel.appendChild(div);
    } else rows.forEach(c=>{
      const b=document.createElement('button');b.type='button';b.className='autocomplete-item';
      const strong=document.createElement('b');strong.textContent=employeeName(c)||'Nombre no registrado';
      const detail=document.createElement('span');detail.className='text-slate-500';detail.textContent='\n'+[c.rut,c.cargo,c.sucursal].filter(Boolean).join(' · ');
      b.append(strong,document.createElement('br'),detail);
      b.addEventListener('click',()=>selectEmployee(c));panel.appendChild(b);
    });
    panel.classList.remove('hidden');
    status.textContent=message||rows.length+' coincidencia(s). Selecciona al colaborador correcto.';
  }
  let employeeCache = null;
  let employeeLoadPromise = null;
  const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();
  const normalizeRut = value => String(value ?? '').toUpperCase().replace(/[^0-9K]/g,'');
  async function loadEmployeesOnce() {
    if (employeeCache) return employeeCache;
    if (employeeLoadPromise) return employeeLoadPromise;
    employeeLoadPromise = (async () => {
      const all = [];
      const pageSize = 1000;
      for (let from = 0; from < 10000; from += pageSize) {
        const { data, error } = await _supabase.from('colaboradores')
          .select('id,rut,nombres,apellidos,cargo,sucursal,fecha_ingreso,estado')
          .order('nombres', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        all.push(...page);
        if (page.length < pageSize) break;
      }
      employeeCache = all;
      return all;
    })().catch(error => { employeeLoadPromise = null; throw error; });
    return employeeLoadPromise;
  }
  async function searchEmployees() {
    const input = $('ac-buscar');
    const q = String(input?.value || '').trim();
    const panel = $('ac-resultados');
    const status = $('ac-busqueda-estado');
    if (!input || !panel || !status) return;
    if (q.length < 2) {
      panel.classList.add('hidden');
      panel.replaceChildren();
      status.textContent = 'Ingresa al menos 2 caracteres.';
      return;
    }
    if (typeof _supabase === 'undefined' || !_supabase) {
      renderResults([], 'No está disponible la conexión de datos. Recarga la página e inicia sesión nuevamente.');
      return;
    }
    status.textContent = employeeCache ? 'Filtrando nómina…' : 'Cargando nómina y buscando…';
    try {
      const all = await loadEmployeesOnce();
      // Si el usuario siguió escribiendo mientras cargaba, no mostrar resultados obsoletos.
      if (String(input.value || '').trim() !== q) return;
      const needle = normalizeSearch(q);
      const rutNeedle = normalizeRut(q);
      const rows = all.filter(c => {
        if (c.estado && /inactivo|desvinculado|finiquitado/i.test(String(c.estado))) return false;
        const name = normalizeSearch([c.nombres, c.apellidos, c.nombre_completo, c.nombre].filter(Boolean).join(' '));
        const rut = normalizeRut(c.rut || c.RUT);
        return name.includes(needle) || (rutNeedle.length >= 2 && rut.includes(rutNeedle));
      }).slice(0, 20);
      renderResults(rows, rows.length ? '' : 'No encontramos colaboradores activos con ese nombre o RUT.');
    } catch (e) {
      console.error('Búsqueda de acuerdos:', e);
      renderResults([], 'No se pudo consultar la nómina. Verifica tu sesión y los permisos de lectura de colaboradores.');
      if (window.mostrarToast) window.mostrarToast('Error al buscar colaborador: ' + (e.message || e), 'error', 8000);
    }
  }
  function selectEmployee(c) {
    selectedEmployee=c;
    $('ac-nombre').value=employeeName(c);
    $('ac-rut').value=c.rut||c.RUT||'';
    $('ac-cargo').value=c.cargo||c.Cargo||'';
    $('ac-ingreso').value=formatDate(employeeHireDate(c))||'No registrada';
    $('ac-buscar').value=[employeeName(c),c.rut||c.RUT].filter(Boolean).join(' · ');
    $('ac-resultados').classList.add('hidden');
    $('ac-busqueda-estado').textContent='Colaborador seleccionado desde la nómina.';
    updatePreview();
  }
  function readValues() {
    return {
      'fecha-acuerdo':$('ac-fecha-acuerdo')?.value||'',
      desde:$('ac-desde')?.value||'',
      hasta:$('ac-hasta')?.value||'',
      dias:$('ac-dias')?.value||'1',
      descanso:$('ac-descanso')?.value||'',
      nombre:$('ac-nombre')?.value||'',
      rut:$('ac-rut')?.value||'',
      cargo:$('ac-cargo')?.value||'',
      ingreso:selectedEmployee?employeeHireDate(selectedEmployee):''
    };
  }
  function updatePreview() {
    const values=readValues();
    dateFields.forEach(key=>{
      const val=values[key];
      const output=(key==='fecha-acuerdo'||key==='ingreso')?formatDate(val):(key==='desde'||key==='hasta'||key==='descanso')?formatShortDate(val):val;
      document.querySelectorAll('[data-ac-out="'+key+'"]').forEach(el=>el.textContent=output||({
        'fecha-acuerdo':'[FECHA DEL ACUERDO]',desde:'[INICIO]',hasta:'[TÉRMINO]',descanso:'[FECHA DE DESCANSO]',
        nombre:'[NOMBRE DEL TRABAJADOR]',rut:'[RUT]',cargo:'[CARGO]',ingreso:'[FECHA DE INGRESO]',dias:'1'
      }[key]||''));
    });
    document.querySelectorAll('[data-ac-out="tabla-dias"]').forEach(el=>el.textContent=(values.dias||'1')+' ('+formatShortDate(values.descanso)+')');
    const valid=$('ac-validacion');
    const ok=selectedEmployee && values.desde && values.hasta && values.descanso && values['fecha-acuerdo'] &&
      values.hasta>=values.desde && Number(values.dias)>=1 && Number.isInteger(Number(values.dias));
    if(valid) {
      valid.className=ok?'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800':'helper-note';
      valid.textContent=!selectedEmployee?'Selecciona un colaborador de la nómina.':!values.desde||!values.hasta||!values.descanso?'Completa todas las fechas requeridas.':values.hasta<values.desde?'La fecha de término no puede ser anterior a la fecha de inicio.':Number(values.dias)<1||!Number.isInteger(Number(values.dias))?'Los días por compensar deben ser un número entero mayor que cero.':ok?'Datos completos. Revisa el documento y valida los días con los registros de asistencia y turnos.':'Completa los campos requeridos.';
    }
    return Boolean(ok);
  }
  function clearForm() {
    selectedEmployee=null;
    $('ac-buscar').value='';$('ac-nombre').value='';$('ac-rut').value='';$('ac-cargo').value='';$('ac-ingreso').value='';
    $('ac-fecha-acuerdo').value=isoToday();$('ac-desde').value='';$('ac-hasta').value='';$('ac-dias').value='1';$('ac-descanso').value='';$('ac-notas').value='';
    $('ac-resultados').classList.add('hidden');$('ac-busqueda-estado').textContent='Ingresa al menos 2 caracteres.';
    updatePreview();
  }
  async function saveAgreement() {
    if(!updatePreview()){if(window.mostrarToast)window.mostrarToast('Completa los datos y selecciona un colaborador antes de registrar.','warning');return;}
    try {
      const {data:sessionData,error:sessionError}=await _supabase.auth.getSession();
      if(sessionError) throw sessionError;
      const session=sessionData?.session;
      if(!session?.user) throw new Error('Inicia sesión para registrar el acuerdo.');
      const v=readValues();
      const payload={
        colaborador_id:String(selectedEmployee.id),
        nombre:v.nombre,rut:v.rut,cargo:v.cargo||null,
        fecha_ingreso:employeeHireDate(selectedEmployee)||null,
        fecha_acuerdo:v['fecha-acuerdo'],
        fecha_trabajada_desde:v.desde,fecha_trabajada_hasta:v.hasta,
        dias_compensar:Number(v.dias),fecha_descanso_acordada:v.descanso,
        notas_internas:$('ac-notas').value.trim()||null,
        generado_por:session.user.email||''
      };
      const {error}=await _supabase.from('acuerdos_compensacion').insert(payload);
      if(error) throw error;
      if(window.registrarAuditoria) await window.registrarAuditoria('acuerdos-compensacion','CREA_ACUERDO',v.nombre+' · '+v.rut+' · '+v.dias+' día(s)');
      if(window.mostrarToast)window.mostrarToast('Acuerdo registrado correctamente. Ahora puedes imprimirlo o guardarlo como PDF.','success',7000);
    } catch(e) {
      console.error('Registro de acuerdo de compensación:',e);
      if(window.mostrarToast)window.mostrarToast('No se pudo registrar. Verifica que la migración de Supabase esté aplicada y que tu usuario tenga permiso. '+(e.message||''),'error',10000);
    }
  }
  function printAgreement() {
    if(!updatePreview()){if(window.mostrarToast)window.mostrarToast('Completa los datos y selecciona un colaborador antes de generar el documento.','warning');return;}
    window.print();
  }
  window.limpiarAcuerdoCompensacion=clearForm;
  window.registrarAcuerdoCompensacion=saveAgreement;
  window.imprimirAcuerdoCompensacion=printAgreement;
  function init() {
    if(!$('view-acuerdos-compensacion')) return;
    const firmaImg=$('ac-firma-img');
    if(firmaImg){
      fetch('/public/firma-empleador.jpg.b64',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se pudo cargar la firma institucional desde /public');return r.text();}).then(data=>{const clean=data.trim();if(clean.length>1000&&/^[A-Za-z0-9+/]+={0,2}$/.test(clean)){firmaImg.src='data:image/jpeg;base64,'+clean;firmaImg.classList.add('ac-signature-loaded');}}).catch(e=>{console.warn('No se pudo cargar la firma institucional:',e);const existing=$('pap-firma-preview');if(existing&&existing.src&&existing.src.startsWith('data:image/'))firmaImg.src=existing.src;});
    }
    const searchInput = $('ac-buscar');
    if (!searchInput) return;
    if (searchInput.dataset.acSearchBound !== 'true') {
      searchInput.dataset.acSearchBound = 'true';
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchEmployees, 180);
      });
      searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) searchEmployees();
      });
      searchInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') $('ac-resultados')?.classList.add('hidden');
      });
    }
    ['ac-fecha-acuerdo','ac-desde','ac-hasta','ac-dias','ac-descanso'].forEach(id=>$(id).addEventListener('input',updatePreview));
    $('ac-fecha-acuerdo').value=isoToday();
    const style=document.createElement('style');
    style.textContent='.acuerdo-paper{width:100%;max-width:216mm;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}.ac-page{position:relative;box-sizing:border-box;width:216mm;min-height:279.4mm;padding:15mm 18mm;margin:0 auto 14px;background:#fff;box-shadow:0 2px 12px rgba(15,23,42,.12);font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.52;color:#111}.ac-doc-header{position:relative;display:block;min-height:25mm;margin-bottom:7mm;padding-top:4mm;text-align:center}.ac-doc-logo{position:absolute;left:-12mm;top:-10mm;display:block;width:25mm;height:25mm;object-fit:contain;object-position:left top}.ac-doc-header h2{margin:0;padding:0;text-align:center;font-size:15pt;font-weight:700;letter-spacing:.2px}.ac-doc-p{text-align:justify;margin:0 0 5mm;line-height:1.62;font-size:10.5pt}.ac-page h3{font-size:10.5pt;font-weight:700;text-decoration:underline;margin:5mm 0 2mm}.ac-identification{width:100%;border-collapse:collapse;margin:7mm 0}.ac-identification td{padding:2mm 1mm;font-size:10.5pt}.ac-identification td:first-child{width:45%}.ac-worked-table{width:100%;border-collapse:collapse;margin:6mm 0;font-size:9.5pt;text-align:center}.ac-worked-table th,.ac-worked-table td{border:1px solid #444;padding:2.8mm 2mm}.ac-worked-table th{font-weight:700}.ac-worked-table .ac-total-label{text-align:right}.ac-representation{margin-top:9mm}.ac-signatures{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12mm;margin-top:8mm;align-items:end;text-align:center;font-size:9pt}.ac-signature-block{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:1.5mm}.ac-signature-block img{display:block;width:48mm;height:34mm;object-fit:cover;object-position:center top;margin:0 auto 1mm}.ac-signature-line{width:100%;border-top:1px solid #111;margin-bottom:1.5mm}.ac-signature-block strong{display:block;font-size:9pt;line-height:1.3}.ac-worker-blank{height:34mm;width:100%}.ac-page-two .ac-doc-p{font-size:9.5pt;line-height:1.38;margin-bottom:3mm}.ac-page-two h3{font-size:9.5pt;margin:3mm 0 1.5mm}.ac-page-two .ac-representation{margin-top:4mm}.ac-final-rut{display:none!important}.@media(max-width:900px){.ac-page{width:100%;min-height:0;padding:24px 20px;margin-bottom:12px}.ac-doc-logo{width:54px;height:54px;left:-12px;top:-10px}.ac-doc-header{min-height:64px;padding-top:12px}.ac-doc-header h2{font-size:14px;padding-top:0}.ac-doc-p{font-size:10px}.ac-signatures{gap:18px}.ac-signature-block img{width:110px;height:100px}.ac-worker-blank{height:100px}}@media print{ @page{size:letter;margin:0}body *{visibility:hidden!important}#view-acuerdos-compensacion,#view-acuerdos-compensacion *{visibility:visible!important}body{background:#fff!important}#sidebar{display:none!important}#view-acuerdos-compensacion{display:block!important;position:absolute!important;inset:0!important;width:100%!important;padding:0!important;margin:0!important;background:#fff!important}#view-acuerdos-compensacion>.module-intro,#view-acuerdos-compensacion>.grid>section:first-child,#view-acuerdos-compensacion>.grid>section>div:first-child{display:none!important}#view-acuerdos-compensacion>.grid{display:block!important}#view-acuerdos-compensacion .ui-card{border:0!important;box-shadow:none!important}#view-acuerdos-compensacion .bg-slate-100{background:#fff!important;padding:0!important}#ac-documento{max-width:none!important;width:216mm!important;margin:0!important;padding:0!important;box-shadow:none!important;font-family:Arial,sans-serif!important;color:#000!important}#ac-documento .ac-page{width:216mm!important;height:279.4mm!important;min-height:279.4mm!important;margin:0!important;padding:15mm 18mm!important;box-shadow:none!important;overflow:hidden!important;break-after:page!important;page-break-after:always!important}#ac-documento .ac-page:last-child{break-after:auto!important;page-break-after:auto!important}.ac-signature-block img{width:48mm!important;height:34mm!important}.ac-worker-blank{height:34mm!important}#ac-documento .ac-page-two .ac-doc-p{font-size:9.5pt!important;line-height:1.38!important;margin-bottom:3mm!important}#ac-documento .ac-page-two h3{font-size:9.5pt!important;margin:3mm 0 1.5mm!important}#ac-documento .ac-page-two .ac-signatures{margin-top:8mm!important}}';

    style.textContent += `
      /* Acuerdos: paginación determinista de tres páginas, tanto en pantalla como al imprimir */
      #ac-documento{box-sizing:border-box;width:215.9mm;max-width:215.9mm;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111}
      #ac-documento .ac-page{box-sizing:border-box;width:215.9mm;height:279mm;min-height:279mm;padding:16mm 18mm;margin:0 auto 14px;background:#fff;overflow:hidden;position:relative;box-shadow:0 3px 14px rgba(15,23,42,.12);font-size:10.5pt;line-height:1.48}
      #ac-documento .ac-page-one .ac-doc-header{min-height:25mm;margin-bottom:6mm}
      #ac-documento .ac-page-one .ac-doc-p{font-size:10.2pt;line-height:1.48;margin-bottom:4mm}
      #ac-documento .ac-page-one h3{margin:4mm 0 2mm}
      #ac-documento .ac-page-two .ac-doc-p{font-size:10.2pt;line-height:1.48;margin-bottom:4mm}
      #ac-documento .ac-page-two h3{font-size:10.5pt;margin:4mm 0 2mm}
      #ac-documento .ac-page-three{display:block!important;padding-top:24mm}
      #ac-documento .ac-page-three h3{margin:0 0 3mm;font-size:10.5pt}
      #ac-documento .ac-page-three .ac-doc-p{font-size:10.5pt;line-height:1.55;margin-bottom:5mm}
      #ac-documento .ac-page-three .ac-representation{margin-top:14mm}
      #ac-documento .ac-page-three .ac-signatures{margin-top:18mm;gap:14mm;align-items:end}
      #ac-documento .ac-page-three .ac-signature-block img{width:48mm;height:38mm;object-fit:contain}
      #ac-documento .ac-page-three .ac-worker-blank{height:38mm}
      #ac-documento .ac-page-one::after,#ac-documento .ac-page-two::after,#ac-documento .ac-page-three::after{position:absolute;left:18mm;right:18mm;bottom:7mm;padding-top:2mm;border-top:1px solid #dbe4ee;font-size:8pt;line-height:1.2;color:#64748b;letter-spacing:.25px;text-align:right}
      #ac-documento .ac-page-one::after{content:"ACUERDO DE COMPENSACIÓN · PÁGINA 1 DE 3"}
      #ac-documento .ac-page-two::after{content:"ACUERDO DE COMPENSACIÓN · PÁGINA 2 DE 3"}
      #ac-documento .ac-page-three::after{content:"ACUERDO DE COMPENSACIÓN · PÁGINA 3 DE 3"}
      @media(max-width:900px){
        #ac-documento{width:100%;max-width:100%}
        #ac-documento .ac-page{width:100%;height:auto;min-height:0;padding:28px 24px;margin:0 auto 16px;overflow:visible}
        #ac-documento .ac-page-three{padding-top:32px}
        #ac-documento .ac-page-three .ac-signatures{margin-top:36px}
      }
      @media print{
        @page{size:letter;margin:0}
        html,body{width:215.9mm!important;margin:0!important;padding:0!important;background:#fff!important}
        body *{visibility:hidden!important}
        #view-acuerdos-compensacion,#view-acuerdos-compensacion *{visibility:visible!important}
        #sidebar,#topbar,.module-intro,#view-acuerdos-compensacion>.grid>section:first-child{display:none!important}
        #view-acuerdos-compensacion{display:block!important;position:absolute!important;left:0!important;top:0!important;width:215.9mm!important;margin:0!important;padding:0!important;background:#fff!important}
        #view-acuerdos-compensacion>.grid{display:block!important;margin:0!important;padding:0!important}
        #view-acuerdos-compensacion .ui-card{border:0!important;box-shadow:none!important}
        #view-acuerdos-compensacion .bg-slate-100{background:#fff!important;padding:0!important}
        #ac-documento{display:block!important;width:215.9mm!important;max-width:215.9mm!important;margin:0!important;padding:0!important;box-shadow:none!important}
        #ac-documento .ac-page{display:block!important;width:215.9mm!important;height:279mm!important;min-height:279mm!important;margin:0!important;padding:16mm 18mm!important;overflow:hidden!important;box-shadow:none!important;break-inside:avoid!important;page-break-inside:avoid!important;break-after:page!important;page-break-after:always!important}
        #ac-documento .ac-page-three{display:block!important;padding-top:24mm!important}
        #ac-documento .ac-page:last-child{break-after:auto!important;page-break-after:auto!important}
        #ac-documento .ac-page-two .ac-doc-p{font-size:10.2pt!important;line-height:1.48!important;margin-bottom:4mm!important}
        #ac-documento .ac-page-two h3{font-size:10.5pt!important;margin:4mm 0 2mm!important}
        #ac-documento .ac-page-three .ac-signatures{margin-top:18mm!important}
        #ac-documento .ac-page-three .ac-signature-block img{width:48mm!important;height:38mm!important;object-fit:contain!important}
        #ac-documento .ac-page-three .ac-worker-blank{height:38mm!important}
      }`;
    document.head.appendChild(style);
    updatePreview();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
