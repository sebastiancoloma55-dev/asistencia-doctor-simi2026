        // ============================================================
        // VACACIONES, CRUCES, PAPELETAS, REPORTES, USUARIOS Y AUDITORÍA
        // ============================================================
        function estadoVacacion(registro) {
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const inicio = parsearFechaExcel(registro.fecha_inicio);
            const fin = parsearFechaExcel(registro.fecha_fin);
            if (!inicio || !fin) return 'CADUCADA';
            if (inicio > hoy) return 'PROXIMA';
            if (inicio <= hoy && fin >= hoy) return 'VIGENTE';
            return 'CADUCADA';
        }

        function analizarFilaVacacion(fila) {
            return {
                rut: normalizarRut(obtenerCampo(fila,['Rut','RUT'])),
                nombre: texto(obtenerCampo(fila,['Nombre','Nombre Completo'])),
                empresa: texto(obtenerCampo(fila,['Empresa'])),
                cargo: texto(obtenerCampo(fila,['Cargo'])),
                gerencia: texto(obtenerCampo(fila,['Gerencia'])),
                sucursal: texto(obtenerCampo(fila,['Sucursal'])),
                centro_costo: texto(obtenerCampo(fila,['Centro de Costo'])),
                fecha_solicitud: texto(obtenerCampo(fila,['Fecha/Hora Solicitud'])),
                fecha_aprobacion: texto(obtenerCampo(fila,['Fecha/Hora Aprobación/Rechazo','Fecha/Hora Aprobacion/Rechazo'])),
                aprobado_por: texto(obtenerCampo(fila,['Aprobada/Rechazada por'])),
                estado: texto(obtenerCampo(fila,['Estado'])),
                fecha_inicio: fechaISODesdeExcel(obtenerCampo(fila,['Fecha Inicio Vacaciones'])),
                fecha_fin: fechaISODesdeExcel(obtenerCampo(fila,['Fecha Fin Vacaciones'])),
                fecha_retorno: fechaISODesdeExcel(obtenerCampo(fila,['Fecha Retorno'])),
                dias: Number(obtenerCampo(fila,['Número de días de Vacaciones','Numero de dias de Vacaciones'],0)) || 0,
                jornada: texto(obtenerCampo(fila,['Jornada'])),
                tipo_vacaciones: texto(obtenerCampo(fila,['Tipo de Vacaciones'],'Vacaciones')) || 'Vacaciones',
                observaciones: texto(obtenerCampo(fila,['Observaciones']))
            };
        }

        async function procesarHistorialVacaciones(event) {
            const input=event.target, file=input.files?.[0], boton=document.getElementById('btn-upload-vacaciones');
            if(!file) return;
            try {
                boton.textContent='Procesando vacaciones...';
                const originales=(await leerExcel(file)).map(analizarFilaVacacion);
                const invalidas=originales.filter(r=>!r.rut||!r.fecha_inicio||!r.fecha_fin);
                if(invalidas.length) throw new Error(`${invalidas.length} fila(s) sin RUT o fechas válidas.`);
                const consolidado=deduplicarRegistros(originales,r=>[r.rut,r.fecha_inicio,r.fecha_fin,texto(r.tipo_vacaciones).toLowerCase()].join('|'));
                boton.textContent='Guardando en Supabase...';
                const resultado=await guardarLotes('vacaciones_historico',consolidado.registros,{onConflict:'rut,fecha_inicio,fecha_fin,tipo_vacaciones'});
                await cargarVacacionesDesdeNube();
                await registrarAuditoria('vacaciones','CARGA_EXCEL',`Filas: ${originales.length}; únicos: ${consolidado.registros.length}; duplicados: ${consolidado.duplicados.length}`);
                mostrarToast(`Vacaciones guardadas. ${resultado.confirmados} registros confirmados; ${consolidado.duplicados.length} duplicados consolidados.`,'success',15000);
            } catch(error) { mostrarToast(`No se pudieron guardar vacaciones. ${error.message}`,'error',18000); }
            finally { boton.innerHTML='<i data-lucide="upload-cloud" class="h-4 w-4"></i> Cargar histórico<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="procesarHistorialVacaciones(event)">'; input.value=''; lucide.createIcons(); }
        }

        function fechaEnRango(fecha,inicio,fin) { return fecha && inicio && fin && fecha>=inicio && fecha<=fin; }
        function obtenerMarcasVacacion(v) {
            return datosAsistenciaGlobal.filter(a=>normalizarRut(a.rut)===normalizarRut(v.rut) && fechaEnRango(a.fecha,v.fecha_inicio,v.fecha_fin) && ((a.entrada&&a.entrada!=='-')||(a.salida&&a.salida!=='-')));
        }

        async function cargarVacacionesDesdeNube() {
            datosVacacionesGlobal=await leerTablaCompleta('vacaciones_historico','fecha_inicio');
            if(!asistenciaCargada) await cargarAsistenciaDesdeNube();
            vacacionesCargadas=true;
            poblarFiltroVacaciones();
        }

        function poblarFiltroVacaciones() {
            const sel=document.getElementById('filtro-vac-persona'), actual=sel.value;
            const personas=new Map(datosVacacionesGlobal.filter(v=>v.rut).map(v=>[v.rut,v.nombre||'Sin nombre']));
            sel.innerHTML='<option value="TODOS">Todos los colaboradores</option>';
            [...personas.entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')).forEach(([rut,nombre])=>{const o=document.createElement('option');o.value=rut;o.textContent=`${nombre} (${rut})`;sel.appendChild(o);});
            sel.value=personas.has(actual)?actual:'TODOS'; renderizarVacaciones();
        }

        function renderizarVacaciones() {
            const persona=document.getElementById('filtro-vac-persona').value, vig=document.getElementById('filtro-vac-vigencia').value, cruce=document.getElementById('filtro-vac-cruce').value, buscar=document.getElementById('busqueda-vacaciones').value.toLowerCase().trim();
            let enriquecidos=datosVacacionesGlobal.map(v=>({...v,vigencia:estadoVacacion(v),marcas:obtenerMarcasVacacion(v)}));
            document.getElementById('vac-stat-vigentes').innerText=enriquecidos.filter(v=>v.vigencia==='VIGENTE').length;
            document.getElementById('vac-stat-proximas').innerText=enriquecidos.filter(v=>v.vigencia==='PROXIMA').length;
            document.getElementById('vac-stat-caducadas').innerText=enriquecidos.filter(v=>v.vigencia==='CADUCADA').length;
            document.getElementById('vac-stat-alertas').innerText=enriquecidos.filter(v=>v.marcas.length).length;
            let f=enriquecidos;
            if(persona!=='TODOS') f=f.filter(v=>v.rut===persona);
            if(vig!=='TODOS') f=f.filter(v=>v.vigencia===vig);
            if(cruce==='CON_MARCAS') f=f.filter(v=>v.marcas.length);
            if(cruce==='SIN_MARCAS') f=f.filter(v=>!v.marcas.length);
            if(buscar) f=f.filter(v=>`${v.nombre} ${v.rut} ${v.sucursal}`.toLowerCase().includes(buscar));
            document.getElementById('contador-vacaciones').innerText=`Mostrando ${Math.min(f.length,1000)} de ${f.length}`;
            const tbody=document.getElementById('tabla-vacaciones-body');
            if(!f.length){tbody.innerHTML='<tr><td colspan="9" class="p-8 text-center text-slate-400">Sin registros.</td></tr>';return;}
            tbody.innerHTML=f.slice(0,1000).map(v=>{const cls=v.vigencia==='VIGENTE'?'badge-vigente':v.vigencia==='PROXIMA'?'badge-proxima':'badge-caducada'; const alerta=v.marcas.length?`<span class="badge-alerta rounded-full px-2 py-1 font-bold">ALERTA: ${v.marcas.length} día(s) con marcas</span>`:'<span class="text-emerald-700">Sin marcas</span>'; return `<tr><td class="p-3"><div class="font-bold">${escaparHTML(v.nombre)}</div><div class="text-[10px] text-slate-400">${escaparHTML(v.rut)}</div></td><td class="p-3">${escaparHTML(v.sucursal)}</td><td class="p-3">${escaparHTML(v.estado)}</td><td class="p-3">${escaparHTML(v.tipo_vacaciones)}</td><td class="p-3 font-mono">${escaparHTML(v.fecha_inicio)} / ${escaparHTML(v.fecha_fin)}</td><td class="p-3 font-mono">${escaparHTML(v.fecha_retorno)}</td><td class="p-3">${escaparHTML(v.dias)}</td><td class="p-3"><span class="${cls} rounded-full px-2 py-1 font-bold">${v.vigencia}</span></td><td class="p-3">${alerta}</td></tr>`;}).join('');
        }

        const diasSemana=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
        function fechaBonita(iso) { if(!iso)return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
        function fechaLocalISO(iso){if(!iso)return null;const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d);}
        function fechaAISO(fecha){return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;}
        async function archivoADataURL(file) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);}); }

        function feriadoChile(iso){
            if(!iso)return null;
            try {
                const year=Number(iso.slice(0,4));
                if(!feriadosChileCache.has(year)){
                    const HolidaysCtor=window.Holidays||window.DateHolidays;
                    if(HolidaysCtor){const hd=new HolidaysCtor('CL');feriadosChileCache.set(year,hd.getHolidays(year));}
                    else feriadosChileCache.set(year,[]);
                }
                const encontrado=(feriadosChileCache.get(year)||[]).find(h=>String(h.date||'').slice(0,10)===iso && ['public','bank'].includes(h.type));
                return encontrado?.name||null;
            } catch(error){console.warn('No se pudo consultar feriados',error);return null;}
        }

        function analizarDia(iso){const f=fechaLocalISO(iso);if(!f)return {esDomingo:false,feriado:null,texto:''};const esDomingo=f.getDay()===0,feriado=feriadoChile(iso);return {esDomingo,feriado,texto:`${diasSemana[f.getDay()]}${feriado?` · Feriado: ${feriado}`:''}`};}
        function diaComputable(fecha,modo){if(modo==='CORRIDOS'||modo==='MANUAL')return true;const iso=fechaAISO(fecha);return fecha.getDay()!==0&&!feriadoChile(iso);}
        function calcularPeriodoPermiso(inicioISO,cantidad,modo){
            const inicio=fechaLocalISO(inicioISO), total=Math.max(1,Math.ceil(Number(cantidad)||1));if(!inicio)return {fin:'',retorno:''};
            let cursor=new Date(inicio),contados=0;
            while(contados<total){if(diaComputable(cursor,modo))contados++;if(contados<total)cursor.setDate(cursor.getDate()+1);}
            const fin=new Date(cursor);let retorno=new Date(fin);retorno.setDate(retorno.getDate()+1);while(retorno.getDay()===0||feriadoChile(fechaAISO(retorno)))retorno.setDate(retorno.getDate()+1);
            return {fin:fechaAISO(fin),retorno:fechaAISO(retorno)};
        }

        async function prepararModuloPapeletas(){
            document.getElementById('pap-logo-preview').src=logoPapeletaDataUrl;document.getElementById('pap-firma-preview').src=firmaPapeletaDataUrl;
            const {data,error}=await _supabase.from('colaboradores').select('*').order('nombres');
            if(error){mostrarToast(`No se pudieron cargar colaboradores: ${error.message}`,'error');return;}colaboradoresPapeleta=data||[];
        }

        function buscarColaboradorPapeleta(){
            const input=document.getElementById('pap-buscar'),panel=document.getElementById('pap-resultados'),q=input.value.trim().toLowerCase();
            if(q.length<2){panel.classList.add('hidden');panel.innerHTML='';return;}
            const resultados=colaboradoresPapeleta.filter(c=>`${c.nombres||''} ${c.apellidos||''} ${c.rut||''}`.toLowerCase().includes(q)).slice(0,20);
            panel.innerHTML=resultados.length?resultados.map(c=>`<button type="button" class="autocomplete-item" onclick="seleccionarColaboradorPapeleta('${String(c.id).replaceAll("'","\\'")}')"><b>${escaparHTML(`${c.nombres||''} ${c.apellidos||''}`.trim())}</b><br><span class="text-slate-500">${escaparHTML(c.rut||'')} · ${escaparHTML(c.cargo||'')} · ${escaparHTML(c.sucursal||'')}</span></button>`).join(''):'<div class="p-3 text-xs text-slate-500">Sin coincidencias.</div>';
            panel.classList.remove('hidden');
        }

        function seleccionarColaboradorPapeleta(id){
            const c=colaboradoresPapeleta.find(x=>String(x.id)===String(id));if(!c)return;
            const nombre=`${c.nombres||''} ${c.apellidos||''}`.trim();document.getElementById('pap-colaborador-id').value=c.id;document.getElementById('pap-buscar').value=`${nombre} · ${c.rut||''}`;document.getElementById('pap-nombre').value=nombre;document.getElementById('pap-rut').value=c.rut||'';document.getElementById('pap-cargo').value=c.cargo||'';document.getElementById('pap-sucursal').value=c.sucursal||'';document.getElementById('pap-resultados').classList.add('hidden');
        }

        function aplicarTipoPermiso(){const sel=document.getElementById('pap-tipo'),op=sel.options[sel.selectedIndex],dias=op?.dataset?.dias||'',modo=op?.dataset?.modo||'MANUAL';document.getElementById('pap-modo').value=modo;if(dias)document.getElementById('pap-dias').value=dias;if(modo==='MANUAL')document.getElementById('pap-manual').checked=true;toggleFechasManuales();actualizarFechasPapeleta();}
        function toggleFechasManuales(){const manual=document.getElementById('pap-manual').checked||document.getElementById('pap-modo').value==='MANUAL';['pap-fin','pap-retorno'].forEach(id=>{const e=document.getElementById(id);e.readOnly=!manual;e.classList.toggle('bg-slate-50',!manual);});}
        function actualizarFechasPapeleta(){const inicio=document.getElementById('pap-inicio').value,dias=document.getElementById('pap-dias').value,modo=document.getElementById('pap-modo').value,manual=document.getElementById('pap-manual').checked||modo==='MANUAL';const nota=document.getElementById('pap-inicio-nota'),info=analizarDia(inicio);if(!inicio){nota.className='day-note mt-1 bg-slate-50 text-slate-600';nota.textContent='Selecciona una fecha.';return;}nota.textContent=`Inicio: ${info.texto}.`;nota.className=`day-note mt-1 ${info.esDomingo||info.feriado?'bg-amber-50 text-amber-800':'bg-emerald-50 text-emerald-800'}`;if(!manual&&dias){const p=calcularPeriodoPermiso(inicio,dias,modo);document.getElementById('pap-fin').value=p.fin;document.getElementById('pap-retorno').value=p.retorno;}}
        async function cambiarActivoPapeleta(event,tipo){const file=event.target.files?.[0];if(!file)return;const data=await archivoADataURL(file);if(tipo==='logo'){logoPapeletaDataUrl=data;document.getElementById('pap-logo-preview').src=data;}else{firmaPapeletaDataUrl=data;document.getElementById('pap-firma-preview').src=data;}}

        async function generarPapeletaPDF(event) {
            event?.preventDefault();const form=document.getElementById('form-papeleta');if(!form.reportValidity())return;
            const colaboradorId=document.getElementById('pap-colaborador-id').value;if(!colaboradorId){mostrarToast('Selecciona un colaborador de la lista de resultados.','warning');return;}
            const nombre=texto(document.getElementById('pap-nombre').value),rut=normalizarRut(document.getElementById('pap-rut').value),cargo=texto(document.getElementById('pap-cargo').value),sucursal=texto(document.getElementById('pap-sucursal').value),tipo=texto(document.getElementById('pap-tipo').value),inicio=document.getElementById('pap-inicio').value,fin=document.getElementById('pap-fin').value,retorno=document.getElementById('pap-retorno').value,dias=document.getElementById('pap-dias').value,modo=document.getElementById('pap-modo').value,remuneracion=document.getElementById('pap-remuneracion').value,motivo=texto(document.getElementById('pap-motivo').value),firma=texto(document.getElementById('pap-firma').value),adicional=texto(document.getElementById('pap-adicional').value);
            const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),left=20,width=170;
            try{doc.addImage(logoPapeletaDataUrl,'PNG',18,10,55,28);}catch(e){console.warn(e);}doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('FARMACIAS DE SIMILARES CHILE S.A.',190,16,{align:'right'});doc.setFontSize(8);doc.text('RUT: 59.111.330-5',190,22,{align:'right'});doc.setDrawColor(0,151,178);doc.setLineWidth(1);doc.line(20,42,190,42);doc.setFontSize(13);doc.text('CARTA DE AUTORIZACIÓN DE PERMISO',105,52,{align:'center'});
            doc.setFont('helvetica','normal');doc.setFontSize(10);let y=62;const intro=doc.splitTextToSize(`Se deja constancia que ${nombre}, RUT ${rut}, cargo ${cargo}, perteneciente a la sucursal ${sucursal}, ha solicitado el permiso señalado a continuación.`,width);doc.text(intro,left,y);y+=intro.length*5+6;
            const inicioInfo=analizarDia(inicio);const campos=[['TIPO DE PERMISO',tipo],['FECHA INICIO',`${fechaBonita(inicio)} (${inicioInfo.texto})`],['FECHA TÉRMINO',fechaBonita(fin)],['FECHA DE RETORNO',fechaBonita(retorno)],['DÍAS AUTORIZADOS',`${dias} día(s) - ${modo}`],['REMUNERACIÓN',remuneracion],['MOTIVO / RESPALDO',motivo]];
            campos.forEach(([a,b])=>{doc.setFont('helvetica','bold');doc.text(a,left,y);doc.setFont('helvetica','normal');const t=doc.splitTextToSize(String(b),108);doc.text(t,76,y);y+=Math.max(7,t.length*5);});y+=3;doc.text(doc.splitTextToSize(adicional,width),left,y);y+=25;
            try{doc.addImage(firmaPapeletaDataUrl,'PNG',72,y,66,32);y+=34;}catch(e){console.warn(e);}doc.line(60,y,150,y);doc.setFont('helvetica','bold');doc.text(firma,105,y+5,{align:'center'});doc.setFont('helvetica','normal');doc.text('Farmacias de Similares Chile S.A.',105,y+10,{align:'center'});
            const nombreSeguro = nombre
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
            const tipoSeguro = tipo
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 45);
            doc.save(`Papeleta_${nombreSeguro}_${rut}_${tipoSeguro}_${inicio}.pdf`);
            const {data:{session}}=await _supabase.auth.getSession();const registro={rut,nombre,sucursal,tipo_permiso:tipo,fecha_inicio:inicio,fecha_fin:fin,fecha_retorno:retorno,dias:Number(dias)||1,remuneracion,motivo,firma_responsable:firma,generado_por:session?.user?.email||''};const {error}=await _supabase.from('papeletas_permiso').insert([registro]);if(error)mostrarToast(`PDF generado, pero no se pudo registrar: ${error.message}`,'warning');else{await registrarAuditoria('papeletas','GENERA_PDF',`${nombre} · ${tipo} · ${inicio} a ${fin}`);await cargarPapeletas();mostrarToast('Papeleta completa, firmada y registrada.','success');}
        }

        async function cargarPapeletas() { const tbody=document.getElementById('tabla-papeletas-body'); if(!tbody)return; const {data,error}=await _supabase.from('papeletas_permiso').select('*').order('created_at',{ascending:false}).limit(300); if(error){tbody.innerHTML=`<tr><td colspan="5" class="p-8 text-center text-red-600">${escaparHTML(error.message)}</td></tr>`;return;} tbody.innerHTML=data?.length?data.map(p=>`<tr><td class="p-3">${escaparHTML(p.created_at?.slice(0,10))}</td><td class="p-3"><b>${escaparHTML(p.nombre)}</b><br>${escaparHTML(p.rut)}</td><td class="p-3">${escaparHTML(p.tipo_permiso)}</td><td class="p-3">${escaparHTML(p.fecha_inicio)} a ${escaparHTML(p.fecha_fin)}</td><td class="p-3">${escaparHTML(p.generado_por)}</td></tr>`).join(''):'<tr><td colspan="5" class="p-8 text-center text-slate-400">Sin registros.</td></tr>'; }

        function filtrarPeriodo(datos,campo,desde,hasta){return datos.filter(r=>(!desde||r[campo]>=desde)&&(!hasta||r[campo]<=hasta));}
        async function generarReporte() {
            const tipo=document.getElementById('rep-tipo').value,titulo=texto(document.getElementById('rep-titulo').value,'Reporte RRHH'),formato=document.getElementById('rep-formato').value,desde=document.getElementById('rep-desde').value,hasta=document.getElementById('rep-hasta').value,sucursal=texto(document.getElementById('rep-sucursal').value).toLowerCase(),contenido=texto(document.getElementById('rep-contenido').value);
            let datos=[],resumen='';
            if(tipo==='ASISTENCIA'){datos=filtrarPeriodo(datosAsistenciaGlobal,'fecha',desde,hasta);resumen=`Registros: ${datos.length}. Atrasos: ${datos.filter(r=>r.tiene_atraso).length}. Sin marcas: ${datos.filter(r=>r.sin_marca).length}.`;}
            if(tipo==='LICENCIAS'){datos=filtrarPeriodo(datosLicenciasGlobal,'fecha_inicio',desde,hasta);resumen=`Licencias: ${datos.length}. Vigentes: ${datos.filter(r=>{const f=parsearFechaExcel(r.fecha_fin),h=new Date();h.setHours(0,0,0,0);return f&&f>=h;}).length}.`;}
            if(tipo==='VACACIONES'||tipo==='CRUCES'){if(!vacacionesCargadas)await cargarVacacionesDesdeNube();datos=filtrarPeriodo(datosVacacionesGlobal,'fecha_inicio',desde,hasta).map(v=>({...v,marcas:obtenerMarcasVacacion(v).length}));if(tipo==='CRUCES')datos=datos.filter(v=>v.marcas);resumen=`Vacaciones: ${datos.length}. Casos con marcas: ${datos.filter(v=>v.marcas).length}.`;}
            if(tipo==='RESUMEN'){resumen=`Asistencia: ${datosAsistenciaGlobal.length} registros. Licencias: ${datosLicenciasGlobal.length}. Vacaciones: ${datosVacacionesGlobal.length}. Alertas vacaciones con marcas: ${datosVacacionesGlobal.filter(v=>obtenerMarcasVacacion(v).length).length}.`;}
            if(sucursal)datos=datos.filter(r=>texto(r.sucursal).toLowerCase().includes(sucursal));
            if(formato==='XLSX'){const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(datos.length?datos:[{reporte:titulo,resumen,contenido}]);XLSX.utils.book_append_sheet(wb,ws,'Reporte');XLSX.writeFile(wb,`${titulo.replace(/[^a-z0-9]+/gi,'_')}.xlsx`);} else {const {jsPDF}=window.jspdf,doc=new jsPDF();doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(titulo,20,20);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`Periodo: ${desde||'sin inicio'} a ${hasta||'sin término'}`,20,28);let y=38;[resumen,contenido].filter(Boolean).forEach(t=>{const l=doc.splitTextToSize(t,170);doc.text(l,20,y);y+=l.length*5+5;});doc.setFontSize(8);datos.slice(0,120).forEach((r,i)=>{const txt=`${i+1}. ${r.fecha||r.fecha_inicio||''} · ${r.nombre||''} · ${r.rut||''} · ${r.sucursal||''} ${r.marcas?`· Marcas: ${r.marcas}`:''}`;const l=doc.splitTextToSize(txt,170);if(y+l.length*4>280){doc.addPage();y=20;}doc.text(l,20,y);y+=l.length*4+2;});doc.save(`${titulo.replace(/[^a-z0-9]+/gi,'_')}.pdf`);}
            await registrarAuditoria('reportes','GENERA_REPORTE',`${tipo} · ${formato} · ${desde||'s/f'} a ${hasta||'s/f'} · ${datos.length} registros`);mostrarToast('Reporte generado y descargado.','success');
        }

        const listaPermisos=['dashboard','colaboradores','sucursales','asistencia','licencias','vacaciones','papeletas','correos','amonestaciones','reportes','usuarios','auditoria','configcorreos','mapas','tareas','operaciones','calidad','notificaciones','integraciones'];
        let perfilActualSistema=null, modulosPermitidosActuales=[];
        const EMAIL_ADMIN_PRINCIPAL='scoloma@farmaciasdoctorsimi.cl';
        function esAdminPrincipalActual(){return String(perfilActualSistema?.email||'').trim().toLowerCase()===EMAIL_ADMIN_PRINCIPAL;}
        function esAdministradorConAccesoGlobal(){
            const rol=String(perfilActualSistema?.rol||'').trim().toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[\\s-]+/g,'_');
            return esAdminPrincipalActual() || perfilActualSistema?.acceso_global===true || ['ADMIN','ADMINISTRADOR','SUPERADMIN','SUPER_ADMIN','ADMIN_PRINCIPAL','ADMINISTRADOR_PRINCIPAL'].includes(rol);
        }
        function tienePermisoModulo(modulo){
            // Los perfiles administradores y las cuentas con acceso_global pueden administrar los 19 módulos.
            if(esAdministradorConAccesoGlobal())return true;
            if(modulo==='operaciones')return ['tareas','correos','asistencia','licencias','coberturas','reportes'].some(p=>modulosPermitidosActuales.includes(p));
            if(modulo==='calidad'||modulo==='integraciones')return false;
            if(modulo==='notificaciones')return modulosPermitidosActuales.includes('tareas');
            return modulosPermitidosActuales.includes(modulo);
        }
        function puedeAsignarTareasActual(){return esAdminPrincipalActual()||!!perfilActualSistema?.puede_asignar_tareas;}
        function puedeRevisarTareasActual(){return esAdminPrincipalActual()||!!perfilActualSistema?.puede_revisar_tareas;}
        function puedePrepararCorreosActual(){return esAdminPrincipalActual()||!!perfilActualSistema?.puede_preparar_correos;}
        async function cargarPerfilPermisosActual(user){
            const email=String(user?.email||'').trim().toLowerCase();
            if(!email)throw new Error('La sesión no contiene un correo válido.');
            const {data,error}=await _supabase.from('usuarios_roles').select('*').eq('email',email).maybeSingle();
            if(error)throw new Error('No se pudieron comprobar tus permisos: '+error.message);
            if(email===EMAIL_ADMIN_PRINCIPAL){
                if(data&&data.activo===false)throw new Error('La cuenta administradora está desactivada en el sistema.');
                perfilActualSistema=data||{email,nombre:'Administrador principal',rol:'ADMIN',activo:true,permisos:listaPermisos,acceso_global:true,puede_asignar_tareas:true,puede_revisar_tareas:true,puede_preparar_correos:true};
                modulosPermitidosActuales=[...modulos];
            }else{
                if(!data||data.activo===false)throw new Error('Tu cuenta no tiene un perfil activo. Solicita al administrador que habilite tu acceso.');
                perfilActualSistema=data;
                modulosPermitidosActuales=Array.isArray(data.permisos)?data.permisos.filter(x=>modulos.includes(x)):[];
                if(esAdministradorConAccesoGlobal())modulosPermitidosActuales=[...modulos];
                if(!modulosPermitidosActuales.length)throw new Error('Tu usuario todavía no tiene módulos autorizados.');
            }
            aplicarPermisosVisuales();
            return perfilActualSistema;
        }
        function aplicarPermisosVisuales(){
            modulos.forEach(nombre=>{const b=document.getElementById('btn-'+nombre);if(b)b.classList.toggle('hidden',!tienePermisoModulo(nombre));});
            const form=document.getElementById('form-tarea');if(form)form.classList.toggle('hidden',!tienePermisoModulo('tareas')||!puedeAsignarTareasActual());
            const aviso=document.getElementById('tarea-permiso-aviso');if(aviso)aviso.classList.toggle('hidden',!tienePermisoModulo('tareas')||puedeAsignarTareasActual());
            const avisoCorreo=document.getElementById('correo-permiso-aviso');if(avisoCorreo)avisoCorreo.classList.toggle('hidden',!tienePermisoModulo('correos')||puedePrepararCorreosActual());
            document.querySelectorAll('[data-accion="preparar-correos"],[data-accion="abrir-borradores"]').forEach(b=>b.classList.toggle('hidden',!puedePrepararCorreosActual()));
            if(window.lucide)lucide.createIcons();
        }
        function opcionesSeleccionadas(id){return [...document.getElementById(id).selectedOptions].map(x=>x.value);}
        function construirChecksPermisos(){const c=document.getElementById('usr-permisos');if(!c)return;c.innerHTML=listaPermisos.map(p=>`<label class="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" value="${p}" class="usr-check">${p}</label>`).join('');}
        async function prepararSelectoresUsuarios(){
            const suc=await obtenerSucursalesConfig();
            const supervisores=[...new Set(suc.map(x=>texto(x.supervisor)).filter(Boolean))].sort();
            document.getElementById('usr-supervisores').innerHTML=supervisores.map(x=>`<option value="${escaparHTML(x)}">${escaparHTML(x)}</option>`).join('');
            document.getElementById('usr-sucursales').innerHTML=suc.map(x=>`<option value="${x.id}">${escaparHTML(x.nombre)}</option>`).join('');
            if(window.actualizarContadoresSelectores2026)window.actualizarContadoresSelectores2026();
        }
        async function tokenSesionActual(){const {data:{session}}=await _supabase.auth.getSession();return session?.access_token||'';}
        async function llamarApiAdmin(ruta,payload){const token=await tokenSesionActual();const res=await fetch(ruta,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});const raw=await res.text();let json;try{json=JSON.parse(raw)}catch{throw new Error(raw||`Error ${res.status}`)}if(!res.ok)throw new Error(json.error||`Error ${res.status}`);return json;}
        async function crearInvitarUsuario(){const email=texto(document.getElementById('usr-email').value).toLowerCase(),nombre=texto(document.getElementById('usr-nombre').value);if(!email)return mostrarToast('Ingresa el correo del usuario.','warning');try{await guardarUsuarioRol();const json=await llamarApiAdmin('/api/usuarios-auth',{accion:'INVITAR',email,nombre,redirectTo:window.location.origin});mostrarToast(json.message||'Invitación enviada.','success',12000);}catch(e){mostrarToast(e.message,'error',15000)}}
        async function enviarRecuperacionUsuario(){const email=texto(document.getElementById('usr-email').value).toLowerCase();if(!email)return mostrarToast('Ingresa o selecciona el correo.','warning');try{const json=await llamarApiAdmin('/api/usuarios-auth',{accion:'RECUPERAR',email,redirectTo:window.location.origin});mostrarToast(json.message||'Correo de recuperación enviado.','success',12000);}catch(e){mostrarToast(e.message,'error',15000)}}
        async function buscarCoordenadasPorDireccion(){const lista=await obtenerSucursalesConfig(),faltantes=lista.filter(x=>!coordenadaValida(x)&&texto(x.direccion));if(!faltantes.length)return mostrarToast('Todas las sucursales con dirección ya tienen coordenadas válidas.','success');if(!confirm(`Se buscarán coordenadas para ${faltantes.length} sucursal(es), una por una. ¿Continuar?`))return;const token=await tokenSesionActual();if(!token)return mostrarToast('Tu sesión expiró. Inicia sesión nuevamente.','error');let ok=0,fallas=[];for(let i=0;i<faltantes.length;i++){const x=faltantes[i],consulta=[x.direccion,x.comuna,'Chile'].filter(Boolean).join(', ');mostrarToast(`Buscando ${i+1} de ${faltantes.length}: ${x.nombre}`,'info',1800);try{const r=await fetch(`/api/geocodificar?direccion=${encodeURIComponent(consulta)}&nombre=${encodeURIComponent(x.nombre||'')}&comuna=${encodeURIComponent(x.comuna||'')}`,{headers:{'Authorization':`Bearer ${token}`}}),j=await r.json();if(!r.ok||!j.latitud)throw new Error(j.error||'Sin resultado');const u=await _supabase.from('sucursales').update({latitud:j.latitud,longitud:j.longitud}).eq('id',x.id);if(u.error)throw u.error;ok++;}catch(e){fallas.push(x.nombre);}await new Promise(r=>setTimeout(r,1100));}await prepararMapa14();mostrarToast(`Coordenadas encontradas: ${ok}. Sin resultado: ${fallas.length}${fallas.length?' ('+fallas.join(', ')+')':''}.`,fallas.length?'warning':'success',18000);}

        function alternarClaveUsuario(){const a=document.getElementById('usr-clave'),b=document.getElementById('usr-clave-repetir'),v=a.type==='text';a.type=v?'password':'text';b.type=v?'password':'text';}
        function validarClaveUsuario(){const a=document.getElementById('usr-clave').value,b=document.getElementById('usr-clave-repetir').value;if(a.length<8)throw new Error('La clave debe tener al menos 8 caracteres.');if(a!==b)throw new Error('Las claves no coinciden.');return a;}
        function payloadFichaUsuario(accion){return {accion,email:texto(document.getElementById('usr-email').value).toLowerCase(),nombre:texto(document.getElementById('usr-nombre').value),rol:document.getElementById('usr-rol').value,permisos:[...document.querySelectorAll('.usr-check:checked')].map(x=>x.value),supervisores:opcionesSeleccionadas('usr-supervisores'),sucursales:opcionesSeleccionadas('usr-sucursales'),activo:true,puede_asignar_tareas:document.getElementById('usr-puede-asignar').checked,puede_revisar_tareas:document.getElementById('usr-puede-revisar').checked,puede_preparar_correos:document.getElementById('usr-puede-correos').checked,acceso_global:document.getElementById('usr-acceso-global').checked};}
        async function crearUsuarioConClave(){try{const payload=payloadFichaUsuario('CREAR_CON_CLAVE');if(!payload.email)throw new Error('Ingresa el correo.');payload.password=validarClaveUsuario();const j=await llamarApiAdmin('/api/usuarios-auth',payload);document.getElementById('usr-clave').value='';document.getElementById('usr-clave-repetir').value='';mostrarToast(j.message,'success',12000);await cargarUsuariosRoles()}catch(e){mostrarToast(e.message,'error',15000)}}
        async function cambiarClaveUsuario(){try{const payload=payloadFichaUsuario('CAMBIAR_CLAVE');if(!payload.email)throw new Error('Ingresa el correo.');payload.password=validarClaveUsuario();const j=await llamarApiAdmin('/api/usuarios-auth',payload);document.getElementById('usr-clave').value='';document.getElementById('usr-clave-repetir').value='';mostrarToast(j.message,'success',12000);await cargarUsuariosRoles()}catch(e){mostrarToast(e.message,'error',15000)}}
        async function eliminarUsuarioCreado(email,nombre){if(!confirm(`¿Eliminar definitivamente el acceso de ${nombre||email}?`))return;if(prompt('Escribe ELIMINAR para confirmar')!=='ELIMINAR')return mostrarToast('Eliminación cancelada.','warning');try{const j=await llamarApiAdmin('/api/usuarios-auth',{accion:'ELIMINAR',email});mostrarToast(j.message,'success',12000);await cargarUsuariosRoles()}catch(e){mostrarToast(e.message,'error',15000)}}
        async function guardarUsuarioRol(){try{const payload=payloadFichaUsuario('GUARDAR_FICHA');if(!payload.email)throw new Error('Ingresa un correo.');const j=await llamarApiAdmin('/api/usuarios-auth',payload);mostrarToast(j.message,'success');await cargarUsuariosRoles();return j}catch(e){mostrarToast(e.message,'error',15000);throw e}}
        async function cargarUsuariosRoles(){
            construirChecksPermisos();await prepararSelectoresUsuarios();
            const {data,error}=await _supabase.from('usuarios_roles').select('*,usuarios_supervisores(supervisor),usuarios_sucursales(sucursal_id)').order('email');
            const tbody=document.getElementById('tabla-usuarios-body');if(error){tbody.innerHTML=`<tr><td colspan="6" class="p-8 text-center text-red-600">${escaparHTML(error.message)}</td></tr>`;return;}
            usuariosSistemaGlobal=data||[];

            tbody.innerHTML = data?.length
                ? data.map((u, i) => `
                    <tr>
                        <td class="p-3">${escaparHTML(u.email)}</td>
                        <td class="p-3">${escaparHTML(u.nombre || '')}</td>
                        <td class="p-3 font-bold">${escaparHTML(u.rol || '')}</td>
                        <td class="p-3">
                            <b>Módulos:</b>
                            ${escaparHTML((u.permisos || []).join(', '))}
                            <br>
                            <b>Supervisores:</b>
                            ${escaparHTML((u.usuarios_supervisores || []).map(x => x.supervisor).join(', '))}
                            <br>
                            <b>Sucursales:</b>
                            ${(u.usuarios_sucursales || []).length}
                        </td>
                        <td class="p-3">${u.activo ? 'Activo' : 'Inactivo'}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    onclick="editarUsuarioRol(${i})"
                                    class="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white">
                                    Editar perfil
                                </button>

                                <button
                                    onclick="toggleUsuario('${escaparHTML(u.email)}',${!u.activo})"
                                    class="font-bold text-simiNavy">
                                    ${u.activo ? 'Desactivar' : 'Activar'}
                                </button>

                                <button
                                    onclick="eliminarUsuarioCreado('${escaparHTML(u.email)}','${escaparHTML(u.nombre || u.email)}')"
                                    class="font-bold text-rose-700">
                                    Eliminar acceso
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')
                : '<tr><td colspan="6" class="p-8 text-center">Sin usuarios registrados</td></tr>';
        }

        async function toggleUsuario(email, activo) {
            try {
                const j = await llamarApiAdmin('/api/usuarios-auth', {
                    accion: 'CAMBIAR_ESTADO',
                    email,
                    activo
                });

                mostrarToast(j.message, 'success');
                await cargarUsuariosRoles();
            } catch (e) {
                mostrarToast(e.message, 'error', 15000);
            }
        }

        function editarUsuarioRol(indice) {
            const u = usuariosSistemaGlobal[indice];

            if (!u) {
                mostrarToast('No se encontró el usuario.', 'error');
                return;
            }

            document.getElementById('usr-email').value = u.email || '';
            document.getElementById('usr-nombre').value = u.nombre || '';
            document.getElementById('usr-rol').value = u.rol || 'CONSULTA';

            construirChecksPermisos();

            document.querySelectorAll('.usr-check').forEach(check => {
                check.checked = (u.permisos || []).includes(check.value);
            });

            const supervisores = (u.usuarios_supervisores || [])
                .map(x => String(x.supervisor));

            const sucursales = (u.usuarios_sucursales || [])
                .map(x => String(x.sucursal_id));

            document.querySelectorAll('#usr-supervisores option').forEach(op => {
                op.selected = supervisores.includes(op.value);
            });

            document.querySelectorAll('#usr-sucursales option').forEach(op => {
                op.selected = sucursales.includes(op.value);
            });

            document.getElementById('usr-puede-asignar').checked =
                !!u.puede_asignar_tareas;

            document.getElementById('usr-puede-revisar').checked =
                !!u.puede_revisar_tareas;

            document.getElementById('usr-puede-correos').checked =
                !!u.puede_preparar_correos;

            document.getElementById('usr-acceso-global').checked =
                !!u.acceso_global;

            document.getElementById('usr-clave').value = '';
            document.getElementById('usr-clave-repetir').value = '';

            document.getElementById('view-usuarios').scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            mostrarToast(
                'Perfil cargado. Revisa los cambios y pulsa Guardar permisos.',
                'success'
            );
        }
        async function prepararModuloTareas(){
            const [usuarios,sucursales] = await Promise.all([
                _supabase.rpc('usuarios_tareas_asignables'),
                obtenerSucursalesConfig()
            ]);
            if(usuarios.error) throw usuarios.error;
            const activos=usuarios.data||[];
            const responsables=activos;
            const revisores=activos.filter(u=>u.puede_revisar_tareas || String(u.email||'').toLowerCase()===EMAIL_ADMIN_PRINCIPAL);
            const opt=(u)=>`<option value="${u.id}">${escaparHTML(u.nombre||u.email)} · ${escaparHTML(u.email||'')}</option>`;
            const opcionesKpi='<option value="TODOS">Todos los usuarios</option>'+responsables.map(opt).join('');
            document.getElementById('tarea-filtro-responsable').innerHTML=opcionesKpi;
            document.getElementById('tarea-kpi-filtro-usuario').innerHTML=opcionesKpi;
            document.getElementById('tarea-responsable').innerHTML='<option value="">Selecciona responsable</option>'+responsables.map(opt).join('');
            document.getElementById('tarea-revisor').innerHTML='<option value="">Sin revisor</option>'+revisores.map(opt).join('');
            document.getElementById('tarea-sucursal').innerHTML='<option value="">Todas / No aplica</option>'+(sucursales||[]).map(x=>`<option value="${x.id}">${escaparHTML(x.nombre)}</option>`).join('');
            const vencimiento=document.getElementById('tarea-vencimiento');
            if(vencimiento && !vencimiento.value){const d=new Date();d.setHours(23,59,0,0);vencimiento.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
            await cargarTareas();
        }
        function aplicarPlantillaTarea(){
            const plantillas={
                incidencias:{titulo:'Revisar correos de incidencias',descripcion:'Revisar la bandeja de incidencias, clasificar los casos, responder o derivar y dejar actualizados los pendientes.',prioridad:'ALTA',recurrencia:'DIARIA'},
                asistencia:{titulo:'Regularizar marcas de asistencia',descripcion:'Revisar marcas incompletas, atrasos, salidas anticipadas y marcas sin turno. Gestionar las regularizaciones y dejar respaldo.',prioridad:'ALTA',recurrencia:'DIARIA'},
                licencias:{titulo:'Revisar licencias médicas pendientes',descripcion:'Verificar licencias nuevas, fechas, recepción en sistema y casos que requieren gestión o seguimiento.',prioridad:'ALTA',recurrencia:'DIARIA'},
                turnos:{titulo:'Revisar turnos y cambios',descripcion:'Revisar modificaciones de turnos, diferencias con la jornada asignada y solicitudes pendientes de aprobación.',prioridad:'MEDIA',recurrencia:'DIARIA'},
                reporte:{titulo:'Enviar reporte diario a jefatura',descripcion:'Consolidar pendientes, incidencias relevantes, regularizaciones realizadas y casos que requieren decisión de jefatura.',prioridad:'ALTA',recurrencia:'DIARIA'},
                sucursales:{titulo:'Contactar sucursales con pendientes',descripcion:'Contactar a las sucursales con incidencias abiertas, solicitar respaldo y registrar el resultado de la gestión.',prioridad:'MEDIA',recurrencia:'DIARIA'}
            };
            const p=plantillas[document.getElementById('tarea-plantilla').value];if(!p)return;
            document.getElementById('tarea-titulo').value=p.titulo;
            document.getElementById('tarea-descripcion').value=p.descripcion;
            document.getElementById('tarea-prioridad').value=p.prioridad;
            document.getElementById('tarea-recurrencia').value=p.recurrencia;
            document.getElementById('tarea-titulo').focus();
        }
        async function guardarTarea(event){
            event.preventDefault();
            if(!puedeAsignarTareasActual())return mostrarToast('No tienes autorización para asignar tareas.','warning');
            const responsable=document.getElementById('tarea-responsable').value;
            const vencimiento=document.getElementById('tarea-vencimiento').value;
            if(!responsable)return mostrarToast('Selecciona un responsable para esta tarea.','warning');
            if(!vencimiento || Number.isNaN(new Date(vencimiento).getTime()))return mostrarToast('Indica una fecha límite válida.','warning');
            const {data:{session}}=await _supabase.auth.getSession();
            const registro={titulo:document.getElementById('tarea-titulo').value.trim(),descripcion:document.getElementById('tarea-descripcion').value.trim(),responsable_rol_id:Number(responsable),revisor_rol_id:document.getElementById('tarea-revisor').value?Number(document.getElementById('tarea-revisor').value):null,prioridad:document.getElementById('tarea-prioridad').value,fecha_limite:new Date(vencimiento).toISOString(),recurrencia:document.getElementById('tarea-recurrencia').value,sucursal_id:document.getElementById('tarea-sucursal').value||null,estado:'PENDIENTE',creado_por_email:session?.user?.email||''};
            const {data,error}=await _supabase.from('tareas').insert([registro]).select('id').single();if(error)return mostrarToast(error.message,'error');
            await _supabase.from('tareas_eventos').insert([{tarea_id:data.id,accion:'CREADA',estado_nuevo:'PENDIENTE',usuario_email:session?.user?.email||'',detalle:'Tarea creada desde la aplicación'}]);
            event.target.reset();document.getElementById('tarea-vencimiento').value='';await prepararModuloTareas();mostrarToast('Tarea creada y asignada.','success');
        }
        function estadoTareaCalculado(t){if(!['APROBADA','CANCELADA','DEVUELTA'].includes(t.estado)&&new Date(t.fecha_limite)<new Date())return'VENCIDA';return t.estado;}
        async function cargarTareas(){const {data,error}=await _supabase.from('tareas').select('*,responsable:usuarios_roles!tareas_responsable_rol_id_fkey(nombre,email),revisor:usuarios_roles!tareas_revisor_rol_id_fkey(nombre,email),sucursal:sucursales(nombre)').order('fecha_limite',{ascending:true});if(error)return mostrarToast(error.message,'error');tareasGlobal=(data||[]).map(x=>({...x,estado_calculado:estadoTareaCalculado(x)}));renderizarTareas();}
        function renderizarTareas(){
            const estado=document.getElementById('tarea-filtro-estado')?.value||'TODOS',responsableFiltro=document.getElementById('tarea-filtro-responsable')?.value||'TODOS',q=texto(document.getElementById('tarea-filtro-buscar')?.value).toLowerCase();
            let f=tareasGlobal;if(estado!=='TODOS')f=f.filter(x=>x.estado_calculado===estado);if(responsableFiltro!=='TODOS')f=f.filter(x=>String(x.responsable_rol_id)===responsableFiltro);if(q)f=f.filter(x=>`${x.titulo} ${x.descripcion} ${x.responsable?.nombre} ${x.responsable?.email} ${x.sucursal?.nombre}`.toLowerCase().includes(q));
            const cuenta=e=>tareasGlobal.filter(x=>x.estado_calculado===e).length;
            document.getElementById('tk-pendiente').innerText=cuenta('PENDIENTE');document.getElementById('tk-proceso').innerText=cuenta('EN_PROCESO');document.getElementById('tk-validar').innerText=cuenta('COMPLETADA_POR_VALIDAR');document.getElementById('tk-aprobada').innerText=cuenta('APROBADA');document.getElementById('tk-devuelta').innerText=cuenta('DEVUELTA');document.getElementById('tk-vencida').innerText=cuenta('VENCIDA');
            const medibles=tareasGlobal.filter(x=>x.estado_calculado!=='CANCELADA');
            const terminadas=medibles.filter(x=>x.estado_calculado==='APROBADA');
            document.getElementById('tk-cumplimiento').innerText=(medibles.length?Math.round(100*terminadas.length/medibles.length):0)+'%';
            document.getElementById('tk-tiempo').innerText=(terminadas.length?Math.round(100*terminadas.filter(x=>new Date(x.updated_at||x.created_at)<=new Date(x.fecha_limite)).length/terminadas.length):0)+'%';
            const filtroKpi=document.getElementById('tarea-kpi-filtro-usuario')?.value||'TODOS';
            const porUsuario=new Map();
            tareasGlobal.filter(t=>filtroKpi==='TODOS'||String(t.responsable_rol_id)===filtroKpi).forEach(t=>{const id=String(t.responsable_rol_id||'sin-asignar'),nombre=t.responsable?.nombre||t.responsable?.email||'Sin responsable';if(!porUsuario.has(id))porUsuario.set(id,{id,nombre,total:0,aprobadas:0,pendientes:0,vencidas:0,validar:0});const k=porUsuario.get(id);k.total++;if(t.estado_calculado==='APROBADA')k.aprobadas++;if(['PENDIENTE','EN_PROCESO'].includes(t.estado_calculado))k.pendientes++;if(t.estado_calculado==='VENCIDA')k.vencidas++;if(t.estado_calculado==='COMPLETADA_POR_VALIDAR')k.validar++;});
            const kpi=document.getElementById('tabla-kpi-usuarios');
            kpi.innerHTML=porUsuario.size?[...porUsuario.values()].sort((a,b)=>b.total-a.total).map(u=>{const medibles=tareasGlobal.filter(t=>String(t.responsable_rol_id||'sin-asignar')===u.id&&t.estado_calculado!=='CANCELADA').length;const pct=medibles?Math.round(100*u.aprobadas/medibles):0;return `<div class="kpi-persona-row rounded-xl border border-slate-100 p-3"><div><b class="block text-sm text-slate-800">${escaparHTML(u.nombre)}</b><span class="text-xs text-slate-500">${u.total} tarea(s) asignadas</span><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${pct>=80?'bg-emerald-500':pct>=50?'bg-amber-500':'bg-rose-500'}" style="width:${pct}%"></div></div></div><div><span class="block text-[11px] text-slate-500">Aprobadas</span><b class="text-lg text-emerald-700">${u.aprobadas}</b></div><div><span class="block text-[11px] text-slate-500">Pendientes</span><b class="text-lg">${u.pendientes}</b></div><div><span class="block text-[11px] text-slate-500">Vencidas</span><b class="text-lg ${u.vencidas?'text-rose-700':''}">${u.vencidas}</b></div><div><span class="block text-[11px] text-slate-500">Cumplimiento</span><b class="text-lg">${pct}%</b><span class="block text-[10px] text-slate-400">${u.validar} por validar</span></div></div>`}).join(''):'<p class="p-4 text-sm text-slate-500">Todavía no hay tareas asignadas. Crea una tarea para empezar a medir.</p>';
            document.getElementById('tabla-tareas').innerHTML=f.length?f.map(t=>`<tr><td><b>${escaparHTML(t.titulo)}</b><br><span class="text-xs text-slate-500">${escaparHTML(t.descripcion)}</span></td><td>${escaparHTML(t.responsable?.nombre||t.responsable?.email||'Sin asignar')}</td><td>${escaparHTML(t.revisor?.nombre||t.revisor?.email||'—')}</td><td><span class="rounded-full px-2 py-1 text-xs font-bold ${t.prioridad==='URGENTE'?'bg-rose-100 text-rose-800':t.prioridad==='ALTA'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}">${escaparHTML(t.prioridad)}</span></td><td>${new Date(t.fecha_limite).toLocaleString('es-CL')}</td><td><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">${t.estado_calculado}</span></td><td><select aria-label="Cambiar estado de tarea" class="form-field min-w-40" onchange="cambiarEstadoTarea(${t.id},this.value)"><option value="">Actualizar estado…</option>${(esAdminPrincipalActual()||(puedeRevisarTareasActual()&&String(t.revisor_rol_id)===String(perfilActualSistema?.id))?['EN_PROCESO','COMPLETADA_POR_VALIDAR','APROBADA','DEVUELTA','CANCELADA']:(String(t.responsable_rol_id)===String(perfilActualSistema?.id)?['EN_PROCESO','COMPLETADA_POR_VALIDAR']:[])).map(e=>`<option>${e}</option>`).join('')}</select></td></tr>`).join(''):'<tr><td colspan="7" class="p-8 text-center text-sm text-slate-500">No hay tareas para estos filtros.</td></tr>';
        }
        async function cambiarEstadoTarea(id,estado){if(!estado)return;const tarea=tareasGlobal.find(x=>String(x.id)===String(id));if(!tarea)return mostrarToast('No se encontró la tarea.','error');const idActual=String(perfilActualSistema?.id||'');const esResp=String(tarea.responsable_rol_id)===idActual;const esRev=String(tarea.revisor_rol_id)===idActual;if(!esAdminPrincipalActual()&&(['APROBADA','DEVUELTA','CANCELADA'].includes(estado)?(!puedeRevisarTareasActual()||!esRev):(!esResp&&!esRev)))return mostrarToast('No tienes permiso para cambiar este estado.','warning');const motivo=['DEVUELTA','CANCELADA'].includes(estado)?prompt('Indica el motivo del cambio:')||'Sin motivo':'';const {data:{session}}=await _supabase.auth.getSession();const {error}=await _supabase.from('tareas').update({estado,updated_at:new Date().toISOString()}).eq('id',id);if(error)return mostrarToast(error.message,'error');await _supabase.from('tareas_eventos').insert([{tarea_id:id,accion:'CAMBIO_ESTADO',estado_nuevo:estado,usuario_email:session?.user?.email||'',detalle:motivo}]);await cargarTareas();}

        async function registrarAuditoria(modulo,accion,detalle){try{const {data:{session}}=await _supabase.auth.getSession();await _supabase.from('auditoria_eventos').insert([{usuario_email:session?.user?.email||'sin sesión',modulo,accion,detalle}]);}catch(e){console.warn('Auditoría no registrada',e);}}
        async function cargarAuditoria(){const {data,error}=await _supabase.from('auditoria_eventos').select('*').order('created_at',{ascending:false}).limit(2000);if(error){mostrarToast(error.message,'error');return;}datosAuditoriaGlobal=data||[];renderizarAuditoria();}
        function renderizarAuditoria(){const buscar=document.getElementById('audit-buscar')?.value.toLowerCase().trim()||'',desde=document.getElementById('audit-desde')?.value||'',hasta=document.getElementById('audit-hasta')?.value||'';let f=datosAuditoriaGlobal.filter(a=>(!desde||a.created_at.slice(0,10)>=desde)&&(!hasta||a.created_at.slice(0,10)<=hasta));if(buscar)f=f.filter(a=>`${a.usuario_email} ${a.modulo} ${a.accion} ${a.detalle}`.toLowerCase().includes(buscar));document.getElementById('contador-auditoria').innerText=f.length;document.getElementById('tabla-auditoria-body').innerHTML=f.length?f.map(a=>`<tr><td class="p-3 font-mono">${escaparHTML(a.created_at?.replace('T',' ').slice(0,19))}</td><td class="p-3">${escaparHTML(a.usuario_email)}</td><td class="p-3">${escaparHTML(a.modulo)}</td><td class="p-3 font-bold">${escaparHTML(a.accion)}</td><td class="p-3">${escaparHTML(a.detalle)}</td></tr>`).join(''):'<tr><td colspan="5" class="p-8 text-center text-slate-400">Sin eventos.</td></tr>';}


