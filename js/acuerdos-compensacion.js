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
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'long',year:'numeric'});
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
  async function searchEmployees() {
    const q=String($('ac-buscar')?.value||'').trim();
    if(q.length<2){$('ac-resultados')?.classList.add('hidden');$('ac-busqueda-estado').textContent='Ingresa al menos 2 caracteres.';return;}
    if(typeof _supabase === 'undefined'){renderResults([], 'No está disponible la conexión de datos.');return;}
    $('ac-busqueda-estado').textContent='Buscando en la nómina…';
    try {
      const term=q.replace(/[,%_()]/g,' ').trim();
      const safe=term.replace(/\s+/g,' ');
      const {data,error}=await _supabase.from('colaboradores').select('*')
        .or('rut.ilike.%'+safe+'%,nombres.ilike.%'+safe+'%,apellidos.ilike.%'+safe+'%')
        .limit(15);
      if(error) throw error;
      const rows=(data||[]).filter(c=>!c.estado || !/inactivo|desvinculado|finiquitado/i.test(String(c.estado)));
      renderResults(rows, rows.length ? '' : 'No encontramos colaboradores activos con ese nombre o RUT.');
    } catch(e) {
      console.error('Búsqueda de acuerdos:',e);
      renderResults([], 'No se pudo consultar la nómina. Revisa tu sesión y los permisos de acceso.');
      if(window.mostrarToast) window.mostrarToast('No se pudo buscar el colaborador: '+(e.message||e),'warning',8000);
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
      const output=(key==='fecha-acuerdo'||key==='desde'||key==='hasta'||key==='descanso'||key==='ingreso')?formatDate(val):val;
      document.querySelectorAll('[data-ac-out="'+key+'"]').forEach(el=>el.textContent=output||({
        'fecha-acuerdo':'[FECHA DEL ACUERDO]',desde:'[INICIO]',hasta:'[TÉRMINO]',descanso:'[FECHA DE DESCANSO]',
        nombre:'[NOMBRE DEL TRABAJADOR]',rut:'[RUT]',cargo:'[CARGO]',ingreso:'[FECHA DE INGRESO]',dias:'1'
      }[key]||''));
    });
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
    $('ac-buscar').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchEmployees,260);});
    $('ac-buscar').addEventListener('focus',()=>{if($('ac-buscar').value.trim().length>=2)searchEmployees();});
    ['ac-fecha-acuerdo','ac-desde','ac-hasta','ac-dias','ac-descanso'].forEach(id=>$(id).addEventListener('input',updatePreview));
    $('ac-fecha-acuerdo').value=isoToday();
    const style=document.createElement('style');
    style.textContent='@media print{body *{visibility:hidden!important}#view-acuerdos-compensacion,#view-acuerdos-compensacion *{visibility:visible!important}body{background:#fff!important} #sidebar{display:none!important}#view-acuerdos-compensacion{display:block!important;position:absolute!important;inset:0!important;width:100%!important;padding:0!important;margin:0!important;background:#fff!important}#view-acuerdos-compensacion>.module-intro,#view-acuerdos-compensacion>.grid>section:first-child,#view-acuerdos-compensacion>.grid>section>div:first-child{display:none!important}#view-acuerdos-compensacion>.grid{display:block!important}#view-acuerdos-compensacion .ui-card{border:0!important;box-shadow:none!important}#view-acuerdos-compensacion .bg-slate-100{background:#fff!important;padding:0!important}#ac-documento{max-width:none!important;box-shadow:none!important;padding:14mm 16mm!important;margin:0!important;font-family:Arial,sans-serif!important;color:#000!important}@page{size:A4;margin:8mm}}';
    document.head.appendChild(style);
    updatePreview();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
