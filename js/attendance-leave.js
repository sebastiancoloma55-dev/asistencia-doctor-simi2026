        // ============================================================
        // MÓDULO 4: ASISTENCIA
        // ============================================================
        function analizarFilaAsistencia(fila) {
            const entrada = convertirHoraExcel(
                obtenerCampo(fila, ['Entrada'])
            );

            const salida = convertirHoraExcel(
                obtenerCampo(fila, ['Salida'])
            );

            const atraso = texto(
                obtenerCampo(
                    fila,
                    ['Horas de Atraso', 'Atraso'],
                    '00:00'
                ),
                '00:00'
            ) || '00:00';

            const turnoCrudo = texto(
                obtenerCampo(fila, ['Turno'])
            );

            const fecha = fechaISODesdeExcel(
                obtenerCampo(fila, ['Fecha', 'Fecha Asistencia', 'Fecha de Asistencia', 'Fecha Registro', 'Fecha de Registro', 'Fecha Jornada', 'Fecha de marcación', 'Fecha de marcacion', 'Fecha (dd/mm/aaaa)', 'Día', 'Dia', 'Día de trabajo', 'Dia de trabajo'])
            );

            const rut = normalizarRut(
                obtenerCampo(fila, ['Rut', 'RUT'])
            );

            const sinMarca =
                entrada === '-' &&
                salida === '-';

            const marcaIncompleta =
                (entrada === '-' || salida === '-') &&
                !sinMarca;

            const tieneAtraso = ![
                '',
                '0',
                '-',
                '00:00',
                '00:00:00'
            ].includes(atraso);

            const sinTurnoConMarcas =
                (!turnoCrudo || turnoCrudo === '-') &&
                !sinMarca;

            let salidaTemprana = '-';

            const match = turnoCrudo.match(
                /(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})/i
            );

            if (
                !sinMarca &&
                !marcaIncompleta &&
                match
            ) {
                const [hSalida, mSalida] = salida
                    .slice(0, 5)
                    .split(':')
                    .map(Number);

                const [hProgramada, mProgramada] = match[2]
                    .split(':')
                    .map(Number);

                const real = hSalida * 60 + mSalida;
                const programada = hProgramada * 60 + mProgramada;

                if (
                    Number.isFinite(real) &&
                    Number.isFinite(programada) &&
                    real < programada
                ) {
                    const diferencia = programada - real;
                    const horas = Math.floor(diferencia / 60);
                    const minutos = diferencia % 60;

                    salidaTemprana = `Se retiró ${horas ? `${horas}h ` : ''}${minutos}m antes`;
                }
            }

            return {
                rut,
                nombre: texto(
                    obtenerCampo(
                        fila,
                        ['Nombre', 'Nombre Completo']
                    )
                ),
                sucursal: texto(
                    obtenerCampo(
                        fila,
                        ['Sucursal'],
                        'Sin Sucursal'
                    )
                ) || 'Sin Sucursal',
                fecha,
                turno: turnoCrudo || 'Sin Turno',
                entrada,
                salida,
                atraso,
                tipo_ausentismo: texto(
                    obtenerCampo(
                        fila,
                        ['Tipo de Ausentismo', 'Ausentismo']
                    )
                ),
                estado: texto(
                    obtenerCampo(
                        fila,
                        ['Estado'],
                        'OK'
                    )
                ) || 'OK',
                salida_temprana: salidaTemprana,
                sin_marca: sinMarca,
                marca_incompleta: marcaIncompleta,
                tiene_atraso: tieneAtraso,
                sin_turno_marcas: sinTurnoConMarcas
            };
        }

        async function procesarReporteAsistencia(event) {
            const input = event.target;
            const file = input.files?.[0];

            if (!file) {
                return;
            }

            const boton = document.getElementById('btn-upload-container');

            try {
                boton.textContent = 'Procesando y consolidando...';

                const filas = await leerExcel(file);

                const originales = filas.map(
                    analizarFilaAsistencia
                );

                const invalidas = originales.filter(registro => {
                    return !registro.rut || !registro.fecha;
                });

                if (invalidas.length) {
                    throw new Error(
                        `${invalidas.length} fila(s) no tienen RUT o fecha válida. No se guardó el archivo.`
                    );
                }

                // Una fila diaria por RUT. Si hay repetidos, conserva el último.
                const consolidado = deduplicarRegistros(
                    originales,
                    registro => [
                        normalizarRut(registro.rut),
                        registro.fecha
                    ].join('|')
                );

                const procesadas = consolidado.registros;

                datosAsistenciaGlobal = procesadas;
                asistenciaCargada = true;
                renderizarFiltrosAsistencia();

                if (consolidado.duplicados.length) {
                    mostrarToast(
                        `Asistencia: se detectaron ${consolidado.duplicados.length} fila(s) repetidas por RUT y fecha. Se conservó la última aparición.`,
                        'warning',
                        12000
                    );
                }

                boton.textContent = 'Guardando todos los lotes...';

                const resultado = await guardarLotes(
                    'registros_asistencia',
                    procesadas,
                    {
                        onConflict: 'rut,fecha'
                    }
                );

                await cargarAsistenciaDesdeNube(false);
                await inicializarDashboard();
                await registrarAuditoria('asistencia', 'CARGA_EXCEL', `Filas: ${originales.length}; únicos: ${procesadas.length}; duplicados: ${consolidado.duplicados.length}`);
                await registrarActualizacionFuente('asistencia', file.name, procesadas.length, 'manual');

                mostrarToast(
                    `Carga de asistencia finalizada. Excel: ${originales.length} filas. Registros únicos: ${procesadas.length}. Duplicados consolidados: ${consolidado.duplicados.length}. Supabase confirmó ${resultado.confirmados} registros en ${resultado.lotesProcesados} lote(s).`,
                    'success',
                    16000
                );
            } catch (error) {
                mostrarToast(
                    `No se pudo guardar asistencia. ${error.message}`,
                    'error',
                    18000
                );
            } finally {
                boton.innerHTML = `
                    <i data-lucide="cloud-upload" class="h-4 w-4"></i>
                    Cargar reporte
                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        class="hidden"
                        onchange="procesarReporteAsistencia(event)"
                    >
                `;

                input.value = '';
                lucide.createIcons();
            }
        }

        async function leerAsistenciaPaginada() {
            // Consultar en páginas pequeñas reduce el costo de cada sentencia bajo RLS.
            // Solo se solicitan las columnas usadas por el módulo, evitando transferir
            // campos innecesarios del histórico completo.
            const columnas = [
                'id', 'rut', 'nombre', 'sucursal', 'fecha', 'turno',
                'entrada', 'salida', 'atraso', 'tipo_ausentismo', 'estado',
                'salida_temprana', 'sin_marca', 'marca_incompleta',
                'tiene_atraso', 'sin_turno_marcas'
            ].join(',');
            const resultado = [];
            const tamanoPagina = 200;
            for (let desde = 0; ; desde += tamanoPagina) {
                const { data, error } = await _supabase
                    .from('registros_asistencia')
                    .select(columnas)
                    .order('fecha', { ascending: false })
                    .range(desde, desde + tamanoPagina - 1);
                if (error) throw errorSupabase('No se pudo cargar el detalle de asistencia', error);
                const pagina = data || [];
                resultado.push(...pagina);
                if (pagina.length < tamanoPagina) break;
            }
            return resultado;
        }

        async function cargarAsistenciaDesdeNube() {
            const tbody = document.getElementById('tabla-asistencia-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400">Cargando asistencia…</td></tr>';
            try {
                const [, registros] = await Promise.all([
                    obtenerMapaSupervisoresDirectorio(),
                    leerAsistenciaPaginada()
                ]);
                datosAsistenciaGlobal = registros;
                asistenciaCargada = true;
                document.getElementById('kpi-asistencia').innerText =
                    datosAsistenciaGlobal.length;
                renderizarFiltrosAsistencia();
            } catch (error) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-rose-600">No se pudo cargar la asistencia. Intenta actualizar; si persiste, revisa los permisos y los índices de Supabase.</td></tr>';
                mostrarToast('No se pudo cargar asistencia: ' + (error?.message || error), 'error', 14000);
                throw error;
            }
        }

        function renderizarFiltrosAsistencia() {
            const select = document.getElementById('filtro-sucursal-asistencia');
            const actual = select.value;

            const sucursales = [...new Set(
                datosAsistenciaGlobal
                    .map(registro => registro.sucursal)
                    .filter(Boolean)
            )].sort(
                (a, b) => a.localeCompare(b, 'es')
            );

            select.innerHTML = '<option value="TODAS">Todas</option>';

            sucursales.forEach(sucursal => {
                const option = document.createElement('option');
                option.value = sucursal;
                option.textContent = sucursal;
                select.appendChild(option);
            });

            select.value = sucursales.includes(actual)
                ? actual
                : 'TODAS';

            renderizarAnalisisAsistencia();
        }

        function seleccionarFiltroAnomaliaCard(tipo) {
            document.getElementById('filtro-tipo-anomalia').value = tipo;
            renderizarAnalisisAsistencia();
        }

        function renderizarAnalisisAsistencia() {
            const sucursal = document.getElementById('filtro-sucursal-asistencia').value;
            const tipo = document.getElementById('filtro-tipo-anomalia').value;
            const buscar = document.getElementById('busqueda-asistencia').value.trim().toLowerCase();

            let base = [...datosAsistenciaGlobal];

            if (sucursal !== 'TODAS') {
                base = base.filter(
                    registro => registro.sucursal === sucursal
                );
            }

            document.getElementById('stat-sin-marcas').innerText =
                base.filter(registro => registro.sin_marca && !registro.tipo_ausentismo).length;

            document.getElementById('stat-incompletas').innerText =
                base.filter(registro => registro.marca_incompleta).length;

            document.getElementById('stat-atrasos').innerText =
                base.filter(registro => registro.tiene_atraso).length;

            document.getElementById('stat-tempranas').innerText =
                base.filter(registro => registro.salida_temprana && registro.salida_temprana !== '-').length;

            document.getElementById('stat-sin-turno-marcas').innerText =
                base.filter(registro => registro.sin_turno_marcas).length;

            let filtrados = base;

            if (buscar) {
                filtrados = filtrados.filter(registro => {
                    return `${registro.nombre || ''} ${registro.rut || ''}`
                        .toLowerCase()
                        .includes(buscar);
                });
            }

            if (tipo === 'ATRASOS') {
                filtrados = filtrados.filter(registro => registro.tiene_atraso);
            }

            if (tipo === 'TEMPRANAS') {
                filtrados = filtrados.filter(registro => registro.salida_temprana && registro.salida_temprana !== '-');
            }

            if (tipo === 'INCOMPLETAS') {
                filtrados = filtrados.filter(registro => registro.marca_incompleta);
            }

            if (tipo === 'SIN_MARCAS') {
                filtrados = filtrados.filter(registro => registro.sin_marca && !registro.tipo_ausentismo);
            }

            if (tipo === 'SIN_TURNO') {
                filtrados = filtrados.filter(registro => registro.sin_turno_marcas);
            }

            document.getElementById('contador-asistencia').innerText =
                `Mostrando ${Math.min(filtrados.length, LIMITE_RENDER_ASISTENCIA)} de ${filtrados.length}`;

            const tbody = document.getElementById('tabla-asistencia-body');

            if (!filtrados.length) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400">Sin registros.</td></tr>';
                return;
            }

            tbody.innerHTML = filtrados
                .slice(0, LIMITE_RENDER_ASISTENCIA)
                .map(registro => {
                    let estado = escaparHTML(registro.estado || 'OK');

                    if (registro.tipo_ausentismo) {
                        estado = escaparHTML(registro.tipo_ausentismo);
                    } else if (registro.sin_marca) {
                        estado = 'Sin marcas';
                    } else if (registro.marca_incompleta) {
                        estado = 'Marca incompleta';
                    } else if (registro.sin_turno_marcas) {
                        estado = 'Sin turno con marcas';
                    }

                    return `
                        <tr>
                            <td class="col-fecha font-mono">${escaparHTML(registro.fecha)}</td>
                            <td class="col-sucursal font-semibold">${escaparHTML(registro.sucursal)}</td>
                            <td class="col-supervisor">${escaparHTML(supervisorDeSucursal(registro.sucursal))}</td>
                            <td class="col-colaborador">
                                <div class="font-bold">${escaparHTML(registro.nombre || 'N/A')}</div>
                                <div class="text-[10px] text-slate-400">${escaparHTML(registro.rut)}</div>
                            </td>
                            <td class="col-turno">${escaparHTML(registro.turno || 'Sin Turno')}</td>
                            <td class="col-marcas font-mono whitespace-nowrap">
                                Entrada: ${escaparHTML(registro.entrada || '-')}<br>
                                Salida: ${escaparHTML(registro.salida || '-')}
                            </td>
                            <td class="col-atraso font-mono">${escaparHTML(registro.atraso || '-')}</td>
                            <td class="col-temprana">${escaparHTML(registro.salida_temprana || '-')}</td>
                            <td class="col-estado"><span class="estado-asistencia">${estado}</span></td>
                        </tr>
                    `;
                })
                .join('');
        }

        // ============================================================
        // MÓDULO 5: LICENCIAS
        // ============================================================
        function analizarFilaLicencia(fila) {
            return {
                rut: normalizarRut(
                    obtenerCampo(fila, ['Rut', 'RUT'])
                ),
                nombre: texto(
                    obtenerCampo(fila, ['Nombre', 'Nombre Completo'])
                ),
                empresa: texto(
                    obtenerCampo(fila, ['Empresa'])
                ),
                cargo: texto(
                    obtenerCampo(fila, ['Cargo'])
                ),
                sucursal: texto(
                    obtenerCampo(fila, ['Sucursal'])
                ),
                tipo_ausencia: texto(
                    obtenerCampo(
                        fila,
                        ['Tipo de Ausencia', 'Tipo Ausencia'],
                        'Permiso'
                    ),
                    'Permiso'
                ) || 'Permiso',
                motivo_ausencia: texto(
                    obtenerCampo(
                        fila,
                        ['Motivo de Ausencia', 'Motivo']
                    )
                ),
                dias_ausencia: Number(
                    obtenerCampo(
                        fila,
                        [
                            'Número de días de Ausencia',
                            'Numero de dias de Ausencia',
                            'Días',
                            'Dias'
                        ],
                        1
                    )
                ) || 1,
                fecha_inicio: fechaISODesdeExcel(
                    obtenerCampo(
                        fila,
                        [
                            'Fecha Inicio Ausencia',
                            'Fecha Inicio',
                            'Desde'
                        ]
                    )
                ),
                fecha_fin: fechaISODesdeExcel(
                    obtenerCampo(
                        fila,
                        [
                            'Fecha Fin Ausencia',
                            'Fecha Fin',
                            'Hasta'
                        ]
                    )
                ),
                observaciones: texto(
                    obtenerCampo(fila, ['Observaciones'])
                ),
                gerencia: texto(obtenerCampo(fila, ['Gerencia'])),
                centro_costo: texto(obtenerCampo(fila, ['Centro de Costo', 'Centro Costo'])),
                fecha_creacion: texto(obtenerCampo(fila, ['Fecha de Creación', 'Fecha Creacion', 'Fecha de creación', 'Fecha creación'])),
                hora_inicio: texto(obtenerCampo(fila, ['Hora Inicio', 'Hora de Inicio', 'Hora inicio'])),
                hora_fin: texto(obtenerCampo(fila, ['Hora Fin', 'Hora de Fin', 'Hora fin'])),
                numero_horas: texto(obtenerCampo(fila, ['Número de horas', 'Numero de horas', 'Horas'])),
                numero_minutos: texto(obtenerCampo(fila, ['Número de minutos', 'Numero de minutos', 'Minutos']))
            };
        }

        async function procesarHistorialLicencias(event) {
            const input = event.target;
            const file = input.files?.[0];

            if (!file) {
                return;
            }

            const boton = document.getElementById('btn-upload-licencias');

            try {
                boton.textContent = 'Procesando archivo completo...';

                const filas = await leerExcel(file);

                const originales = filas.map(
                    analizarFilaLicencia
                );

                const invalidas = originales.filter(registro => {
                    return (
                        !registro.rut ||
                        !registro.fecha_inicio ||
                        !registro.fecha_fin
                    );
                });

                if (invalidas.length) {
                    throw new Error(
                        `${invalidas.length} fila(s) no tienen RUT, fecha de inicio o fecha de fin válida. No se guardó el archivo.`
                    );
                }

                // Consolidación global ANTES de dividir en lotes.
                // Esto evita que el lote 901-1200 caiga completo por código 21000.
                const normalizarIdentidadTexto = valor => String(valor ?? '')
                    .trim().toLowerCase().replace(/\s+/g, ' ');
                const normalizarTipoIdentidad = valor => normalizarIdentidadTexto(valor)
                    .replace(/[áéíóúüñ]/g, letra => ({á:'a',é:'e',í:'i',ó:'o',ú:'u',ü:'u',ñ:'n'}[letra]));
                const consolidado = deduplicarRegistros(
                    originales,
                    registro => [
                        normalizarRut(registro.rut).replace(/[.\s]/g, '').toUpperCase(),
                        String(registro.fecha_inicio || '').trim(),
                        normalizarTipoIdentidad(registro.tipo_ausencia),
                        String(registro.fecha_creacion || '').trim().slice(0, 10),
                        normalizarIdentidadTexto(registro.hora_inicio),
                        normalizarIdentidadTexto(registro.hora_fin)
                    ].join('|')
                );

                const procesadas = consolidado.registros;

                // No reemplazar la vista actual con filas todavía no confirmadas por Supabase.
                // La tabla se recarga desde la nube solo después de guardar todos los lotes.
                if (consolidado.duplicados.length) {
                    mostrarToast(
                        `Licencias: se detectaron ${consolidado.duplicados.length} fila(s) repetidas. Se conservó la última aparición de cada identidad Talana (RUT + inicio + tipo + fecha de creación + horas).`,
                        'warning',
                        14000
                    );
                }

                boton.textContent = 'Guardando todos los lotes...';

                let confirmados = 0;
                let lotesProcesados = 0;
                for (let inicio = 0; inicio < procesadas.length; inicio += TAMANO_LOTE) {
                    const lote = procesadas.slice(inicio, inicio + TAMANO_LOTE);
                    const { data, error } = await _supabase.rpc('upsert_licencias_medicas_batch', {
                        p_rows: lote
                    });
                    if (error) {
                        throw errorSupabase(
                            `Error en licencias_medicas, filas únicas ${inicio + 1} a ${inicio + lote.length}`,
                            error
                        );
                    }
                    confirmados += Number(data?.procesados ?? lote.length);
                    lotesProcesados++;
                }
                const resultado = { confirmados, lotesProcesados };

                if (typeof window.invalidarCacheLecturas === 'function') window.invalidarCacheLecturas('licencias_medicas');
                await cargarLicenciasDesdeNube(false);
                await inicializarDashboard();
                await registrarAuditoria('licencias', 'CARGA_EXCEL', `Filas: ${originales.length}; únicos: ${procesadas.length}; duplicados: ${consolidado.duplicados.length}`);
                await registrarActualizacionFuente('licencias', file.name, procesadas.length, 'manual');

                mostrarToast(
                    `Carga de licencias finalizada. Excel: ${originales.length} filas. Registros únicos: ${procesadas.length}. Duplicados consolidados: ${consolidado.duplicados.length}. Supabase confirmó ${resultado.confirmados} registros en ${resultado.lotesProcesados} lote(s). Los registros existentes se actualizaron y los nuevos se insertaron.`,
                    'success',
                    18000
                );
            } catch (error) {
                mostrarToast(
                    `No se pudieron guardar las licencias. ${error.message}`,
                    'error',
                    20000
                );
            } finally {
                boton.innerHTML = `
                    <i data-lucide="cloud-upload" class="h-4 w-4"></i>
                    Cargar histórico
                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        class="hidden"
                        onchange="procesarHistorialLicencias(event)"
                    >
                `;

                input.value = '';
                lucide.createIcons();
            }
        }

        async function cargarLicenciasDesdeNube() {
            // Traer licencias en paralelo al directorio evita una espera innecesaria.
            const [, registros] = await Promise.all([
                obtenerMapaSupervisoresDirectorio(),
                leerTablaCompleta('licencias_medicas', 'fecha_inicio')
            ]);
            datosLicenciasGlobal = registros;

            licenciasCargadas = true;
            document.getElementById('kpi-licencias').innerText =
                datosLicenciasGlobal.length;

            poblarFiltrosLicencias();
        }

        function poblarFiltrosLicencias() {
            const selectPersona = document.getElementById('filtro-colaborador-licencia');
            const selectTipo = document.getElementById('filtro-tipo-ausencia-licencia');
            const personaActual = selectPersona.value;
            const tipoActual = selectTipo.value;
            const personas = new Map();
            const tipos = new Set();

            datosLicenciasGlobal.forEach(registro => {
                if (registro.rut) {
                    personas.set(
                        registro.rut,
                        registro.nombre || 'Sin nombre'
                    );
                }

                if (registro.tipo_ausencia) {
                    tipos.add(registro.tipo_ausencia);
                }
            });

            selectPersona.innerHTML = '<option value="TODOS">Todos</option>';

            [...personas.entries()]
                .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                .forEach(([rut, nombre]) => {
                    const option = document.createElement('option');
                    option.value = rut;
                    option.textContent = `${nombre} (${rut})`;
                    selectPersona.appendChild(option);
                });

            selectTipo.innerHTML = '<option value="TODOS">Todos</option>';

            [...tipos]
                .sort((a, b) => a.localeCompare(b, 'es'))
                .forEach(tipo => {
                    const option = document.createElement('option');
                    option.value = tipo;
                    option.textContent = tipo;
                    selectTipo.appendChild(option);
                });

            selectPersona.value = personas.has(personaActual)
                ? personaActual
                : 'TODOS';

            selectTipo.value = tipos.has(tipoActual)
                ? tipoActual
                : 'TODOS';

            renderizarTablaLicencias();
        }

        function renderizarTablaLicencias() {
            const persona = document.getElementById('filtro-colaborador-licencia').value;
            const tipo = document.getElementById('filtro-tipo-ausencia-licencia').value;
            const vigencia = document.getElementById('filtro-vigencia-licencia').value;
            const buscar = document.getElementById('busqueda-licencias').value.trim().toLowerCase();

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            let filtrados = datosLicenciasGlobal.map(registro => {
                const fechaFin = parsearFechaExcel(registro.fecha_fin);

                return {
                    ...registro,
                    esVigente: Boolean(
                        fechaFin &&
                        fechaFin >= hoy
                    )
                };
            });

            if (persona !== 'TODOS') {
                filtrados = filtrados.filter(
                    registro => registro.rut === persona
                );
            }

            if (tipo !== 'TODOS') {
                filtrados = filtrados.filter(
                    registro => registro.tipo_ausencia === tipo
                );
            }

            if (vigencia === 'VIGENTE') {
                filtrados = filtrados.filter(
                    registro => registro.esVigente
                );
            }

            if (vigencia === 'CADUCADA') {
                filtrados = filtrados.filter(
                    registro => !registro.esVigente
                );
            }

            if (buscar) {
                filtrados = filtrados.filter(registro => {
                    return [
                        registro.nombre,
                        registro.rut,
                        registro.motivo_ausencia,
                        registro.sucursal
                    ]
                        .join(' ')
                        .toLowerCase()
                        .includes(buscar);
                });
            }

            document.getElementById('contador-licencias-filtradas').innerText =
                `Mostrando ${Math.min(filtrados.length, LIMITE_RENDER)} de ${filtrados.length}`;

            const tbody = document.getElementById('tabla-licencias-body');

            if (!filtrados.length) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400">Sin registros.</td></tr>';
                return;
            }

            tbody.innerHTML = filtrados
                .slice(0, LIMITE_RENDER)
                .map(registro => {
                    const estado = registro.esVigente
                        ? '<span class="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">Vigente</span>'
                        : '<span class="rounded-full bg-red-50 px-2 py-1 font-bold text-red-700">No vigente</span>';

                    return `
                        <tr>
                            <td class="p-3">
                                <div class="font-bold">${escaparHTML(registro.nombre || 'N/A')}</div>
                                <div class="text-[10px] text-slate-400">${escaparHTML(registro.rut)}</div>
                            </td>
                            <td class="p-3">${escaparHTML(registro.sucursal || 'N/A')}</td>
                            <td class="p-3">${escaparHTML(supervisorDeSucursal(registro.sucursal))}</td>
                            <td class="p-3">${escaparHTML(registro.tipo_ausencia || 'Permiso')}</td>
                            <td class="p-3">${escaparHTML(registro.motivo_ausencia || 'N/A')}</td>
                            <td class="p-3">${escaparHTML(registro.dias_ausencia)}</td>
                            <td class="p-3 font-mono">${escaparHTML(registro.fecha_inicio)} al ${escaparHTML(registro.fecha_fin)}</td>
                            <td class="p-3">${estado}</td>
                        </tr>
                    `;
                })
                .join('');
        }


