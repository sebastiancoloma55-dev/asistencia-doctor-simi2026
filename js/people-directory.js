        // ============================================================
        // COLABORADORES Y SUCURSALES
        // ============================================================
        function estadoColaboradorDesdeExcel(valor) {
            if (valor === undefined || valor === null) return null;
            const raw = String(valor).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!raw) return null;
            if (['no','n','false','0','inactivo','inactiva','no vigente','no activo','no activa','baja','cesado','cesada','desvinculado','desvinculada','finiquitado','finiquitada','terminado','terminada','retirado','retirada','cesante','jubilado','jubilada','fin contrato','termino contrato'].includes(raw) || raw.startsWith('no vigente')) return 'inactivo';
            if (['si','s','true','1','vigente','activo','activa','contratado','contratada','en servicio','active','yes'].includes(raw)) return 'activo';
            return null;
        }

        function colaboradorEstaInactivo(estado) {
            return estadoColaboradorDesdeExcel(estado) === 'inactivo';
        }

        async function procesarExcelGenerico(event, tabla) {
            const input = event.target;
            const file = input.files?.[0];

            if (!file) {
                return;
            }

            try {
                const filas = await leerExcel(file);
                let datos = [];

                let resumenEstadoColaboradores = null;
                if (tabla === 'colaboradores') {
                    datos = filas
                        .map(fila => {
                            const registro = {
                                rut: normalizarRut(obtenerCampo(fila, ['RUT', 'Rut'])),
                                nombres: texto(obtenerCampo(fila, ['Nombre', 'Nombres'])),
                                apellidos: `${texto(obtenerCampo(fila, ['Apellido Paterno']))} ${texto(obtenerCampo(fila, ['Apellido Materno']))}`.trim(),
                                cargo: texto(obtenerCampo(fila, ['Cargo'])),
                                sucursal: texto(obtenerCampo(fila, ['Sucursal']))
                            };
                            // "Vigente" es la columna del maestro de empleados: No => inactivo, Sí => activo.
                            // Si el archivo no trae una vigencia reconocible, no alterar el estado que ya existe en la nube.
                            const estadoExcel = estadoColaboradorDesdeExcel(obtenerCampo(fila, [
                                'Vigente', 'Estado Laboral', 'Situación Laboral', 'Situacion Laboral',
                                'Estado Colaborador', 'Estado', 'Estatus', 'Activo'
                            ], null));
                            if (estadoExcel) registro.estado = estadoExcel;
                            return registro;
                        })
                        .filter(registro => registro.rut);

                    const conEstado = datos.filter(registro => Object.prototype.hasOwnProperty.call(registro, 'estado'));
                    resumenEstadoColaboradores = {
                        activos: conEstado.filter(registro => registro.estado === 'activo').length,
                        inactivos: conEstado.filter(registro => registro.estado === 'inactivo').length,
                        sinEstado: datos.length - conEstado.length
                    };
                }

                if (tabla === 'sucursales') {
                    datos = filas
                        .map(fila => ({
                            unidad: texto(obtenerCampo(fila, ['UNIDAD', 'Unidad'])),
                            nombre: texto(obtenerCampo(fila, ['NOMBRE SUCURSAL', 'Nombre Sucursal'])),
                            direccion: texto(obtenerCampo(fila, ['DIRECCIÓN', 'DIRECCION', 'Dirección'])),
                            comuna: texto(obtenerCampo(fila, ['COMUNA', 'Comuna'])),
                            supervisor: texto(obtenerCampo(fila, ['SUPERVISOR', 'Supervisor'])),
                            geolocalizacion: texto(obtenerCampo(fila, ['GEOLOCALIZACION', 'Geolocalización']))
                        }))
                        .filter(registro => registro.nombre);
                }

                if (tabla === 'sucursales') {
                    // La unidad identifica la sucursal. Evitar duplicados tanto dentro del Excel
                    // como en Supabase, sin depender de que exista un índice UNIQUE en la tabla.
                    const porUnidad = new Map();
                    for (const registro of datos) {
                        const unidad = texto(registro.unidad).toUpperCase().replace(/\s+/g, '');
                        if (!unidad) continue;
                        porUnidad.set(unidad, { ...registro, unidad });
                    }
                    datos = [...porUnidad.values()];
                    for (const registro of datos) {
                        const { data: existentes, error: buscarError } = await _supabase
                            .from('sucursales')
                            .select('id')
                            .eq('unidad', registro.unidad)
                            .order('id')
                            .limit(1);
                        if (buscarError) throw errorSupabase('No se pudo comprobar la sucursal ' + registro.unidad, buscarError);

                        let guardado;
                        if (existentes?.length) {
                            guardado = await _supabase.from('sucursales')
                                .update(registro).eq('id', existentes[0].id);
                        } else {
                            guardado = await _supabase.from('sucursales').insert(registro);
                        }
                        if (guardado.error) throw errorSupabase('No se pudo guardar la sucursal ' + registro.unidad, guardado.error);
                    }
                } else {
                    // Separar por filas con/sin estado para no borrar la vigencia existente
                    // cuando un Excel no incluya esa columna.
                    const lotesDatos = [
                        datos.filter(registro => Object.prototype.hasOwnProperty.call(registro, 'estado')),
                        datos.filter(registro => !Object.prototype.hasOwnProperty.call(registro, 'estado'))
                    ].filter(lote => lote.length);
                    for (const lote of lotesDatos) {
                        const { error } = await _supabase
                            .from(tabla)
                            .upsert(lote, tabla === 'colaboradores' ? { onConflict: 'rut' } : {});
                        if (error) throw errorSupabase(`No se pudo guardar ${tabla}`, error);
                    }
                }

                await registrarActualizacionFuente(tabla, file.name, datos.length, 'manual');
                const mensajeEstado = resumenEstadoColaboradores
                    ? (resumenEstadoColaboradores.activos + resumenEstadoColaboradores.inactivos > 0
                        ? ` Estado leído desde Excel: ${resumenEstadoColaboradores.activos} activos y ${resumenEstadoColaboradores.inactivos} inactivos.`
                        : ' No se encontró una columna de vigencia con valores reconocibles; se conservaron los estados anteriores.')
                    : '';
                mostrarToast(
                    `Se guardaron ${datos.length} registros en ${tabla}.${mensajeEstado}`,
                    'success',
                    14000
                );

                await inicializarDashboard();

                if (tabla === 'colaboradores') {
                    await cargarTablaColaboradores();
                }

                if (tabla === 'sucursales') {
                    await cargarTablaSucursales();
                }
            } catch (error) {
                mostrarToast(error.message, 'error', 15000);
            } finally {
                input.value = '';
            }
        }

        let cacheColaboradoresCompletoRRHH = null;
        let cacheSucursalesCompletoRRHH = null;
        let totalColaboradoresVisibleRRHH = 0;
        let paginaActualColaboradoresRRHH = 1;
        const FILAS_POR_PAGINA_COLABORADORES_RRHH = 100;

        async function leerTablaCompletaPaginadaRRHH(tabla, columnas, columnaOrden = 'id') {
            const tamanoBloque = 1000;
            const filas = [];
            let total = null;
            let desde = 0;

            while (true) {
                let consulta = desde === 0
                    ? _supabase.from(tabla).select(columnas, { count: 'exact' })
                    : _supabase.from(tabla).select(columnas);
                if (columnaOrden) consulta = consulta.order(columnaOrden, { ascending: true });
                const { data, error, count } = await consulta.range(desde, desde + tamanoBloque - 1);
                if (error) throw error;
                const bloque = data || [];
                if (desde === 0) total = Number.isFinite(count) ? count : null;
                filas.push(...bloque);

                if (bloque.length < tamanoBloque) break;
                desde += tamanoBloque;
                if (desde >= 1000000) throw new Error('La nómina supera el máximo seguro de lectura por esta pantalla. Usa los reportes de exportación para consultar el total.');
            }
            return { data: filas, count: total ?? filas.length };
        }

        async function cargarTablaColaboradores() {
            const tbody = document.getElementById('tabla-colaboradores-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500"><span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="h-4 w-4 animate-spin"></i> Cargando nómina completa desde la nube…</span></td></tr>';
            const pagination = document.getElementById('colab-paginacion');
            if (pagination) pagination.innerHTML = '<span class="colab-pagination-loading">Consultando todos los registros de Supabase…</span>';

            try {
                const [colaboradoresResult, sucursalesResult] = await Promise.all([
                    leerTablaCompletaPaginadaRRHH('colaboradores', '*', 'id'),
                    leerTablaCompletaPaginadaRRHH('sucursales', 'id,nombre,supervisor', 'id')
                ]);
                cacheColaboradoresCompletoRRHH = colaboradoresResult.data;
                cacheSucursalesCompletoRRHH = sucursalesResult.data;
                totalColaboradoresVisibleRRHH = colaboradoresResult.count;
                paginaActualColaboradoresRRHH = 1;

                const { data: stamp, error: stampError } = await _supabase
                    .from('actualizaciones_fuentes').select('modulo').eq('modulo','colaboradores').maybeSingle();
                if (stampError) console.warn('No se pudo consultar la fecha base de colaboradores:', stampError.message);
                if (!stamp && cacheColaboradoresCompletoRRHH.length) {
                    await registrarActualizacionFuente('colaboradores', 'Referencia inicial; fecha original no disponible', cacheColaboradoresCompletoRRHH.length, 'sistema', { baseline: true });
                }
                renderizarTablaColaboradores();
            } catch (error) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center"><div class="colab-load-error"><i data-lucide="database-zap"></i><b>No se pudo cargar la nómina</b><p>'+escaparHTML(error.message || error)+'</p><small>La base de datos contiene registros; revisa la sesión, el permiso “Colaboradores” y las políticas de lectura de Supabase.</small><button type="button" onclick="cargarTablaColaboradores()">Reintentar carga</button></div></td></tr>';
                if (pagination) pagination.innerHTML = '<span class="colab-pagination-error">Carga incompleta. Pulsa “Reintentar carga”.</span>';
                if (window.lucide) lucide.createIcons();
                throw error;
            }
        }

        function renderizarTablaColaboradores() {
            const tbody = document.getElementById('tabla-colaboradores-body');
            if (!tbody) return;
            if (!Array.isArray(cacheColaboradoresCompletoRRHH) || !Array.isArray(cacheSucursalesCompletoRRHH)) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Preparando conexión con la nómina…</td></tr>';
                return;
            }

            const registrosTodos = cacheColaboradoresCompletoRRHH;
            const sucursalesTodos = cacheSucursalesCompletoRRHH;
            const mapa = new Map(sucursalesTodos.map(sucursal => [
                texto(sucursal.nombre).toLowerCase(),
                sucursal.supervisor
            ]));
            const totalActivos = registrosTodos.filter(x => !colaboradorEstaInactivo(x.estado)).length;
            const totalInactivos = registrosTodos.length - totalActivos;
            const totalSucursales = new Set(registrosTodos.map(x => texto(x.sucursal)).filter(Boolean).map(x => x.toLowerCase())).size;
            const kpi = document.getElementById('colab-kpi-grid');
            if (kpi) {
                const tarjetas = [
                    {icon:'users',label:'Colaboradores cargados',value:registrosTodos.length},
                    {icon:'user-check',label:'Activos',value:totalActivos},
                    {icon:'user-round-x',label:'Inactivos',value:totalInactivos},
                    {icon:'building',label:'Sucursales con nómina',value:totalSucursales}
                ];
                kpi.innerHTML = tarjetas.map(x => '<div class="colab-kpi"><span><i data-lucide="'+x.icon+'"></i></span><div><small>'+x.label+'</small><strong>'+Number(x.value).toLocaleString('es-CL')+'</strong></div></div>').join('');
            }

            const branchSelect = document.getElementById('col-filtro-sucursal');
            const currentBranch = texto(branchSelect?.value);
            if (branchSelect) {
                const options = [...new Set(sucursalesTodos.map(x => texto(x.nombre)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
                const currentOptions = [...branchSelect.options].map(op=>op.value).filter(Boolean);
                if (currentOptions.length !== options.length || options.some((name,index)=>name !== currentOptions[index])) {
                    branchSelect.innerHTML = '<option value="">Todas las sucursales</option>' + options.map(n => '<option value="' + escaparHTML(n) + '">' + escaparHTML(n) + '</option>').join('');
                }
                branchSelect.value = options.includes(currentBranch) ? currentBranch : '';
            }

            const search = texto(document.getElementById('col-filtro-busqueda')?.value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const branchFilter = texto(branchSelect?.value);
            const statusFilter = texto(document.getElementById('col-filtro-estado')?.value).toLowerCase();
            const visible = registrosTodos.filter(registro => {
                const nombre = (registro.nombres || '') + ' ' + (registro.apellidos || '');
                const textoBusqueda = (nombre + ' ' + (registro.rut || '') + ' ' + (registro.cargo || '') + ' ' + (registro.sucursal || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const inactivo = colaboradorEstaInactivo(registro.estado);
                const coincideEstado = !statusFilter || (statusFilter === 'activos' ? !inactivo : inactivo);
                return (!search || textoBusqueda.includes(search)) && (!branchFilter || texto(registro.sucursal) === branchFilter) && coincideEstado;
            });

            const pageSize = FILAS_POR_PAGINA_COLABORADORES_RRHH;
            const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
            paginaActualColaboradoresRRHH = Math.min(Math.max(1, paginaActualColaboradoresRRHH), totalPages);
            const from = (paginaActualColaboradoresRRHH - 1) * pageSize;
            const pageRows = visible.slice(from, from + pageSize);

            if (!visible.length) {
                if (registrosTodos.length === 0 && totalColaboradoresVisibleRRHH > 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center"><div class="colab-load-error"><i data-lucide="shield-alert"></i><b>Supabase informó '+Number(totalColaboradoresVisibleRRHH).toLocaleString('es-CL')+' registros, pero no entregó filas a esta sesión.</b><p>Esto suele indicar permisos de lectura o una política RLS. Revisa el perfil y el permiso “Colaboradores”.</p></div></td></tr>';
                } else if (!registrosTodos.length) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center"><div class="colab-load-error"><i data-lucide="database"></i><b>La consulta no devolvió colaboradores.</b><p>La tabla de Supabase puede contener datos, pero esta sesión no los está recibiendo. Revisa el perfil y las políticas de acceso.</p><button type="button" onclick="cargarTablaColaboradores()">Reintentar carga</button></div></td></tr>';
                } else {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">No hay colaboradores que coincidan con los filtros actuales.</td></tr>';
                }
                actualizarPaginacionColaboradores(visible.length, pageSize, totalPages, from, 0);
                if (window.lucide) lucide.createIcons();
                return;
            }

            tbody.innerHTML = pageRows.map(registro => {
                const nombre = ((registro.nombres || '') + ' ' + (registro.apellidos || '')).trim();
                const supervisor = mapa.get(texto(registro.sucursal).toLowerCase()) || 'No asignado';
                const esActivo = !colaboradorEstaInactivo(registro.estado);
                return '<tr>' +
                    '<td class="p-4 font-mono">' + escaparHTML(registro.rut) + '</td>' +
                    '<td class="p-4"><b class="block">' + escaparHTML(nombre) + '</b><button type="button" onclick="verFichaColaborador(\'' + escaparHTML(registro.rut).replace(/'/g, '&#39;') + '\')" class="mt-1 rounded-lg bg-gradient-to-r from-indigo-50 to-cyan-50 px-2.5 py-1.5 text-[10px] font-extrabold text-indigo-800 ring-1 ring-indigo-100 hover:from-indigo-100 hover:to-cyan-100">Ver ficha RR. HH.</button></td>' +
                    '<td class="p-4">' + escaparHTML(registro.cargo) + '</td>' +
                    '<td class="p-4">' + escaparHTML(registro.sucursal) + '</td>' +
                    '<td class="p-4">' + escaparHTML(supervisor) + '</td>' +
                    '<td class="p-4"><span class="' + (esActivo ? 'colab-status-active' : 'colab-status-inactive') + '">' + (esActivo ? 'Activo' : 'Inactivo') + '</span></td>' +
                    '</tr>';
            }).join('');

            actualizarPaginacionColaboradores(visible.length, pageSize, totalPages, from, pageRows.length);
            if (window.lucide) lucide.createIcons();
        }

        function actualizarPaginacionColaboradores(total, pageSize, totalPages, start, visibleOnPage) {
            const pagination = document.getElementById('colab-paginacion');
            if (!pagination) return;
            const first = total ? start + 1 : 0;
            const last = total ? start + visibleOnPage : 0;
            pagination.innerHTML = '<div class="colab-pagination-info"><b>' +
                Number(total).toLocaleString('es-CL') + ' resultado(s) con los filtros</b><span>Mostrando ' +
                first.toLocaleString('es-CL') + '–' + last.toLocaleString('es-CL') + ' de ' +
                Number(total).toLocaleString('es-CL') + ' · Nómina cargada: ' +
                Number(cacheColaboradoresCompletoRRHH?.length || 0).toLocaleString('es-CL') +
                ' · ' + pageSize + ' por página</span></div><div class="colab-pagination-controls">' +
                '<button type="button" onclick="cambiarPaginaColaboradoresRRHH(-1)" ' + (paginaActualColaboradoresRRHH <= 1 ? 'disabled' : '') + ' aria-label="Página anterior"><i data-lucide="chevron-left"></i> Anterior</button>' +
                '<span>Página <b>' + paginaActualColaboradoresRRHH + '</b> de <b>' + totalPages + '</b></span>' +
                '<button type="button" onclick="cambiarPaginaColaboradoresRRHH(1)" ' + (paginaActualColaboradoresRRHH >= totalPages ? 'disabled' : '') + ' aria-label="Página siguiente">Siguiente <i data-lucide="chevron-right"></i></button></div>';
            if (window.lucide) lucide.createIcons();
        }

        function cambiarPaginaColaboradoresRRHH(delta) {
            paginaActualColaboradoresRRHH += Number(delta || 0);
            renderizarTablaColaboradores();
        }

        function fechaFichaColaborador(value, missing='Fecha no registrada') {
            if (value === null || value === undefined || String(value).trim() === '') return missing;
            const raw = String(value).trim();
            const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (iso) return iso[3] + '-' + iso[2] + '-' + iso[1];
            const chile = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
            if (chile) return chile[1].padStart(2,'0') + '-' + chile[2].padStart(2,'0') + '-' + chile[3];
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('es-CL',{timeZone:'America/Santiago'});
            return raw;
        }

        function obtenerModalFichaColaborador() {
            let modal = document.getElementById('modal-ficha-colaborador');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'modal-ficha-colaborador';
            modal.className = 'hidden fixed inset-0 z-[120] items-center justify-center bg-slate-950/60 p-3 sm:p-6 ref-employee-history-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'ficha-colaborador-title');
            modal.innerHTML = '<div class="relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">' +
                '<header class="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">' +
                '<div><p class="text-xs font-extrabold uppercase tracking-widest text-cyan-700">Historial laboral</p><h2 id="ficha-colaborador-title" class="mt-1 text-xl font-black text-slate-900">Ficha RR. HH.</h2><p id="ficha-colaborador-subtitle" class="mt-1 text-sm text-slate-500"></p></div>' +
                '<button type="button" id="ficha-colaborador-close" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" aria-label="Cerrar ficha">Cerrar ✕</button></header>' +
                '<div id="ficha-colaborador-body" class="overflow-y-auto p-4 sm:p-6"></div></div>';
            document.body.appendChild(modal);
            const close = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
            modal.querySelector('#ficha-colaborador-close')?.addEventListener('click', close);
            modal.addEventListener('click', event => { if (event.target === modal) close(); });
            modal.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
            return modal;
        }

        async function leerRegistrosColaborador(tabla, rut, campoFecha) {
            const base=String(rut??'').trim();
            const sinPuntos=base.replace(/\\./g,'');
            const sinGuion=sinPuntos.replace(/-/g,'');
            const match=sinPuntos.match(/^(\\d{7,8})([0-9kK])$/);
            const conGuion=sinPuntos.includes('-')?sinPuntos:(match?match[1]+'-'+match[2]:'');
            const variantes=[...new Set([base,sinGuion,conGuion].filter(Boolean))];
            const columnas=['rut','rut_colaborador','colaborador_rut'];
            let errorFinal=null, columnaDisponible=false;
            const acumulados=new Map();
            const consultarColumna=async columna=>{
                const resultados=await Promise.all(variantes.map(valor=>
                    _supabase.from(tabla).select('*').eq(columna,valor).limit(1000)
                ));
                resultados.forEach(resultado=>{
                    if(resultado.error){errorFinal=resultado.error;return;}
                    columnaDisponible=true;
                    (resultado.data||[]).forEach(row=>{
                        const key=row.id??[row.rut||row.rut_colaborador||row.colaborador_rut||row.rut_empleado,row.fecha_inicio||row.fecha||'',row.fecha_fin||'',row.tipo_ausencia||row.tipo_permiso||row.tipo||'',row.created_at||''].join('|');
                        acumulados.set(String(key),row);
                    });
                });
            };
            await consultarColumna(columnas[0]);
            // Solo probar nombres alternativos cuando el esquema no admite la columna rut o no hay coincidencias.
            if(!acumulados.size){
                for(const columna of columnas.slice(1)){
                    columnaDisponible=false;
                    await consultarColumna(columna);
                    if(acumulados.size||columnaDisponible)break;
                }
            }
            const data=[...acumulados.values()];
            if(campoFecha)data.sort((a,b)=>String(b[campoFecha]||b.created_at||'').localeCompare(String(a[campoFecha]||a.created_at||'')));
            return {data,error:data.length||columnaDisponible?null:errorFinal};
        }

        async function verFichaColaborador(rut) {
            const modal = obtenerModalFichaColaborador();
            const body = document.getElementById('ficha-colaborador-body');
            const title = document.getElementById('ficha-colaborador-title');
            const subtitle = document.getElementById('ficha-colaborador-subtitle');
            modal.classList.remove('hidden'); modal.classList.add('flex');
            body.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center"><div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent"></div><p class="text-sm font-semibold text-slate-600">Separando licencias médicas, permisos, ausencias, vacaciones y asistencia…</p></div>';
            try {
                const [personResult, licensesResult, permissionsResult, vacationsResult, attendanceResult] = await Promise.all([
                    _supabase.from('colaboradores').select('rut,nombres,apellidos,cargo,sucursal,estado').eq('rut', rut).maybeSingle(),
                    leerRegistrosColaborador('licencias_medicas', rut, 'fecha_inicio'),
                    leerRegistrosColaborador('papeletas_permiso', rut, 'fecha_inicio'),
                    leerRegistrosColaborador('vacaciones_historico', rut, 'fecha_inicio'),
                    leerRegistrosColaborador('registros_asistencia', rut, 'fecha')
                ]);
                if (personResult.error) throw personResult.error;
                const person = personResult.data;
                const nombre = person ? ((person.nombres || '') + ' ' + (person.apellidos || '')).trim() : 'Colaborador';
                if (title) title.textContent = nombre;
                if (subtitle) subtitle.textContent = (person?.rut || rut) + ' · ' + (person?.cargo || 'Cargo no informado') + ' · ' + (person?.sucursal || 'Sucursal no informada');

                const sourceAbsences = licensesResult.data || [];
                const looksLikePermission = row => {
                    const type = String(row.tipo_ausencia || row.tipo_permiso || row.tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                    return /\bpermiso\b|\bausencia\b|\binasistencia justificada\b/.test(type) && !/\blicencia medica\b/.test(type);
                };
                // Algunos archivos históricos etiquetados como "Permiso" terminaron en licencias_medicas.
                // Se muestran aquí en Permisos/Ausencias y no se mezclan con las licencias médicas.
                const importedPermissions = sourceAbsences.filter(looksLikePermission).map(row => ({
                    ...row, tipo_permiso: row.tipo_ausencia || row.tipo_permiso || 'Permiso',
                    motivo: row.motivo_ausencia || row.motivo || '',
                    dias: row.dias_ausencia ?? row.dias ?? null,
                    _origen: 'Historial de ausencias'
                }));
                const licenses = sourceAbsences.filter(row => !looksLikePermission(row));
                const permissions = [...importedPermissions, ...(permissionsResult.data || []).map(row => ({...row,_origen:'Papeletas de permiso'}))]
                    .sort((a,b) => {
                        const da = new Date(a.fecha_inicio || a.fecha || a.created_at || 0).getTime() || 0;
                        const db = new Date(b.fecha_inicio || b.fecha || b.created_at || 0).getTime() || 0;
                        return db - da;
                    });
                const vacations = vacationsResult.data || [];
                const attendance = attendanceResult.data || [];
                const atraso = row => {
                    const raw = String(row.atraso || row.horas_atraso || '').trim();
                    return row.tiene_atraso === true || (!!raw && !['0','-','00:00','00:00:00'].includes(raw));
                };
                const metric = (label, value, gradient, icon) => {
                    const tint = ({rose:'#fff1f2',blue:'#eff6ff',cyan:'#ecfeff',amber:'#fffbeb',violet:'#f5f3ff'})[gradient] || '#f8fafc';
                    return '<div style="background:linear-gradient(135deg,#ffffff,'+tint+')" class="rounded-2xl border border-slate-200 p-4 shadow-sm"><span class="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><span>'+icon+'</span>'+label+'</span><b class="mt-2 block text-3xl font-black text-slate-900">'+Number(value||0).toLocaleString('es-CL')+'</b></div>';
                };
                const dateRange = (startValue,endValue,startLabel='Inicio',endLabel='Término') => {
                    return '<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"><span><b>'+startLabel+':</b> '+escaparHTML(fechaFichaColaborador(startValue))+'</span><span><b>'+endLabel+':</b> '+escaparHTML(fechaFichaColaborador(endValue))+'</span></div>';
                };
                const licenseRows = licenses.slice(0,15).map(x => {
                    const start = x.fecha_inicio || x.fecha_desde || x.desde;
                    const end = x.fecha_fin || x.fecha_termino || x.fecha_hasta || x.hasta;
                    const datesMissing = !start || !end;
                    return '<article class="ficha-record ficha-record-licencia"><div class="ficha-record-head"><div><span class="ficha-record-kicker">LICENCIA MÉDICA</span><b>'+escaparHTML(x.tipo_licencia || x.tipo || 'Licencia médica')+'</b></div><span class="ficha-record-status">'+escaparHTML(x.estado || x.estado_solicitud || 'Registrada')+'</span></div>'+
                        dateRange(start,end)+
                        '<p class="ficha-record-detail">'+(x.dias_ausencia!=null?'<b>'+escaparHTML(x.dias_ausencia)+' día(s)</b> · ':'')+escaparHTML(x.observaciones || '')+'</p>'+
                        (datesMissing?'<p class="ficha-date-warning">Falta completar la fecha '+(!start&&!end?'de inicio y término':!start?'de inicio':'de término')+' en el registro.</p>':'')+
                        (x.created_at?'<small class="ficha-created-at">Registrada en el sistema: '+escaparHTML(fechaFichaColaborador(x.created_at))+'</small>':'')+'</article>';
                }).join('');
                const permissionRows = permissions.slice(0,20).map(x => {
                    const start = x.fecha_inicio || x.fecha || x.fecha_solicitud || null;
                    const end = x.fecha_fin || x.fecha_termino || null;
                    const ret = x.fecha_retorno || null;
                    const datesMissing = !start && !end && !ret;
                    const schedule = x.hora_inicio || x.hora_termino ? ' · Horario: '+escaparHTML(x.hora_inicio || 'Hora no indicada')+'–'+escaparHTML(x.hora_termino || 'Hora no indicada') : '';
                    return '<article class="ficha-record ficha-record-permiso"><div class="ficha-record-head"><div><span class="ficha-record-kicker">PERMISO / AUSENCIA</span><b>'+escaparHTML(x.tipo_permiso || x.tipo_ausencia || x.tipo || 'Permiso registrado')+'</b></div><span class="ficha-record-status">'+escaparHTML(x.estado || x.estado_solicitud || 'Registrado')+'</span></div>'+
                        '<div class="ficha-permission-dates">'+
                        '<div><small>Desde</small><b>'+escaparHTML(fechaFichaColaborador(start))+'</b></div>'+
                        '<div><small>Hasta</small><b>'+escaparHTML(fechaFichaColaborador(end))+'</b></div>'+
                        '<div><small>Retorno</small><b>'+escaparHTML(fechaFichaColaborador(ret))+'</b></div></div>'+
                        '<p class="ficha-record-detail">'+(x.dias!=null||x.dias_ausencia!=null?'<b>'+escaparHTML(x.dias ?? x.dias_ausencia)+' día(s)</b> · ':'')+escaparHTML(x.motivo || x.motivo_ausencia || x.observaciones || 'Sin detalle indicado')+schedule+'</p>'+
                        (x.remuneracion?'<p class="ficha-record-detail"><b>Remuneración:</b> '+escaparHTML(x.remuneracion)+'</p>':'')+
                        (datesMissing?'<p class="ficha-date-warning">Este permiso no tiene fechas de inicio, término ni retorno. No se inventaron fechas; revisa el documento de origen.</p>':'')+
                        (x.created_at?'<small class="ficha-created-at">Fecha de registro del sistema: '+escaparHTML(fechaFichaColaborador(x.created_at))+' · Esta no sustituye la fecha del permiso.</small>':'')+
                        '<small class="ficha-created-at">Fuente: '+escaparHTML(x._origen || 'Papeleta de permiso')+'</small></article>';
                }).join('');
                const vacationRows = vacations.slice(0,15).map(x => {
                    const start=x.fecha_inicio||x.desde, end=x.fecha_fin||x.fecha_termino||x.hasta;
                    return '<article class="ficha-record ficha-record-vacaciones"><div class="ficha-record-head"><div><span class="ficha-record-kicker">VACACIONES</span><b>'+escaparHTML(x.tipo_vacaciones || x.tipo || 'Vacaciones')+'</b></div><span class="ficha-record-status">'+escaparHTML(x.estado_solicitud || x.estado || 'Registradas')+'</span></div>'+
                        dateRange(start,end)+
                        '<p class="ficha-record-detail">'+(x.dias!=null?'<b>'+escaparHTML(x.dias)+' día(s)</b> · ':'')+escaparHTML(x.observaciones || '')+'</p>'+
                        ((!start||!end)?'<p class="ficha-date-warning">La fecha '+(!start&&!end?'de inicio y término':!start?'de inicio':'de término')+' no está registrada en este dato.</p>':'')+
                        (x.fecha_solicitud?'<small class="ficha-created-at">Solicitadas: '+escaparHTML(fechaFichaColaborador(x.fecha_solicitud))+'</small>':'')+'</article>';
                }).join('');
                const attendanceRows = attendance.slice(0,15).map(x => {
                    const late = atraso(x), status = x.tipo_ausentismo || (x.sin_marca ? 'Sin marcas' : x.marca_incompleta ? 'Marca incompleta' : late ? 'Atraso' : x.estado || 'OK');
                    return '<article class="ficha-attendance-row"><div><b>'+escaparHTML(fechaFichaColaborador(x.fecha,'Fecha no registrada'))+'</b><p>Entrada '+escaparHTML(x.entrada || '—')+' · Salida '+escaparHTML(x.salida || '—')+'</p><small>Atraso: '+escaparHTML(x.atraso || x.horas_atraso || '00:00')+'</small></div><span class="ficha-attendance-status '+(late?'is-late':'is-ok')+'">'+escaparHTML(status)+'</span></article>';
                }).join('');
                const section = (titleText,eyebrow,icon,color,result,rows,rowsHtml,empty) => {
                    const content = result.error
                        ? '<p class="ficha-section-error">No se pudo consultar esta fuente con tu perfil: '+escaparHTML(result.error.message)+'</p>'
                        : rows.length
                            ? rowsHtml + (rows.length > (titleText==='Permisos y ausencias'?20:15) ? '<p class="ficha-section-more">Se muestran los más recientes; total encontrado: '+rows.length+'.</p>' : '')
                            : '<div class="ficha-empty"><span>'+icon+'</span><b>Sin registros de '+titleText.toLowerCase()+'</b><p>'+empty+'</p></div>';
                    const colors = {rose:['#fff0f2','#b4233a'],violet:['#f2edff','#7049b8'],blue:['#edf5ff','#2461a5'],amber:['#fff6df','#9e6b10']};
                    const palette=colors[color]||colors.blue;
                    return '<section class="ficha-section"><header style="--ficha-soft:'+palette[0]+';--ficha-strong:'+palette[1]+'"><span class="ficha-section-icon">'+icon+'</span><div><span class="ficha-record-kicker">'+eyebrow+'</span><h4>'+titleText+'</h4><p>'+ (result.error?'Fuente no disponible':rows.length+' registro(s) · información separada por tipo')+'</p></div><span class="ficha-section-count">'+(result.error?'—':rows.length)+'</span></header><div class="ficha-section-body">'+content+'</div></section>';
                };
                const licenseHtml = section('Licencias médicas','SALUD LABORAL','🩺','rose',licensesResult,{length:licenses.length},licenseRows,'No hay licencias médicas registradas para este RUT.');
                const permissionHtml = section('Permisos y ausencias','PAPELETAS / AUSENCIAS','🗓️','violet',permissionsResult,{length:permissions.length},permissionRows,'No hay permisos ni ausencias registradas para este RUT.');
                const vacationHtml = section('Vacaciones','DESCANSO','🏖️','blue',vacationsResult,{length:vacations.length},vacationRows,'No hay vacaciones registradas para este RUT.');
                const attendanceHtml = section('Asistencia y atrasos','MARCACIONES','⏱️','amber',attendanceResult,{length:attendance.length},attendanceRows,'No hay marcas de asistencia registradas para este RUT.');
                body.innerHTML = '<div class="grid grid-cols-2 gap-3 xl:grid-cols-5">'+
                    metric('Licencias médicas',licensesResult.error?0:licenses.length,'rose','🩺')+
                    metric('Permisos / ausencias',permissionsResult.error?0:permissions.length,'violet','🗓️')+
                    metric('Vacaciones',vacationsResult.error?0:vacations.length,'blue','🏖️')+
                    metric('Marcas',attendanceResult.error?0:attendance.length,'cyan','⏱️')+
                    metric('Atrasos',attendanceResult.error?0:attendance.filter(atraso).length,'amber','⌛')+
                    '</div><div class="mt-5 grid grid-cols-1 gap-4 2xl:grid-cols-2">'+licenseHtml+permissionHtml+vacationHtml+attendanceHtml+'</div><p class="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500">Las licencias médicas, permisos/ausencias, vacaciones y marcaciones se muestran por separado. Cuando una fecha falta en la fuente, se indica expresamente y se muestra la fecha de registro del sistema solo como referencia. La ficha no muestra diagnósticos médicos.</p>';

                // Navegación por pestañas de la ficha, sin duplicar ni inventar registros.
                const metricGrid=body.firstElementChild;
                const recordSections=[...body.querySelectorAll('.ficha-section')];
                const sectionByTitle=new Map(recordSections.map(section=>[section.querySelector('h4')?.textContent?.trim(),section]));
                const licenseSection=sectionByTitle.get('Licencias médicas');
                const permissionSection=sectionByTitle.get('Permisos y ausencias');
                const vacationSection=sectionByTitle.get('Vacaciones');
                const attendanceSection=sectionByTitle.get('Asistencia y atrasos');
                const recordGrid=document.createElement('div');
                recordGrid.className='ficha-section-grid mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-2';
                const firstSection=recordSections[0];
                if(firstSection)firstSection.insertAdjacentElement('beforebegin',recordGrid);
                recordSections.forEach(section=>recordGrid.appendChild(section));
                const docsSection=document.createElement('section');
                docsSection.className='ficha-section ficha-documents-placeholder';
                docsSection.innerHTML='<header><span class="ficha-section-icon">📄</span><div><span class="ficha-record-kicker">DOCUMENTOS</span><h4>Documentos</h4><p>Archivos asociados a la ficha</p></div></header><div class="ficha-section-body"><div class="ficha-empty"><span>📄</span><b>Sin documentos disponibles en esta vista</b><p>No se consultó una fuente documental para este RUT; no se muestran archivos ficticios.</p></div></div>';
                recordGrid.appendChild(docsSection);
                const tabs=document.createElement('nav');
                tabs.className='ficha-history-tabs';
                tabs.setAttribute('role','tablist');
                const tabItems=[
                  ['resumen','Resumen'],['licencias','Licencias médicas'],['permisos','Permisos y ausencias'],
                  ['vacaciones','Vacaciones'],['asistencia','Asistencia'],['atrasos','Atrasos'],['documentos','Documentos']
                ];
                tabItems.forEach(([key,label],index)=>{
                  const button=document.createElement('button');button.type='button';button.className='ficha-history-tab'+(index===0?' active':'');
                  button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(index===0));button.dataset.fichaTab=key;
                  tabs.appendChild(button);
                });
                if(metricGrid)metricGrid.insertAdjacentElement('afterend',tabs);
                const allAttendanceRows=[...(attendanceSection?.querySelectorAll('.ficha-attendance-row')||[])];
                let noLateMessage=null;
                const setTab=key=>{
                  tabs.querySelectorAll('[data-ficha-tab]').forEach(button=>{
                    const active=button.dataset.fichaTab===key;
                    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
                  });
                  const showAll=key==='resumen';
                  const map={licencias:licenseSection,permisos:permissionSection,vacaciones:vacationSection,asistencia:attendanceSection,atrasos:attendanceSection,documentos:docsSection};
                  recordSections.forEach(section=>{section.hidden=showAll?false:section===map[key];});
                  docsSection.hidden=key!=='documentos';
                  allAttendanceRows.forEach(row=>{row.hidden=key==='atrasos'&&!row.classList.contains('is-late');});
                  if(key==='atrasos'&&attendanceSection){
                    const hasLate=allAttendanceRows.some(row=>row.classList.contains('is-late'));
                    if(!hasLate){
                      if(!noLateMessage){noLateMessage=document.createElement('div');noLateMessage.className='ficha-empty ficha-no-late';noLateMessage.innerHTML='<span>⌛</span><b>Sin atrasos registrados</b><p>No se encontraron marcas con atraso para este RUT.</p>';attendanceSection.querySelector('.ficha-section-body')?.appendChild(noLateMessage);}
                      noLateMessage.hidden=false;
                    }else if(noLateMessage)noLateMessage.hidden=true;
                  }else if(noLateMessage)noLateMessage.hidden=true;
                };
                tabs.addEventListener('click',event=>{const button=event.target.closest('[data-ficha-tab]');if(button)setTab(button.dataset.fichaTab);});
                setTab('resumen');
            } catch (error) {
                body.innerHTML = '<p class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">No se pudo cargar la ficha: ' + escaparHTML(error.message || error) + '</p>';
            }
        }

        window.verFichaColaborador = verFichaColaborador;

        async function cargarTablaSucursales() {
            const tbody = document.getElementById('tabla-sucursales-body');

            const { data, error } = await _supabase
                .from('sucursales')
                .select('*');

            if (error) {
                throw error;
            }

            if (!data?.length) {
                window.sucursalesConfiguracionGlobal = [];
                tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center">Sin sucursales.</td></tr>';
                return;
            }

            // Compartir el directorio autorizado ya cargado con los módulos de mapa y configuración.
            // Evita repetir consultas más restrictivas y permite conservar el alcance que autorizó Supabase.
            window.sucursalesConfiguracionGlobal = data;
            try { cacheSucursalesCompletoRRHH = data; } catch (_) {}
            window.dispatchEvent(new CustomEvent('simi:sucursales-loaded',{detail:{count:data.length}}));

            tbody.innerHTML = data
                .map(registro => {
                    const direccion = `${registro.direccion || ''}, ${registro.comuna || ''}, Chile`;
                    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;

                    return `
                        <tr>
                            <td class="p-4">${escaparHTML(registro.unidad)}</td>
                            <td class="p-4 font-bold">${escaparHTML(registro.nombre)}</td>
                            <td class="p-4">${escaparHTML(direccion)}</td>
                            <td class="p-4">${escaparHTML(registro.supervisor)}</td>
                            <td class="p-4">
                                <div class="flex flex-col items-start gap-2">
                                    <a href="${mapa}" target="_blank" rel="noopener noreferrer" class="font-bold text-simiRed">Ver mapa</a>
                                    <button type="button" onclick="verColaboradoresSucursal('${escaparHTML(registro.nombre).replace(/'/g, '&#39;')}')" class="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-extrabold text-sky-800 hover:bg-sky-100">Ver colaboradores</button>
                                </div>
                            </td>
                        </tr>
                    `;
                })
                .join('');
        }

        let temporizadorFiltroColaboradores = null;
        function filtrarTablaColaboradores() {
            if (temporizadorFiltroColaboradores) clearTimeout(temporizadorFiltroColaboradores);
            temporizadorFiltroColaboradores = setTimeout(() => {
                paginaActualColaboradoresRRHH = 1;
                if (Array.isArray(cacheColaboradoresCompletoRRHH)) renderizarTablaColaboradores();
                else cargarTablaColaboradores().catch(error => mostrarToast('No se pudo filtrar la nómina: ' + error.message, 'error'));
            }, 120);
        }

        function exportarDirectorioColaboradores() {
            const registros = Array.isArray(cacheColaboradoresCompletoRRHH) ? cacheColaboradoresCompletoRRHH : [];
            const sucursales = Array.isArray(cacheSucursalesCompletoRRHH) ? cacheSucursalesCompletoRRHH : [];
            if (!registros.length) {
                if (typeof mostrarToast === 'function') mostrarToast('Primero espera a que cargue el directorio de colaboradores.', 'error');
                return;
            }
            const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            const q = normalizar(document.getElementById('col-filtro-busqueda')?.value);
            const sucursalFiltro = String(document.getElementById('col-filtro-sucursal')?.value || '').trim();
            const estadoFiltro = String(document.getElementById('col-filtro-estado')?.value || '').trim().toLowerCase();
            const supervisorPorSucursal = new Map(sucursales.map(x => [normalizar(x.nombre), x.supervisor || 'No asignado']));
            const filas = registros.filter(x => {
                const nombre = String((x.nombres || '') + ' ' + (x.apellidos || ''));
                const busqueda = normalizar([nombre, x.rut, x.cargo, x.sucursal].join(' '));
                const inactivo = colaboradorEstaInactivo(x.estado);
                return (!q || busqueda.includes(q)) &&
                    (!sucursalFiltro || String(x.sucursal || '').trim() === sucursalFiltro) &&
                    (!estadoFiltro || (estadoFiltro === 'activos' ? !inactivo : inactivo));
            });
            const columnas = ['RUT','Nombre','Cargo','Sucursal','Supervisor','Estado'];
            const escapar = valor => '"' + String(valor ?? '').replace(/"/g, '""') + '"';
            const lineas = [columnas, ...filas.map(x => [
                x.rut, ((x.nombres || '') + ' ' + (x.apellidos || '')).trim(),
                x.cargo, x.sucursal, supervisorPorSucursal.get(normalizar(x.sucursal)) || 'No asignado',
                colaboradorEstaInactivo(x.estado) ? 'Inactivo' : 'Activo'
            ])].map(row => row.map(escapar).join(';')).join('\r\n');
            const blob = new Blob(['\uFEFF', lineas], {type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'directorio_colaboradores_' + new Date().toISOString().slice(0,10) + '.csv';
            document.body.appendChild(link); link.click(); link.remove();
            URL.revokeObjectURL(url);
            if (typeof mostrarToast === 'function') mostrarToast('Exportación lista: ' + filas.length.toLocaleString('es-CL') + ' colaboradores.', 'success');
        }

        window.exportarDirectorioColaboradores = exportarDirectorioColaboradores;
        window.renderizarTablaColaboradores = renderizarTablaColaboradores;
        window.cambiarPaginaColaboradoresRRHH = cambiarPaginaColaboradoresRRHH;

        function verColaboradoresSucursal(nombre) {
            const filtro = document.getElementById('col-filtro-sucursal');
            const buscar = document.getElementById('col-filtro-busqueda');
            if (filtro) filtro.value = nombre;
            if (buscar) buscar.value = '';
            cambiarModulo('colaboradores');
            cargarTablaColaboradores().catch(error => mostrarToast(error.message, 'error'));
            setTimeout(() => document.getElementById('col-filtro-sucursal')?.focus(), 100);
        }

        function toggleModalColaborador(mostrar) {
            const modal = document.getElementById('modal-colaborador');
            modal.classList.toggle('hidden', !mostrar);
            modal.classList.toggle('flex', mostrar);
        }

        async function guardarColaborador(event) {
            event.preventDefault();

            const registro = {
                rut: normalizarRut(document.getElementById('input-rut').value),
                nombres: texto(document.getElementById('input-nombres').value),
                apellidos: texto(document.getElementById('input-apellidos').value),
                cargo: texto(document.getElementById('input-cargo').value),
                sucursal: texto(document.getElementById('input-sucursal').value)
            };

            const { error } = await _supabase
                .from('colaboradores')
                .upsert([registro], { onConflict: 'rut' });

            if (error) {
                mostrarToast(error.message, 'error');
                return;
            }

            await registrarActualizacionFuente('colaboradores', 'Alta manual de colaborador', 1, 'manual');
            toggleModalColaborador(false);
            document.getElementById('form-nuevo-colaborador').reset();
            await cargarTablaColaboradores();
            await inicializarDashboard();
            mostrarToast('Colaborador guardado.', 'success');
        }
    