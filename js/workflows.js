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
                await registrarActualizacionFuente('vacaciones', file.name, consolidado.registros.length, 'manual');
                mostrarToast(`Vacaciones guardadas. ${resultado.confirmados} registros confirmados; ${consolidado.duplicados.length} duplicados consolidados.`,'success',15000);
            } catch(error) { mostrarToast(`No se pudieron guardar vacaciones. ${error.message}`,'error',18000); }
            finally { boton.innerHTML='<i data-lucide="cloud-upload" class="h-4 w-4"></i> Cargar histórico<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="procesarHistorialVacaciones(event)">'; input.value=''; lucide.createIcons(); }
        }

        function fechaEnRango(fecha,inicio,fin) { return fecha && inicio && fin && fecha>=inicio && fecha<=fin; }
        function obtenerMarcasVacacion(v) {
            return datosAsistenciaGlobal.filter(a=>normalizarRut(a.rut)===normalizarRut(v.rut) && fechaEnRango(a.fecha,v.fecha_inicio,v.fecha_fin) && ((a.entrada&&a.entrada!=='-')||(a.salida&&a.salida!=='-')));
        }

        async function cargarVacacionesDesdeNube() {
            // Mostrar primero las vacaciones; el cruce de asistencia termina en segundo plano.
            const vacaciones = await leerTablaCompleta('vacaciones_historico', 'fecha_inicio');
            datosVacacionesGlobal = vacaciones;
            vacacionesCargadas = true;
            poblarFiltroVacaciones();

            if (!asistenciaCargada) {
                cargarAsistenciaDesdeNube()
                    .then(() => {
                        if (vacacionesCargadas) renderizarVacaciones();
                    })
                    .catch(error => {
                        console.error('No se pudo completar el cruce de vacaciones con asistencia:', error);
                    });
            }
        }

        function poblarFiltroVacaciones() {
            const sel=document.getElementById('filtro-vac-persona'), actual=sel.value;
            const personas=new Map(datosVacacionesGlobal.filter(v=>v.rut).map(v=>[v.rut,v.nombre||'Sin nombre']));
            sel.innerHTML='<option value="TODOS">Todos los colaboradores</option>';
            [...personas.entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')).forEach(([rut,nombre])=>{const o=document.createElement('option');o.value=rut;o.textContent=`${nombre} (${rut})`;sel.appendChild(o);});
            sel.value=personas.has(actual)?actual:'TODOS'; renderizarVacaciones();
        }

        function seleccionarFiltroVacaciones(tipo) {
            const vigencia=document.getElementById('filtro-vac-vigencia');
            const cruce=document.getElementById('filtro-vac-cruce');
            if(tipo==='CON_MARCAS'){if(vigencia)vigencia.value='TODOS';if(cruce)cruce.value='CON_MARCAS';}
            else {if(vigencia)vigencia.value=tipo;if(cruce)cruce.value='TODOS';}
            renderizarVacaciones();
            document.getElementById('tabla-vacaciones-body')?.scrollIntoView({behavior:'smooth',block:'start'});
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
            document.getElementById('pap-logo-preview').src=logoPapeletaDataUrl;
            document.getElementById('pap-firma-preview').src=firmaPapeletaDataUrl;
            // Cargar toda la nómina por bloques: Supabase limita por defecto el número
            // de filas devueltas y eso podía ocultar colaboradores en Papeletas.
            const filas=[];
            const tamanoBloque=1000;
            let desde=0;
            try {
                while(true){
                    const {data,error}=await _supabase
                        .from('colaboradores')
                        .select('*')
                        .order('nombres',{ascending:true})
                        .range(desde,desde+tamanoBloque-1);
                    if(error) throw error;
                    const bloque=data||[];
                    filas.push(...bloque);
                    if(bloque.length<tamanoBloque) break;
                    desde+=tamanoBloque;
                    if(desde>=1000000) throw new Error('La nómina supera el máximo seguro de lectura.');
                }
                colaboradoresPapeleta=filas;
            } catch(error) {
                colaboradoresPapeleta=[];
                mostrarToast(`No se pudieron cargar todos los colaboradores para papeletas: ${error.message||error}`,'error',12000);
                console.error('Error cargando colaboradores para papeletas:',error);
            }
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

        async function cargarPapeletas() {
            const tbody=document.getElementById('tabla-papeletas-body'); if(!tbody)return;
            const {data,error}=await _supabase.from('papeletas_permiso').select('*').order('created_at',{ascending:false}).limit(300);
            if(error){tbody.innerHTML=`<tr><td colspan="6" class="p-8 text-center text-red-600">${escaparHTML(error.message)}</td></tr>`;return;}
            const {data:sessionData}=await _supabase.auth.getSession();
            const esSuperAdmin=String(sessionData?.session?.user?.email||'').toLowerCase()===String(EMAIL_ADMIN_PRINCIPAL||'scoloma@farmaciasdoctorsimi.cl').toLowerCase();
            tbody.innerHTML=data?.length?data.map(p=>{
                const fecha=p.created_at?new Date(p.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}):'—';
                const accion=esSuperAdmin?`<button type="button" onclick="eliminarPapeleta(${Number(p.id)})" class="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-extrabold text-rose-700 hover:bg-rose-100">Eliminar</button>`:'<span class="text-slate-400">Solo superadministrador</span>';
                return `<tr><td class="p-3">${escaparHTML(fecha)}</td><td class="p-3"><b>${escaparHTML(p.nombre)}</b><br>${escaparHTML(p.rut)}</td><td class="p-3">${escaparHTML(p.tipo_permiso)}</td><td class="p-3">${escaparHTML(p.fecha_inicio)} a ${escaparHTML(p.fecha_fin)}</td><td class="p-3">${escaparHTML(p.generado_por)}</td><td class="p-3">${accion}</td></tr>`;
            }).join(''):'<tr><td colspan="6" class="p-8 text-center text-slate-400">Sin registros.</td></tr>';
        }

        async function eliminarPapeleta(id) {
            const {data:sessionData}=await _supabase.auth.getSession();
            const email=String(sessionData?.session?.user?.email||'').toLowerCase();
            if(email!==String(EMAIL_ADMIN_PRINCIPAL||'scoloma@farmaciasdoctorsimi.cl').toLowerCase()) return mostrarToast('Solo el superadministrador puede eliminar papeletas.','error');
            if(!Number.isFinite(Number(id))||!confirm('¿Eliminar definitivamente esta papeleta del historial? Esta acción no se puede deshacer.')) return;
            const {error}=await _supabase.from('papeletas_permiso').delete().eq('id',Number(id));
            if(error) return mostrarToast('No se pudo eliminar la papeleta: '+error.message,'error',10000);
            await registrarAuditoria('papeletas','ELIMINA_PAPELETA','ID '+id);
            await cargarPapeletas();
            mostrarToast('Papeleta eliminada por superadministrador.','success');
        }

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

        const listaPermisos=['dashboard','espacio','colaboradores','sucursales','asistencia','licencias','envio_licencias','vacaciones','papeletas','correos','correosareas','configcorreosareas','memes','amonestaciones','reportes','usuarios','auditoria','configcorreos','mapas','tareas','operaciones','calidad','notificaciones','integraciones','chat','traslados','traslados_aprobar'];
        let perfilActualSistema=null, modulosPermitidosActuales=[];
        const EMAIL_ADMIN_PRINCIPAL='scoloma@farmaciasdoctorsimi.cl';
        function esAdminPrincipalActual(){return String(perfilActualSistema?.email||'').trim().toLowerCase()===EMAIL_ADMIN_PRINCIPAL;}
        function esAdministradorConAccesoGlobal(){
            const rol=String(perfilActualSistema?.rol||'').trim().toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[\\s-]+/g,'_');
            return esAdminPrincipalActual() || perfilActualSistema?.acceso_global===true || ['ADMIN','ADMINISTRADOR','SUPERADMIN','SUPER_ADMIN','ADMIN_PRINCIPAL','ADMINISTRADOR_PRINCIPAL'].includes(rol);
        }
        function tienePermisoModulo(modulo){
            // Administradores globales mantienen acceso a todo el catálogo.
            if(esAdministradorConAccesoGlobal())return true;
            // Mi espacio acompaña a Tareas para evitar quitarle al equipo una herramienta de seguimiento útil.
            if(modulo==='espacio')return modulosPermitidosActuales.includes('espacio')||modulosPermitidosActuales.includes('tareas');
            if(modulo==='operaciones')return ['tareas','correos','asistencia','licencias','amonestaciones','reportes'].some(p=>modulosPermitidosActuales.includes(p));
            if(modulo==='calidad'||modulo==='integraciones')return false;
            if(modulo==='notificaciones')return ['tareas','traslados','amonestaciones'].some(p=>modulosPermitidosActuales.includes(p));
            return modulosPermitidosActuales.includes(modulo);
        }
        function esVisualizadorActual(){
            return !esAdminPrincipalActual() && rolNormalizadoUsuario(perfilActualSistema?.rol)==='CONSULTA';
        }
        function puedeAsignarTareasActual(){return esAdminPrincipalActual()||(!esVisualizadorActual()&&!!perfilActualSistema?.puede_asignar_tareas);}
        function puedeRevisarTareasActual(){return esAdminPrincipalActual()||(!esVisualizadorActual()&&!!perfilActualSistema?.puede_revisar_tareas);}
        function puedePrepararCorreosActual(){return esAdminPrincipalActual()||(!esVisualizadorActual()&&!!perfilActualSistema?.puede_preparar_correos);}
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
            const topNotif=document.getElementById('topbar-notification-button');if(topNotif)topNotif.classList.toggle('hidden',!tienePermisoModulo('notificaciones'));
            const form=document.getElementById('form-tarea');if(form)form.classList.toggle('hidden',!tienePermisoModulo('tareas')||!puedeAsignarTareasActual());
            const aviso=document.getElementById('tarea-permiso-aviso');if(aviso)aviso.classList.toggle('hidden',!tienePermisoModulo('tareas')||puedeAsignarTareasActual());
            const avisoCorreo=document.getElementById('correo-permiso-aviso');if(avisoCorreo)avisoCorreo.classList.toggle('hidden',!tienePermisoModulo('correos')||puedePrepararCorreosActual());
            document.querySelectorAll('[data-accion="preparar-correos"],[data-accion="abrir-borradores"]').forEach(b=>b.classList.toggle('hidden',!puedePrepararCorreosActual()));
            if(window.organizarNavegacionPermisos)window.organizarNavegacionPermisos();
            aplicarModoVisualizadorActual();
            if(window.lucide)lucide.createIcons();
        }

        function esAccionDeModificacionVisualizador(el){
            if(!el)return false;
            const handler=String(el.getAttribute('onclick')||'');
            const title=String(el.getAttribute('title')||el.getAttribute('aria-label')||'');
            const label=String(el.innerText||el.value||'');
            const signals=handler+' '+title+' '+label;
            return /(guardar|crear|eliminar|borrar|editar|modificar|aprobar|rechazar|archivar|resolver|desactivar|importar|procesarexcel|procesarhistorial|asignar|registrar|toggleusuario|cambiarclave|enviarrecuperacion|guardarusuario|alternarfijado|cambiarestadonota|eliminarnota|crearinvitar|crearusuario|generarinvitacion|subirarchivo|procesarhistorial)/i.test(signals);
        }
        function aplicarModoVisualizadorActual(root=document){
            const visualizador=esVisualizadorActual();
            document.body.classList.toggle('modo-visualizador',visualizador);
            document.querySelectorAll('section[id^="view-"]').forEach(view=>{
                let banner=view.querySelector(':scope > .visualizador-notice');
                if(visualizador&&!banner){
                    banner=document.createElement('div');
                    banner.className='visualizador-notice';
                    banner.innerHTML='<span><i data-lucide="eye"></i></span><div><b>Modo visualizador · solo lectura</b><small>Puedes consultar los módulos autorizados. Las acciones de creación, edición, aprobación e importación están deshabilitadas para este perfil.</small></div>';
                    view.insertBefore(banner,view.firstChild);
                }else if(!visualizador&&banner)banner.remove();
            });
            const controls=root.querySelectorAll?root.querySelectorAll('button,input[type="submit"],input[type="file"],form input,form select,form textarea'):[];
            controls.forEach(el=>{
                const form=el.closest('form');
                const handler=String(form?.getAttribute('onsubmit')||'');
                const writeForm=!!form&&/(guardar|crear|eliminar|borrar|editar|modificar|aprobar|rechazar|procesar|importar|registrar|asignar|cambiar|enviarrecuperacion|crearusuario)/i.test(handler);
                const safeButton=el.tagName==='BUTTON'&&/(cerrar|cancelar|volver|limpiar filtros|abrir|consultar|buscar|filtrar|actualizar|refrescar|ver ficha|mostrar todas|descargar|exportar|imprimir|copiar|generar reporte|ruta vial)/i.test(String(el.innerText||el.getAttribute('title')||''));
                const shouldLock=visualizador&&!safeButton&&(
                    (el.tagName==='BUTTON'&&esAccionDeModificacionVisualizador(el))||
                    (el.matches('input[type="submit"],input[type="file"]'))||
                    writeForm
                );
                if(shouldLock){
                    if(!el.hasAttribute('data-readonly-locked')){
                        el.setAttribute('data-readonly-locked','1');
                        el.dataset.readonlyWasDisabled=el.disabled?'1':'0';
                        el.dataset.readonlyWasTitle=el.getAttribute('title')||'';
                    }
                    el.disabled=true;
                    el.setAttribute('aria-disabled','true');
                    el.title='Perfil visualizador: acción de modificación no disponible.';
                }else if(!visualizador&&el.hasAttribute('data-readonly-locked')){
                    el.disabled=el.dataset.readonlyWasDisabled==='1';
                    el.removeAttribute('data-readonly-locked');
                    el.removeAttribute('aria-disabled');
                    if(el.dataset.readonlyWasTitle)el.title=el.dataset.readonlyWasTitle;else el.removeAttribute('title');
                    delete el.dataset.readonlyWasDisabled;delete el.dataset.readonlyWasTitle;
                }
            });
            if(visualizador&&!window.__rrhhViewerObserver&&document.body&&window.MutationObserver){
                window.__rrhhViewerObserver=new MutationObserver(records=>{
                    if(records.some(r=>r.addedNodes&&r.addedNodes.length))aplicarModoVisualizadorActual(document);
                });
                window.__rrhhViewerObserver.observe(document.body,{childList:true,subtree:true});
            }
        }

        function opcionesSeleccionadas(id){return [...document.getElementById(id).selectedOptions].map(x=>x.value);}
        const etiquetasPermisosUsuarios = {
            dashboard:'Dashboard', espacio:'Mi espacio de trabajo', tareas:'Tareas diarias',
            colaboradores:'Colaboradores', sucursales:'Sucursales', usuarios:'Usuarios y roles',
            asistencia:'Asistencia y atrasos', licencias:'Licencias médicas', envio_licencias:'Envío de licencias médicas', vacaciones:'Vacaciones',
            papeletas:'Permisos y ausencias', amonestaciones:'Coberturas', traslados:'Traslados de personal',
            correos:'Borradores de correo', correosareas:'Borradores Área', configcorreosareas:'Configuración de correos por área', memes:'Memes RR. HH.', configcorreos:'Correos de sucursales', chat:'Chat interno',
            reportes:'Reportes', mapas:'Mapa y distancias', operaciones:'Centro de operaciones',
            calidad:'Calidad de datos', notificaciones:'Notificaciones', integraciones:'Integraciones y monitoreo',
            auditoria:'Bitácora y auditoría', traslados_aprobar:'Aprobar traslados'
        };
        const gruposPermisosUsuarios = [
            {label:'Inicio y productividad',icon:'layout-dashboard',keys:['dashboard','espacio','tareas']},
            {label:'Personas y estructura',icon:'users',keys:['colaboradores','sucursales','usuarios']},
            {label:'Asistencia y beneficios',icon:'clock',keys:['asistencia','licencias','envio_licencias','vacaciones','papeletas']},
            {label:'Coberturas y comunicación',icon:'calendar-check',keys:['amonestaciones','traslados','correos','configcorreos','correosareas','configcorreosareas','memes','chat']},
            {label:'Análisis y control',icon:'chart-no-axes-combined',keys:['reportes','mapas','operaciones','calidad','notificaciones','integraciones','auditoria']},
            {label:'Privilegios especiales',icon:'shield-check',keys:['traslados_aprobar']}
        ];
        function construirChecksPermisos(){
            const c=document.getElementById('usr-permisos');if(!c)return;
            c.innerHTML=gruposPermisosUsuarios.map(grupo=>{
                const checks=grupo.keys.filter(key=>listaPermisos.includes(key)).map(key=>
                    '<label class="usr-check-label" title="'+escaparHTML(etiquetasPermisosUsuarios[key]||key)+'"><input type="checkbox" value="'+key+'" class="usr-check"><span>'+escaparHTML(etiquetasPermisosUsuarios[key]||key)+'</span></label>'
                ).join('');
                return '<section class="usr-permission-group"><h4><i data-lucide="'+grupo.icon+'"></i>'+escaparHTML(grupo.label)+'</h4><div class="usr-permission-group-list">'+checks+'</div></section>';
            }).join('');
            if(window.lucide)lucide.createIcons();
        }
        function rolNormalizadoUsuario(rol){
            return String(rol||'CONSULTA').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');
        }
        function etiquetaRolUsuario(rol){
            const key=rolNormalizadoUsuario(rol);
            return ({ADMIN:'Administrador',ADMINISTRADOR:'Administrador',SUPERADMIN:'Administrador principal',SUPER_ADMIN:'Administrador principal',ADMIN_PRINCIPAL:'Administrador principal',ADMINISTRADOR_PRINCIPAL:'Administrador principal',RRHH:'Gestión de RR. HH.',CARGA:'Carga de datos',CONSULTA:'Visualizador · solo lectura'})[key]||String(rol||'Sin rol definido');
        }
        function usuarioTieneAlcanceGlobal(u){
            const role=rolNormalizadoUsuario(u?.rol);
            return !!u?.acceso_global||['ADMIN','ADMINISTRADOR','SUPERADMIN','SUPER_ADMIN','ADMIN_PRINCIPAL','ADMINISTRADOR_PRINCIPAL'].includes(role);
        }
        function nombresSucursalesUsuario(u){
            const select=document.getElementById('usr-sucursales');
            return (u?.usuarios_sucursales||[]).map(x=>{
                const option=[...(select?.options||[])].find(op=>op.value===String(x.sucursal_id));
                return option?.textContent||('ID '+x.sucursal_id);
            });
        }
        function recursosEfectivosUsuario(u){
            if(usuarioTieneAlcanceGlobal(u))return listaPermisos.filter(p=>p!=='traslados_aprobar');
            return [...new Set((Array.isArray(u?.permisos)?u.permisos:[]).map(String))];
        }
        async function prepararSelectoresUsuarios(){
            const suc=await obtenerSucursalesConfig();
            const supervisores=[...new Set(suc.map(x=>texto(x.supervisor)).filter(Boolean))].sort();
            document.getElementById('usr-supervisores').innerHTML=supervisores.map(x=>`<option value="${escaparHTML(x)}">${escaparHTML(x)}</option>`).join('');
            document.getElementById('usr-sucursales').innerHTML=suc.map(x=>`<option value="${x.id}">${escaparHTML(x.nombre)}</option>`).join('');
            if(window.actualizarContadoresSelectores2026)window.actualizarContadoresSelectores2026();
        }
        async function tokenSesionActual(){const {data:{session}}=await _supabase.auth.getSession();return session?.access_token||'';}
        async function llamarApiAdmin(ruta,payload){const token=await tokenSesionActual();const res=await fetch(ruta,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});const raw=await res.text();let json;try{json=JSON.parse(raw)}catch{throw new Error(raw||`Error ${res.status}`)}if(!res.ok)throw new Error(json.error||`Error ${res.status}`);return json;}

        document.getElementById('usr-rol')?.addEventListener('change',event=>{const node=document.getElementById('usr-rol-description');if(node)node.textContent=descripcionRolUsuario(event.target.value);});
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
            const tbody=document.getElementById('tabla-usuarios-body');
            if(tbody)tbody.innerHTML='<tr><td colspan="6" class="p-8 text-center text-slate-500">Cargando matriz de permisos…</td></tr>';
            try{
                construirChecksPermisos();
                await prepararSelectoresUsuarios();
                const {data,error}=await _supabase.from('usuarios_roles').select('*,usuarios_supervisores(supervisor),usuarios_sucursales(sucursal_id)').order('email');
                if(error)throw error;
                usuariosSistemaGlobal=data||[];
                actualizarResumenMatrizUsuarios();
                renderizarMatrizUsuarios();
                const banner=document.getElementById('usr-admin-status');
                const owner=!!(window.esAdminPrincipalActual&&window.esAdminPrincipalActual());
                if(banner)banner.classList.toggle('hidden',!owner);
                const roleDescription=document.getElementById('usr-rol-description');
                if(roleDescription)roleDescription.textContent=descripcionRolUsuario(document.getElementById('usr-rol')?.value||'CONSULTA');
                if(window.lucide)lucide.createIcons();
            }catch(error){
                if(tbody)tbody.innerHTML='<tr><td colspan="6" class="p-8 text-center text-red-700">No se pudo cargar la matriz: '+escaparHTML(error.message||error)+'</td></tr>';
                mostrarToast('No se pudieron cargar los perfiles de usuario: '+(error.message||error),'error',10000);
            }
        }
        function descripcionRolUsuario(rol){
            const key=rolNormalizadoUsuario(rol);
            return ({
                ADMIN:'Administrador: acceso a todos los módulos y funciones administrativas según las políticas del sistema.',
                RRHH:'Gestión de RR. HH.: acceso a los módulos seleccionados y a las capacidades operativas autorizadas.',
                CARGA:'Carga de datos: acceso a los módulos marcados para importar, actualizar o preparar información.',
                CONSULTA:'Visualizador: perfil pensado para consultar información en los módulos asignados; las operaciones sensibles siguen sujetas a permisos y políticas de datos.'
            })[key]||'El perfil tendrá acceso a los módulos seleccionados y al alcance asignado.';
        }
        function actualizarResumenMatrizUsuarios(){
            const users=usuariosSistemaGlobal||[];
            const active=users.filter(u=>u.activo===true).length;
            const viewers=users.filter(u=>rolNormalizadoUsuario(u.rol)==='CONSULTA').length;
            const global=users.filter(usuarioTieneAlcanceGlobal).length;
            const box=document.getElementById('usr-role-summary');
            if(box){
                const values=[['Perfiles registrados',users.length,'users'],['Activos',active,'user-check'],['Visualizadores',viewers,'eye'],['Acceso global',global,'shield-check']];
                box.innerHTML=values.map(([label,value,icon])=>'<div class="usr-role-summary-card"><span class="usr-role-summary-icon"><i data-lucide="'+icon+'"></i></span><small>'+label+'</small><strong>'+Number(value).toLocaleString('es-CL')+'</strong></div>').join('');
            }
            const banner=document.getElementById('usr-admin-status');
            if(banner&&window.esAdminPrincipalActual)banner.classList.toggle('hidden',!window.esAdminPrincipalActual());
            if(window.lucide)lucide.createIcons();
        }
        function renderizarMatrizUsuarios(){
            const tbody=document.getElementById('tabla-usuarios-body');
            if(!tbody)return;
            const query=String(document.getElementById('usr-matrix-search')?.value||'').trim().toLocaleLowerCase('es-CL');
            const roleFilter=String(document.getElementById('usr-matrix-role')?.value||'').toUpperCase();
            const statusFilter=String(document.getElementById('usr-matrix-status')?.value||'').toUpperCase();
            const users=(usuariosSistemaGlobal||[]).map((u,index)=>({u,index})).filter(({u})=>{
                const role=rolNormalizadoUsuario(u.rol);
                const global=usuarioTieneAlcanceGlobal(u);
                const matchRole=!roleFilter||(roleFilter==='GLOBAL'?global:role===roleFilter);
                const matchStatus=!statusFilter||(statusFilter==='ACTIVO'?u.activo===true:u.activo!==true);
                const modules=recursosEfectivosUsuario(u).map(p=>etiquetasPermisosUsuarios[p]||p).join(' ');
                const scopes=[...(u.usuarios_supervisores||[]).map(x=>x.supervisor||''),...nombresSucursalesUsuario(u)];
                const capabilities=[u.puede_asignar_tareas?'Asignar tareas':'',u.puede_revisar_tareas?'Revisar tareas':'',u.puede_preparar_correos?'Preparar correos':'',((u.permisos||[]).includes('traslados_aprobar')?'Aprobar traslados':'')].filter(Boolean).join(' ');
                const all=[u.email,u.nombre,u.rol,modules,scopes.join(' '),capabilities,global?'global':''].join(' ').toLocaleLowerCase('es-CL');
                return matchRole&&matchStatus&&(!query||all.includes(query));
            });
            const count=document.getElementById('usr-matrix-count');
            if(count)count.textContent=users.length+' perfil'+(users.length===1?'':'es');
            if(!users.length){
                tbody.innerHTML='<tr><td colspan="6" class="usr-row-empty">No hay perfiles que coincidan con los filtros. Prueba otra búsqueda o limpia los filtros.</td></tr>';
                return;
            }
            tbody.innerHTML=users.map(({u,index})=>{
                const global=usuarioTieneAlcanceGlobal(u);
                const role=rolNormalizadoUsuario(u.rol);
                const isPrimaryOwner=String(u.email||'').trim().toLowerCase()===EMAIL_ADMIN_PRINCIPAL;
                const roleClass=isPrimaryOwner?'role-admin is-owner':role==='CONSULTA'?'role-view':global?'role-admin':'';
                const roleLabel=isPrimaryOwner?'Administrador principal · propietario':etiquetaRolUsuario(u.rol);
                const assignedModules=recursosEfectivosUsuario(u);
                const modules=assignedModules.map(p=>'<span class="usr-resource-chip is-granted">'+escaparHTML(etiquetasPermisosUsuarios[p]||p)+'</span>').join('');
                const supervisors=(u.usuarios_supervisores||[]).map(x=>String(x.supervisor||'').trim()).filter(Boolean);
                const branches=nombresSucursalesUsuario(u);
                const scopeHtml='<div class="usr-scope-list">'+
                    '<span class="usr-scope-line"><i data-lucide="layers"></i><span>'+(global?'Acceso global a módulos':assignedModules.length+' módulo(s) asignado(s)')+'</span></span>'+
                    '<span class="usr-scope-line"><i data-lucide="map-pin"></i><span>'+(branches.length?branches.map(escaparHTML).join(', '):'Sin sucursales asignadas explícitamente')+'</span></span>'+
                    '<span class="usr-scope-line"><i data-lucide="users"></i><span>'+(supervisors.length?supervisors.map(escaparHTML).join(', '):'Sin supervisores asignados explícitamente')+'</span></span></div>';
                const caps=[];
                if(u.puede_asignar_tareas)caps.push('Asignar tareas');
                if(u.puede_revisar_tareas)caps.push('Revisar tareas');
                if(u.puede_preparar_correos)caps.push('Preparar correos');
                if((u.permisos||[]).includes('traslados_aprobar'))caps.push('Aprobar traslados');
                const chipCaps=caps.length?caps.map(x=>'<span class="usr-resource-chip is-capability">'+escaparHTML(x)+'</span>').join(''):'<span class="text-[9px] text-slate-400">Sin privilegios operativos adicionales</span>';
                const fullResources='<details class="usr-resources-details"><summary><i data-lucide="list-checks"></i> Ver recursos ('+assignedModules.length+')</summary><div><div class="usr-resource-summary">'+(modules||'<span class="text-xs text-slate-500">No hay módulos asignados explícitamente.</span>')+'</div><p class="mb-2 mt-3 text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Capacidades operativas</p><div class="usr-resource-summary">'+chipCaps+'</div></div></details>';
                const status=u.activo===true?'<span class="usr-state-pill is-active">Activo</span>':'<span class="usr-state-pill is-inactive">Inactivo</span>';
                return '<tr>'+
                    '<td class="p-3"><div class="usr-user-name">'+escaparHTML(u.nombre||'Nombre no informado')+'</div><div class="usr-user-email">'+escaparHTML(u.email||'')+'</div></td>'+
                    '<td class="p-3"><span class="usr-role-pill '+roleClass+'">'+(isPrimaryOwner?'<i data-lucide="crown"></i>':'')+escaparHTML(roleLabel)+'</span>'+(global?'<div><span class="usr-role-pill role-global">'+(isPrimaryOwner?'CONTROL PRINCIPAL':'Acceso global')+'</span></div>':'')+'</td>'+
                    '<td class="p-3">'+scopeHtml+'</td>'+
                    '<td class="p-3"><div class="usr-resource-summary">'+modules+'</div>'+fullResources+'</td>'+
                    '<td class="p-3">'+status+'</td>'+
                    '<td class="p-3"><div class="usr-row-actions"><button type="button" data-user-action="edit" data-index="'+index+'">Editar perfil</button><button type="button" data-user-action="toggle" data-index="'+index+'">'+(u.activo===true?'Desactivar':'Activar')+'</button><button type="button" class="is-danger" data-user-action="delete" data-index="'+index+'">Eliminar acceso</button></div></td>'+
                    '</tr>';
            }).join('');
            tbody.querySelectorAll('[data-user-action]').forEach(button=>{
                button.addEventListener('click',()=>{
                    const index=Number(button.dataset.index),u=usuariosSistemaGlobal[index];
                    if(!u)return;
                    if(button.dataset.userAction==='edit')editarUsuarioRol(index);
                    else if(button.dataset.userAction==='toggle')toggleUsuario(u.email,u.activo!==true);
                    else if(button.dataset.userAction==='delete')eliminarUsuarioCreado(u.email,u.nombre||u.email);
                });
            });
            if(window.lucide)lucide.createIcons();
        }
        window.renderizarMatrizUsuarios=renderizarMatrizUsuarios;
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
            const roleDescription = document.getElementById('usr-rol-description');
            if (roleDescription) roleDescription.textContent = descripcionRolUsuario(u.rol || 'CONSULTA');

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
            const listaResponsables=document.getElementById('tarea-responsables-list');
            if(listaResponsables){listaResponsables.innerHTML=responsables.map(u=>{const nombre=escaparHTML(u.nombre||u.email||'Usuario'),email=escaparHTML(u.email||''),id=escaparHTML(String(u.id));return '<label class="task-assignee-option" data-assignee-search="'+escaparHTML(((u.nombre||'')+' '+(u.email||'')).toLowerCase())+'"><input type="checkbox" name="tarea-responsable-multiple" value="'+id+'" onchange="actualizarConteoResponsablesTarea()"><span class="task-assignee-person"><b>'+nombre+'</b><small>'+email+'</small></span></label>';}).join('')||'<p class="task-assignee-empty">No hay personas disponibles para asignar.</p>';actualizarConteoResponsablesTarea();}
            document.getElementById('tarea-revisor').innerHTML='<option value="">Sin revisor</option>'+revisores.map(opt).join('');
            document.getElementById('tarea-sucursal').innerHTML='<option value="">Todas / No aplica</option>'+(sucursales||[]).map(x=>`<option value="${x.id}">${escaparHTML(x.nombre)}</option>`).join('');
            const kpiBranch=document.getElementById('tarea-kpi-sucursal');
            if(kpiBranch){const current=kpiBranch.value;kpiBranch.innerHTML='<option value="">Todas las sucursales</option>'+(sucursales||[]).map(x=>`<option value="${x.id}">${escaparHTML(x.nombre)}</option>`).join('');kpiBranch.value=current;}
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
        function obtenerResponsablesSeleccionadosTarea(){return Array.from(document.querySelectorAll('input[name="tarea-responsable-multiple"]:checked')).map(x=>x.value);}
        function actualizarConteoResponsablesTarea(){const seleccionados=obtenerResponsablesSeleccionadosTarea();const el=document.getElementById('tarea-responsables-count');if(el)el.textContent=seleccionados.length+' '+(seleccionados.length===1?'persona seleccionada':'personas seleccionadas');}
        function filtrarResponsablesTarea(){const q=texto(document.getElementById('tarea-responsable-buscar')?.value||'').toLowerCase();document.querySelectorAll('#tarea-responsables-list .task-assignee-option').forEach(el=>{el.style.display=el.dataset.assigneeSearch.includes(q)?'flex':'none';});}
        function seleccionarTodosResponsablesTarea(seleccionar){document.querySelectorAll('#tarea-responsables-list .task-assignee-option').forEach(el=>{if(el.style.display==='none')return;const cb=el.querySelector('input');if(cb)cb.checked=seleccionar;});actualizarConteoResponsablesTarea();}
        async function guardarTarea(event){
            event.preventDefault();
            if(!tienePermisoModulo('tareas')||!puedeAsignarTareasActual())return mostrarToast('Tu perfil no tiene autorización para crear y asignar tareas.','warning',9000);
            const boton=event.submitter||document.querySelector('#form-tarea button[type="submit"]');
            const responsables=obtenerResponsablesSeleccionadosTarea();
            const titulo=document.getElementById('tarea-titulo').value.trim();
            const vencimiento=document.getElementById('tarea-vencimiento').value;
            if(!titulo)return mostrarToast('Escribe el título de la tarea.','warning');
            if(!responsables.length)return mostrarToast('Selecciona al menos una persona responsable en la lista.','warning',8000);
            if(!vencimiento||Number.isNaN(new Date(vencimiento).getTime()))return mostrarToast('Indica una fecha límite válida.','warning');
            if(boton){boton.disabled=true;boton.dataset.originalText=boton.textContent;boton.textContent='Guardando asignaciones…';}
            try{
              const {data:{session}}=await _supabase.auth.getSession();
              const base={titulo,descripcion:document.getElementById('tarea-descripcion').value.trim(),revisor_rol_id:document.getElementById('tarea-revisor').value?Number(document.getElementById('tarea-revisor').value):null,prioridad:document.getElementById('tarea-prioridad').value,fecha_limite:new Date(vencimiento).toISOString(),recurrencia:document.getElementById('tarea-recurrencia').value,sucursal_id:document.getElementById('tarea-sucursal').value||null,estado:'PENDIENTE',creado_por_email:session?.user?.email||''};
              const registros=responsables.map(id=>({...base,responsable_rol_id:Number(id)}));
              const {data,error}=await _supabase.from('tareas').insert(registros).select('id');
              if(error)throw error;
              if(!data||data.length!==registros.length)throw new Error('No se confirmaron todas las asignaciones. Actualiza la lista y vuelve a intentarlo.');
              const eventos=data.map(t=>({tarea_id:t.id,accion:'CREADA',estado_nuevo:'PENDIENTE',usuario_email:session?.user?.email||'',detalle:'Tarea creada desde la aplicación; asignación individual dentro de una asignación múltiple'}));
              const {error:eventError}=await _supabase.from('tareas_eventos').insert(eventos);
              if(eventError)console.error('No se pudieron registrar todos los eventos de creación:',eventError);
              event.target.reset();
              document.querySelectorAll('input[name="tarea-responsable-multiple"]').forEach(x=>x.checked=false);
              const buscador=document.getElementById('tarea-responsable-buscar');if(buscador)buscador.value='';
              filtrarResponsablesTarea();actualizarConteoResponsablesTarea();
              document.getElementById('tarea-vencimiento').value='';
              await prepararModuloTareas();
              mostrarToast('Se crearon y asignaron '+data.length+' tarea(s) correctamente.','success',9000);
            }catch(error){
              console.error('Error al crear/asignar tareas:',error);
              mostrarToast('No se pudieron crear/asignar las tareas: '+(error?.message||'Error inesperado'), 'error',15000);
            }finally{
              if(boton){boton.disabled=false;boton.textContent=boton.dataset.originalText||'Crear y asignar tarea';}
            }
        }
        function estadoTareaCalculado(t){if(!['APROBADA','CANCELADA','DEVUELTA'].includes(t.estado)&&new Date(t.fecha_limite)<new Date())return'VENCIDA';return t.estado;}
        async function cargarTareas(){const {data,error}=await _supabase.from('tareas').select('*,responsable:usuarios_roles!tareas_responsable_rol_id_fkey(nombre,email),revisor:usuarios_roles!tareas_revisor_rol_id_fkey(nombre,email),sucursal:sucursales(nombre)').order('fecha_limite',{ascending:true});if(error)return mostrarToast(error.message,'error');tareasGlobal=(data||[]).map(x=>({...x,estado_calculado:estadoTareaCalculado(x)}));renderizarTareas();}
        function exportarKpiTareasCSV(){
            const desde=document.getElementById('tarea-kpi-desde')?.value||'',hasta=document.getElementById('tarea-kpi-hasta')?.value||'',sucursal=document.getElementById('tarea-kpi-sucursal')?.value||'';
            const isoChile=x=>x?new Date(x).toLocaleDateString('sv-SE',{timeZone:'America/Santiago'}):'';
            const rows=tareasGlobal.filter(t=>{const d=isoChile(t.created_at||t.fecha_limite);return(!desde||d>=desde)&&(!hasta||d<=hasta)&&(!sucursal||String(t.sucursal_id||'')===sucursal);});
            const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
            const lines=[['ID','Tarea','Responsable','Estado','Prioridad','Vencimiento','Creada','Actualizada','Sucursal'].map(csvCell).join(',')];
            rows.forEach(t=>lines.push([t.id,t.titulo,t.responsable?.nombre||t.responsable?.email,t.estado_calculado,t.prioridad,t.fecha_limite,t.created_at,t.updated_at,t.sucursal?.nombre||''].map(csvCell).join(',')));
            const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='KPI_Tareas_RRHH_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
        }

        let vistaTareasActiva='RUTINA';
