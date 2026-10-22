/* Exportador de reportes de asistencia por área/centro de costo o sucursal.
 * Procesamiento local en el navegador: no se suben archivos a Supabase ni a terceros.
 */
(function () {
  'use strict';
  const COLUMNS = [
    'Fecha', 'RUT', 'Nombre', 'Centro de Costo', 'Entrada prog.', 'Entrada real',
    'Llegada temp. cal.', 'Salida prog.', 'Salida real', 'Salida tardía cal.',
    'Colación salida', 'Colación entrada', 'Colación', 'Atrasos (min)',
    'Salida anticipada (min)', 'Exceso colación (min)', 'Horas extra (min)'
  ];
  const $ = id => document.getElementById(id);
  let sourceRows = [];
  let outputFiles = [];
  let warnings = [];

  function norm(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function get(row, names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const found = keys.find(k => norm(k) === norm(name));
      if (found != null && row[found] !== '' && row[found] != null) return row[found];
    }
    return '';
  }
  function dateText(value) {
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX && XLSX.SSF) {
      const d = XLSX.SSF.parse_date_code(value);
      if (d && d.y) return [d.y, String(d.m).padStart(2,'0'), String(d.d).padStart(2,'0')].join('-');
    }
    const s = String(value == null ? '' : value).trim();
    const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return iso[1] + '-' + iso[2].padStart(2,'0') + '-' + iso[3].padStart(2,'0');
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return dmy[3] + '-' + dmy[2].padStart(2,'0') + '-' + dmy[1].padStart(2,'0');
    return s;
  }
  function seconds(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !isNaN(value)) return value.getHours()*3600 + value.getMinutes()*60 + value.getSeconds();
    if (typeof value === 'number' && isFinite(value)) {
      if (value >= 0 && value < 1) return Math.round(value * 86400);
      if (value >= 1 && value < 2) return Math.round((value % 1) * 86400);
    }
    const s = String(value).trim();
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3] || 0);
    return null;
  }
  function timeText(value) {
    const n = seconds(value);
    if (n == null) return '';
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
    return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
  }
  function durationText(total) {
    total = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
  }
  function deltaDescription(actual, planned, earlyLabel, lateLabel) {
    if (actual == null || planned == null) return 'Sin marcación';
    const diff = actual - planned;
    if (diff > 0) return lateLabel + ' por ' + durationText(diff);
    if (diff < 0) return earlyLabel + ' por ' + durationText(-diff);
    return 'En horario';
  }
  function minutesLate(actual, planned) {
    return actual == null || planned == null ? '' : Math.max(0, Math.floor((actual - planned) / 60));
  }
  function minutesEarly(actual, planned) {
    return actual == null || planned == null ? '' : Math.max(0, Math.floor((planned - actual) / 60));
  }
  function minutesOvertime(actual, planned) {
    return actual == null || planned == null ? '' : Math.max(0, Math.ceil((actual - planned) / 60));
  }
  function transform(row, rowNumber) {
    const date = dateText(get(row, ['Fecha','Día']));
    const rut = String(get(row, ['Rut','RUT'])).trim();
    const name = String(get(row, ['Nombre','Colaborador'])).trim();
    const branch = String(get(row, ['Sucursal','Local'])).trim();
    const cost = String(get(row, ['Centro de costo','Centro de Costo','Área','Area'])).trim();
    const entryPlannedRaw = get(row, ['Entrada turno','Entrada programada','Entrada prog.']);
    const entryActualRaw = get(row, ['Entrada real']);
    const exitPlannedRaw = get(row, ['Salida turno','Salida programada','Salida prog.']);
    const exitActualRaw = get(row, ['Salida real']);
    const lunchStartRaw = get(row, ['Entrada colación real','Colación salida','Salida colación']);
    const lunchEndRaw = get(row, ['Salida colación real','Colación entrada','Entrada colación']);
    const entryPlanned = seconds(entryPlannedRaw), entryActual = seconds(entryActualRaw);
    const exitPlanned = seconds(exitPlannedRaw), exitActual = seconds(exitActualRaw);
    const lunchStart = seconds(lunchStartRaw), lunchEnd = seconds(lunchEndRaw);
    const missing = [];
    if (!date) missing.push('fecha');
    if (!rut) missing.push('RUT');
    if (!name) missing.push('nombre');
    if (!entryPlannedRaw && !exitPlannedRaw) missing.push('horario programado');
    if (missing.length) warnings.push('Fila ' + rowNumber + ': faltan ' + missing.join(', ') + '.');
    const lunchSeconds = lunchStart != null && lunchEnd != null ? Math.max(0, lunchEnd - lunchStart) : null;
    const lunchOver = lunchSeconds == null ? '' : Math.max(0, Math.floor((lunchSeconds - 1800) / 60));
    const lunchLabel = lunchSeconds == null ? 'Sin marcación de colación' :
      (lunchOver > 0 ? 'Exceso colación ' + durationText(lunchOver * 60) : 'Marcó colación');
    return {
      'Fecha': date, 'RUT': rut, 'Nombre': name, 'Centro de Costo': cost || branch,
      'Entrada prog.': timeText(entryPlannedRaw), 'Entrada real': timeText(entryActualRaw),
      'Llegada temp. cal.': deltaDescription(entryActual, entryPlanned, 'Entrada anticipada', 'Llegó tarde'),
      'Salida prog.': timeText(exitPlannedRaw), 'Salida real': timeText(exitActualRaw),
      'Salida tardía cal.': deltaDescription(exitActual, exitPlanned, 'Salida anticipada', 'Salida tarde'),
      'Colación salida': timeText(lunchStartRaw), 'Colación entrada': timeText(lunchEndRaw),
      'Colación': lunchLabel,
      'Atrasos (min)': minutesLate(entryActual, entryPlanned),
      'Salida anticipada (min)': minutesEarly(exitActual, exitPlanned),
      'Exceso colación (min)': lunchOver,
      'Horas extra (min)': minutesOvertime(exitActual, exitPlanned),
      __groupBranch: branch || 'SIN SUCURSAL', __groupCost: cost || 'SIN ÁREA'
    };
  }
  function safeName(s) {
    return String(s || 'SIN DATOS').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0,100) || 'SIN DATOS';
  }
  function styleWorkbook(ws, rows) {
    if (!ws['!ref']) return;
    ws['!cols'] = [12,16,30,24,13,13,31,13,13,30,14,14,27,14,20,20,17].map(w => ({wch:w}));
    ws['!autofilter'] = {ref: ws['!ref']};
    ws['!freeze'] = {xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
    const header = 'A1:Q1';
    for (let c=0;c<COLUMNS.length;c++) {
      const cell = ws[XLSX.utils.encode_cell({r:0,c})];
      if (cell) cell.s = {font:{bold:true,color:{rgb:'FFFFFF'},name:'Arial',sz:10},fill:{patternType:'solid',fgColor:{rgb:'00529B'}},alignment:{vertical:'center',horizontal:'center',wrapText:true},border:{bottom:{style:'medium',color:{rgb:'0097B2'}}}};
    }
    ws['!rows'] = [{hpt:34}];
    for (let r=1;r<rows.length+1;r++) {
      for (let c=0;c<COLUMNS.length;c++) {
        const cell=ws[XLSX.utils.encode_cell({r,c})];
        if (cell) cell.s={font:{name:'Arial',sz:10,color:{rgb:'1F2937'}},alignment:{vertical:'center',wrapText:true},border:{bottom:{style:'hair',color:{rgb:'DCE5EE'}}},fill:r%2===0?{patternType:'solid',fgColor:{rgb:'F4F8FB'}}:{patternType:'solid',fgColor:{rgb:'FFFFFF'}}};
      }
    }
  }
  function makeWorkbook(rows, groupType, groupName) {
    const clean = rows.map(row => {
      const obj={}; COLUMNS.forEach(c=>obj[c]=row[c] == null ? '' : row[c]); return obj;
    });
    const ws = XLSX.utils.json_to_sheet(clean, {header:COLUMNS});
    styleWorkbook(ws, clean);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, safeName(groupName).slice(0,31) || 'Asistencia');
    return {name:'Asistencia_' + (groupType==='SUCURSAL'?'Sucursal':'Area') + '_' + safeName(groupName) + '.xlsx', data:XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true}), count:rows.length, group:groupName};
  }
  function selectedGroups() {
    return Array.from($('excel-asistencia-grupos').selectedOptions).map(o=>o.value);
  }
  function renderGroups(groups) {
    const select=$('excel-asistencia-grupos');
    select.replaceChildren();
    groups.forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;select.appendChild(o);});
    Array.from(select.options).forEach(o=>o.selected=true);
  }
  function showStatus(text, type) {
    const el=$('excel-asistencia-status');
    el.textContent=text; el.className='mt-3 rounded-xl border p-3 text-sm '+(type==='error'?'border-red-200 bg-red-50 text-red-800':type==='ok'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-blue-200 bg-blue-50 text-blue-900');
    el.classList.remove('hidden');
  }
  function processFile() {
    const file=$('excel-asistencia-file').files[0];
    if (!file) {showStatus('Selecciona primero un archivo Excel (.xlsx o .xls).','error');return;}
    if (!window.XLSX || !window.JSZip) {showStatus('No se cargaron las librerías de Excel o ZIP. Recarga la página e inténtalo nuevamente.','error');return;}
    const button=$('excel-asistencia-procesar'); button.disabled=true; button.textContent='Procesando archivo…';
    warnings=[]; outputFiles=[]; $('excel-asistencia-resultados').replaceChildren();
    const reader=new FileReader();
    reader.onerror=()=>{button.disabled=false;button.textContent='Procesar reporte';showStatus('No se pudo leer el archivo seleccionado.','error');};
    reader.onload=()=>{
      try {
        const wb=XLSX.read(reader.result,{type:'array',cellDates:true});
        const sheetName=wb.SheetNames[0], ws=wb.Sheets[sheetName];
        if (!ws) throw new Error('El archivo no contiene una hoja legible.');
        const raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
        if (!raw.length) throw new Error('La hoja seleccionada no contiene registros.');
        const headers=Object.keys(raw[0]).map(norm);
        const required=['rut','nombre','fecha'];
        const absent=required.filter(k=>!headers.includes(k));
        if (absent.length) throw new Error('No se reconocen las columnas obligatorias: '+absent.join(', ')+'. Verifica que subiste el reporte avanzado de asistencia.');
        sourceRows=raw.map((r,i)=>transform(r,i+2));
        const grouping=$('excel-asistencia-agrupar').value;
        const key=grouping==='SUCURSAL'?'__groupBranch':'__groupCost';
        const groups=[...new Set(sourceRows.map(r=>r[key]||'SIN DATOS'))].sort((a,b)=>a.localeCompare(b,'es'));
        renderGroups(groups);
        const selected=new Set(groups);
        groups.forEach(group=>{
          const rows=sourceRows.filter(r=>(r[key]||'SIN DATOS')===group);
          outputFiles.push(makeWorkbook(rows,grouping,group));
        });
        const valid=sourceRows.filter(r=>r.RUT&&r.Nombre&&r.Fecha).length;
        $('excel-asistencia-kpi-registros').textContent=String(sourceRows.length);
        $('excel-asistencia-kpi-grupos').textContent=String(groups.length);
        $('excel-asistencia-kpi-validos').textContent=String(valid);
        $('excel-asistencia-kpi-alertas').textContent=String(warnings.length);
        $('excel-asistencia-resumen').classList.remove('hidden');
        renderOutputList();
        if(warnings.length) {
          $('excel-asistencia-alertas').classList.remove('hidden');
          $('excel-asistencia-alertas').textContent=warnings.slice(0,30).join('\n')+(warnings.length>30?'\n… y '+(warnings.length-30)+' alertas más.':'');
        } else $('excel-asistencia-alertas').classList.add('hidden');
        showStatus('Procesamiento completado. Se prepararon '+groups.length+' archivos con '+sourceRows.length+' registros. Revisa los resultados antes de descargar.','ok');
      } catch(err) {showStatus(err.message||'Ocurrió un error al procesar el Excel.','error');}
      finally {button.disabled=false;button.textContent='Procesar reporte';}
    };
    reader.readAsArrayBuffer(file);
  }
  function renderOutputList() {
    const container=$('excel-asistencia-resultados');container.replaceChildren();
    const grouping=$('excel-asistencia-agrupar').value;
    const selected=new Set(selectedGroups());
    outputFiles.filter(f=>selected.has(f.group)).forEach(f=>{
      const row=document.createElement('div');row.className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-0';
      const info=document.createElement('div');info.className='min-w-0';
      const title=document.createElement('p');title.className='truncate text-sm font-bold text-slate-800';title.textContent=f.group;
      const sub=document.createElement('p');sub.className='mt-1 text-xs text-slate-500';sub.textContent=f.count+' registros · '+f.name;
      info.append(title,sub);
      const actions=document.createElement('div');actions.className='flex flex-wrap gap-2';
      const btn=document.createElement('button');btn.type='button';btn.className='rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700';btn.textContent='Descargar Excel';btn.addEventListener('click',()=>downloadOne(f));
      const mailBtn=document.createElement('button');mailBtn.type='button';mailBtn.className='corp-button';mailBtn.textContent='Preparar correo';mailBtn.title='Descarga el Excel y abre un borrador dirigido al contacto configurado';
      mailBtn.addEventListener('click',()=>prepareEmail(f,grouping,mailBtn));
      actions.append(btn,mailBtn);row.append(info,actions);container.appendChild(row);
    });
    $('excel-asistencia-descargar-zip').disabled=!outputFiles.some(f=>selected.has(f.group));
    $('excel-asistencia-zip-correos').disabled=!outputFiles.some(f=>selected.has(f.group));
    $('excel-asistencia-descargar-seleccion').disabled=!outputFiles.some(f=>selected.has(f.group));
  }
  function normalizeKey(value) {
    return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  }
  function splitEmails(value) {
    return String(value || '').split(/[;,]+/).map(x=>x.trim()).filter(x=>/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(x));
  }
  async function resolveRecipients(file, grouping) {
    const key=grouping==='SUCURSAL'?'sucursal':'area';
    let to='',cc='',subject='Reporte de asistencia · '+file.group;
    let body='Estimados/as:\\n\\nJunto con saludar, adjunto el reporte de asistencia correspondiente a '+file.group+'.\\n\\nAgradeceré revisar la información y gestionar las regularizaciones que correspondan.\\n\\nSaludos.';
    if(grouping==='SUCURSAL') {
      const client=(typeof _supabase!=='undefined'&&_supabase?.from)?_supabase:window._supabase;
      if(client?.from) {
        const {data,error}=await client.from('sucursales').select('nombre,correo_sucursal,correo_copia');
        if(error) throw error;
        const row=(data||[]).find(x=>normalizeKey(x.nombre)===normalizeKey(file.group));
        if(row){to=row.correo_sucursal||'';cc=row.correo_copia||'';}
      }
    } else {
      const client=(typeof _supabase!=='undefined'&&_supabase?.from)?_supabase:window._supabase;
      let row=null;
      if(client?.from) {
        const {data,error}=await client.from('configuracion_correos_areas').select('area,correo_para,correo_cc,asunto_plantilla,cuerpo_plantilla,firma');
        if(!error) row=(data||[]).find(x=>normalizeKey(x.area)===normalizeKey(file.group))||null;
      }
      if(!row) {
        try { const local=JSON.parse(localStorage.getItem('doctor-simi-configuracion-correos-areas-v1')||'{}'); row=Object.values(local).find(x=>normalizeKey(x.area)===normalizeKey(file.group))||local[file.group]||null; } catch(_) {}
      }
      if(row) {
        to=row.correo_para||'';cc=row.correo_cc||'';
        subject=String(row.asunto_plantilla||subject).replace(/\\[AREA\\]/gi,file.group).replace(/\\{AREA\\}/gi,file.group);
        body=String(row.cuerpo_plantilla||body).replace(/\\[AREA\\]/gi,file.group).replace(/\\{AREA\\}/gi,file.group);
        if(row.firma) body+='\\n\\n'+row.firma;
      }
    }
    return {to:splitEmails(to),cc:splitEmails(cc),subject,body};
  }
  async function prepareEmail(file, grouping, button) {
    button.disabled=true;const old=button.textContent;button.textContent='Preparando…';
    try {
      const recipients=await resolveRecipients(file,grouping);
      if(!recipients.to.length) {
        showStatus('No hay destinatario configurado para '+file.group+'. Configura el correo en '+(grouping==='SUCURSAL'?'Correos de sucursales':'Configuración de correos por área')+' y vuelve a intentarlo.','error');
        return;
      }
      downloadOne(file);
      const query=[];
      if(recipients.cc.length) query.push('cc='+encodeURIComponent(recipients.cc.join(',')));
      query.push('subject='+encodeURIComponent(recipients.subject),'body='+encodeURIComponent(recipients.body+'\\n\\nArchivo adjunto: '+file.name));
      const mailto='mailto:'+encodeURIComponent(recipients.to.join(',')).replace(/%2C/gi,',')+'?'+query.join('&');
      window.location.href=mailto;
      showStatus('Se descargó '+file.name+' y se abrió un borrador para '+file.group+'. Adjunta el Excel descargado antes de enviar el correo.','ok');
    } catch(err) {
      showStatus('No se pudo preparar el correo para '+file.group+': '+(err.message||String(err)),'error');
    } finally {button.disabled=false;button.textContent=old;}
  }
  function downloadOne(file) {
    const blob=new Blob([file.data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function base64Bytes(value) {
    const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
    let binary='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    const encoded=btoa(binary);
    const lines=[];
    for(let i=0;i<encoded.length;i+=76) lines.push(encoded.slice(i,i+76));
    return lines.join('\r\n');
  }
  function mimeHeader(value) {
    const bytes=new TextEncoder().encode(String(value||''));
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
    return '=?UTF-8?B?'+btoa(binary)+'?=';
  }
  function createEml(file, recipients) {
    const boundary='----=_DoctorSimi_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
    const lines=[
      'To: '+recipients.to.join(', '),
      ...(recipients.cc.length?['Cc: '+recipients.cc.join(', ')]:[]),
      'Subject: '+mimeHeader(recipients.subject),
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="'+boundary+'"',
      '',
      '--'+boundary,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(recipients.body))),
      '',
      '--'+boundary,
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="'+file.name.replace(/["\\\\]/g,'_')+'"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="'+file.name.replace(/["\\\\]/g,'_')+'"',
      '',
      base64Bytes(file.data),
      '',
      '--'+boundary+'--',
      ''
    ];
    return lines.join('\\r\\n');
  }
  async function downloadEmailZip() {
    const button=$('excel-asistencia-zip-correos');
    button.disabled=true;const old=button.textContent;button.textContent='Preparando ZIP…';
    try {
      const selected=new Set(selectedGroups());const files=outputFiles.filter(f=>selected.has(f.group));
      if(!files.length){showStatus('Selecciona al menos un área o sucursal.','error');return;}
      const grouping=$('excel-asistencia-agrupar').value;
      const zip=new JSZip();const mailFolder=zip.folder('Correos_listos_para_abrir');const excelFolder=zip.folder('Excel_por_area_o_sucursal');
      const missing=[];
      for(const file of files) {
        excelFolder.file(file.name,file.data);
        try {
          const recipients=await resolveRecipients(file,grouping);
          if(!recipients.to.length){missing.push(file.group);continue;}
          mailFolder.file(file.name.replace(/\\.xlsx?$/i,'')+'.eml',createEml(file,recipients));
        } catch(err) {missing.push(file.group+' (error al consultar destinatario)');}
      }
      const blob=await zip.generateAsync({type:'blob'});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Reportes_Asistencia_y_Correos_'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
      if(missing.length) showStatus('ZIP creado con los Excel seleccionados. No se generó borrador para: '+missing.join(', ')+'. Configura sus destinatarios y vuelve a generar el ZIP.','error');
      else showStatus('ZIP creado con '+files.length+' Excel y '+files.length+' correos .eml con el archivo correspondiente adjunto. Abre cada .eml con Outlook para revisar y enviar.','ok');
    } catch(err) {showStatus('No se pudo generar el ZIP de correos: '+(err.message||String(err)),'error');}
    finally {button.disabled=false;button.textContent=old;}
  }
  async function downloadZip() {
    const selected=new Set(selectedGroups());const files=outputFiles.filter(f=>selected.has(f.group));
    if(!files.length){showStatus('Selecciona al menos un área o sucursal para descargar.','error');return;}
    const zip=new JSZip();files.forEach(f=>zip.file(f.name,f.data));
    const blob=await zip.generateAsync({type:'blob'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Reportes_Asistencia_'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadSelectedIndividually() {
    const selected=new Set(selectedGroups());const files=outputFiles.filter(f=>selected.has(f.group));
    if(!files.length){showStatus('Selecciona al menos un área o sucursal para descargar.','error');return;}
    files.forEach((f,i)=>setTimeout(()=>downloadOne(f),i*250));
  }
  function reset() {
    sourceRows=[];outputFiles=[];warnings=[];
    $('excel-asistencia-resultados').replaceChildren();$('excel-asistencia-resumen').classList.add('hidden');
    $('excel-asistencia-alertas').classList.add('hidden');$('excel-asistencia-status').classList.add('hidden');
    $('excel-asistencia-file').value='';$('excel-asistencia-grupos').replaceChildren();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!$('view-excelasistencia')) return;
    $('excel-asistencia-procesar').addEventListener('click',processFile);
    $('excel-asistencia-agrupar').addEventListener('change',()=>{if(sourceRows.length)processCurrentGrouping();});
    $('excel-asistencia-grupos').addEventListener('change',renderOutputList);
    $('excel-asistencia-descargar-zip').addEventListener('click',downloadZip);
    $('excel-asistencia-zip-correos').addEventListener('click',downloadEmailZip);
    $('excel-asistencia-descargar-seleccion').addEventListener('click',downloadSelectedIndividually);
    $('excel-asistencia-limpiar').addEventListener('click',reset);
  });
  function processCurrentGrouping() {
    const grouping=$('excel-asistencia-agrupar').value;
    const key=grouping==='SUCURSAL'?'__groupBranch':'__groupCost';
    const groups=[...new Set(sourceRows.map(r=>r[key]||'SIN DATOS'))].sort((a,b)=>a.localeCompare(b,'es'));
    outputFiles=groups.map(group=>makeWorkbook(sourceRows.filter(r=>(r[key]||'SIN DATOS')===group),grouping,group));
    renderGroups(groups);renderOutputList();
    $('excel-asistencia-kpi-grupos').textContent=String(groups.length);
    showStatus('Agrupación actualizada. Se prepararon '+groups.length+' archivos.','ok');
  }
})();
