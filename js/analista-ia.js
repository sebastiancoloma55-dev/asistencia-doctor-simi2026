/* Analista IA de RR. HH. — pantalla independiente */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  let rows = [], filtered = [], headers = [], fileName = '', lastResult = '', pdfText = '';
  const safe = value => String(value == null ? '' : value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const status = (msg, kind='info') => { const el=$('aia-status'); if(el){el.textContent=msg;el.dataset.kind=kind;} };
  const dateValue = v => { if(v instanceof Date && !isNaN(v)) return v; const s=String(v||'').trim(); if(!s)return null; let d=new Date(s); if(!isNaN(d))return d; const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); if(m){d=new Date(+m[3],+m[2]-1,+m[1]);if(!isNaN(d))return d;} return null; };
  function populateColumns(){
    const select=$('aia-column'); if(!select)return;
    select.innerHTML='<option value="">Todas las columnas</option>'+headers.map(h=>'<option value="'+safe(h)+'">'+safe(h)+'</option>').join('');
    const dateCol=headers.find(h=>/fecha|date|día|dia|inicio|término|termino/i.test(h));
    if(dateCol)select.value=dateCol;
    applyFilters();
  }
  function applyFilters(){
    const q=String($('aia-search')?.value||'').trim().toLocaleLowerCase('es-CL');
    const col=String($('aia-column')?.value||'');
    const val=String($('aia-value')?.value||'').trim().toLocaleLowerCase('es-CL');
    const from=$('aia-from')?.value?new Date($('aia-from').value+'T00:00:00'):null;
    const to=$('aia-to')?.value?new Date($('aia-to').value+'T23:59:59'):null;
    filtered=rows.filter(row=>{
      if(q&&!headers.some(h=>String(row[h]??'').toLocaleLowerCase('es-CL').includes(q)))return false;
      if(col&&val&&!String(row[col]??'').toLocaleLowerCase('es-CL').includes(val))return false;
      if(col&&/fecha|date|día|dia|inicio|término|termino/i.test(col)&&(from||to)){
        const d=dateValue(row[col]); if(!d)return false;
        if(from&&d<from)return false;if(to&&d>to)return false;
      }
      return true;
    });
    const count=$('aia-filter-count');if(count)count.textContent=rows.length?filtered.length.toLocaleString('es-CL')+' de '+rows.length.toLocaleString('es-CL')+' filas': 'Sin archivo cargado';
    const kpis=$('aia-kpis');if(kpis){const pct=rows.length?Math.round(filtered.length/rows.length*100):0;kpis.innerHTML='<div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">Filas filtradas</p><p class="mt-1 text-xl font-black text-slate-800">'+filtered.length.toLocaleString('es-CL')+'</p></div><div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">Columnas detectadas</p><p class="mt-1 text-xl font-black text-slate-800">'+headers.length.toLocaleString('es-CL')+'</p></div><div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">Cobertura del archivo</p><p class="mt-1 text-xl font-black text-slate-800">'+pct+'%</p></div>';}
    const preview=$('aia-preview');
    if(preview){
      if(!filtered.length){preview.innerHTML='<div class="p-6 text-center text-slate-500">Carga un archivo para revisar sus datos.</div>';return;}
      const sample=filtered.slice(0,8);
      preview.innerHTML='<div class="overflow-x-auto"><table class="w-full min-w-[700px] text-left text-xs"><thead><tr>'+headers.map(h=>'<th class="border-b p-2 font-bold text-slate-500">'+safe(h)+'</th>').join('')+'</tr></thead><tbody>'+sample.map(r=>'<tr>'+headers.map(h=>'<td class="border-b p-2">'+safe(r[h])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="px-3 py-2 text-xs text-slate-500">Vista previa de '+sample.length+' filas · los filtros se combinan.</p>';
    }
  }
  async function extractPdfText(file){
    if(!window.pdfjsLib)throw new Error('No se cargó el lector PDF. Recarga la vista previa.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      pages.push(content.items.map(item=>item.str||'').join(' '));
    }
    const text=pages.join('\n\n').trim();
    if(!text)throw new Error('El PDF no contiene texto seleccionable. Los PDF escaneados requieren OCR antes del análisis.');
    if(text.length>1900000)throw new Error('El texto del PDF supera el límite permitido. Usa un archivo más pequeño.');
    return text;
  }
  async function loadFile(){
    const file=$('aia-file')?.files?.[0]; if(!file)return;
    fileName=file.name; rows=[];filtered=[];headers=[];lastResult='';pdfText='';
    $('aia-output').textContent='Leyendo archivo y preparando vista previa…';
    try{
      if(/\.(xlsx|xls|csv)$/i.test(file.name)){
        if(!window.XLSX)throw new Error('No se cargó el lector Excel. Recarga la página.');
        const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
        const sheet=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
        if(!rows.length)throw new Error('La primera hoja no contiene filas para analizar.');
        headers=Object.keys(rows[0]);
      } else if(/\.pdf$/i.test(file.name)){
        if(file.size>5*1024*1024)throw new Error('El PDF supera 5 MB. Usa un archivo menor.');
        pdfText=await extractPdfText(file);
        status('PDF leído localmente. Solo se enviará el texto extraído después de autorizar el análisis.','info');
        $('aia-filter-count').textContent='PDF · '+(file.size/1024).toFixed(0)+' KB';
        $('aia-preview').innerHTML='<div class="p-5 text-sm text-slate-600">PDF leído en este navegador. El texto se enviará al servidor Ollama solo después de autorizarlo. Los filtros por filas están disponibles para Excel y CSV.</div>';
        $('aia-output').textContent='Escribe una pregunta y autoriza el envío para comenzar.';
        return;
      } else throw new Error('Formato no compatible. Usa Excel (.xlsx/.xls), CSV o PDF.');
      populateColumns();
      $('aia-output').textContent='Archivo listo. Revisa los filtros y ejecuta el análisis cuando quieras.';
      status('Archivo cargado: '+file.name,'success');
    }catch(e){status(e.message,'error');$('aia-output').textContent='No se pudo leer el archivo: '+e.message;}
  }
  const chatHistory=[];
  function addChatMessage(role, text){
    const chat=$('aia-chat'); if(!chat)return;
    const empty=chat.querySelector('.aia-chat-empty'); if(empty)empty.remove();
    const item=document.createElement('div');
    item.className='aia-chat-message '+(role==='user'?'aia-chat-user':'aia-chat-assistant');
    const label=document.createElement('span');label.className='aia-chat-label';label.textContent=role==='user'?'Tú':'Ollama';
    const content=document.createElement('div');content.textContent=String(text||'');
    item.append(label,content);chat.appendChild(item);chat.scrollTop=chat.scrollHeight;
  }
  async function analyze(){
    const file=$('aia-file')?.files?.[0], prompt=String($('aia-prompt')?.value||'').trim();
    if(!prompt)return status('Escribe una pregunta antes de enviar.','error');
    if(!$('aia-consent')?.checked)return status('Autoriza el envío de tu pregunta a Ollama para continuar.','error');
    const btn=$('aia-run');btn.disabled=true;btn.classList.add('opacity-60');
    addChatMessage('user',prompt+(file?'\n\nArchivo adjunto: '+file.name:''));
    $('aia-prompt').value='';
    const pending=document.createElement('div');pending.className='aia-chat-message aia-chat-assistant';pending.textContent='Ollama está pensando…';pending.id='aia-pending';$('aia-chat')?.appendChild(pending);
    try{
      status('Conectando con Ollama…');
      const payload={prompt, conversation:chatHistory.slice(-12), fileName:file?.name||'', mimeType:file?.type||''};
      if(file){
        if(/\.(xlsx|xls|csv)$/i.test(file.name)){
          if(!rows.length)await loadFile();
          if(!rows.length)throw new Error('No se pudieron leer filas del archivo.');
          const selected=filtered.length?filtered:rows;
          const unique={};headers.forEach(h=>{unique[h]=new Set(selected.slice(0,5000).map(r=>String(r[h]??'').trim()).filter(Boolean)).size;});
          let sampleSize=Math.min(700,selected.length),serialized='';
          do{
            const sample=selected.slice(0,sampleSize);
            serialized=JSON.stringify({totalFilasOriginales:rows.length,totalFilasTrasFiltros:selected.length,columnas:headers,valoresUnicosEnMuestra:unique,muestra:sample,nota:sample.length<selected.length?'La muestra contiene '+sample.length+' de '+selected.length+' filas filtradas. No extrapoles conteos exactos de la muestra.':'Se incluyeron todas las filas filtradas.'});
            if(serialized.length<=1800000||sampleSize<=1)break;
            sampleSize=Math.max(1,Math.floor(sampleSize/2));
          }while(sampleSize>0);
          if(serialized.length>1950000)throw new Error('El archivo contiene campos demasiado extensos. Reduce el archivo o elimina columnas innecesarias.');
          payload.textData=serialized;
        }else if(/\.pdf$/i.test(file.name)){
          if(file.size>5*1024*1024)throw new Error('El PDF supera 5 MB. Usa un archivo menor.');
          payload.textData=pdfText||await extractPdfText(file);
        }else throw new Error('Formato no compatible. Usa Excel, CSV o PDF.');
      }
      const {data}=await _supabase.auth.getSession();const token=data?.session?.access_token;
      if(!token)throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const response=await fetch('/api/ollama',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({error:'Respuesta no válida del servidor.'}));
      if(!response.ok)throw new Error(body.error||'Error '+response.status);
      lastResult=String(body.text||'').trim();if(!lastResult)throw new Error('Ollama devolvió una respuesta vacía.');
      chatHistory.push({role:'user',content:prompt},{role:'assistant',content:lastResult});
      $('aia-pending')?.remove();addChatMessage('assistant',lastResult);
      $('aia-output').textContent=lastResult;status('Respuesta recibida de Ollama · '+new Date().toLocaleTimeString('es-CL'),'success');
      if(typeof window.registrarAuditoria==='function')try{await window.registrarAuditoria('analista_ia',file?'ANALISIS_OLLAMA':'CHAT_OLLAMA',(file?file.name+' · ':'')+prompt.slice(0,150));}catch(e){console.warn('No se pudo registrar auditoría de IA',e);}
    }catch(e){
      $('aia-pending')?.remove();
      const message=e.message||'Error inesperado al consultar Ollama.';
      addChatMessage('assistant','No pude responder: '+message);
      status(message,'error');
    }finally{btn.disabled=false;btn.classList.remove('opacity-60');}
  }
  function downloadText(){
    if(!lastResult)return status('Primero completa un análisis para exportarlo.','error');
    const blob=new Blob(['Analista de RR. HH. con IA\nArchivo: '+fileName+'\nFecha: '+new Date().toLocaleString('es-CL')+'\n\n'+lastResult],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='analisis-rrhh-'+Date.now()+'.txt';a.click();URL.revokeObjectURL(a.href);
  }
  function downloadPdf(){
    if(!lastResult)return status('Primero completa un análisis para exportarlo.','error');
    if(!window.jspdf?.jsPDF)return status('No se cargó el generador PDF. Usa Exportar TXT.','error');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});const lines=doc.splitTextToSize(lastResult,175);let y=18;
    doc.setFontSize(16);doc.text('Conversación con Ollama',18,y);y+=9;doc.setFontSize(9);doc.text('Generado: '+new Date().toLocaleString('es-CL'),18,y);y+=8;doc.setFontSize(10);
    lines.forEach(line=>{if(y>278){doc.addPage();y=18;}doc.text(line,18,y);y+=5;});
    doc.save('analisis-rrhh-'+Date.now()+'.pdf');
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('aia-file')?.addEventListener('change',loadFile);
    ['aia-search','aia-column','aia-value','aia-from','aia-to'].forEach(id=>$(id)?.addEventListener(id==='aia-column'?'change':'input',applyFilters));
    $('aia-run')?.addEventListener('click',analyze);
    $('aia-prompt')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();analyze();}});
    $('aia-export-txt')?.addEventListener('click',downloadText);
    $('aia-export-pdf')?.addEventListener('click',downloadPdf);
    $('aia-clear')?.addEventListener('click',()=>{ $('aia-file').value='';$('aia-prompt').value='';pdfText='';$('aia-consent').checked=false;rows=[];filtered=[];headers=[];lastResult='';chatHistory.length=0;$('aia-output').textContent='';$('aia-chat').innerHTML='<div class="aia-chat-empty">👋 Hola, soy tu asistente conectado a Ollama. Puedes preguntarme sobre RR. HH., redacción, Excel, ideas o cualquier tema de trabajo. No necesitas adjuntar archivos.</div>';$('aia-preview').innerHTML='<div class="p-6 text-center text-slate-500">Carga un archivo para revisar sus datos.</div>';$('aia-filter-count').textContent='Sin archivo cargado';status('Conversación limpiada.');});
  });
})();
