        // ============================================================
        // MAPA, SUCURSALES, CORREOS, COBERTURAS Y GEMINI
        // ============================================================
        async function obtenerSucursalesConfig() {
            try {
                const {data,error}=await _supabase.from('sucursales').select('*').order('nombre');
                if(error)throw error;
                const rows=data||[];
                if(rows.length)window.sucursalesConfiguracionGlobal=rows;
                return rows;
            } catch(error) {
                const cached=Array.isArray(window.sucursalesConfiguracionGlobal)?window.sucursalesConfiguracionGlobal:[];
                if(cached.length)return cached;
                throw error;
            }
        }
        function direccionSucursal(x){return [x.direccion,x.comuna,'Chile'].filter(Boolean).join(', ');}
        function calcularDiasDotacion(){
            const inicio=document.getElementById('dot-inicio')?.value,fin=document.getElementById('dot-fin')?.value,host=document.getElementById('dot-dias');
            if(!host)return;
            if(inicio&&fin&&fin>=inicio){const a=new Date(inicio+'T12:00:00Z'),b=new Date(fin+'T12:00:00Z');host.value=Math.floor((b-a)/86400000)+1;}
            else host.value='';
        }
        function actualizarHorarioDotacion(){
            const ini=document.getElementById('dot-hora-inicio'),fin=document.getElementById('dot-hora-fin');
            if(!ini||!fin)return;
            // Los horarios varían por sucursal; no se inventan horas por defecto.
            ini.value='';fin.value='';
        }
        async function cargarSucursalesDotacion(){
            const select=document.getElementById('dot-sucursal');if(!select)return;
            const {data,error}=await _supabase.from('sucursales').select('id,nombre,activa').eq('activa',true).order('nombre').limit(1000);
            if(error){select.innerHTML='<option value="">No se pudieron cargar sucursales</option>';const status=document.getElementById('dot-estado');if(status)status.textContent='No se pudo cargar el listado de sucursales: '+error.message;return;}
            select.innerHTML='<option value="">Selecciona una sucursal</option>'+(data||[]).map(x=>'<option value="'+escaparHTML(x.id)+'">'+escaparHTML(x.nombre)+'</option>').join('');
        }
        let solicitudCoberturaSeleccionada=null;
        async function cargarResponsablesCobertura(){
            const select=document.getElementById('dot-responsables');if(!select)return;
            const {data,error}=await _supabase.rpc('listar_responsables_cobertura');
            if(error){select.innerHTML='<option value="">No disponible para este perfil</option>';return;}
            select.innerHTML=(data||[]).map(u=>'<option value="'+escaparHTML(u.id)+'">'+escaparHTML((u.nombre||u.email||('Usuario '+u.id))+(u.email?' · '+u.email:''))+'</option>').join('');
        }
        async function crearSolicitudDotacion(event){
            event.preventDefault();
            const status=document.getElementById('dot-estado'),form=document.getElementById('form-alerta-dotacion');
            const sucursalId=document.getElementById('dot-sucursal')?.value,opcion=document.getElementById('dot-sucursal')?.selectedOptions?.[0];
            const inicio=document.getElementById('dot-inicio')?.value,fin=document.getElementById('dot-fin')?.value;
            const turno=document.getElementById('dot-turno')?.value,horaini=document.getElementById('dot-hora-inicio')?.value||null,horafin=document.getElementById('dot-hora-fin')?.value||null;
            const destinatarios=[...(document.getElementById('dot-responsables')?.selectedOptions||[])].map(o=>Number(o.value)).filter(Number.isFinite);
            if(!sucursalId||!inicio||!fin||fin<inicio)return mostrarToast('Selecciona una sucursal y revisa las fechas de la solicitud.','warning');
            if(!destinatarios.length)return mostrarToast('Selecciona al menos una persona responsable de la cobertura.','warning');
            if(horaini&&horafin&&horafin<=horaini)return mostrarToast('La hora de término debe ser posterior a la hora de inicio.','warning');
            try{
                if(status)status.textContent='Creando alerta, tareas diarias y notificaciones…';
                const params={p_sucursal_id:sucursalId,p_sucursal_nombre:opcion?.textContent||'',p_fecha_inicio:inicio,p_fecha_fin:fin,p_cantidad:Number(document.getElementById('dot-cantidad')?.value||1),p_cargo_requerido:document.getElementById('dot-cargo')?.value||'AF',p_turno:turno,p_hora_inicio:horaini,p_hora_fin:horafin,p_motivo:document.getElementById('dot-motivo')?.value?.trim(),p_observaciones:document.getElementById('dot-observaciones')?.value?.trim()||null,p_destinatarios:destinatarios};
                const {data,error}=await _supabase.rpc('crear_alerta_cobertura_asignada',params);if(error)throw error;
                await registrarAuditoria('coberturas','CREA_ALERTA_DOTACION',params.p_sucursal_nombre+' · '+params.p_cargo_requerido+' · '+params.p_turno+' · '+inicio+' a '+fin+' · Responsables: '+destinatarios.length);
                if(status)status.textContent='Alerta creada y asignada a '+destinatarios.length+' responsable(s). ID '+String(data).slice(0,8)+'.';
                form?.reset();document.getElementById('dot-dias').value='';actualizarHorarioDotacion();
                mostrarToast('Alerta creada. Las personas seleccionadas recibieron una notificación y una tarea en Tareas diarias.','success',9000);
                await cargarSolicitudesDotacion();
            }catch(error){console.error('Crear alerta dotación:',error);if(status)status.textContent='No se pudo enviar: '+(error.message||'Error desconocido');mostrarToast('No se pudo guardar la alerta: '+(error.message||''),'error',10000);}
        }
        async function esPerfilProductividadCobertura(){
            const {data,error}=await _supabase.auth.getUser();
            if(error)throw error;
            const email=String(data?.user?.email||'').trim().toLowerCase();
            return ['ocabanas@farmaciasdoctorsimi.cl','dcantellano@farmaciasdoctorsimi.cl','cpalacio@farmaciasdoctorsimi.cl'].includes(email);
        }
        async function idRolActualCobertura(){
            const {data,error}=await _supabase.rpc('chat_usuario_actual_id');
            if(error)throw error;
            if(data===null||data===undefined)throw new Error('No se pudo identificar el perfil de usuario.');
            return data;
        }
        async function cargarSolicitudesDotacion(){
            const host=document.getElementById('tabla-alertas-dotacion');if(!host)return;
            host.innerHTML='<tr><td colspan="6" class="p-4 text-sm text-slate-500">Cargando alertas…</td></tr>';
            const timeout=(ms)=>new Promise((_,reject)=>setTimeout(()=>reject(new Error('La consulta tardó demasiado. Pulsa “Actualizar alertas” para intentarlo otra vez.')),ms));
            try{
                let rows=[];
                if(await esPerfilProductividadCobertura()){
                    // Consulta en el servidor solo alertas propias y alertas asignadas al usuario.
                    // No descargar el historial de otros usuarios para luego ocultarlo en el navegador.
                    const userId=await idRolActualCobertura();
                    const ownResult=await Promise.race([
                        _supabase.from('solicitudes_dotacion').select('*').eq('solicitada_por',userId).order('created_at',{ascending:false}).limit(300),
                        timeout(15000)
                    ]);
                    if(ownResult.error)throw ownResult.error;
                    const assignedResult=await Promise.race([
                        _supabase.from('solicitud_dotacion_responsables').select('solicitud_id').eq('usuario_rol_id',userId),
                        timeout(10000)
                    ]);
                    if(assignedResult.error)throw assignedResult.error;
                    const assignedIds=[...new Set((assignedResult.data||[]).map(x=>x.solicitud_id).filter(Boolean))];
                    let assignedRows=[];
                    if(assignedIds.length){
                        const assignedQuery=await Promise.race([
                            _supabase.from('solicitudes_dotacion').select('*').in('id',assignedIds).order('created_at',{ascending:false}).limit(300),
                            timeout(15000)
                        ]);
                        if(assignedQuery.error)throw assignedQuery.error;
                        assignedRows=assignedQuery.data||[];
                    }
                    rows=[...new Map([...(ownResult.data||[]),...assignedRows].map(x=>[String(x.id),x])).values()]
                        .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
                }else{
                    const result=await Promise.race([
                        _supabase.from('solicitudes_dotacion').select('*').order('created_at',{ascending:false}).limit(300),
                        timeout(15000)
                    ]);
                    if(result.error)throw result.error;
                    rows=result.data||[];
                }
                const ids=[...new Set(rows.map(x=>x.solicitada_por).filter(Boolean))];
                let usuarios=[];
                if(ids.length){
                    try{
                        const u=await Promise.race([_supabase.rpc('listar_responsables_cobertura'),timeout(10000)]);
                        if(!u.error)usuarios=(u.data||[]).filter(x=>ids.includes(x.id));
                    }catch(userError){console.warn('No se pudieron cargar nombres de solicitantes:',userError);}
                }
                const map=new Map(usuarios.map(u=>[String(u.id),u]));
                host.innerHTML=rows.map(x=>{
                    const estado=x.estado||'PENDIENTE',resuelta=estado==='CUBIERTA',u=map.get(String(x.solicitada_por)),solicitante=u?.nombre||u?.email||'Usuario';
                    const color=resuelta?'bg-emerald-100 text-emerald-800':estado==='RECHAZADA'?'bg-rose-100 text-rose-800':estado==='APROBADA'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800';
                    const acciones=resuelta?'<button type="button" class="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white" onclick="seleccionarAlertaParaAsignacion(\''+x.id+'\')">Asignar colaborador</button>':estado==='CANCELADA'||estado==='RECHAZADA'?'<span class="text-xs text-slate-500">Sin acciones</span>':'<button type="button" class="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white" onclick="resolverSolicitudDotacion(\''+x.id+'\')">Cobertura resuelta</button>';
                    return '<tr><td class="p-3"><b>'+escaparHTML(x.sucursal_nombre)+'</b><div class="text-xs text-slate-500">'+escaparHTML(x.cargo_requerido)+' · '+escaparHTML(x.turno)+'</div></td><td class="p-3">'+escaparHTML(x.fecha_inicio)+' a '+escaparHTML(x.fecha_fin)+'<div class="text-xs text-slate-500">'+Number(x.cantidad||1)+' persona(s)</div></td><td class="p-3">'+escaparHTML(solicitante)+'</td><td class="p-3">'+escaparHTML(x.motivo)+'</td><td class="p-3"><span class="rounded-full px-2 py-1 text-xs font-bold '+color+'">'+(resuelta?'RESUELTA':escaparHTML(estado))+'</span></td><td class="p-3">'+acciones+'</td></tr>';
                }).join('')||'<tr><td colspan="6" class="p-4 text-sm text-slate-500">Todavía no hay alertas de cobertura.</td></tr>';
            }catch(error){
                console.error('Cargar alertas de cobertura:',error);
                host.innerHTML='<tr><td colspan="6" class="p-4 text-sm text-rose-700">No se pudieron cargar las alertas: '+escaparHTML(error.message||'Error desconocido')+'. Puedes volver a intentarlo con “Actualizar alertas”.</td></tr>';
            }
        }
        async function resolverSolicitudDotacion(id){
            try{
                const {data,error}=await _supabase.rpc('resolver_alerta_cobertura',{p_solicitud_id:id});
                if(error)throw error;
                solicitudCoberturaSeleccionada=data;
                document.getElementById('cob-solicitud-id').value=data.id;
                document.getElementById('form-cobertura')?.classList.remove('hidden');
                const destino=document.getElementById('cob-destino');if(destino)destino.value=data.sucursal_nombre||'';
                document.getElementById('cob-inicio').value=data.fecha_inicio||'';
                document.getElementById('cob-fin').value=data.fecha_fin||'';
                document.getElementById('cob-motivo').value=data.motivo||'Cobertura';
                document.getElementById('cob-observaciones').value=data.observaciones||'Sin observaciones adicionales.';
                calcularDiasCobertura();
                await cargarSolicitudesDotacion();
                mostrarToast('Cobertura marcada como resuelta. Ahora puedes buscar al colaborador para preparar el traslado.','success',9000);
                document.getElementById('cob-buscar')?.focus();
            }catch(e){mostrarToast('No se pudo marcar como resuelta. Verifica que tengas permiso de revisión: '+(e.message||''),'error',10000);}
        }
        async function seleccionarAlertaParaAsignacion(id){
            const {data,error}=await _supabase.from('solicitudes_dotacion').select('*').eq('id',id).single();
            if(error||!data)return mostrarToast('No se pudo cargar la alerta seleccionada.','error');
            if(data.estado!=='CUBIERTA')return mostrarToast('Primero marca la cobertura como resuelta.','warning');
            solicitudCoberturaSeleccionada=data;
            document.getElementById('cob-solicitud-id').value=data.id;
            document.getElementById('form-cobertura')?.classList.remove('hidden');
            const destino=document.getElementById('cob-destino');if(destino)destino.value=data.sucursal_nombre||'';
            document.getElementById('cob-inicio').value=data.fecha_inicio||'';
            document.getElementById('cob-fin').value=data.fecha_fin||'';
            document.getElementById('cob-motivo').value=data.motivo||'Cobertura';
            document.getElementById('cob-observaciones').value=data.observaciones||'Sin observaciones adicionales.';
            calcularDiasCobertura();
            document.getElementById('cob-buscar')?.focus();
        }
        async function prepararMapaYConfiguracionSucursales(){
            const lista=await obtenerSucursalesConfig(), opts='<option value="">Seleccione sucursal</option>'+lista.map(x=>`<option value="${escaparHTML(direccionSucursal(x))}">${escaparHTML(x.nombre)}</option>`).join('');
            document.getElementById('map-origen').innerHTML=opts;document.getElementById('map-destino').innerHTML=opts;
            await cargarSucursalesDotacion();
            document.getElementById('tabla-config-sucursales').innerHTML=lista.map(x=>`<tr><td class="p-3 font-bold">${escaparHTML(x.nombre)}</td><td class="p-3">${escaparHTML(direccionSucursal(x))}</td><td class="p-3">${escaparHTML(x.horario_apertura||'')}</td><td class="p-3">${escaparHTML(x.horario_cierre||'')}</td><td class="p-3">${escaparHTML(x.correo_sucursal||'')}</td><td class="p-3">${escaparHTML(x.correo_copia||'')}</td></tr>`).join('');
        }
        function mostrarRutaSucursales(){const o=document.getElementById('map-origen').value,d=document.getElementById('map-destino').value,m=document.getElementById('map-modo').value;if(!o||!d){mostrarToast('Selecciona origen y destino.','warning');return;}document.getElementById('mapa-sucursales').src=`https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(o)}&daddr=${encodeURIComponent(d)}&dirflg=${m}`;}
        function descargarPlantillaSucursales(){const datos=[{nombre:'Nombre exacto de la sucursal',direccion:'Dirección',comuna:'Comuna',horario_apertura:'09:00',horario_cierre:'19:00',correo_sucursal:'sucursal@empresa.cl',correo_copia:'supervisor@empresa.cl'}],wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(datos);XLSX.utils.book_append_sheet(wb,ws,'Configuracion');XLSX.writeFile(wb,'Plantilla_configuracion_sucursales.xlsx');}
        async function importarConfiguracionSucursales(event){try{const filas=await leerExcel(event.target.files[0]);for(const f of filas){const nombre=texto(obtenerCampo(f,['nombre','Nombre Sucursal','Sucursal']));if(!nombre)continue;const cambios={direccion:texto(obtenerCampo(f,['direccion','Dirección'])),comuna:texto(obtenerCampo(f,['comuna','Comuna'])),horario_apertura:texto(obtenerCampo(f,['horario_apertura','Horario Apertura'])),horario_cierre:texto(obtenerCampo(f,['horario_cierre','Horario Cierre'])),correo_sucursal:texto(obtenerCampo(f,['correo_sucursal','Correo Sucursal'])),correo_copia:texto(obtenerCampo(f,['correo_copia','Correo Copia','CC']))};const {error}=await _supabase.from('sucursales').update(cambios).eq('nombre',nombre);if(error)throw error;}await prepararMapaYConfiguracionSucursales();await registrarActualizacionFuente('config_sucursales',event.target.files?.[0]?.name||'Plantilla de configuración',filas.length,'manual');mostrarToast('Configuración de sucursales actualizada.','success');}catch(e){mostrarToast(e.message,'error');}finally{event.target.value='';}}

        function minutosAtraso(valor) {
            const partes = texto(valor).split(':').map(Number);
            return partes.length >= 2 ? (partes[0] || 0) * 60 + (partes[1] || 0) : Number(valor) || 0;
        }
        function valoresSeleccionados(id) {
            return [...document.getElementById(id).selectedOptions].map(x => x.value);
        }
        function seleccionarFiltroCorreo(id,seleccionar) { const sel=document.getElementById(id);if(!sel)return;Array.from(sel.options).forEach(o=>o.selected=!!seleccionar);if(sel._uxUpdate2026)sel._uxUpdate2026();sel.dispatchEvent(new Event('change',{bubbles:true})); }
        function fechaActualChileISO() {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(new Date());
            const get = type => parts.find(part => part.type === type)?.value || '';
            return get('year') + '-' + get('month') + '-' + get('day');
        }

        function sumarDiasISOChile(iso, delta) {
            const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!match) return '';
            const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
            date.setDate(date.getDate() + Number(delta || 0));
            return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
        }

        function sincronizarPresetCorreo() {
            const desde = document.getElementById('correo-desde')?.value || '';
            const hasta = document.getElementById('correo-hasta')?.value || '';
            const hoy = fechaActualChileISO();
            const rangos = {
                0: [hoy, hoy],
                7: [sumarDiasISOChile(hoy, -6), hoy],
                30: [sumarDiasISOChile(hoy, -29), hoy]
            };
            document.querySelectorAll('[data-periodo-correo]').forEach(button => {
                const rango = rangos[Number(button.dataset.periodoCorreo)];
                const activo = !!rango && desde === rango[0] && hasta === rango[1];
                button.setAttribute('aria-pressed', activo ? 'true' : 'false');
                button.classList.toggle('bg-sky-100', activo);
                button.classList.toggle('border-sky-400', activo);
                button.classList.toggle('text-sky-900', activo);
            });
        }
        window.sincronizarPresetCorreo = sincronizarPresetCorreo;

        function establecerPeriodoCorreos(dias) {
            const periodo = Number(dias);
            if (![0, 7, 30].includes(periodo)) {
                mostrarToast('Selecciona un rango de Hoy, 7 días o 30 días.', 'warning');
                return;
            }
            const hasta = fechaActualChileISO();
            const desde = sumarDiasISOChile(hasta, periodo === 0 ? 0 : -(periodo - 1));
            const campoDesde = document.getElementById('correo-desde');
            const campoHasta = document.getElementById('correo-hasta');
            if (!campoDesde || !campoHasta) {
                mostrarToast('No se encontraron los campos de fecha del módulo de correos.', 'error');
                return;
            }
            campoDesde.value = desde;
            campoHasta.value = hasta;
            sincronizarPresetCorreo();
        }
        window.establecerPeriodoCorreos = establecerPeriodoCorreos;

        async function prepararModuloCorreos() {
            if (!asistenciaCargada) await cargarAsistenciaDesdeNube();
            sucursalesConfiguracionGlobal = await obtenerSucursalesConfig();
            if(!sucursalesConfiguracionGlobal.length)throw new Error('No se cargaron sucursales desde Supabase. Revisa los permisos del usuario y vuelve a intentar.');
            const hoy = fechaActualChileISO();
            const fechaInicioSugerida = new Date(hoy + 'T12:00:00');
            fechaInicioSugerida.setDate(fechaInicioSugerida.getDate() - 7);
            const desdeSugerido = [fechaInicioSugerida.getFullYear(), String(fechaInicioSugerida.getMonth() + 1).padStart(2, '0'), String(fechaInicioSugerida.getDate()).padStart(2, '0')].join('-');
            document.getElementById('correo-hasta').value ||= hoy;
            document.getElementById('correo-desde').value ||= desdeSugerido;
            sincronizarPresetCorreo();
            document.getElementById('correo-sucursales').innerHTML = sucursalesConfiguracionGlobal.map(x => `<option value="${escaparHTML(x.nombre)}">${escaparHTML(x.nombre)}</option>`).join('');
            const supervisores = [...new Set(sucursalesConfiguracionGlobal.map(x => texto(x.supervisor)).filter(Boolean))].sort();
            document.getElementById('correo-supervisores').innerHTML = supervisores.map(x => `<option value="${escaparHTML(x)}">${escaparHTML(x)}</option>`).join('');
            if(window.actualizarContadoresSelectores2026)window.actualizarContadoresSelectores2026();
        }
        function crearCuerpoCorreo(grupo, casos, desde, hasta) {
            const nombreGrupo = grupo.tipo === 'SUPERVISOR' ? 'sucursales a cargo de ' + grupo.nombre : 'sucursal ' + grupo.nombre;
            const filas = casos.map((x, i) => (i + 1) + '. ' + x.fecha + ' | ' + x.rut + ' | ' + x.nombre + ' | ' + x.sucursal + '\n   ' + (x.detalles || []).join('\n   ')).join('\n\n');
            const firma = texto(grupo.firma) || 'Saludos cordiales,\nDepartamento de Recursos Humanos\nFarmacias de Similares Chile S.A.\nRUT: 59.111.330-5';
            return 'Estimados/as equipo de ' + nombreGrupo.toUpperCase() + ':\n\nJunto con saludar, esperamos que se encuentren muy bien.\n\nEste correo tiene como objetivo orientar el cumplimiento de la jornada y el correcto registro de asistencia de su equipo. En la revisión preventiva de asistencia se identificaron registros que requieren revisión para el período ' + desde + ' al ' + hasta + ':\n\n' + filas + '\n\nPara regularizar cada caso, agradeceremos confirmar si corresponde a asistencia normal (olvido de marcar), permiso autorizado o inasistencia justificada/no justificada, indicando el motivo y adjuntando el respaldo cuando corresponda.\n\n' + firma;
        }
        function crearCuerpoCorreoHTML(grupo, casos, desde, hasta) {
            const e = v => escaparHTML(texto(v) || '—');
            const nombreGrupo = grupo.tipo === 'SUPERVISOR' ? 'sucursales a cargo de ' + grupo.nombre : 'sucursal ' + grupo.nombre;
            const estadoCaso = x => { const d=(x.detalles||[]).join(' ').toLowerCase(); if(d.includes('no registra marcas'))return 'Inexistente'; if(d.includes('sin turno'))return 'Sin turno'; if(d.includes('salida anticipada'))return 'Salida anticipada'; if(d.includes('atraso'))return 'Atraso'; return 'Revisar'; };
            const filas = casos.map(x => {
                const turno=x.turno||x.turno_asignado||x.jornada||x.horario||'—';
                const entrada=x.entrada&&x.entrada!=='-'?x.entrada:'—'; const salida=x.salida&&x.salida!=='-'?x.salida:'—';
                const celdas=[e(x.fecha),e(estadoCaso(x)),e(x.rut),e(x.nombre),e(x.sucursal),e(turno),e(entrada),e(salida)];
                return '<tr>'+celdas.map(v=>'<td style="padding:9px 8px;border:1px solid #c7d8ef;background:#eaf3ff;font-size:12px;">'+v+'</td>').join('')+'</tr><tr><td colspan="8" style="padding:8px 10px;border:1px solid #c7d8ef;background:#fff;font-size:12px;color:#26364b;"><b>Gestión solicitada:</b> '+e((x.detalles||[]).join(' '))+'</td></tr>';
            }).join('');
            const firmaConfigurada=texto(grupo.firma); const firma=firmaConfigurada?e(firmaConfigurada).replace(/\r?\n/g,'<br>'):'Saludos cordiales,<br><b>Departamento de Recursos Humanos</b><br>Farmacias de Similares Chile S.A.<br>RUT: 59.111.330-5';
            const headers=['Fecha','Estado','RUT','Nombre','Sucursal','Turno','Entrada','Salida'].map(t=>'<th style="padding:10px 8px;background:#1554a6;color:#fff;border:1px solid #8eb1e6;text-align:left;font-size:12px;">'+t+'</th>').join('');
            return '<div style="background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#202b3c;"><div style="padding:20px;background:#fff;border:1px solid #d5dfeb;">'+
                '<p>Estimados/as equipo de <b>'+e(nombreGrupo).toUpperCase()+'</b>:</p><p>Junto con saludar, esperamos que se encuentren muy bien.</p>'+
                '<p style="line-height:1.55;">Este correo tiene como objetivo orientar el cumplimiento de la jornada y el correcto registro de asistencia. En la revisión preventiva se identificaron registros que requieren aclaración, correspondientes al período <b>'+e(desde)+' al '+e(hasta)+'</b>. Para su gestión, dejamos el detalle a continuación:</p>'+
                '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #9bb9e3;font-family:Arial,Helvetica,sans-serif;"><thead><tr>'+headers+'</tr></thead><tbody>'+filas+'</tbody></table>'+
                '<p style="margin-top:16px;">Para regularizar cada caso, agradeceremos confirmar si corresponde a:</p><ul style="line-height:1.6;"><li>Asistencia normal (olvido de marcar).</li><li>Permiso autorizado.</li><li>Inasistencia justificada o no justificada (indicar motivo).</li></ul>'+
                '<p>Agradecemos su colaboración y respuesta para mantener los registros de asistencia actualizados.</p><p>'+firma+'</p></div></div>';
        }
        async function guardarLoteBorradoresNube(desde,hasta,agrupar,filtroSuc,filtroSup,minimo) {
            const {data:sesion,error:errSesion}=await _supabase.auth.getUser();
            if(errSesion||!sesion?.user?.email)throw new Error('No se pudo verificar la sesión para guardar en la nube.');
            const borradores=(borradoresGeneradosGlobal||[]).map(b=>({id:b.id,nombre:b.nombre,tipoCorreo:b.tipoCorreo||((b.casosDetalle||[]).some(c=>(c.detalles||[]).some(d=>/no registra marcas durante la jornada/i.test(String(d))))?'SIN_MARCAS':'OTRAS_INCIDENCIAS'),para:b.para,cc:b.cc,asunto:b.asunto,cuerpo:b.cuerpo,cuerpoHtml:b.cuerpoHtml||'',cantidad:Number(b.cantidad||0),proteccionAusenciasVerificada:b.proteccionAusenciasVerificada===true,periodoDesde:b.periodoDesde||desde,periodoHasta:b.periodoHasta||hasta,grupoCorreo:b.grupoCorreo||null,casosDetalle:Array.isArray(b.casosDetalle)?b.casosDetalle:[]}));
            const totalCasos=borradores.reduce((n,b)=>n+b.cantidad,0);
            const fila={usuario_email:String(sesion.user.email).trim().toLowerCase(),usuario_rol_id:perfilActualSistema?.id||null,fecha_desde:desde,fecha_hasta:hasta,agrupacion:agrupar,filtros:{sucursales:filtroSuc,supervisores:filtroSup,minimo_atraso:minimo,tipos:{atraso:!!document.getElementById('correo-t-atraso')?.checked,salida_temprana:!!document.getElementById('correo-t-temprana')?.checked,sin_turno:!!document.getElementById('correo-t-sinturno')?.checked,sin_marca:!!document.getElementById('correo-t-sinmarca')?.checked},proteccionAusencias:resumenExclusionesCorreoGlobal},borradores,total_borradores:borradores.length,total_casos:totalCasos};
            const {error}=await _supabase.from('borradores_correo_usuario').insert([fila]);
            if(error)throw new Error(error.message||'No se pudo guardar el historial de correos.');
        }
        function alternarHistorialBorradoresNube() {
            const panel=document.getElementById('correo-historial-panel');
            const boton=document.getElementById('correo-historial-toggle');
            const refrescar=document.getElementById('correo-historial-refresh');
            if(!panel||!boton)return;
            const abrir=panel.hidden;
            panel.hidden=!abrir;
            boton.setAttribute('aria-expanded',String(abrir));
            boton.textContent=abrir?'Ocultar historial':'Mostrar historial';
            if(refrescar)refrescar.classList.toggle('hidden',!abrir);
            if(abrir)cargarHistorialBorradoresNube(false);
        }
        async function cargarHistorialBorradoresNube(notificar=false) {
            const panel=document.getElementById('correo-historial-panel');
            const cont=document.getElementById('correo-nube-historial');if(!cont)return;
            // No consultar la nube mientras el historial esté cerrado.
            if(panel?.hidden)return;
            cont.innerHTML='<p class="text-sm text-slate-500">Cargando historial de generaciones del equipo…</p>';
            const {data:sesion,error:errSesion}=await _supabase.auth.getUser();
            if(errSesion||!sesion?.user?.email){cont.innerHTML='<p class="text-sm text-rose-700">No se pudo verificar la sesión.</p>';return;}
            const {data,error}=await _supabase.from('borradores_correo_usuario').select('id,usuario_email,fecha_desde,fecha_hasta,agrupacion,total_borradores,total_casos,created_at').order('created_at',{ascending:false}).limit(100);
            if(error){cont.innerHTML='<p class="text-sm text-amber-700">No se pudo cargar el historial en la nube.</p><p class="mt-1 text-xs text-slate-500">Detalle técnico: '+escaparHTML(error.message||'Error desconocido')+'</p>';if(notificar)mostrarToast('No se pudo cargar el historial de borradores: '+(error.message||'error desconocido'),'warning');return;}
            if(!data?.length){cont.innerHTML='<p class="text-sm text-slate-500">No hay generaciones disponibles para esta cuenta. Si el equipo ya generó correos, revisa los permisos de lectura de borradores_correo_usuario en Supabase.</p>';return;}
            cont.innerHTML=data.map(x=>{const fecha=x.created_at?new Date(x.created_at).toLocaleString('es-CL'):'Fecha no disponible';const creador=String(x.usuario_email||'Usuario no identificado');return `<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><b class="text-sm">${escaparHTML(x.fecha_desde)} a ${escaparHTML(x.fecha_hasta)}</b><p class="text-xs text-slate-600">Generado por: <b>${escaparHTML(creador)}</b></p><p class="text-xs text-slate-500">${escaparHTML(fecha)} · ${Number(x.total_borradores||0)} borradores · ${Number(x.total_casos||0)} casos · agrupado por ${escaparHTML(x.agrupacion||'sucursal')}</p></div><button type="button" onclick="restaurarBorradoresNube('${x.id}')" class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Ver / restaurar</button></div>`;}).join('');
            if(notificar)mostrarToast('Historial actualizado desde la nube.','success');
        }
        async function restaurarBorradoresNube(id) {
            if(!id)return;
            const {data,error}=await _supabase.from('borradores_correo_usuario').select('borradores,filtros,fecha_desde,fecha_hasta').eq('id',id).maybeSingle();
            if(error||!data){mostrarToast('No se pudo restaurar ese historial o no tienes acceso.','error');return;}
            borradoresGeneradosGlobal=Array.isArray(data.borradores)?data.borradores.map(b=>({...b,tipoCorreo:b.tipoCorreo||((b.casosDetalle||[]).some(c=>(c.detalles||[]).some(d=>/no registra marcas durante la jornada/i.test(String(d))))?'SIN_MARCAS':'OTRAS_INCIDENCIAS'),cuerpoHtml:b.cuerpoHtml||'',proteccionAusenciasVerificada:b.proteccionAusenciasVerificada===true&&Array.isArray(b.casosDetalle)&&b.casosDetalle.length>0&&!!b.grupoCorreo&&!!b.periodoDesde&&!!b.periodoHasta})):[];
            casosExcluidosCorreoGlobal=[];
            resumenExclusionesCorreoGlobal=data.filtros?.proteccionAusencias?.verificada===true?{...data.filtros.proteccionAusencias}:null;
            renderizarBorradoresMasivos();
            mostrarToast('Historial restaurado. Solo los borradores con protección de ausencias verificada podrán abrirse o descargarse; los antiguos deben regenerarse.','warning',12000);
        }

        let casosExcluidosCorreoGlobal = [];
        let resumenExclusionesCorreoGlobal = null;
        const VERSION_PROTECCION_AUSENCIAS_CORREO = '2026-10-13-v1';

        function normalizarFechaProteccionCorreo(valor) {
            if (valor === null || valor === undefined || String(valor).trim() === '') return '';
            if (typeof fechaISODesdeExcel === 'function') {
                const convertida = fechaISODesdeExcel(valor);
                if (convertida && /^\d{4}-\d{2}-\d{2}$/.test(String(convertida))) return String(convertida);
            }
            const raw = String(valor).trim();
            const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
            if (iso) return iso[1];
            return '';
        }

        function normalizarRutProteccionCorreo(valor) {
            return String(valor || '')
                .normalize('NFKC')
                .trim()
                .toUpperCase()
                .replace(/[.\s]/g, '')
                .replace(/[‐‑‒–—−]/g, '-');
        }

        function normalizarTextoProteccionCorreo(valor) {
            return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
        }

        function tipoProtegidoCorreo(tipo) {
            const valor = normalizarTextoProteccionCorreo(tipo);
            if (valor.includes('permiso')) return 'permisos';
            if (valor.includes('licencia') || valor.includes('maternal')) return 'licencias';
            return '';
        }

        function vacacionesAprobadasParaProteccionCorreo(estado) {
            const valor = normalizarTextoProteccionCorreo(estado);
            if (!valor || /rechaz|cancel|anulad|denegad|pendiente|borrador/.test(valor)) return false;
            return /^(aprobad[oa]|autorizad[oa]|aceptad[oa]|vigente)$/.test(valor);
        }

        function rangoCorreoSeSolapa(inicio, fin, desde, hasta) {
            return Boolean(inicio && fin && fin >= desde && inicio <= hasta);
        }

        async function cargarProteccionAusenciasCorreos(desde, hasta, opciones = {}) {
            if (typeof tienePermisoModulo !== 'function') {
                throw new Error('No se pudieron comprobar los permisos para validar licencias, vacaciones y papeletas.');
            }
            const modulosNecesarios = ['licencias', 'vacaciones', 'papeletas'];
            const sinPermiso = modulosNecesarios.filter(modulo => !tienePermisoModulo(modulo));
            if (sinPermiso.length) {
                throw new Error('Por seguridad no se generaron borradores: tu perfil necesita permiso de consulta para Licencias, Vacaciones y Papeletas para verificar las ausencias.');
            }

            const cacheCorreo = window.__doctorSimiAusenciasCache;
            if (!opciones.forceFresh && cacheCorreo && Date.now() - cacheCorreo.timestamp < 20000) return cacheCorreo.resultado;
            // Lecturas paralelas con solo columnas de validación; se conservan todas las filas
            // para detectar RUT con fechas defectuosas y bloquear borradores inseguros.
            const [licencias, vacaciones, permisos] = await Promise.all([
                leerColumnasTablaCorreo('licencias_medicas', ['id', 'rut', 'tipo_ausencia', 'fecha_inicio', 'fecha_fin']),
                leerColumnasTablaCorreo('vacaciones_historico', ['id', 'rut', 'estado', 'fecha_inicio', 'fecha_fin']),
                leerColumnasTablaCorreo('papeletas_permiso', ['id', 'rut', 'fecha_inicio', 'fecha_fin', 'fecha_retorno'])
            ]);

            const periodosPorRut = new Map();
            const rutConFechaNoVerificable = new Map();
            const resumen = { vacaciones: 0, permisos: 0, licencias: 0, fecha_no_verificable: 0 };
            let registrosEnPeriodoSinRut = 0;

            function agregarPeriodo(registro, categoria, inicioRaw, finRaw) {
                const inicio = normalizarFechaProteccionCorreo(inicioRaw);
                const fin = normalizarFechaProteccionCorreo(finRaw);
                const rut = normalizarRutProteccionCorreo(registro.rut);

                // Un registro de ausencia relevante con fecha inválida no autoriza a generar
                // correos sobre esa persona: se bloquea ese RUT hasta poder verificarlo.
                if (!inicio || !fin || inicio > fin) {
                    if (rut) {
                        rutConFechaNoVerificable.set(rut, categoria);
                        resumen.fecha_no_verificable++;
                    } else {
                        registrosEnPeriodoSinRut++;
                    }
                    return;
                }
                if (!rangoCorreoSeSolapa(inicio, fin, desde, hasta)) return;
                if (!rut) {
                    registrosEnPeriodoSinRut++;
                    return;
                }
                const periodos = periodosPorRut.get(rut) || [];
                periodos.push({ inicio, fin, categoria });
                periodosPorRut.set(rut, periodos);
            }

            (licencias || []).forEach(registro => {
                const categoria = tipoProtegidoCorreo(registro.tipo_ausencia);
                if (!categoria) return;
                agregarPeriodo(registro, categoria, registro.fecha_inicio, registro.fecha_fin);
            });

            (vacaciones || []).forEach(registro => {
                if (!vacacionesAprobadasParaProteccionCorreo(registro.estado)) return;
                agregarPeriodo(registro, 'vacaciones', registro.fecha_inicio, registro.fecha_fin);
            });

            // Papeletas registradas representan permisos formalizados; la tabla no dispone
            // de columna de estado, por lo que el rango registrado se trata como autorizado.
            (permisos || []).forEach(registro => {
                agregarPeriodo(registro, 'permisos', registro.fecha_inicio, registro.fecha_fin || registro.fecha_retorno);
            });

            if (registrosEnPeriodoSinRut) {
                throw new Error('No se generaron borradores: hay registros de licencia, vacaciones o permiso que no se pueden asociar a un RUT. Corrige esos datos para evitar correos incorrectos.');
            }

            const resultadoProteccion = { periodosPorRut, rutConFechaNoVerificable, resumen, filasConsultadas: {
                licencias: (licencias || []).length,
                vacaciones: (vacaciones || []).length,
                permisos: (permisos || []).length
            }};
            window.__doctorSimiAusenciasCache = { timestamp: Date.now(), resultado: resultadoProteccion };
            return resultadoProteccion;
        }

        function buscarExclusionAusenciaCorreo(registroAsistencia, fechaCaso, proteccion) {
            const rut = normalizarRutProteccionCorreo(registroAsistencia.rut);
            if (!rut) return { categoria: 'fecha_no_verificable', mensaje: 'No se puede comprobar la ausencia porque el registro de asistencia no tiene RUT.' };
            if (proteccion.rutConFechaNoVerificable.has(rut)) {
                return { categoria: 'fecha_no_verificable', mensaje: 'Tiene un registro de licencia o permiso con fechas no verificables.' };
            }
            const periodos = proteccion.periodosPorRut.get(rut) || [];
            const periodo = periodos.find(item => fechaCaso >= item.inicio && fechaCaso <= item.fin);
            if (!periodo) return null;
            const nombres = { vacaciones: 'vacaciones aprobadas', permisos: 'permiso registrado', licencias: 'licencia o permiso registrado' };
            return { categoria: periodo.categoria, mensaje: 'Registro omitido por ' + (nombres[periodo.categoria] || 'ausencia registrada') + ' (' + periodo.inicio + ' a ' + periodo.fin + ').' };
        }

        function actualizarResumenExclusionesCorreo() {
            const numero = document.getElementById('correo-resumen-excluidos');
            const detalle = document.getElementById('correo-exclusiones-detalle');
            if (numero) numero.textContent = resumenExclusionesCorreoGlobal?.verificada
                ? Number(resumenExclusionesCorreoGlobal.casos_excluidos || 0).toLocaleString('es-CL')
                : (borradoresGeneradosGlobal.some(b => b.proteccionAusenciasVerificada !== true) ? '—' : '0');
            if (!detalle) return;
            if (resumenExclusionesCorreoGlobal?.verificada) {
                const tipos = resumenExclusionesCorreoGlobal.por_tipo || {};
                detalle.textContent = 'Validación completada · ' +
                    Number(resumenExclusionesCorreoGlobal.colaboradores_excluidos || 0).toLocaleString('es-CL') + ' colaborador(es) afectado(s). ' +
                    'Vacaciones: ' + Number(tipos.vacaciones || 0) + ' · Permisos: ' + Number(tipos.permisos || 0) +
                    ' · Licencias: ' + Number(tipos.licencias || 0) + ' · Fechas no verificables: ' + Number(tipos.fecha_no_verificable || 0) + '.';
                detalle.classList.remove('hidden');
            } else if (borradoresGeneradosGlobal.some(b => b.proteccionAusenciasVerificada !== true)) {
                detalle.textContent = 'Este historial es anterior a la protección automática o no tiene constancia de validación. No se puede descargar ni abrir para envío; vuelve a generar el borrador con datos actuales.';
                detalle.classList.remove('hidden');
            } else {
                detalle.textContent = 'Antes de preparar los correos se validan licencias, vacaciones aprobadas y permisos contra las fechas de cada incidencia.';
                detalle.classList.remove('hidden');
            }
        }

        function borradorTieneProteccionAusencias(borrador) {
            const completo = borrador?.proteccionAusenciasVerificada === true &&
                Array.isArray(borrador.casosDetalle) && borrador.casosDetalle.length > 0 &&
                !!borrador.grupoCorreo && !!borrador.periodoDesde && !!borrador.periodoHasta;
            if (completo) return true;
            mostrarToast('Este borrador no tiene los casos fuente para volver a validar licencias, vacaciones y permisos. No se permite abrirlo; vuelve a generarlo.', 'warning', 12000);
            return false;
        }

        async function revalidarBorradoresAntesDeExportar(lista) {
            if (!Array.isArray(lista) || !lista.length) return [];
            if (lista.some(b => !borradorTieneProteccionAusencias(b))) {
                throw new Error('Uno o más borradores antiguos no tienen datos para volver a validar las ausencias. Regénéralos antes de descargar.');
            }
            const desde = lista.map(b => b.periodoDesde).sort()[0];
            const hasta = lista.map(b => b.periodoHasta).sort().slice(-1)[0];
            actualizarProgresoCorreos(18, 'Preparando ZIP', 'Revalidando licencias, vacaciones y permisos en Supabase…');
            await esperarPintadoCorreo();
            const proteccion = await cargarProteccionAusenciasCorreos(desde, hasta, { forceFresh: true });
            actualizarProgresoCorreos(38, 'Preparando ZIP', 'Ausencias verificadas. Preparando archivos EML…');
            await esperarPintadoCorreo();
            const remociones = [];
            const conservados = [];

            for (const borrador of lista) {
                const casosOriginales = borrador.casosDetalle || [];
                const casosValidos = [];
                for (const caso of casosOriginales) {
                    const fechaCaso = normalizarFechaProteccionCorreo(caso.fecha);
                    const exclusion = !fechaCaso
                        ? { categoria: 'fecha_no_verificable', mensaje: 'La fecha de asistencia no se pudo validar.' }
                        : buscarExclusionAusenciaCorreo(caso, fechaCaso, proteccion);
                    if (exclusion) {
                        remociones.push({ rut: normalizarRutProteccionCorreo(caso.rut), nombre: caso.nombre || '', fecha: fechaCaso || '', categoria: exclusion.categoria, mensaje: exclusion.mensaje });
                    } else {
                        casosValidos.push({ ...caso, fecha: fechaCaso });
                    }
                }

                borrador.casosDetalle = casosValidos;
                borrador.cantidad = casosValidos.length;
                if (!casosValidos.length) {
                    borrador.proteccionAusenciasVerificada = false;
                    borrador.cuerpo = '';
                    borrador.cuerpoHtml = '';
                    continue;
                }
                borrador.cuerpo = crearCuerpoCorreo(borrador.grupoCorreo, casosValidos, borrador.periodoDesde, borrador.periodoHasta);
                borrador.cuerpoHtml = crearCuerpoCorreoHTML(borrador.grupoCorreo, casosValidos, borrador.periodoDesde, borrador.periodoHasta);
                borrador.proteccionAusenciasVerificada = true;
                conservados.push(borrador);
            }

            if (remociones.length) {
                casosExcluidosCorreoGlobal.push(...remociones);
                const porTipo = { vacaciones: 0, permisos: 0, licencias: 0, fecha_no_verificable: 0 };
                casosExcluidosCorreoGlobal.forEach(caso => porTipo[caso.categoria] = (porTipo[caso.categoria] || 0) + 1);
                const anteriores = resumenExclusionesCorreoGlobal?.verificada ? resumenExclusionesCorreoGlobal : {
                    verificada: true, version: VERSION_PROTECCION_AUSENCIAS_CORREO,
                    periodo_desde: desde, periodo_hasta: hasta, casos_excluidos: 0,
                    colaboradores_excluidos: 0, por_tipo: { vacaciones: 0, permisos: 0, licencias: 0, fecha_no_verificable: 0 }
                };
                resumenExclusionesCorreoGlobal = {
                    ...anteriores,
                    verificada: true,
                    version: VERSION_PROTECCION_AUSENCIAS_CORREO,
                    casos_excluidos: Number(anteriores.casos_excluidos || 0) + remociones.length,
                    colaboradores_excluidos: Number(anteriores.colaboradores_excluidos || 0) + new Set(remociones.map(x => x.rut).filter(Boolean)).size,
                    por_tipo: Object.fromEntries(Object.keys(porTipo).map(tipo => [tipo, Number(anteriores.por_tipo?.[tipo] || 0) + remociones.filter(x => x.categoria === tipo).length])),
                    ultima_revalidacion: new Date().toISOString()
                };
            }
            renderizarBorradoresMasivos();
            if (!conservados.length) {
                throw new Error('No se descargó ningún correo: todos los casos del borrador coinciden ahora con vacaciones, permisos o licencias, o tienen fechas no verificables. El borrador quedó bloqueado.');
            }
            return conservados;
        }

        // Progreso visual con gatito animado. El porcentaje sigue conectado al avance real.
        function asegurarPanelProgresoCorreos() {
            let panel = document.getElementById('correo-progreso-ejecucion');
            if (panel) return panel;
            if (!document.getElementById('simi-cat-progress-style')) {
                const style = document.createElement('style');
                style.id = 'simi-cat-progress-style';
                style.textContent = `
                  #correo-progreso-ejecucion{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(4,24,53,.64);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
                  #correo-progreso-ejecucion.hidden{display:none}
                  #correo-progreso-ejecucion .simi-progress-card{width:min(760px,100%);overflow:hidden;border:1px solid rgba(255,255,255,.75);border-radius:28px;background:linear-gradient(145deg,#fff 0%,#f3fbff 60%,#effdfa 100%);box-shadow:0 28px 90px rgba(0,20,55,.35);animation:simiProgressIn .28s ease-out}
                  #correo-progreso-ejecucion .simi-progress-hero{position:relative;overflow:hidden;padding:24px 26px 16px;background:linear-gradient(120deg,#0759c7 0%,#168be4 52%,#0db8b2 100%);color:white}
                  #correo-progreso-ejecucion .simi-progress-track{position:relative;height:72px;margin-top:12px;border-radius:18px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.24);overflow:hidden}
                  #correo-progreso-ejecucion .simi-progress-track:before{content:"";position:absolute;left:0;right:0;top:50%;border-top:2px dashed rgba(255,255,255,.52)}
                  #correo-progreso-ejecucion .simi-cat-runner{position:absolute;top:5px;left:0%;transform:translateX(-50%);font-size:42px;line-height:1;filter:drop-shadow(0 5px 5px rgba(0,0,0,.18));transition:left .45s cubic-bezier(.2,.8,.2,1);animation:simiCatBounce .7s ease-in-out infinite alternate;white-space:nowrap;z-index:2}
                  #correo-progreso-ejecucion .simi-cat-package{display:inline-block;font-size:20px;vertical-align:middle;margin-left:2px}
                  #correo-progreso-ejecucion .simi-progress-bar{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#19a8a5,#27c8d0,#5eead4);box-shadow:0 0 20px rgba(25,168,165,.32);transition:width .35s ease}
                  #correo-progreso-ejecucion .simi-step{display:flex;align-items:center;gap:8px;font-size:11px;color:#64748b}
                  #correo-progreso-ejecucion .simi-step-dot{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;border:2px solid #cbd5e1;background:white;font-weight:800}
                  #correo-progreso-ejecucion .simi-step.active{color:#075985;font-weight:800}
                  #correo-progreso-ejecucion .simi-step.active .simi-step-dot{border-color:#19a8a5;color:#087e8b;box-shadow:0 0 0 4px rgba(25,168,165,.12)}
                  #correo-progreso-ejecucion .simi-step.done .simi-step-dot{background:#0dbaa0;color:white;border-color:#0dbaa0}
                  @keyframes simiCatBounce{from{margin-top:0}to{margin-top:7px}}
                  @keyframes simiProgressIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
                  @media(prefers-reduced-motion:reduce){#correo-progreso-ejecucion *,#correo-progreso-ejecucion *:before{animation:none!important;transition:none!important}}
                `;
                document.head.appendChild(style);
            }
            panel = document.createElement('section');
            panel.id = 'correo-progreso-ejecucion';
            panel.className = 'hidden';
            panel.setAttribute('role', 'status');
            panel.setAttribute('aria-live', 'polite');
            panel.innerHTML = '<div class="simi-progress-card"><div class="simi-progress-hero"><div class="flex items-start gap-4"><div class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-3xl shadow-inner">✉️</div><div class="min-w-0 flex-1"><div class="text-xs font-extrabold uppercase tracking-[.18em] text-white/75">Doctor Simi · Asistencia RR. HH.</div><div class="mt-1 flex flex-wrap items-center justify-between gap-2"><strong id="correo-progreso-titulo" class="text-xl font-black sm:text-2xl">Preparando borradores…</strong><strong id="correo-progreso-porcentaje" class="text-2xl font-black tabular-nums">0%</strong></div><p id="correo-progreso-detalle" class="mt-1 text-sm text-white/90">Preparando tarea…</p></div></div><div class="simi-progress-track"><div id="correo-progreso-barra" class="simi-progress-bar absolute inset-y-0 left-0" style="width:0%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div><div id="correo-progreso-gato" class="simi-cat-runner" style="left:0%">🐱<span class="simi-cat-package">✉️</span></div></div><div class="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-white/80"><span>Preparando</span><span>Procesando</span><span>Finalizando</span></div></div><div class="p-5 sm:p-7"><div class="mb-4 flex items-center justify-between gap-3"><div><div class="text-sm font-extrabold text-slate-900">Tu gatito está trabajando</div><div class="mt-1 text-xs text-slate-500">El avance se actualiza con el proceso real. No cierres esta ventana.</div></div><div id="correo-progreso-estado" class="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-extrabold text-cyan-800">En curso</div><button type="button" id="correo-progreso-cerrar" class="hidden rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500" aria-label="Cerrar progreso y volver">Cerrar y volver</button></div><div class="h-3 overflow-hidden rounded-full bg-slate-200"><div id="correo-progreso-barra-secundaria" class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-300" style="width:0%"></div></div><div class="mt-4 grid grid-cols-3 gap-2 sm:gap-3"><div id="correo-progreso-paso-1" class="simi-step active"><span class="simi-step-dot">1</span><span>Preparar</span></div><div id="correo-progreso-paso-2" class="simi-step"><span class="simi-step-dot">2</span><span>Procesar</span></div><div id="correo-progreso-paso-3" class="simi-step"><span class="simi-step-dot">3</span><span>Completar</span></div></div><div class="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 text-xs leading-5 text-slate-600"><span class="font-extrabold text-cyan-900">Tip:</span> Los correos son borradores para revisar en Outlook; no se envían automáticamente.</div></div></div>';
            document.body.appendChild(panel);
            panel.querySelector('#correo-progreso-cerrar')?.addEventListener('click', () => { if (panel.dataset.estado === 'completado' || panel.dataset.estado === 'error') panel.classList.add('hidden'); });
            return panel;
        }
        function actualizarProgresoCorreos(porcentaje, titulo, detalle, estado) {
            const panel = asegurarPanelProgresoCorreos();
            if (!panel) return;
            const pct = Math.max(0, Math.min(100, Math.round(Number(porcentaje) || 0)));
            panel.classList.remove('hidden');
            panel.dataset.estado = estado || 'procesando';
            const title = document.getElementById('correo-progreso-titulo');
            const value = document.getElementById('correo-progreso-porcentaje');
            const bar = document.getElementById('correo-progreso-barra');
            const bar2 = document.getElementById('correo-progreso-barra-secundaria');
            const desc = document.getElementById('correo-progreso-detalle');
            const cat = document.getElementById('correo-progreso-gato');
            const state = document.getElementById('correo-progreso-estado');
            if (title) title.textContent = titulo || 'Procesando…';
            if (value) value.textContent = pct + '%';
            if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct)); }
            if (bar2) bar2.style.width = pct + '%';
            if (cat) { cat.style.left = Math.min(95, Math.max(5, pct)) + '%'; const pkg=cat.querySelector('.simi-cat-package'); if(pkg) pkg.textContent = /zip|comprim|archivo|descarg/i.test(titulo||'') ? '📦' : '✉️'; }
            if (desc) desc.textContent = detalle || '';
            if (state) { state.textContent = estado === 'completado' ? '¡Listo!' : estado === 'error' ? 'Requiere atención' : 'En curso'; state.className = 'rounded-full px-3 py-1.5 text-xs font-extrabold ' + (estado === 'completado' ? 'bg-emerald-100 text-emerald-800' : estado === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-cyan-50 text-cyan-800'); }
            [1,2,3].forEach((n)=>{const el=document.getElementById('correo-progreso-paso-'+n);if(!el)return;el.classList.toggle('done',(estado==='completado')||(pct>=n*33));el.classList.toggle('active',estado!=='completado'&&estado!=='error'&&pct<(n*33)&&pct>=(n-1)*33);});
            const closeButton = document.getElementById('correo-progreso-cerrar');
            if (closeButton) closeButton.classList.toggle('hidden', estado !== 'completado' && estado !== 'error');
            const helper = panel.querySelector('.simi-progress-card .simi-progress-hero + .p-5 .mb-4 .text-xs.text-slate-500');
            if (helper && (estado === 'completado' || estado === 'error')) helper.textContent = 'El proceso terminó. Pulsa “Cerrar y volver” para continuar.';
            if (estado === 'completado' || estado === 'error') {
                if (cat) { cat.style.left = '95%'; cat.style.animation = 'none'; cat.innerHTML = (estado === 'completado' ? '😺<span class="simi-cat-package">✨</span>' : '🙀<span class="simi-cat-package">⚠️</span>'); }
            }
        }
        const esperarPintadoCorreo = () => new Promise(resolve => setTimeout(resolve, 0));

        async function leerColumnasTablaCorreo(tabla, columnas) {
            const resultado = [];
            const tamano = 1000;
            for (let inicio = 0; ; inicio += tamano) {
                const { data, error } = await _supabase.from(tabla).select(columnas.join(',')).order('id', { ascending: true }).range(inicio, inicio + tamano - 1);
                if (error) throw errorSupabase('No se pudo consultar ' + tabla, error);
                if (!data?.length) break;
                resultado.push(...data);
                if (data.length < tamano) break;
            }
            return resultado;
        }

        async function prepararCorreosAsistencia() {
            if(!puedePrepararCorreosActual())return mostrarToast('No tienes autorización para preparar correos.','warning');
            const desde = document.getElementById('correo-desde').value;
            const hasta = document.getElementById('correo-hasta').value;
            const minimo = Number(document.getElementById('correo-min-atraso').value) || 0;
            if (!desde || !hasta) return mostrarToast('Selecciona el período desde y hasta.', 'warning');
            if (desde > hasta) return mostrarToast('La fecha Desde no puede ser posterior a Hasta.', 'warning');
            const filtroSuc = valoresSeleccionados('correo-sucursales');
            const filtroSup = valoresSeleccionados('correo-supervisores');
            const agrupar = document.getElementById('correo-agrupar').value;
            let proteccionAusencias;
            actualizarProgresoCorreos(5, 'Generando vista previa', 'Consultando licencias, vacaciones y permisos en Supabase…');
            await esperarPintadoCorreo();
            try {
                proteccionAusencias = await cargarProteccionAusenciasCorreos(desde, hasta);
                actualizarProgresoCorreos(38, 'Generando vista previa', 'Ausencias consultadas. Analizando registros de asistencia…');
                await esperarPintadoCorreo();
            } catch (error) {
                resumenExclusionesCorreoGlobal = null;
                casosExcluidosCorreoGlobal = [];
                borradoresGeneradosGlobal = [];
                renderizarBorradoresMasivos();
                actualizarResumenExclusionesCorreo();
                actualizarProgresoCorreos(100, 'No se pudo generar la vista previa', error.message || String(error), 'error');
                mostrarToast('No se generaron borradores porque no fue posible validar las ausencias. ' + (error.message || error), 'error', 16000);
                return;
            }
            const config = new Map(sucursalesConfiguracionGlobal.map(x => [texto(x.nombre).toLowerCase(), x]));
            const grupos = new Map();
            casosExcluidosCorreoGlobal = [];
            const conteoExclusiones = { vacaciones: 0, permisos: 0, licencias: 0, fecha_no_verificable: 0 };
            for (let correoIdx = 0; correoIdx < datosAsistenciaGlobal.length; correoIdx++) {
                const x = datosAsistenciaGlobal[correoIdx];
                if (correoIdx % 300 === 0) { actualizarProgresoCorreos(38 + Math.round(34 * correoIdx / Math.max(1, datosAsistenciaGlobal.length)), 'Generando vista previa', 'Analizando asistencia: ' + Math.min(correoIdx + 1, datosAsistenciaGlobal.length).toLocaleString('es-CL') + ' de ' + datosAsistenciaGlobal.length.toLocaleString('es-CL') + ' registros…'); await esperarPintadoCorreo(); }
                const fechaCaso = normalizarFechaProteccionCorreo(x.fecha);
                if (!fechaCaso || fechaCaso < desde || fechaCaso > hasta) continue;
                const cfg = config.get(texto(x.sucursal).toLowerCase()) || {};
                // Los filtros de supervisores y sucursales se combinan como una unión (OR):
                // incluye las sucursales de los supervisores elegidos MÁS las sucursales
                // seleccionadas manualmente, aunque pertenezcan a otros supervisores.
                // Si no se elige nada en ninguno de los dos filtros, se incluyen todas.
                const sucursalActual = texto(x.sucursal).trim().toLocaleLowerCase('es-CL');
                const supervisorActual = texto(cfg.supervisor).trim().toLocaleLowerCase('es-CL');
                const sucursalElegida = filtroSuc.some(v => texto(v).trim().toLocaleLowerCase('es-CL') === sucursalActual);
                const supervisorElegido = filtroSup.some(v => texto(v).trim().toLocaleLowerCase('es-CL') === supervisorActual);
                if (filtroSuc.length || filtroSup.length) {
                    if (!sucursalElegida && !supervisorElegido) continue;
                }
                const detalles = [];
                if (document.getElementById('correo-t-atraso').checked && x.tiene_atraso && minutosAtraso(x.atraso) >= minimo) detalles.push(`Atraso: ${x.atraso}. Favor indicar motivo.`);
                if (document.getElementById('correo-t-temprana').checked && x.salida_temprana && x.salida_temprana !== '-') detalles.push(`Salida anticipada: ${x.salida_temprana}. Favor indicar motivo.`);
                if (document.getElementById('correo-t-sinturno').checked && x.sin_turno_marcas) detalles.push('Presenta marcas sin turno asignado. Favor aclarar la jornada realizada.');
                if (document.getElementById('correo-t-sinmarca').checked && x.sin_marca && !x.tipo_ausentismo) detalles.push('No registra marcas durante la jornada. Favor confirmar asistencia o justificar inasistencia.');
                if (!detalles.length) continue;
                const exclusion = buscarExclusionAusenciaCorreo(x, fechaCaso, proteccionAusencias);
                if (exclusion) {
                    casosExcluidosCorreoGlobal.push({ rut: normalizarRutProteccionCorreo(x.rut), nombre: x.nombre || '', fecha: fechaCaso, categoria: exclusion.categoria, mensaje: exclusion.mensaje });
                    conteoExclusiones[exclusion.categoria] = (conteoExclusiones[exclusion.categoria] || 0) + 1;
                    continue;
                }
                const clave = agrupar === 'SUPERVISOR' ? (cfg.supervisor || 'Sin supervisor') : (x.sucursal || 'Sin sucursal');
                if (!grupos.has(clave)) grupos.set(clave, []);
                grupos.get(clave).push({ ...x, fecha: fechaCaso, detalles, cfg });
            }
            actualizarProgresoCorreos(76, 'Generando vista previa', 'Agrupando incidencias y preparando borradores…');
            await esperarPintadoCorreo();
            resumenExclusionesCorreoGlobal = {
                verificada: true,
                version: VERSION_PROTECCION_AUSENCIAS_CORREO,
                periodo_desde: desde,
                periodo_hasta: hasta,
                casos_excluidos: casosExcluidosCorreoGlobal.length,
                colaboradores_excluidos: new Set(casosExcluidosCorreoGlobal.map(x => x.rut).filter(Boolean)).size,
                por_tipo: conteoExclusiones,
                fuentes_consultadas: proteccionAusencias.filasConsultadas
            };
            const esCasoSinMarca = caso => (caso.detalles || []).some(d => /no registra marcas durante la jornada/i.test(String(d)));
            let contadorBorradoresSeparados = 0;
            borradoresGeneradosGlobal = [...grupos].flatMap(([nombreGrupo, casosGrupo]) => {
                const particiones = [
                    { tipoCorreo: 'SIN_MARCAS', etiqueta: 'SOLO INEXISTENTES SIN MARCAS', casos: casosGrupo.filter(esCasoSinMarca) },
                    { tipoCorreo: 'OTRAS_INCIDENCIAS', etiqueta: 'OTRAS INCIDENCIAS DE ASISTENCIA', casos: casosGrupo.filter(x => !esCasoSinMarca(x)) }
                ].filter(p => p.casos.length);
                return particiones.map((particion, indiceParticion) => {
                    const casos = particion.casos;
                    const configs = [...new Set(casos.map(x => x.sucursal))].map(s => config.get(texto(s).toLowerCase()) || {});
                    const para = [...new Set(configs.map(x => x.correo_sucursal).filter(Boolean))].join(';');
                    const cc = [...new Set(configs.flatMap(x => texto(x.correo_copia).split(/[;,]/)).filter(Boolean))].join(';');
                    const firma = configs.map(x => x.firma_correo).find(Boolean) || '';
                    const nombre = nombreGrupo + ' · ' + particion.etiqueta;
                    const grupo = { tipo: agrupar, nombre, firma };
                    const indice = contadorBorradoresSeparados++;
                    return { id: 'borrador-' + indice + '-' + particion.tipoCorreo.toLowerCase(), tipoCorreo: particion.tipoCorreo, nombre, para, cc, asunto: `Importancia alta - ${particion.etiqueta} - ${nombreGrupo} - ${desde} a ${hasta}`, cuerpo: '', cuerpoHtml: '', cantidad: casos.length, proteccionAusenciasVerificada: true, periodoDesde: desde, periodoHasta: hasta, grupoCorreo: grupo, casosDetalle: casos.map(x => ({ fecha: x.fecha, rut: x.rut, nombre: x.nombre, sucursal: x.sucursal, detalles: x.detalles, turno: x.turno, turno_asignado: x.turno_asignado, jornada: x.jornada, horario: x.horario, entrada: x.entrada, salida: x.salida })) };
                });
            });
            actualizarProgresoCorreos(84, 'Generando vista previa', 'Vista previa preparada. Guardando el historial en la nube…');
            renderizarBorradoresMasivos();
            actualizarResumenExclusionesCorreo();
            if(borradoresGeneradosGlobal.length){
                try {
                    await guardarLoteBorradoresNube(desde,hasta,agrupar,filtroSuc,filtroSup,minimo);
                    actualizarProgresoCorreos(100, 'Vista previa lista', borradoresGeneradosGlobal.length.toLocaleString('es-CL') + ' borrador(es) preparados y guardados.', 'completado');
                    mostrarToast('Borradores verificados y guardados. Se omitieron ' + casosExcluidosCorreoGlobal.length + ' caso(s) que coincidían con vacaciones, permisos o licencias. Abrirlos en Outlook no envía el correo automáticamente.','success',12000);
                    await cargarHistorialBorradoresNube(false);
                } catch(error) {
                    actualizarProgresoCorreos(100, 'Vista previa lista con advertencia', 'No se pudo guardar el historial: ' + (error.message || 'error desconocido'), 'error');
                    mostrarToast('Los borradores están preparados en esta sesión, pero no se guardaron en la nube: '+(error.message||'error desconocido'),'warning',12000);
                }
            } else {
                await cargarHistorialBorradoresNube(false);
                actualizarProgresoCorreos(100, 'Vista previa finalizada', 'No se encontraron casos que cumplan los filtros.', 'completado');
            }
        }
        function renderizarBorradoresMasivos() {
            const cont = document.getElementById('lista-borradores');
            const resumen=document.getElementById('correo-resumen-resultados');
            if(resumen)resumen.classList.remove('hidden');
            const casos=borradoresGeneradosGlobal.reduce((n,b)=>n+Number(b.cantidad||0),0);
            document.getElementById('correo-resumen-borradores').textContent=borradoresGeneradosGlobal.length.toLocaleString('es-CL');
            document.getElementById('correo-resumen-casos').textContent=casos.toLocaleString('es-CL');
            document.getElementById('correo-resumen-sin-destino').textContent=borradoresGeneradosGlobal.filter(b=>!b.para).length.toLocaleString('es-CL');
            actualizarResumenExclusionesCorreo();
            if (!borradoresGeneradosGlobal.length) { cont.innerHTML = '<div class="ui-card p-6 text-center text-slate-500"><i data-lucide="circle-check" class="mx-auto mb-2 h-8 w-8 text-emerald-600"></i><b>No se encontraron casos</b><p class="mt-1 text-sm">Prueba ampliar el período o revisar los filtros de sucursal y tipo de incidencia.</p></div>';if(window.lucide)lucide.createIcons();return; }
            const renderTarjeta = b => `<div class="ui-card mail-card p-5"><div class="flex flex-wrap items-start justify-between gap-3"><label class="flex items-start gap-3"><input type="checkbox" class="borrador-check mt-1" data-tipo-correo="${b.tipoCorreo||'OTRAS_INCIDENCIAS'}" value="${b.id}" checked><span><b class="text-base">${escaparHTML(b.nombre)}</b><br><span class="text-xs text-slate-500">${b.cantidad} caso(s)</span>${b.proteccionAusenciasVerificada ? '<span class="mt-1 block text-xs font-bold text-emerald-700">Ausencias verificadas</span>' : '<span class="mt-1 block text-xs font-bold text-rose-700">HISTÓRICO SIN VALIDAR · vuelve a generar</span>'}<span class="mt-2 block text-xs ${b.para?'text-emerald-700':'font-bold text-rose-700'}">${b.para?'Para: '+escaparHTML(b.para):'Falta configurar correo destinatario'}${b.cc?' · CC: '+escaparHTML(b.cc):''}</span></span></label><button onclick="descargarUnBorradorOutlook('${b.id}')" ${b.proteccionAusenciasVerificada ? '' : 'disabled aria-disabled="true" title="Vuelve a generar este borrador para validar las ausencias"'} class="corp-button"><i data-lucide="mail" class="mr-1 inline h-4 w-4"></i>Preparar correo separado</button></div><div class="mt-3 rounded-lg bg-slate-50 p-3 text-xs"><b>Asunto:</b> ${escaparHTML(b.asunto)}</div><details class="mt-3" ontoggle="if(this.open)mostrarContenidoBorrador('${b.id}')"><summary class="cursor-pointer text-xs font-bold text-slate-600">Ver contenido completo del correo</summary><div id="contenido-borrador-${b.id}" class="mt-2 overflow-auto rounded-lg border bg-white p-3 text-xs text-slate-500">La vista previa se generará al abrir esta sección.</div></details></div>`;
            const sinMarcas=borradoresGeneradosGlobal.filter(b=>b.tipoCorreo==='SIN_MARCAS');
            const otras=borradoresGeneradosGlobal.filter(b=>b.tipoCorreo!=='SIN_MARCAS');
            const bloque=(titulo,desc,lista,tipo,color)=>`<section class="space-y-3 rounded-xl border ${color} p-4"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-extrabold text-slate-900">${titulo}</h3><p class="mt-1 text-xs text-slate-600">${desc}</p><p class="mt-1 text-xs font-bold">${lista.reduce((n,b)=>n+Number(b.cantidad||0),0)} caso(s) · ${lista.length} correo(s)</p></div><div class="flex flex-wrap gap-2"><button type="button" onclick="seleccionarTipoBorradores('${tipo}',true)" class="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Seleccionar sección</button><button type="button" onclick="descargarTipoBorradores('${tipo}')" class="corp-button">${tipo==='SIN_MARCAS'?'Descargar ZIP solo sin marcas':'Descargar ZIP otras incidencias'}</button></div></div><details class="rounded-lg border border-white bg-white/80 p-3"><summary class="cursor-pointer text-sm font-bold text-slate-700">Ver los ${lista.length} correos de esta sección</summary><div class="mt-3 space-y-3">${lista.length?lista.map(renderTarjeta).join(''):'<div class="rounded-lg border border-dashed bg-white p-5 text-center text-sm text-slate-500">No hay casos para esta sección en el período seleccionado.</div>'}</div></details></section>`;
            cont.innerHTML=bloque('1. Inexistentes / sin marcas','Correo exclusivo para colaboradores que no registran ninguna marca durante la jornada. No mezcla atrasos ni otras incidencias.',sinMarcas,'SIN_MARCAS','border-rose-200 bg-rose-50/40')+bloque('2. Otras incidencias de asistencia','Correos independientes para atrasos, salidas anticipadas y marcas sin turno. Los casos sin marcas no se incluyen aquí.',otras,'OTRAS_INCIDENCIAS','border-sky-200 bg-sky-50/40');
            if(window.lucide)lucide.createIcons();
        }
        function mostrarContenidoBorrador(id) {
            const cont = document.getElementById('contenido-borrador-' + id);
            const b = borradoresGeneradosGlobal.find(x => x.id === id);
            if (!cont || !b || cont.dataset.generado === '1') return;
            cont.textContent = 'Preparando vista previa…';
            // Construye las tablas solo cuando la persona abre un correo, no para cientos de tarjetas a la vez.
            b.cuerpo = b.cuerpo || crearCuerpoCorreo(b.grupoCorreo, b.casosDetalle || [], b.periodoDesde, b.periodoHasta);
            b.cuerpoHtml = b.cuerpoHtml || crearCuerpoCorreoHTML(b.grupoCorreo, b.casosDetalle || [], b.periodoDesde, b.periodoHasta);
            cont.innerHTML = b.cuerpoHtml;
            cont.dataset.generado = '1';
        }
        function seleccionarTipoBorradores(tipo, valor) {
            document.querySelectorAll('.borrador-check[data-tipo-correo]').forEach(x => { if (x.dataset.tipoCorreo === tipo) x.checked = valor; });
        }
        async function descargarTipoBorradores(tipo) {
            if (!puedePrepararCorreosActual()) return mostrarToast('No tienes autorización para descargar borradores.', 'warning');
            const elegidos = borradoresGeneradosGlobal.filter(b => (b.tipoCorreo || 'OTRAS_INCIDENCIAS') === tipo);
            if (!elegidos.length) return mostrarToast('No hay correos para descargar en esta sección.', 'warning');
            try {
                actualizarProgresoCorreos(3, 'Preparando ZIP', 'Validando los borradores seleccionados…');
                await esperarPintadoCorreo();
                const list = await revalidarBorradoresAntesDeExportar(elegidos);
                if (!list.length) { actualizarProgresoCorreos(100, 'ZIP no generado', 'No quedaron borradores válidos después de revalidar ausencias.', 'error'); return; }
                if (!window.JSZip) { actualizarProgresoCorreos(100, 'ZIP no generado', 'No se pudo cargar el generador ZIP. Recarga la página.', 'error'); return mostrarToast('No se pudo cargar el generador ZIP. Recarga la página.', 'error'); }
                const zip = new JSZip(), folder = zip.folder(tipo === 'SIN_MARCAS' ? 'Correos_Solo_Sin_Marcas' : 'Correos_Otras_Incidencias');
                list.forEach((b, i) => {
                    const slug = String(b.nombre || 'Correo_' + (i + 1)).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'Correo_' + (i + 1);
                    folder.file(String(i + 1).padStart(3, '0') + '_' + slug + '.eml', crearEmlOutlook(b));
                });
                zip.file('LEEME.txt', 'Correos separados por categoría. Son borradores EML para Outlook; no se envían automáticamente. Revise destinatarios y contenido antes de pulsar Enviar.');
                const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE'});
                const url = URL.createObjectURL(blob), a = document.createElement('a');
                a.href=url; a.download=(tipo === 'SIN_MARCAS' ? 'Correos_Solo_Sin_Marcas_' : 'Correos_Otras_Incidencias_')+fechaActualChileISO()+'.zip';
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
                mostrarToast('Se descargaron '+list.length+' correos separados para esta sección. No se enviaron automáticamente.','success',10000);
            } catch(error) { mostrarToast(error.message || 'No se pudo preparar el ZIP de esta sección.','error',14000); }
        }
        function seleccionarTodosBorradores(valor) {
            document.querySelectorAll('.borrador-check').forEach(x => x.checked = valor);
        }
        function urlOutlookBorrador(b) {
            // mailto: entrega el borrador al cliente de correo predeterminado de Windows.
            // Si Outlook escritorio está configurado como aplicación predeterminada, se abrirá allí.
            return `mailto:${encodeURIComponent(b.para||'')}?cc=${encodeURIComponent(b.cc||'')}&subject=${encodeURIComponent(b.asunto||'')}&body=${encodeURIComponent(b.cuerpo||'')}`;
        }
        async function abrirUnBorrador(id) {
            if (!puedePrepararCorreosActual()) return mostrarToast('No tienes autorización para preparar correos.', 'warning');
            const b = borradoresGeneradosGlobal.find(x => x.id === id);
            if (!b || !borradorTieneProteccionAusencias(b)) return;
            try {
                const listos = await revalidarBorradoresAntesDeExportar([b]);
                const actualizado = listos.find(x => x.id === id);
                if (actualizado) window.open(urlOutlookBorrador(actualizado), '_blank', 'noopener');
            } catch (error) {
                mostrarToast(error.message || 'No se pudo volver a validar el borrador.', 'error', 14000);
            }
        }
        async function descargarUnBorradorOutlook(id) {
            if (!puedePrepararCorreosActual()) return mostrarToast('No tienes autorización para descargar borradores.', 'warning');
            const b = borradoresGeneradosGlobal.find(x => x.id === id);
            if (!b || !borradorTieneProteccionAusencias(b)) return;
            try {
                const listos = await revalidarBorradoresAntesDeExportar([b]);
                const actualizado = listos.find(x => x.id === id);
                if (!actualizado) return;
                const blob = new Blob([crearEmlOutlook(actualizado)], { type: 'message/rfc822;charset=utf-8' });
                const url = URL.createObjectURL(blob), a = document.createElement('a');
                const slug = String(actualizado.nombre || 'Borrador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'Borrador';
                a.href = url; a.download = 'Correo_Asistencia_' + slug + '.eml';
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
                mostrarToast('Borrador revalidado contra las ausencias actuales y descargado. Revisa el destinatario antes de enviarlo.', 'success', 10000);
            } catch (error) {
                mostrarToast(error.message || 'No se pudo volver a validar el borrador.', 'error', 14000);
            }
        }

        function textoMimeBase64(value) {
            const bytes = new TextEncoder().encode(String(value || ''));
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return btoa(binary);
        }
        function plegarBase64Mime(value) {
            return String(value || '').match(/.{1,76}/g)?.join('\r\n') || '';
        }
        function asuntoMimeUTF8(value) {
            const words = []; let part = '';
            for (const char of String(value || '')) {
                const candidate = part + char;
                if (part && 12 + textoMimeBase64(candidate).length > 75) {
                    words.push('=?UTF-8?B?' + textoMimeBase64(part) + '?='); part = char;
                } else part = candidate;
            }
            if (part) words.push('=?UTF-8?B?' + textoMimeBase64(part) + '?=');
            return words.join('\r\n ');
        }
        function crearEmlOutlook(b) {
            const safe = v => String(v || '').replace(/[\r\n]+/g, ' ').trim();
            const subject = asuntoMimeUTF8(safe(b.asunto));
            const boundary = '----=_DoctorSimi_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
            const plain = plegarBase64Mime(textoMimeBase64(String(b.cuerpo || '')));
            const html = plegarBase64Mime(textoMimeBase64(b.cuerpoHtml || ('<html><body><pre>' + escaparHTML(b.cuerpo || '') + '</pre></body></html>')));
            return 'To: ' + safe(b.para) + '\r\n' +
                (safe(b.cc) ? 'Cc: ' + safe(b.cc) + '\r\n' : '') +
                'Subject: ' + subject + '\r\n' +
                'MIME-Version: 1.0\r\nX-Unsent: 1\r\n' +
                'Content-Type: multipart/alternative; boundary="' + boundary + '"\r\n\r\n' +
                '--' + boundary + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + plain + '\r\n' +
                '--' + boundary + '\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + html + '\r\n' +
                '--' + boundary + '--\r\n';
        }
        async function descargarBorradoresOutlookZip() {
            if (!puedePrepararCorreosActual()) return mostrarToast('No tienes autorización para descargar borradores.', 'warning');
            const ids = [...document.querySelectorAll('.borrador-check:checked')].map(x => x.value);
            const elegidos = borradoresGeneradosGlobal.filter(x => ids.includes(x.id));
            if (!elegidos.length) return mostrarToast('Selecciona uno o más borradores antes de descargar el ZIP.', 'warning');
            try {
                const list = await revalidarBorradoresAntesDeExportar(elegidos);
                if (!list.length) { actualizarProgresoCorreos(100, 'ZIP no generado', 'No quedaron borradores válidos después de revalidar ausencias.', 'error'); return; }
                if (!window.JSZip) { actualizarProgresoCorreos(100, 'ZIP no generado', 'No se pudo cargar el generador ZIP. Recarga la página.', 'error'); return mostrarToast('No se pudo cargar el generador ZIP. Recarga la página.', 'error'); }
                const zip = new JSZip(), folder = zip.folder('Borradores_Outlook');
                for (let i = 0; i < list.length; i++) {
                    const b = list[i];
                    const slug = String(b.nombre || 'Correo_' + (i + 1)).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'Correo_' + (i + 1);
                    folder.file(String(i + 1).padStart(3, '0') + '_' + slug + '.eml', crearEmlOutlook(b));
                    const pct = 38 + Math.round(((i + 1) / list.length) * 25);
                    actualizarProgresoCorreos(pct, 'Preparando archivos EML', 'Archivo ' + (i + 1).toLocaleString('es-CL') + ' de ' + list.length.toLocaleString('es-CL') + ' preparado.');
                    await esperarPintadoCorreo();
                }
                zip.file('LEEME.txt', 'Borradores para Outlook de escritorio. Extrae el ZIP, abre los archivos .eml con Outlook, revisa destinatarios y contenido y pulsa Enviar. No se envían automáticamente. Los casos se revalidaron contra las ausencias actuales antes de crear este paquete.');
                actualizarProgresoCorreos(65, 'Comprimiendo ZIP', list.length.toLocaleString('es-CL') + ' archivo(s) preparados. Comprimiendo…');
                await esperarPintadoCorreo();
                const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, metadata => {
                    const real = Math.round(Number(metadata.percent) || 0);
                    actualizarProgresoCorreos(65 + Math.round(real * 0.32), 'Comprimiendo ZIP', 'Compresión real: ' + real + '% · ' + list.length.toLocaleString('es-CL') + ' borrador(es).');
                });
                const url = URL.createObjectURL(blob), a = document.createElement('a');
                a.href = url; a.download = 'Borradores_Outlook_' + fechaActualChileISO() + '.zip';
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
                actualizarProgresoCorreos(100, 'ZIP listo para descargar', list.length.toLocaleString('es-CL') + ' borrador(es) comprimidos. La descarga se inició en el navegador.', 'completado');
                await esperarPintadoCorreo();
                mostrarToast('ZIP revalidado: ' + list.length + ' borrador(es) descargados después de excluir ausencias actuales.', 'success', 10000);
            } catch (error) {
                actualizarProgresoCorreos(100, 'No se pudo generar el ZIP', error.message || 'Error desconocido', 'error');
                mostrarToast(error.message || 'No se pudo volver a validar el paquete de correos.', 'error', 14000);
            }
        }
        async function abrirBorradoresMasivos() {
            if(!puedePrepararCorreosActual())return mostrarToast('No tienes autorización para descargar borradores.','warning');
            // mailto no admite HTML; descargar EML en ZIP conserva la tabla corporativa en Outlook.
            return descargarBorradoresOutlookZip();
        }


        async function prepararConfiguracionCorreos() {
            sucursalesConfiguracionGlobal = await obtenerSucursalesConfig();
            renderizarConfigCorreos();
        }
        function renderizarConfigCorreos() {
            const q = texto(document.getElementById('config-correo-buscar')?.value).toLowerCase();
            const lista = sucursalesConfiguracionGlobal.filter(x => `${x.nombre} ${x.supervisor || ''}`.toLowerCase().includes(q));
            const resumen = document.getElementById('config-correo-resumen');
            if (resumen) resumen.textContent = `${lista.length} sucursal(es) visibles · ${lista.filter(x => x.correo_sucursal).length} con correo principal configurado · ${lista.filter(x => !x.correo_sucursal).length} sin correo principal`;
            const cont = document.getElementById('tabla-config-correos');
            if (!lista.length) { cont.innerHTML = '<div class="ui-card p-8 text-center text-sm text-slate-500">No hay sucursales que coincidan con la búsqueda.</div>'; return; }
            cont.innerHTML = lista.map(x => `<article class="config-sucursal-card" data-id="${escaparHTML(x.id)}">
                <div class="mb-4 flex items-start justify-between gap-3"><div><h4 class="font-extrabold text-slate-900">${escaparHTML(x.nombre)}</h4><p class="mt-1 text-xs text-slate-500">Supervisor: ${escaparHTML(x.supervisor || 'Sin asignar')}</p></div><span class="rounded-full px-2.5 py-1 text-[11px] font-bold ${x.correo_sucursal ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}">${x.correo_sucursal ? 'Correo configurado' : 'Falta correo'}</span></div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2"><label class="text-xs font-bold text-slate-600">Supervisor<input data-campo="supervisor" class="form-field mt-1" value="${escaparHTML(x.supervisor || '')}" placeholder="Nombre del supervisor"></label><label class="text-xs font-bold text-slate-600">Correo principal<input data-campo="correo_sucursal" type="email" class="form-field mt-1" value="${escaparHTML(x.correo_sucursal || '')}" placeholder="sucursal@empresa.cl"></label><label class="text-xs font-bold text-slate-600 sm:col-span-2">Copias (CC)<input data-campo="correo_copia" class="form-field mt-1" value="${escaparHTML(x.correo_copia || '')}" placeholder="correo1@empresa.cl; correo2@empresa.cl"><span class="mt-1 block font-normal text-slate-400">Separa varios correos con punto y coma.</span></label><label class="text-xs font-bold text-slate-600">Hora de apertura<input data-campo="horario_apertura" type="time" class="form-field mt-1" value="${escaparHTML(x.horario_apertura || '')}"></label><label class="text-xs font-bold text-slate-600">Hora de cierre<input data-campo="horario_cierre" type="time" class="form-field mt-1" value="${escaparHTML(x.horario_cierre || '')}"></label><label class="text-xs font-bold text-slate-600 sm:col-span-2">Firma institucional<textarea data-campo="firma_correo" class="form-field mt-1" rows="3">${escaparHTML(x.firma_correo || 'Saludos cordiales,\nDepartamento de Recursos Humanos\nFarmacias de Similares Chile S.A.\nRUT: 59.111.330-5')}</textarea></label></div>
            </article>`).join('');
        }
        async function guardarConfigCorreosVisibles() {
            const tarjetas = [...document.querySelectorAll('#tabla-config-correos [data-id]')];
            if (!tarjetas.length) return mostrarToast('No hay sucursales visibles para guardar.', 'warning');
            for (const tarjeta of tarjetas) {
                const cambios = {};
                tarjeta.querySelectorAll('[data-campo]').forEach(x => cambios[x.dataset.campo] = x.value.trim());
                const correo = cambios.correo_sucursal || '';
                if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return mostrarToast(`Revisa el correo principal de ${tarjeta.querySelector('h4')?.textContent || 'la sucursal'}.`, 'warning');
                const { error } = await _supabase.from('sucursales').update(cambios).eq('id', tarjeta.dataset.id);
                if (error) return mostrarToast(error.message, 'error');
            }
            await prepararConfiguracionCorreos();
            mostrarToast('Configuración de las sucursales visibles guardada.', 'success');
        }
        function descargarPlantillaCorreosSucursales() {
            const datos = sucursalesConfiguracionGlobal.map(x => ({ nombre: x.nombre, supervisor: x.supervisor || '', correo_sucursal: x.correo_sucursal || '', correo_copia: x.correo_copia || '', horario_apertura: x.horario_apertura || '', horario_cierre: x.horario_cierre || '', firma_correo: x.firma_correo || 'Saludos cordiales, Departamento de Recursos Humanos, Farmacias de Similares Chile S.A., RUT: 59.111.330-5' }));
            const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(datos);
            XLSX.utils.book_append_sheet(wb, ws, 'Correos sucursales');
            XLSX.writeFile(wb, 'Plantilla_correos_sucursales.xlsx');
        }
        async function importarCorreosSucursales(event) {
            const archivo = event.target.files?.[0];
            if (!archivo) return;
            // Normaliza espacios invisibles y caracteres de formato que Excel puede conservar al copiar/pegar.
            const limpiarTexto = valor => String(valor ?? '').replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
            const normalizar = valor => limpiarTexto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
            const limpiarCorreo = valor => limpiarTexto(valor).normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/^[;,\s]+|[;,\s]+$/g, '').trim();
            const correoValido = valor => {
                const correo = limpiarCorreo(valor);
                // Validación compatible con direcciones habituales corporativas, sin rechazar por mayúsculas.
                return !!correo && /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\].]{2,}$/.test(correo);
            };
            try {
                const filas = await leerExcel(archivo);
                if (!filas.length) throw new Error('El Excel no contiene filas para importar.');
                const existentes = await obtenerSucursalesConfig();
                const porNombre = new Map(existentes.map(x => [normalizar(x.nombre), x]));
                const pendientes = [];
                const noEncontradas = [];
                const correosInvalidos = [];
                for (const f of filas) {
                    const nombre = limpiarTexto(obtenerCampo(f, ['nombre', 'Sucursal', 'Nombre Sucursal', 'Nombre de sucursal']));
                    if (!nombre) continue;
                    const sucursal = porNombre.get(normalizar(nombre));
                    if (!sucursal) { noEncontradas.push(nombre); continue; }
                    const correoPrincipal = limpiarCorreo(obtenerCampo(f, ['correo_sucursal', 'Correo Sucursal', 'Correo principal', 'Correo Principal', 'Email']));
                    const correoCopia = limpiarTexto(obtenerCampo(f, ['correo_copia', 'Correo Copia', 'Copias (CC)', 'CC']));
                    const correosCC = correoCopia.split(/[;,]+/).map(limpiarCorreo).filter(Boolean);
                    const ccInvalidos = correosCC.filter(c => !correoValido(c));
                    if (correoPrincipal && !correoValido(correoPrincipal)) {
                        correosInvalidos.push(nombre + ': correo principal "' + correoPrincipal + '"');
                        continue;
                    }
                    if (ccInvalidos.length) {
                        correosInvalidos.push(nombre + ': copia(s) inválida(s) "' + ccInvalidos.join(', ') + '"');
                        continue;
                    }
                    const cambios = {
                        supervisor: limpiarTexto(obtenerCampo(f, ['supervisor', 'Supervisor'])) || sucursal.supervisor || '',
                        correo_sucursal: correoPrincipal,
                        correo_copia: correosCC.join('; '),
                        horario_apertura: limpiarTexto(obtenerCampo(f, ['horario_apertura', 'Horario Apertura', 'Hora de apertura'])) || sucursal.horario_apertura || '',
                        horario_cierre: limpiarTexto(obtenerCampo(f, ['horario_cierre', 'Horario Cierre', 'Hora de cierre'])) || sucursal.horario_cierre || '',
                        firma_correo: limpiarTexto(obtenerCampo(f, ['firma_correo', 'Firma Correo', 'Firma institucional'])) || sucursal.firma_correo || 'Saludos cordiales,\nDepartamento de Recursos Humanos\nFarmacias de Similares Chile S.A.\nRUT: 59.111.330-5'
                    };
                    pendientes.push({ id: sucursal.id, nombre: sucursal.nombre, cambios });
                }
                if (correosInvalidos.length) {
                    throw new Error('Se detectaron correos inválidos. No se guardó ningún cambio. Revisa: ' + correosInvalidos.slice(0, 5).join(' | ') + (correosInvalidos.length > 5 ? ' | y ' + (correosInvalidos.length - 5) + ' más.' : ''));
                }
                if (!pendientes.length) throw new Error('No se encontró ninguna sucursal coincidente. Verifica la columna de nombre y que corresponda a las sucursales cargadas en el sistema.');
                let actualizadas = 0;
                for (let i = 0; i < pendientes.length; i += 10) {
                    const lote = pendientes.slice(i, i + 10);
                    const resultados = await Promise.all(lote.map(async item => {
                        const { error } = await _supabase.from('sucursales').update(item.cambios).eq('id', item.id);
                        if (error) throw new Error(item.nombre + ': ' + error.message);
                        return item.nombre;
                    }));
                    actualizadas += resultados.length;
                }
                await prepararConfiguracionCorreos();
                await registrarActualizacionFuente('config_correos', archivo.name || 'Plantilla de correos', actualizadas, 'manual');
                const resumen = 'Importación completada: ' + actualizadas + ' sucursales actualizadas.' + (noEncontradas.length ? ' No encontradas: ' + noEncontradas.length + ' (' + noEncontradas.slice(0, 8).join(', ') + (noEncontradas.length > 8 ? '…' : '') + ').' : '');
                mostrarToast(resumen, noEncontradas.length ? 'warning' : 'success', 10000);
            } catch (e) {
                console.error('Importar correos de sucursales:', e);
                mostrarToast('No se pudo importar el Excel: ' + (e.message || 'Error desconocido'), 'error', 15000);
            } finally {
                event.target.value = '';
            }
        }
        window.filtrarSucursalesMapa14 = function(tipo) {
            const input = document.getElementById(tipo === 'origen' ? 'map14-buscar-origen' : 'map14-buscar-destino');
            const select = document.getElementById(tipo === 'origen' ? 'map14-origen' : 'map14-destino');
            if (!input || !select) return;
            const q = input.value.trim().toLocaleLowerCase('es-CL');
            let visibles = 0;
            Array.from(select.options).forEach((op, i) => {
                if (i === 0) { op.hidden = false; return; }
                const match = !q || op.textContent.toLocaleLowerCase('es-CL').includes(q) || String(op.dataset.direccion||'').toLocaleLowerCase('es-CL').includes(q);
                op.hidden = !match;
                if (match) visibles++;
            });
            if (q && visibles === 1) {
                const op = Array.from(select.options).find((x,i)=>i>0&&!x.hidden);
                if (op) select.value = op.value;
            }
        }

        function coordenadasSucursalMapa(x) {
            const lat=Number(x?.latitud),lon=Number(x?.longitud);
            if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&(lat!==0||lon!==0))return {lat,lon};
            const raw=String(x?.geolocalizacion||'').trim().replace(/[()]/g,'');
            const m=raw.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
            if(m){const a=Number(m[1]),b=Number(m[2]);if(Math.abs(a)<=90&&Math.abs(b)<=180&&(a!==0||b!==0))return {lat:a,lon:b};}
            return null;
        }
        function puntoMapaSucursal(x) { const p=coordenadasSucursalMapa(x);return p?`${p.lat},${p.lon}`:direccionSucursal(x); }
        let mapa14Leaflet = null;
        let mapa14Marcadores = null;
        let mapa14Ruta = null;
        let mapa14Sucursales = [];

        function marcadorFarmaciaMapa14(sucursal, punto) {
            const marker=L.marker([punto.lat,punto.lon]).bindPopup(
                '<strong>'+escaparHTML(sucursal.nombre)+'</strong><br>'+
                escaparHTML([sucursal.direccion,sucursal.comuna].filter(Boolean).join(', '))+
                '<br><small>'+escaparHTML(sucursal.supervisor||'Supervisor no asignado')+'</small>'
            );
            marker.addTo(mapa14Marcadores);
            return marker;
        }
        function pintarMarcadoresMapa14(lista, ajustarVista=true) {
            if(!mapa14Leaflet||!mapa14Marcadores)return;
            mapa14Marcadores.clearLayers();
            const conGps=(lista||[]).map(x=>({sucursal:x,punto:coordenadasSucursalMapa(x)})).filter(x=>x.punto);
            conGps.forEach(({sucursal,punto})=>marcadorFarmaciaMapa14(sucursal,punto));
            if(ajustarVista&&conGps.length){
                const bounds=L.latLngBounds(conGps.map(x=>[x.punto.lat,x.punto.lon]));
                mapa14Leaflet.fitBounds(bounds,{padding:[28,28],maxZoom:11,animate:false});
            }else if(ajustarVista&&!conGps.length)mapa14Leaflet.setView([-33.45,-70.66],5);
            return conGps.length;
        }
        function marcarSoloPuntosRutaMapa14(puntos) {
            if(!mapa14Marcadores)return;
            mapa14Marcadores.clearLayers();
            (puntos||[]).forEach(p=>{
                if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||(p.lat===0&&p.lon===0))return;
                const sucursal=mapa14Sucursales.find(x=>String(x.id||'')===String(p.id||''))||{nombre:p.nombre,direccion:p.direccion,comuna:p.comuna,supervisor:''};
                marcadorFarmaciaMapa14(sucursal,{lat:p.lat,lon:p.lon});
            });
        }
        function inicializarMapa14(lista = mapa14Sucursales) {
            const host=document.getElementById('mapa14-frame'),status=document.getElementById('mapa14-status');
            if(!host||!window.L){if(status)status.textContent='No se pudo cargar el mapa interactivo. Los enlaces a Google Maps siguen disponibles.';return;}
            if(!mapa14Leaflet){
                mapa14Leaflet=L.map(host,{scrollWheelZoom:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,inertia:false}).setView([-33.45,-70.66],5);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(mapa14Leaflet);
                mapa14Marcadores=L.layerGroup().addTo(mapa14Leaflet);
                setTimeout(()=>mapa14Leaflet&&mapa14Leaflet.invalidateSize(),200);
            }
            if(mapa14Ruta){mapa14Leaflet.removeLayer(mapa14Ruta);mapa14Ruta=null;}
            const count=pintarMarcadoresMapa14(lista,true);
            const visibleGps=Number(count||0);
            const total=lista.length;
            if(status)status.textContent=visibleGps+' farmacia(s) con coordenadas en el mapa'+(total-visibleGps?' · '+(total-visibleGps)+' sin GPS registrado':'')+'. Al consultar una ruta se mostrarán solo el origen y el destino; usa “Mostrar todas las farmacias” para limpiar el filtro.';
            setTimeout(()=>mapa14Leaflet&&mapa14Leaflet.invalidateSize(),150);
        }
        function restaurarMapa14() {
            if(mapa14Ruta&&mapa14Leaflet){mapa14Leaflet.removeLayer(mapa14Ruta);mapa14Ruta=null;}
            ['origen','destino'].forEach(tipo=>{
                const buscar=document.getElementById(tipo==='origen'?'map14-buscar-origen':'map14-buscar-destino');
                const select=document.getElementById(tipo==='origen'?'map14-origen':'map14-destino');
                if(buscar)buscar.value='';
                renderOpcionesMapa14(tipo,'');
                if(select)select.value='';
            });
            const frame=document.getElementById('mapa14-frame');
            if(frame)frame.dataset.rutaCargada='0';
            pintarMarcadoresMapa14(mapa14Sucursales,true);
            const status=document.getElementById('mapa14-status');
            if(status)status.textContent='Mostrando todas las farmacias disponibles. Selecciona un origen y destino para filtrar el mapa y consultar la ruta vial.';
            const resumen=document.getElementById('mapa14-resumen');if(resumen)resumen.textContent='Selecciona origen, destino y medio de transporte.';
            const link=document.getElementById('mapa14-externo');if(link)link.classList.add('hidden');
            const stats=document.getElementById('mapa14-estadisticas');if(stats)stats.classList.add('hidden');
            const steps=document.getElementById('mapa14-pasos');if(steps){steps.classList.add('hidden');steps.innerHTML='';}
            const distancia=document.getElementById('mapa14-distancia');if(distancia)distancia.textContent='—';
            const tiempo=document.getElementById('mapa14-tiempo');if(tiempo)tiempo.textContent='—';
            const puntos=document.getElementById('mapa14-puntos');if(puntos)puntos.textContent=String(mapa14Sucursales.filter(x=>coordenadasSucursalMapa(x)).length);
            if(window.lucide)lucide.createIcons();
        }
        function renderOpcionesMapa14(tipo, query = '') {
            const select = document.getElementById(tipo === 'origen' ? 'map14-origen' : 'map14-destino');
            if (!select) return;
            const previous = select.value;
            const q = String(query || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
            const rows = mapa14Sucursales.filter(x => !q || [x.nombre,x.comuna,x.direccion,x.unidad].join(' ').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().includes(q));
            select.innerHTML = '<option value="">Selecciona sucursal</option>' + rows.map(x => {
                const p = coordenadasSucursalMapa(x);
                return `<option value="${escaparHTML(puntoMapaSucursal(x))}" data-id="${escaparHTML(x.id||'')}" data-nombre="${escaparHTML(x.nombre)}" data-direccion="${escaparHTML(x.direccion||'')}" data-comuna="${escaparHTML(x.comuna||'')}" data-lat="${escaparHTML(p?.lat??'')}" data-lon="${escaparHTML(p?.lon??'')}">${escaparHTML(x.nombre)}${x.comuna ? ' · '+escaparHTML(x.comuna) : ''}${p ? ' · GPS' : ''}</option>`;
            }).join('');
            if ([...select.options].some(o => o.value === previous)) select.value = previous;
        }

        async function prepararMapa14() {
            mapa14Sucursales = await obtenerSucursalesConfig();
            renderOpcionesMapa14('origen', document.getElementById('map14-buscar-origen')?.value || '');
            renderOpcionesMapa14('destino', document.getElementById('map14-buscar-destino')?.value || '');
            if(document.getElementById('map14-buscar-origen'))document.getElementById('map14-buscar-origen').oninput=e=>renderOpcionesMapa14('origen',e.target.value);
            if(document.getElementById('map14-buscar-destino'))document.getElementById('map14-buscar-destino').oninput=e=>renderOpcionesMapa14('destino',e.target.value);
            inicializarMapa14(mapa14Sucursales);
            if (window.lucide) lucide.createIcons();
        }
        async function mostrarRutaMapa14() {
            const selOrigen=document.getElementById('map14-origen'),selDestino=document.getElementById('map14-destino');
            const origen=selOrigen?.value||'',destino=selDestino?.value||'',modo=document.getElementById('map14-modo')?.value||'d';
            const opt1=selOrigen?.selectedOptions?.[0],opt2=selDestino?.selectedOptions?.[0];
            const nombreOrigen=opt1?.dataset.nombre||opt1?.textContent||origen;
            const nombreDestino=opt2?.dataset.nombre||opt2?.textContent||destino;
            if(!origen||!destino)return mostrarToast('Selecciona una sucursal de origen y otra de destino.','warning');
            if(origen===destino)return mostrarToast('El origen y el destino deben ser diferentes.','warning');
            const travelmode=modo==='w'?'walking':modo==='r'?'transit':'driving';
            const externo='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(origen)+'&destination='+encodeURIComponent(destino)+'&travelmode='+travelmode;
            const frame=document.getElementById('mapa14-frame');
            if(frame){frame.dataset.rutaCargada='1';frame.setAttribute('title','Mapa de ruta: '+nombreOrigen+' a '+nombreDestino);}
            const enlace=document.getElementById('mapa14-externo');
            if(enlace){enlace.href=externo;enlace.classList.remove('hidden');}
            const fallback=document.getElementById('mapa14-fallback-link');if(fallback)fallback.href=externo;
            const modoTexto=modo==='w'?'Caminando':modo==='r'?'Transporte público':'Auto';
            const resumen=document.getElementById('mapa14-resumen');if(resumen)resumen.textContent=nombreOrigen+' → '+nombreDestino+' · '+modoTexto;
            const status=document.getElementById('mapa14-status');if(status)status.textContent='Filtrando el mapa a las dos farmacias seleccionadas…';
            if(mapa14Ruta&&mapa14Leaflet){mapa14Leaflet.removeLayer(mapa14Ruta);mapa14Ruta=null;}
            const p1={id:opt1?.dataset.id||'',nombre:nombreOrigen,direccion:opt1?.dataset.direccion||'',comuna:opt1?.dataset.comuna||'',lat:Number(opt1?.dataset.lat),lon:Number(opt1?.dataset.lon)};
            const p2={id:opt2?.dataset.id||'',nombre:nombreDestino,direccion:opt2?.dataset.direccion||'',comuna:opt2?.dataset.comuna||'',lat:Number(opt2?.dataset.lat),lon:Number(opt2?.dataset.lon)};
            const validPoint=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&(p.lat!==0||p.lon!==0);
            const puntos=[p1,p2].filter(validPoint);
            marcarSoloPuntosRutaMapa14(puntos);
            const stats=document.getElementById('mapa14-estadisticas');
            const stepsHost=document.getElementById('mapa14-pasos');
            const distanceEl=document.getElementById('mapa14-distancia'),timeEl=document.getElementById('mapa14-tiempo'),pointsEl=document.getElementById('mapa14-puntos');
            if(pointsEl)pointsEl.textContent=String(puntos.length);
            if(stats)stats.classList.add('hidden');
            if(stepsHost){stepsHost.classList.add('hidden');stepsHost.innerHTML='';}
            if(puntos.length&&mapa14Leaflet){
                const bounds=L.latLngBounds(puntos.map(p=>[p.lat,p.lon]));
                mapa14Leaflet.fitBounds(bounds,{padding:[40,40],maxZoom:12,animate:false});
            }
            if(!validPoint(p1)||!validPoint(p2)){
                if(status)status.textContent='El mapa muestra solo las ubicaciones seleccionadas. Falta GPS en una de ellas; usa Google Maps para obtener el recorrido vial.';
                mostrarToast('Una o ambas sucursales no tienen coordenadas GPS. Se abrirá la ruta en Google Maps.','warning');
                if(window.lucide)lucide.createIcons();
                return;
            }
            if(modo!=='d'){
                if(status)status.textContent='El mapa muestra solo origen y destino. Para obtener el trazado exacto '+(modo==='w'?'a pie':'en transporte público')+', abre Google Maps con el modo seleccionado.';
                if(window.lucide)lucide.createIcons();
                return;
            }
            if(status)status.textContent='Calculando el trayecto vial por calles y avenidas…';
            try{
                const url='https://router.project-osrm.org/route/v1/driving/'+p1.lon+','+p1.lat+';'+p2.lon+','+p2.lat+'?overview=full&geometries=geojson&steps=true';
                const routeController=new AbortController();const routeTimeout=setTimeout(()=>routeController.abort(),6000);let response,payload;try{response=await fetch(url,{headers:{'Accept':'application/json'},signal:routeController.signal,cache:'no-store'});if(!response.ok)throw new Error('El servidor de rutas respondió '+response.status);payload=await response.json();}finally{clearTimeout(routeTimeout);}
                if(payload.code!=='Ok'||!payload.routes?.length)throw new Error('No se encontró un recorrido vial para estas coordenadas.');
                const route=payload.routes[0];
                if(mapa14Ruta&&mapa14Leaflet)mapa14Leaflet.removeLayer(mapa14Ruta);
                mapa14Ruta=L.geoJSON(route.geometry,{style:{color:'#078ca6',weight:6,opacity:.95,lineCap:'round',lineJoin:'round'}}).addTo(mapa14Leaflet);
                mapa14Leaflet.fitBounds(mapa14Ruta.getBounds(),{padding:[35,35],maxZoom:14,animate:false});
                const km=Number(route.distance||0)/1000,minutes=Math.round(Number(route.duration||0)/60);
                if(distanceEl)distanceEl.textContent=km<10?km.toFixed(1)+' km':km.toFixed(1)+' km';
                if(timeEl)timeEl.textContent=minutes<60?minutes+' min':Math.floor(minutes/60)+' h '+(minutes%60)+' min';
                if(stats)stats.classList.remove('hidden');
                if(pointsEl)pointsEl.textContent='2';
                const allSteps=(route.legs||[]).flatMap(leg=>leg.steps||[]).filter(step=>step.name||step.maneuver);
                const turnLabel=m=>{const type=String(m?.type||'');const mod=String(m?.modifier||'');const map={depart:'Inicia el recorrido',arrive:'Llegada al destino',turn:'Gira',roundabout:'Entra a la rotonda',merge:'Incorpórate',fork:'Toma la bifurcación',continue:'Continúa',newname:'Continúa por la vía'};return (map[type]||'Continúa')+(mod?' '+mod.replace(/_/g,' '):'');};
                if(stepsHost){
                    stepsHost.innerHTML='<b>Calles y giros del trayecto</b><ol>'+allSteps.slice(0,18).map(step=>'<li>'+escaparHTML(turnLabel(step.maneuver))+(step.name?' por <strong>'+escaparHTML(step.name)+'</strong>':'')+'</li>').join('')+'</ol>';
                    stepsHost.classList.remove('hidden');
                }
                const estimate=document.getElementById('mapa14-estimacion-2026');if(estimate)estimate.innerHTML='<div><strong>'+km.toFixed(1)+' km</strong><span>Distancia vial estimada</span></div><div><strong>'+(minutes<60?minutes+' min':Math.floor(minutes/60)+' h '+(minutes%60)+' min)+'</strong><span>Tiempo aproximado</span></div>';
                if(status)status.textContent='Ruta vial calculada por calles y avenidas. Se muestran únicamente el origen y el destino; las demás farmacias están ocultas hasta que restaures la vista.';
            }catch(error){
                const estimate=document.getElementById('mapa14-estimacion-2026');if(estimate)estimate.innerHTML='<div><strong>Ruta no disponible en este momento</strong><span>El servicio de rutas tardó demasiado o no respondió. Vuelve a intentarlo o abre Google Maps.</span></div>';
                if(mapa14Ruta&&mapa14Leaflet){mapa14Leaflet.removeLayer(mapa14Ruta);mapa14Ruta=null;}
                if(stats)stats.classList.add('hidden');
                if(stepsHost){stepsHost.innerHTML='';stepsHost.classList.add('hidden');}
                if(status)status.textContent='No fue posible calcular las calles en el mapa. Se mantienen visibles solo las farmacias seleccionadas; abre Google Maps para el recorrido exacto. '+(error.message||'');
            }
            if(window.lucide)lucide.createIcons();
        }

        async function prepararModuloCoberturas(){const lista=await obtenerSucursalesConfig();document.getElementById('cob-destino').innerHTML='<option value="">Local a cubrir</option>'+lista.map(x=>`<option>${escaparHTML(x.nombre)}</option>`).join('');await Promise.all([cargarResponsablesCobertura(),cargarSolicitudesDotacion()]);await cargarCoberturas();}
        function buscarCoberturaPersona(){const q=document.getElementById('cob-buscar').value.toLowerCase().trim(),p=document.getElementById('cob-resultados');if(q.length<2){p.classList.add('hidden');return;}const r=colaboradoresPapeleta.filter(x=>`${x.nombres} ${x.apellidos} ${x.rut} ${x.cargo}`.toLowerCase().includes(q)).slice(0,20);p.innerHTML=r.map(x=>`<button type="button" class="autocomplete-item" onclick="seleccionarCoberturaPersona('${x.id}')"><b>${escaparHTML(`${x.nombres||''} ${x.apellidos||''}`)}</b><br>${escaparHTML(x.rut)} · ${escaparHTML(x.cargo)} · ${escaparHTML(x.sucursal)}</button>`).join('');p.classList.remove('hidden');}
        function seleccionarCoberturaPersona(id){const x=colaboradoresPapeleta.find(a=>String(a.id)===String(id));if(!x)return;document.getElementById('cob-id').value=x.id;document.getElementById('cob-buscar').value=`${x.nombres} ${x.apellidos} · ${x.rut}`;document.getElementById('cob-nombre').value=`${x.nombres} ${x.apellidos}`.trim();document.getElementById('cob-rut').value=x.rut||'';document.getElementById('cob-origen').value=x.sucursal||'';document.getElementById('cob-tipo').value=x.cargo||'';document.getElementById('cob-resultados').classList.add('hidden');}
        function calcularDiasCobertura(){const a=parsearFechaExcel(document.getElementById('cob-inicio').value),b=parsearFechaExcel(document.getElementById('cob-fin').value);if(a&&b&&b>=a)document.getElementById('cob-dias').value=Math.floor((b-a)/86400000)+1;}
        async function guardarCobertura(e) {
            e.preventDefault();
            const solicitudId=document.getElementById('cob-solicitud-id')?.value;
            if(!solicitudId)return mostrarToast('Selecciona una alerta que esté marcada como resuelta antes de asignar al colaborador.','warning');
            const {data:solicitud,error:solicitudError}=await _supabase.from('solicitudes_dotacion').select('*').eq('id',solicitudId).single();
            if(solicitudError||!solicitud||solicitud.estado!=='CUBIERTA')return mostrarToast('La cobertura debe estar resuelta antes de asignar al colaborador.','warning');
            const registro = {
                colaborador_id: String(document.getElementById('cob-id').value || ''),
                rut: document.getElementById('cob-rut').value,
                nombre: document.getElementById('cob-nombre').value,
                tipo_profesional: document.getElementById('cob-tipo').value,
                local_origen: document.getElementById('cob-origen').value,
                local_destino: document.getElementById('cob-destino').value,
                fecha_inicio: document.getElementById('cob-inicio').value,
                fecha_fin: document.getElementById('cob-fin').value,
                dias: Number(document.getElementById('cob-dias').value),
                motivo: document.getElementById('cob-motivo').value,
                observaciones: document.getElementById('cob-observaciones').value
            };
            if (!registro.colaborador_id || !registro.rut) return mostrarToast('Selecciona la persona desde la lista.','warning');
            if (!registro.fecha_inicio || !registro.fecha_fin || registro.fecha_fin < registro.fecha_inicio) return mostrarToast('Revisa las fechas de la cobertura.','warning');
            try {
                const [personResult, branchResult] = await Promise.all([
                    _supabase.from('colaboradores').select('id,rut,sucursal_id,sucursal,nombres,apellidos,cargo').eq('rut',registro.rut).maybeSingle(),
                    _supabase.from('sucursales').select('id,nombre,activa')
                ]);
                if (personResult.error) throw personResult.error;
                if (branchResult.error) throw branchResult.error;
                const person = personResult.data;
                const branches = branchResult.data || [];
                const normBranch = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
                const origin = branches.find(x => normBranch(x.nombre) === normBranch(registro.local_origen));
                const destination = branches.find(x => normBranch(x.nombre) === normBranch(registro.local_destino));
                if (!person) throw new Error('No se encontró al colaborador en el maestro por RUT.');
                if (!origin || !destination) throw new Error('No se encontró la sucursal de origen o destino en el maestro. Revisa los nombres antes de guardar.');
                if (origin.id === destination.id) throw new Error('El local de origen y destino deben ser diferentes.');
                const {data:coverage,error:coverageError} = await _supabase.from('coberturas').insert([{...registro,colaborador_id:String(person.id),solicitud_dotacion_id:solicitudId}]).select('id').single();
                if (coverageError) throw coverageError;
                const me = await _supabase.rpc('chat_usuario_actual_id');
                if (me.error || !me.data) throw me.error || new Error('Tu usuario no tiene un perfil activo.');
                const transferRow = {
                    colaborador_id: person.id,
                    rut: person.rut,
                    colaborador_nombre: ((person.nombres || '') + ' ' + (person.apellidos || '')).trim(),
                    cargo: person.cargo || registro.tipo_profesional,
                    sucursal_origen_id: origin.id,
                    sucursal_origen_nombre: origin.nombre,
                    sucursal_destino_id: destination.id,
                    sucursal_destino_nombre: destination.nombre,
                    fecha_inicio: registro.fecha_inicio,
                    fecha_termino: registro.fecha_fin,
                    indefinido: false,
                    motivo: 'Cobertura temporal: ' + registro.motivo,
                    observaciones: registro.observaciones || null,
                    solicitado_por: me.data,
                    estado: 'SOLICITADO',
                    tipo_movimiento: 'COBERTURA',
                    cobertura_id: coverage.id
                };
                const {error:transferError} = await _supabase.from('traslados_personal').insert(transferRow);
                if (transferError) {
                    await _supabase.from('coberturas').delete().eq('id',coverage.id);
                    throw new Error('No se pudo enviar la cobertura a revisión de Traslados. No se conservó la cobertura para evitar registros huérfanos. ' + transferError.message);
                }
                await registrarAuditoria('coberturas','CREA_COBERTURA',`${registro.nombre}: ${registro.local_origen} a ${registro.local_destino}`);
                e.target.reset();
                document.getElementById('cob-solicitud-id').value='';solicitudCoberturaSeleccionada=null;document.getElementById('form-cobertura')?.classList.add('hidden');
                await cargarCoberturas();await cargarSolicitudesDotacion();
                mostrarToast('Cobertura guardada y enviada al módulo Traslados para aprobar o rechazar. La sucursal maestra no cambiará por aprobar una cobertura temporal.','success',10000);
            } catch (error) {
                console.error('Guardar cobertura:', error);
                mostrarToast(error.message || 'No se pudo guardar la cobertura.','error',12000);
            }
        }
        function estadoCobertura(x){
            const approval=x.estado_solicitud||'APROBADA';
            if(approval==='RECHAZADA')return 'RECHAZADA';
            if(approval!=='APROBADA')return 'PENDIENTE DE APROBACIÓN';
            const h=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Santiago'});
            if(h<x.fecha_inicio)return 'APROBADA · PROGRAMADA';
            if(h>x.fecha_fin)return 'REALIZADA';
            return 'EN CURSO';
        }
        async function cargarCoberturas(){
            await cargarSucursalesDotacion();
            let query=_supabase.from('coberturas').select('*').order('fecha_inicio',{ascending:false});
            if(await esPerfilProductividadCobertura()){
                const userId=await idRolActualCobertura();
                query=query.eq('creado_por_rol_id',userId);
            }
            const {data,error}=await query;
            if(error)return mostrarToast(error.message,'error');
            datosCoberturasGlobal=data||[];
            document.getElementById('cob-pendientes').innerText=datosCoberturasGlobal.filter(x=>(x.estado_solicitud||'APROBADA')==='PENDIENTE').length;
            document.getElementById('cob-curso').innerText=datosCoberturasGlobal.filter(x=>estadoCobertura(x)==='EN CURSO').length;
            document.getElementById('cob-realizadas').innerText=datosCoberturasGlobal.filter(x=>estadoCobertura(x)==='REALIZADA').length;
            document.getElementById('tabla-coberturas').innerHTML=datosCoberturasGlobal.map(x=>{
                const state=estadoCobertura(x);
                const cls=state==='RECHAZADA'?'bg-rose-100 text-rose-800':state==='PENDIENTE DE APROBACIÓN'?'bg-amber-100 text-amber-800':state==='APROBADA · PROGRAMADA'?'bg-blue-100 text-blue-800':state==='EN CURSO'?'bg-cyan-100 text-cyan-800':'bg-emerald-100 text-emerald-800';
                return `<tr><td><b>${escaparHTML(x.nombre)}</b><br>${escaparHTML(x.rut)} · ${escaparHTML(x.tipo_profesional)}</td><td>${escaparHTML(x.local_origen)}</td><td>${escaparHTML(x.local_destino)}</td><td>${x.fecha_inicio} a ${x.fecha_fin}</td><td>${escaparHTML(x.motivo)}</td><td><span class="rounded-full px-2 py-1 text-[11px] font-extrabold ${cls}">${escaparHTML(state)}</span></td></tr>`;
            }).join('');
        }

        function obtenerAnioFilaIA(fila) {
            const clavesFecha = Object.keys(fila).filter(k => /fecha|inicio|fin|desde|hasta/i.test(k));
            for (const clave of clavesFecha) {
                const valor = fila[clave];
                const iso = fechaISODesdeExcel(valor);
                if (iso) return Number(iso.slice(0, 4));
                const match = texto(valor).match(/\b(20\d{2})\b/);
                if (match) return Number(match[1]);
            }
            return null;
        }
        function analisisLocalExcel(filas, prompt, nombreArchivo) {
            const solicitud = texto(prompt).toLowerCase();
            const matchAnio = solicitud.match(/\b(20\d{2})\b/);
            const anio = matchAnio ? Number(matchAnio[1]) : null;
            const filasAnio = anio ? filas.filter(f => obtenerAnioFilaIA(f) === anio) : filas;
            const rutKeys = Object.keys(filas[0] || {}).filter(k => /rut/i.test(k));
            const sucKeys = Object.keys(filas[0] || {}).filter(k => /sucursal|local|unidad/i.test(k));
            const resultado = [];
            resultado.push('ANÁLISIS LOCAL DE RESPALDO');
            resultado.push(`Archivo: ${nombreArchivo}`);
            resultado.push(`Filas totales detectadas: ${filas.length}`);
            if (anio) resultado.push(`Filas correspondientes al año ${anio}: ${filasAnio.length}`);
            if (/licencia|ausencia|permiso/i.test(solicitud)) resultado.push(`Cantidad de registros de licencias/ausencias${anio ? ` en ${anio}` : ''}: ${filasAnio.length}`);
            if (/colaborador|persona|trabajador|rut/i.test(solicitud) && rutKeys.length) {
                const key = rutKeys[0];
                resultado.push(`Colaboradores/RUT únicos: ${new Set(filasAnio.map(f => normalizarRut(f[key])).filter(Boolean)).size}`);
            }
            if (/sucursal|local|unidad/i.test(solicitud) && sucKeys.length) {
                const key = sucKeys[0];
                const cantidades = {};
                filasAnio.forEach(f => { const v = texto(f[key]) || 'Sin sucursal'; cantidades[v] = (cantidades[v] || 0) + 1; });
                resultado.push('Distribución por sucursal:');
                Object.entries(cantidades).sort((a,b)=>b[1]-a[1]).slice(0,100).forEach(([k,v]) => resultado.push(`- ${k}: ${v}`));
            }
            resultado.push('');
            resultado.push('Nota: Gemini no estuvo disponible por cuota temporal. Este resultado fue calculado directamente en el navegador con el Excel completo, sin enviar el archivo a un servicio externo.');
            return resultado.join('\n');
        }
        function segundosReintentoGemini(mensaje) {
            const match = texto(mensaje).match(/retry in\s+([0-9.]+)/i);
            return match ? Math.ceil(Number(match[1])) : 0;
        }
        async function llamarGeminiConReintento(payload, out) {
            for (let intento = 1; intento <= 2; intento++) {
                const token = await tokenSesionActual();
                if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente para usar el análisis de IA.');
                const res = await fetch('/api/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                const raw = await res.text();
                let json;
                try { json = JSON.parse(raw); }
                catch { throw new Error(raw.slice(0, 700) || `Respuesta no válida del servidor (${res.status})`); }
                if (res.ok) return json;
                const espera = segundosReintentoGemini(json.error);
                if (intento === 1 && espera > 0 && espera <= 70) {
                    out.textContent = `La cuota temporal de Gemini está ocupada. Reintento automático en ${espera} segundos...`;
                    await new Promise(resolve => setTimeout(resolve, (espera + 2) * 1000));
                    continue;
                }
                throw new Error(json.error || `Error ${res.status}`);
            }
        }
        async function analizarConGeminiSeguro() {
            const file = document.getElementById('ai-archivo').files?.[0];
            const prompt = texto(document.getElementById('ai-prompt').value);
            const autorizado = document.getElementById('ai-consentimiento').checked;
            const btn = document.getElementById('ai-btn');
            const out = document.getElementById('ai-resultado');
            if (!file || !prompt || !autorizado) return mostrarToast('Selecciona archivo, escribe la solicitud y autoriza el envío.', 'warning');
            btn.disabled = true;
            out.textContent = 'Leyendo y preparando el archivo...';
            let filasExcel = null;
            try {
                const payload = { prompt, fileName: file.name, mimeType: file.type || 'application/octet-stream' };
                if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
                    filasExcel = await leerExcel(file);
                    const columnas = Object.keys(filasExcel[0] || {});
                    const muestra = filasExcel.slice(0, 700);
                    const resumenColumnas = {};
                    columnas.forEach(c => resumenColumnas[c] = new Set(filasExcel.slice(0, 5000).map(f => texto(f[c])).filter(Boolean)).size);
                    payload.textData = JSON.stringify({
                        totalFilas: filasExcel.length,
                        columnas,
                        valoresUnicosAproximados: resumenColumnas,
                        muestra,
                        aviso: muestra.length < filasExcel.length ? `Muestra de ${muestra.length} de ${filasExcel.length} filas. Para conteos simples usa totalFilas y para análisis detallado indica que se trabajó con una muestra.` : ''
                    });
                } else {
                    if (file.size > 5 * 1024 * 1024) throw new Error('El PDF supera 5 MB. Para esta versión, utiliza un PDF más pequeño.');
                    const data = await archivoADataURL(file);
                    payload.base64 = data.split(',')[1];
                }
                out.textContent = 'Analizando con Gemini...';
                const json = await llamarGeminiConReintento(payload, out);
                ultimaRespuestaIA = json.text || '';
                out.textContent = ultimaRespuestaIA;
                await registrarAuditoria('reportes', 'ANALISIS_GEMINI', `${file.name} · ${prompt.slice(0, 180)}`);
                mostrarToast('Análisis completado con Gemini.', 'success');
            } catch (error) {
                const cuota = /quota|rate.limit|exceeded|429/i.test(error.message);
                if (cuota && filasExcel) {
                    ultimaRespuestaIA = analisisLocalExcel(filasExcel, prompt, file.name);
                    out.textContent = ultimaRespuestaIA;
                    mostrarToast('Gemini alcanzó su cuota temporal. Se generó un análisis local de respaldo con el Excel completo.', 'warning', 16000);
                } else {
                    out.textContent = 'Error: ' + error.message;
                    mostrarToast(error.message, 'error', 16000);
                }
            } finally {
                btn.disabled = false;
            }
        }
        async function prepararFiltrosReportesRRHH(){try{const list=await obtenerSucursalesConfig(),sel=document.getElementById('rep-sucursal');sel.innerHTML='<option value="">Todas las sucursales</option>'+list.map(x=>'<option value="'+escaparHTML(x.nombre)+'">'+escaparHTML(x.nombre)+'</option>').join('');const today=fechaActualChileISO();document.getElementById('rep-desde').value ||= sumarDiasISOChile(today,-29);document.getElementById('rep-hasta').value ||= today;}catch(e){document.getElementById('rep-estado').textContent='Error cargando filtros: '+e.message;}}
        async function generarPaqueteReportesRRHH(){
        const state=document.getElementById('rep-estado');
        const types=[...document.querySelectorAll('.rep-tipo:checked')].map(x=>x.value);
        const from=document.getElementById('rep-desde').value,to=document.getElementById('rep-hasta').value;
        const branch=document.getElementById('rep-sucursal').value,format=document.getElementById('rep-formato').value;
        if(!types.length)return mostrarToast('Selecciona al menos un informe.','warning');
        if(from&&to&&from>to)return mostrarToast('La fecha Desde no puede ser posterior a Hasta.','warning');
        try{
            state.textContent='Preparando información de los módulos seleccionados…';
            if((types.includes('ASISTENCIA')||types.includes('RESUMEN'))&&!asistenciaCargada)await cargarAsistenciaDesdeNube();
            if((types.includes('LICENCIAS')||types.includes('RESUMEN'))&&!licenciasCargadas)await cargarLicenciasDesdeNube();
            if((types.includes('VACACIONES')||types.includes('RESUMEN'))&&!vacacionesCargadas)await cargarVacacionesDesdeNube();
            const normalizeDate=(r,keys)=>{for(const key of keys){if(r?.[key]){const raw=r[key];return typeof fechaISODesdeExcel==='function'?(fechaISODesdeExcel(raw)||String(raw).slice(0,10)):String(raw).slice(0,10);}}return '';};
            const inPeriod=(r,keys)=>{const d=normalizeDate(r,keys);return(!from||(!!d&&d>=from))&&(!to||(!!d&&d<=to));};
            const normalize=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
            const branchNamesOf=r=>[r.sucursal,r.local_origen,r.local_destino,r.sucursal_destino_nombre,r.sucursal_origen_nombre,r.sucursal_nombre,r.nombre].filter(Boolean).map(normalize);
            const inBranch=r=>!branch||branchNamesOf(r).includes(normalize(branch));
            const data={},unavailable=[];
            if(types.includes('ASISTENCIA'))data['Asistencia']=datosAsistenciaGlobal.filter(r=>inPeriod(r,['fecha'])&&inBranch(r));
            if(types.includes('LICENCIAS'))data['Licencias']=datosLicenciasGlobal.filter(r=>inPeriod(r,['fecha_inicio','fecha','created_at'])&&inBranch(r));
            if(types.includes('VACACIONES'))data['Vacaciones']=datosVacacionesGlobal.filter(r=>inPeriod(r,['fecha_inicio','fecha','created_at'])&&inBranch(r));
            const extraSpecs=[
                ['COLABORADORES','Colaboradores','colaboradores',['created_at','fecha_ingreso'],'*'],
                ['SUCURSALES','Sucursales','sucursales',['created_at'],'*'],
                ['COBERTURAS','Coberturas','coberturas',['fecha_inicio','created_at'],'*'],
                ['TAREAS','Tareas','tareas',['created_at','fecha_limite'],'*'],
                ['TRASLADOS','Traslados','traslados_personal',['fecha_inicio','created_at'],'*'],
                ['PAPELETAS','Papeletas','papeletas_permiso',['created_at','fecha_inicio'],'*'],
                ['ACTUALIZACIONES','Trazabilidad de archivos','actualizaciones_fuentes',['actualizado_en'],'modulo,actualizado_en,archivo,origen,usuario_email,registros'],
                ['AUDITORIA','Auditoría','auditoria_eventos',['created_at'],'id,usuario_email,modulo,accion,detalle,created_at'],
                ['DOCUMENTOS','Documentos laborales','documentos_laborales',['fecha','created_at'],'id,colaborador_id,tipo,titulo,fecha,created_at'],
                ['IMPORTACIONES','Importaciones','importaciones',['created_at','finalizada_at'],'id,modulo,nombre_archivo,modo,estado,filas_totales,filas_nuevas,filas_actualizadas,filas_rechazadas,filas_error,usuario_email,created_at,finalizada_at'],
                ['BOT_TALANA','Ejecuciones del bot Talana','talana_bot_runs',['started_at','finished_at'],'id,trigger_type,status,started_at,finished_at,reports_downloaded,reports_uploaded,error_summary,requested_by'],
                ['ARCHIVOS_BOT','Archivos del bot Talana','talana_bot_files',['uploaded_at'],'id,run_id,report_type,file_name,mime_type,size_bytes,uploaded_at'],
                ['SOLICITUDES','Solicitudes de colaboradores','solicitudes',['fecha_inicio','created_at'],'id,colaborador_id,tipo,fecha_inicio,fecha_termino,estado,created_at'],
                ['HISTORIAL','Historial de colaboradores','historial_colaborador',['created_at'],'id,rut,accion,actor_email,created_at'],
                ['GESTIONES_CORREO','Gestiones de correo','gestiones_correo',['fecha_preparacion','created_at'],'id,sucursal_id,supervisor,colaborador_rut,responsable_rol_id,asunto,fecha_desde,fecha_hasta,plazo_respuesta,estado,fecha_preparacion,fecha_envio_registrada,creado_por_email,created_at'],
                ['CHAT','Chat interno (metadatos)','chat_conversaciones',['created_at','updated_at'],'id,tipo,created_at,updated_at'],
                ['NOTIFICACIONES','Notificaciones','notificaciones',['created_at'],'id,usuario_rol_id,tipo,titulo,leida,created_at']
            ];
            const extras=extraSpecs.filter(s=>types.includes(s[0]));
            let branchNames=new Map();
            if(extras.length){
                const {data:branches,error:branchError}=await _supabase.from('sucursales').select('id,nombre').limit(3000);
                if(!branchError)branchNames=new Map((branches||[]).map(b=>[String(b.id),b.nombre]));
            }
            for(const [type,label,table,dateKeys,columns] of extras){
                state.textContent='Consultando '+label+'…';
                let rows;
                try { rows = await leerTablaCompleta(table); }
                catch(error) { unavailable.push(label+': '+(error.message||String(error))); data[label]=[{Estado:'No disponible por permisos o conexión',Detalle:error.message||String(error)}]; continue; }
                const enriched=(rows||[]).map(r=>({...r,sucursal:r.sucursal||r.local_destino||r.sucursal_destino_nombre||r.sucursal_origen_nombre||branchNames.get(String(r.sucursal_id||''))||''}));
                data[label]=enriched.filter(r=>inPeriod(r,dateKeys)&&inBranch(r));
            }
            const summary=[
                {Indicador:'Período',Valor:(from||'Sin inicio')+' a '+(to||'Sin término')},
                {Indicador:'Sucursal',Valor:branch||'Todas'},
                {Indicador:'Asistencia',Valor:data.Asistencia?.length??'No seleccionado'},
                {Indicador:'Licencias',Valor:data.Licencias?.length??'No seleccionado'},
                {Indicador:'Vacaciones',Valor:data.Vacaciones?.length??'No seleccionado'},
                {Indicador:'Colaboradores',Valor:data.Colaboradores?.length??'No seleccionado'},
                {Indicador:'Sucursales',Valor:data.Sucursales?.length??'No seleccionado'},
                {Indicador:'Coberturas',Valor:data.Coberturas?.length??'No seleccionado'},
                {Indicador:'Tareas',Valor:data.Tareas?.length??'No seleccionado'},
                {Indicador:'Traslados',Valor:data.Traslados?.length??'No seleccionado'},
                {Indicador:'Papeletas',Valor:data.Papeletas?.length??'No seleccionado'},
                {Indicador:'Atrasos detectados',Valor:(data.Asistencia||[]).filter(r=>r.tiene_atraso).length},
                {Indicador:'Sin marcas',Valor:(data.Asistencia||[]).filter(r=>r.sin_marca).length},
                {Indicador:'Generado (hora Chile)',Valor:new Date().toLocaleString('es-CL',{timeZone:'America/Santiago'})}
            ];
            if(types.includes('RESUMEN'))data['Resumen ejecutivo']=summary;
            const wb=XLSX.utils.book_new();
            Object.entries(data).forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{Mensaje:'Sin registros para los filtros seleccionados'}]),name.slice(0,31)));
            const stamp=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Santiago'}),xlsxName='Reporte_RRHH_'+stamp+'.xlsx';
            const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'}),kpi=document.getElementById('rep-kpis');
            kpi.classList.remove('hidden');
            kpi.innerHTML=Object.entries(data).map(([n,rows])=>'<div class="rounded-xl border bg-slate-50 p-4"><span class="text-xs text-slate-500">'+escaparHTML(n)+'</span><b class="mt-1 block text-2xl">'+rows.length+'</b><span class="text-xs text-slate-500">filas</span></div>').join('');
            const textSummary=summary.map(x=>x.Indicador+': '+x.Valor).join('\\n')+(unavailable.length?'\\nFuentes no disponibles: '+unavailable.join(' | '):'');
            const pdf=()=>{const {jsPDF}=window.jspdf,doc=new jsPDF();doc.setFontSize(17);doc.text('Reporte ejecutivo · Recursos Humanos',15,18);doc.setFontSize(10);let y=30;doc.splitTextToSize(textSummary,180).forEach(line=>{if(y>280){doc.addPage();y=18;}doc.text(line,15,y);y+=6;});return doc;};
            if(format==='xlsx')XLSX.writeFile(wb,xlsxName);
            else if(format==='pdf')pdf().save('Resumen_RRHH_'+stamp+'.pdf');
            else{
                if(!window.JSZip)throw new Error('No se pudo cargar el generador ZIP.');
                const zip=new JSZip();if(format!=='csv')zip.file(xlsxName,bytes);
                Object.entries(data).forEach(([n,rows])=>zip.file(n.replace(/[^a-z0-9_-]/gi,'_')+'.csv',XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.length?rows:[{Mensaje:'Sin registros'}]))));
                if(format!=='csv')zip.file('Resumen_ejecutivo.pdf',pdf().output('arraybuffer'));
                const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(format==='csv'?'Reportes_RRHH_CSV_':'Paquete_Reportes_RRHH_')+stamp+'.zip';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
            }
            state.textContent='Listo · '+Object.keys(data).length+' informe(s) preparados.'+(unavailable.length?' · '+unavailable.length+' fuente(s) no disponibles':'');
            mostrarToast('Reportes generados. '+(unavailable.length?unavailable.length+' fuente(s) no se pudieron consultar.':'Todos los módulos seleccionados fueron consultados.'),'success',8000);
        }catch(e){state.textContent='No se pudieron generar los reportes.';mostrarToast('Error al generar reportes: '+(e.message||e),'error',12000);}
    }
        function descargarRespuestaIA(){if(!ultimaRespuestaIA)return mostrarToast('Primero genera un análisis.','warning');const {jsPDF}=window.jspdf,doc=new jsPDF(),y0=20;doc.setTextColor(0,82,155);doc.setFontSize(15);doc.text('Reporte de Recursos Humanos',20,y0);doc.setTextColor(0);doc.setFontSize(9);let y=32;doc.splitTextToSize(ultimaRespuestaIA,170).forEach(line=>{if(y>280){doc.addPage();y=20;}doc.text(line,20,y);y+=4.5;});doc.save('Reporte_Gemini_RRHH.pdf');}