function cambiarVistaTareas(vista){
 vistaTareasActiva=vista||'RUTINA';
 document.querySelectorAll('.task-workspace-tab').forEach(b=>b.classList.toggle('active',b.dataset.taskView===vistaTareasActiva));
 const form=document.getElementById('form-tarea');
 if(form&&vistaTareasActiva!=='CREAR')form.classList.add('hidden');
 const title=document.getElementById('td-list-title');
 if(title)title.textContent=({'RUTINA':'Tareas de hoy','MIS_TAREAS':'Mis tareas','EQUIPO':'Tareas del equipo','RECURRENTES':'Tareas recurrentes','OCASIONAL':'Tareas ocasionales','CALENDARIO':'Calendario de tareas','INDICADORES':'Indicadores de rendimiento','HISTORIAL':'Historial de tareas'})[vistaTareasActiva]||'Tareas de hoy';
 document.querySelectorAll('.task-workspace-tab').forEach(b=>b.classList.toggle('active',b.dataset.taskView===vistaTareasActiva));
 renderizarTareas();
}
function abrirFormularioTarea(frecuencia){
 const form=document.getElementById('form-tarea');
 if(!form)return;
 if(!tienePermisoModulo('tareas')||!puedeAsignarTareasActual()){
   mostrarToast('Tu perfil no tiene permiso para crear y asignar tareas. Solicita al administrador que habilite la asignación.','warning',9000);
   return;
 }
 // Mantener el formulario junto al encabezado para que no quede fuera de la vista
 // después de abrir "Nueva tarea", especialmente en paneles con scroll propio.
 const header=document.querySelector('#view-tareas .td-heading');
 if(header&&form.previousElementSibling!==header)header.insertAdjacentElement('afterend',form);
 form.classList.remove('hidden');
 form.style.display='block';
 const select=document.getElementById('tarea-recurrencia');
 if(select&&frecuencia)select.value=frecuencia;
 const title=document.getElementById('tarea-titulo');
 if(title)title.focus({preventScroll:true});
 requestAnimationFrame(()=>form.scrollIntoView({behavior:'auto',block:'start'}));
 mostrarToast(frecuencia&&frecuencia!=='NINGUNA'?'Selecciona la frecuencia, completa los datos y asigna responsables.':'Completa los datos y selecciona responsables para la tarea.','info',7000);
}
function renderizarTareas(){
            const estado=document.getElementById('tarea-filtro-estado')?.value||'TODOS',responsableFiltro=document.getElementById('tarea-filtro-responsable')?.value||'TODOS',q=texto(document.getElementById('tarea-filtro-buscar')?.value).toLowerCase();
            const esRutina=x=>String(x.recurrencia||'NINGUNA').toUpperCase()!=='NINGUNA';document.getElementById('task-tab-routine-count')&&(document.getElementById('task-tab-routine-count').textContent=tareasGlobal.filter(esRutina).length);document.getElementById('task-tab-occasional-count')&&(document.getElementById('task-tab-occasional-count').textContent=tareasGlobal.filter(x=>!esRutina(x)).length);let f=tareasGlobal;
            const fechaChile=x=>x?new Date(x).toLocaleDateString('sv-SE',{timeZone:'America/Santiago'}):'';
            const hoyChile=fechaChile(new Date().toISOString());
            if(vistaTareasActiva==='RUTINA')f=f.filter(x=>fechaChile(x.fecha_limite)===hoyChile);
            else if(vistaTareasActiva==='RECURRENTES')f=f.filter(esRutina);
            else if(vistaTareasActiva==='OCASIONAL')f=f.filter(x=>!esRutina(x));
            else if(vistaTareasActiva==='MIS_TAREAS')f=f.filter(x=>String(x.responsable_rol_id)===String(perfilActualSistema?.id));
            else if(vistaTareasActiva==='HISTORIAL')f=f.filter(x=>['APROBADA','DEVUELTA','CANCELADA'].includes(x.estado_calculado));
            if(estado!=='TODOS')f=f.filter(x=>x.estado_calculado===estado);if(responsableFiltro!=='TODOS')f=f.filter(x=>String(x.responsable_rol_id)===responsableFiltro);if(q)f=f.filter(x=>`${x.titulo} ${x.descripcion} ${x.responsable?.nombre} ${x.responsable?.email} ${x.sucursal?.nombre}`.toLowerCase().includes(q));
            const cuenta=e=>tareasGlobal.filter(x=>x.estado_calculado===e).length;
            document.getElementById('tk-pendiente').innerText=cuenta('PENDIENTE');document.getElementById('tk-proceso').innerText=cuenta('EN_PROCESO');document.getElementById('tk-validar').innerText=cuenta('COMPLETADA_POR_VALIDAR');document.getElementById('tk-aprobada').innerText=cuenta('APROBADA');document.getElementById('tk-devuelta').innerText=cuenta('DEVUELTA');document.getElementById('tk-vencida').innerText=cuenta('VENCIDA');
            const medibles=tareasGlobal.filter(x=>x.estado_calculado!=='CANCELADA');
            const terminadas=medibles.filter(x=>x.estado_calculado==='APROBADA');
            document.getElementById('tk-cumplimiento').innerText=(medibles.length?Math.round(100*terminadas.length/medibles.length):0)+'%';
            document.getElementById('tk-tiempo').innerText=(terminadas.length?Math.round(100*terminadas.filter(x=>new Date(x.updated_at||x.created_at)<=new Date(x.fecha_limite)).length/terminadas.length):0)+'%';
            const kpiDesde=document.getElementById('tarea-kpi-desde')?.value||'',kpiHasta=document.getElementById('tarea-kpi-hasta')?.value||'',kpiSucursal=document.getElementById('tarea-kpi-sucursal')?.value||'';
            const isoChile=x=>x?new Date(x).toLocaleDateString('sv-SE',{timeZone:'America/Santiago'}):'';
            const kpiTareas=tareasGlobal.filter(t=>{const fecha=isoChile(t.created_at||t.fecha_limite);return (!kpiDesde||fecha>=kpiDesde)&&(!kpiHasta||fecha<=kpiHasta)&&(!kpiSucursal||String(t.sucursal_id||'')===kpiSucursal);});
            const kpiCerradas=kpiTareas.filter(t=>t.estado_calculado==='APROBADA'),kpiVencidas=kpiTareas.filter(t=>t.estado_calculado==='VENCIDA');
            const kpiPuntuales=kpiCerradas.filter(t=>new Date(t.updated_at||t.created_at)<=new Date(t.fecha_limite));
            const kpiCierre=kpiTareas.filter(t=>t.estado_calculado!=='CANCELADA');
            const kpiMetrics=[['Tareas medibles',kpiCierre.length,'text-white'],['Aprobadas',kpiCerradas.length,'text-emerald-200'],['Vencidas',kpiVencidas.length,'text-rose-200'],['Cumplimiento', (kpiCierre.length?Math.round(kpiCerradas.length*100/kpiCierre.length):0)+'%','text-cyan-100'],['Cierre a tiempo',(kpiCerradas.length?Math.round(kpiPuntuales.length*100/kpiCerradas.length):0)+'%','text-violet-100']];
            const kpiHost=document.getElementById('tarea-kpi-resumen');
            if(kpiHost)kpiHost.innerHTML=kpiMetrics.map(([label,value,color])=>`<div><span class="block text-xs text-cyan-100">${label}</span><b class="mt-1 block text-2xl ${color}">${value}</b></div>`).join('');
            const filtroKpi=document.getElementById('tarea-kpi-filtro-usuario')?.value||'TODOS';
            const porUsuario=new Map();
            tareasGlobal.filter(t=>filtroKpi==='TODOS'||String(t.responsable_rol_id)===filtroKpi).forEach(t=>{const id=String(t.responsable_rol_id||'sin-asignar'),nombre=t.responsable?.nombre||t.responsable?.email||'Sin responsable';if(!porUsuario.has(id))porUsuario.set(id,{id,nombre,total:0,aprobadas:0,pendientes:0,vencidas:0,validar:0});const k=porUsuario.get(id);k.total++;if(t.estado_calculado==='APROBADA')k.aprobadas++;if(['PENDIENTE','EN_PROCESO'].includes(t.estado_calculado))k.pendientes++;if(t.estado_calculado==='VENCIDA')k.vencidas++;if(t.estado_calculado==='COMPLETADA_POR_VALIDAR')k.validar++;});
            const kpi=document.getElementById('tabla-kpi-usuarios');
            kpi.innerHTML=porUsuario.size?[...porUsuario.values()].sort((a,b)=>b.total-a.total).map(u=>{const medibles=tareasGlobal.filter(t=>String(t.responsable_rol_id||'sin-asignar')===u.id&&t.estado_calculado!=='CANCELADA').length;const pct=medibles?Math.round(100*u.aprobadas/medibles):0;return `<div class="kpi-persona-row rounded-xl border border-slate-100 p-3"><div><b class="block text-sm text-slate-800">${escaparHTML(u.nombre)}</b><span class="text-xs text-slate-500">${u.total} tarea(s) asignadas</span><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${pct>=80?'bg-emerald-500':pct>=50?'bg-amber-500':'bg-rose-500'}" style="width:${pct}%"></div></div></div><div><span class="block text-[11px] text-slate-500">Aprobadas</span><b class="text-lg text-emerald-700">${u.aprobadas}</b></div><div><span class="block text-[11px] text-slate-500">Pendientes</span><b class="text-lg">${u.pendientes}</b></div><div><span class="block text-[11px] text-slate-500">Vencidas</span><b class="text-lg ${u.vencidas?'text-rose-700':''}">${u.vencidas}</b></div><div><span class="block text-[11px] text-slate-500">Cumplimiento</span><b class="text-lg">${pct}%</b><span class="block text-[10px] text-slate-400">${u.validar} por validar</span></div></div>`}).join(''):'<p class="p-4 text-sm text-slate-500">Todavía no hay tareas asignadas. Crea una tarea para empezar a medir.</p>';
            document.getElementById('tabla-tareas').innerHTML=f.length?f.map(t=>`<tr><td><b>${escaparHTML(t.titulo)}</b><br><span class="text-xs text-slate-500">${escaparHTML(t.descripcion)}</span></td><td>${escaparHTML(t.responsable?.nombre||t.responsable?.email||'Sin asignar')}</td><td>${escaparHTML(t.revisor?.nombre||t.revisor?.email||'—')}</td><td><span class="rounded-full px-2 py-1 text-xs font-bold ${t.prioridad==='URGENTE'?'bg-rose-100 text-rose-800':t.prioridad==='ALTA'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}">${escaparHTML(t.prioridad)}</span></td><td>${new Date(t.fecha_limite).toLocaleString('es-CL')}</td><td><span class="rounded-full px-2 py-1 text-xs font-bold ${['APROBADA','COMPLETADA_POR_VALIDAR'].includes(t.estado_calculado)?'bg-emerald-100 text-emerald-800':t.estado_calculado==='VENCIDA'?'bg-rose-100 text-rose-800':t.estado_calculado==='PENDIENTE'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}">${({'PENDIENTE':'No realizada · pendiente','EN_PROCESO':'En proceso','COMPLETADA_POR_VALIDAR':'Realizada · por validar','APROBADA':'Realizada · aprobada','DEVUELTA':'Devuelta · corregir','VENCIDA':'No realizada · vencida','CANCELADA':'Cancelada'})[t.estado_calculado]||t.estado_calculado}</span></td><td><select aria-label="Cambiar estado de tarea" class="form-field min-w-40" onchange="cambiarEstadoTarea(${t.id},this.value)"><option value="">Actualizar estado…</option>${(esAdminPrincipalActual()||(puedeRevisarTareasActual()&&String(t.revisor_rol_id)===String(perfilActualSistema?.id))?['EN_PROCESO','COMPLETADA_POR_VALIDAR','APROBADA','DEVUELTA','CANCELADA']:(String(t.responsable_rol_id)===String(perfilActualSistema?.id)?['EN_PROCESO','COMPLETADA_POR_VALIDAR']:[])).map(e=>`<option value="${e}">${({'EN_PROCESO':'Marcar en proceso','COMPLETADA_POR_VALIDAR':'Informar realizada · por validar','APROBADA':'Aprobar realización','DEVUELTA':'Devolver para corregir','CANCELADA':'Cancelar tarea'})[e]||e}</option>`).join('')}</select></td></tr>`).join(''):'<tr><td colspan="7" class="p-8 text-center text-sm text-slate-500">No hay tareas para estos filtros.</td></tr>';
            renderizarPanelTareasPremium();
        }

        let tdCalendarDate = new Date();
        function tdCalendarMove(delta){tdCalendarDate=new Date(tdCalendarDate.getFullYear(),tdCalendarDate.getMonth()+delta,1);renderizarPanelTareasPremium();}
        function renderizarPanelTareasPremium(){
          const host=document.getElementById('td-calendar-grid');if(!host)return;
          const tasks=Array.isArray(tareasGlobal)?tareasGlobal:[],now=new Date();
          const fmtDate=d=>new Date(d).toLocaleDateString('sv-SE',{timeZone:'America/Santiago'});
          const today=fmtDate(now),monthStart=new Date(tdCalendarDate.getFullYear(),tdCalendarDate.getMonth(),1),monthEnd=new Date(tdCalendarDate.getFullYear(),tdCalendarDate.getMonth()+1,0);
          const due=t=>fmtDate(t.fecha_limite),isDone=t=>['APROBADA','COMPLETADA_POR_VALIDAR'].includes(t.estado_calculado),isOpen=t=>!['APROBADA','CANCELADA'].includes(t.estado_calculado);
          const todayTasks=tasks.filter(t=>due(t)===today),doneToday=todayTasks.filter(isDone).length,inProgress=todayTasks.filter(t=>t.estado_calculado==='EN_PROCESO').length,overdue=tasks.filter(t=>t.estado_calculado==='VENCIDA').length,recurring=tasks.filter(t=>String(t.recurrencia||'NINGUNA').toUpperCase()!=='NINGUNA').length;
          const monthOccasional=tasks.filter(t=>String(t.recurrencia||'NINGUNA').toUpperCase()==='NINGUNA'&&due(t).slice(0,7)===today.slice(0,7)).length;
          const put=(id,value)=>{const e=document.getElementById(id);if(e)e.textContent=String(value)};
          put('td-today-label',now.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/Santiago'}));
          put('td-total-hoy',todayTasks.length);put('td-completadas',doneToday);put('td-en-proceso',inProgress);put('td-vencidas',overdue);put('td-recurrentes',recurring);put('td-ocasionales',monthOccasional);
          const pct=todayTasks.length?Math.round(doneToday*100/todayTasks.length):0;put('td-completadas-note',pct+'% de cumplimiento');
          const bar=document.getElementById('td-completadas-bar');if(bar)bar.style.width=pct+'%';const overdueBar=document.getElementById('td-vencidas-bar');if(overdueBar)overdueBar.style.width=(tasks.length?Math.min(100,Math.round(overdue*100/tasks.length)):0)+'%';
          put('td-ocasionales-note','En el mes actual');
          const mon=monthStart.toLocaleDateString('es-CL',{month:'long',year:'numeric',timeZone:'America/Santiago'});put('td-calendar-month',mon.charAt(0).toUpperCase()+mon.slice(1));
          const offset=(monthStart.getDay()+6)%7,week=['L','M','M','J','V','S','D'];let cells=week.map(x=>'<span class="weekday">'+x+'</span>');
          for(let i=0;i<offset;i++)cells.push('<span class="empty"></span>');
          for(let day=1;day<=monthEnd.getDate();day++){const date=new Date(tdCalendarDate.getFullYear(),tdCalendarDate.getMonth(),day),iso=fmtDate(date),dayTasks=tasks.filter(t=>due(t)===iso),cls=[];
            if(dayTasks.length)cls.push('has-task');if(iso===today)cls.push('today');if(dayTasks.some(t=>t.estado_calculado==='VENCIDA'))cls.push('status-overdue');else if(dayTasks.some(isDone))cls.push('status-done');
            cells.push('<span class="'+cls.join(' ')+'" title="'+dayTasks.length+' tarea(s)">'+day+'</span>');}
          host.innerHTML=cells.join('');
          const upcoming=tasks.filter(t=>isOpen(t)&&due(t)>=today).sort((a,b)=>new Date(a.fecha_limite)-new Date(b.fecha_limite)).slice(0,3),upcomingHost=document.getElementById('td-upcoming-list');
          if(upcomingHost)upcomingHost.innerHTML=upcoming.length?upcoming.map(t=>{const d=new Date(t.fecha_limite),label=d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}),status=due(t)===today?'Hoy':t.estado_calculado==='VENCIDA'?'Vencida':label;return '<div class="td-upcoming-item"><span class="td-upcoming-icon"><i data-lucide="calendar-clock"></i></span><div><b>'+escaparHTML(t.titulo||'Tarea sin título')+'</b><small>'+escaparHTML(label)+'</small></div><span class="td-upcoming-pill">'+status+'</span></div>'}).join(''):'<p class="td-empty">No hay tareas próximas pendientes.</p>';
          const showing=document.getElementById('td-showing-tasks');if(showing)showing.textContent=document.querySelectorAll('#tabla-tareas tr').length+' tarea(s) mostradas de '+tasks.length;
          const perf=document.getElementById('td-user-performance');if(perf){const map=new Map();tasks.forEach(t=>{const name=t.responsable?.nombre||t.responsable?.email||'Sin responsable';if(!map.has(name))map.set(name,{total:0,done:0});const v=map.get(name);v.total++;if(t.estado_calculado==='APROBADA')v.done++;});const people=[...map.entries()].sort((a,b)=>b[1].total-a[1].total).slice(0,5);perf.innerHTML=people.length?people.map(([name,v])=>{const p=v.total?Math.round(v.done*100/v.total):0;return '<div class="td-user-row"><b>'+escaparHTML(name)+'</b><span class="td-user-bar"><i style="width:'+p+'%"></i></span><em>'+p+'%</em></div>'}).join(''):'<p class="td-empty">Aún no hay tareas asignadas.</p>';}
          const metrics=tasks.filter(t=>t.estado_calculado!=='CANCELADA'),approved=metrics.filter(t=>t.estado_calculado==='APROBADA').length;
          put('td-kpi-cumplimiento',metrics.length?Math.round(approved*100/metrics.length)+'%':'0%');put('td-kpi-completadas',approved);put('td-kpi-vencidas',overdue);put('td-kpi-validar',tasks.filter(t=>t.estado_calculado==='COMPLETADA_POR_VALIDAR').length);
          const chart=document.getElementById('td-week-chart');if(chart){const labels=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],start=new Date(now);start.setDate(start.getDate()-((start.getDay()+6)%7));const values=labels.map((label,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const day=tasks.filter(t=>due(t)===fmtDate(d));return{label,done:day.filter(isDone).length,over:day.filter(t=>t.estado_calculado==='VENCIDA').length}}),max=Math.max(1,...values.map(x=>x.done+x.over));chart.innerHTML=values.map(x=>'<div class="td-week-column"><div class="td-week-bars"><i style="height:'+Math.max(3,x.done/max*80)+'px" title="'+x.done+' completadas"></i><i class="overdue" style="height:'+Math.max(3,x.over/max*80)+'px" title="'+x.over+' vencidas"></i></div><small>'+x.label+'</small></div>').join('');}
          if(window.lucide&&typeof window.lucide.createIcons==='function')window.lucide.createIcons();
        }
        async function cambiarEstadoTarea(id,estado){if(!estado)return;const tarea=tareasGlobal.find(x=>String(x.id)===String(id));if(!tarea)return mostrarToast('No se encontró la tarea.','error');const idActual=String(perfilActualSistema?.id||'');const esResp=String(tarea.responsable_rol_id)===idActual;const esRev=String(tarea.revisor_rol_id)===idActual;if(!esAdminPrincipalActual()&&(['APROBADA','DEVUELTA','CANCELADA'].includes(estado)?(!puedeRevisarTareasActual()||!esRev):(!esResp&&!esRev)))return mostrarToast('No tienes permiso para cambiar este estado.','warning');const motivo=['DEVUELTA','CANCELADA'].includes(estado)?prompt('Indica el motivo del cambio:')||'Sin motivo':'';const {data:{session}}=await _supabase.auth.getSession();const {error}=await _supabase.from('tareas').update({estado,updated_at:new Date().toISOString()}).eq('id',id);if(error)return mostrarToast(error.message,'error');await _supabase.from('tareas_eventos').insert([{tarea_id:id,accion:'CAMBIO_ESTADO',estado_nuevo:estado,usuario_email:session?.user?.email||'',detalle:motivo}]);await cargarTareas();}

        async function registrarAuditoria(modulo,accion,detalle){try{const {data:{session}}=await _supabase.auth.getSession();await _supabase.from('auditoria_eventos').insert([{usuario_email:session?.user?.email||'sin sesión',modulo,accion,detalle}]);}catch(e){console.warn('Auditoría no registrada',e);}}
        async function cargarAuditoria(){const {data,error}=await _supabase.from('auditoria_eventos').select('*').order('created_at',{ascending:false}).limit(2000);if(error){mostrarToast(error.message,'error');return;}datosAuditoriaGlobal=data||[];renderizarAuditoria();}
        function renderizarAuditoria(){const buscar=document.getElementById('audit-buscar')?.value.toLowerCase().trim()||'',desde=document.getElementById('audit-desde')?.value||'',hasta=document.getElementById('audit-hasta')?.value||'';let f=datosAuditoriaGlobal.filter(a=>(!desde||a.created_at.slice(0,10)>=desde)&&(!hasta||a.created_at.slice(0,10)<=hasta));if(buscar)f=f.filter(a=>`${a.usuario_email} ${a.modulo} ${a.accion} ${a.detalle}`.toLowerCase().includes(buscar));document.getElementById('contador-auditoria').innerText=f.length;document.getElementById('tabla-auditoria-body').innerHTML=f.length?f.map(a=>`<tr><td class="p-3 font-mono">${escaparHTML(a.created_at?.replace('T',' ').slice(0,19))}</td><td class="p-3">${escaparHTML(a.usuario_email)}</td><td class="p-3">${escaparHTML(a.modulo)}</td><td class="p-3 font-bold">${escaparHTML(a.accion)}</td><td class="p-3">${escaparHTML(a.detalle)}</td></tr>`).join(''):'<tr><td colspan="5" class="p-8 text-center text-slate-400">Sin eventos.</td></tr>';}


