        // ============================================================
        // COLABORADORES Y SUCURSALES
        // ============================================================
        async function procesarExcelGenerico(event, tabla) {
            const input = event.target;
            const file = input.files?.[0];

            if (!file) {
                return;
            }

            try {
                const filas = await leerExcel(file);
                let datos = [];

                if (tabla === 'colaboradores') {
                    datos = filas
                        .map(fila => ({
                            rut: normalizarRut(obtenerCampo(fila, ['RUT', 'Rut'])),
                            nombres: texto(obtenerCampo(fila, ['Nombre', 'Nombres'])),
                            apellidos: `${texto(obtenerCampo(fila, ['Apellido Paterno']))} ${texto(obtenerCampo(fila, ['Apellido Materno']))}`.trim(),
                            cargo: texto(obtenerCampo(fila, ['Cargo'])),
                            sucursal: texto(obtenerCampo(fila, ['Sucursal']))
                        }))
                        .filter(registro => registro.rut);
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

                const { error } = await _supabase
                    .from(tabla)
                    .upsert(datos);

                if (error) {
                    throw errorSupabase(`No se pudo guardar ${tabla}`, error);
                }

                await registrarActualizacionFuente(tabla, file.name, datos.length, 'manual');
                mostrarToast(
                    `Se guardaron ${datos.length} registros en ${tabla}.`,
                    'success'
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

        async function cargarTablaColaboradores() {
            const tbody = document.getElementById('tabla-colaboradores-body');

            const [colaboradores, sucursales] = await Promise.all([
                _supabase.from('colaboradores').select('*'),
                _supabase.from('sucursales').select('id,nombre,supervisor')
            ]);

            if (colaboradores.error) {
                throw colaboradores.error;
            }

            if (sucursales.error) {
                throw sucursales.error;
            }

            const mapa = new Map(
                (sucursales.data || []).map(sucursal => [
                    texto(sucursal.nombre).toLowerCase(),
                    sucursal.supervisor
                ])
            );

            const search = texto(document.getElementById('col-filtro-busqueda')?.value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
            const branchFilter = texto(document.getElementById('col-filtro-sucursal')?.value);
            const branchSelect = document.getElementById('col-filtro-sucursal');
            if (branchSelect) {
                const current = branchSelect.value;
                const options = [...new Set((sucursales.data || []).map(x => texto(x.nombre)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
                branchSelect.innerHTML = '<option value="">Todas las sucursales</option>' + options.map(n => '<option value="' + escaparHTML(n) + '">' + escaparHTML(n) + '</option>').join('');
                branchSelect.value = options.includes(current) ? current : branchFilter;
            }
            const { data: stamp } = await _supabase.from('actualizaciones_fuentes').select('modulo').eq('modulo','colaboradores').maybeSingle();
            if (!stamp && colaboradores.data?.length) {
                await registrarActualizacionFuente('colaboradores', 'Referencia inicial; fecha original no disponible', colaboradores.data.length, 'sistema', { baseline: true });
            }
            const visible = (colaboradores.data || []).filter(registro => {
                const nombre = `${registro.nombres || ''} ${registro.apellidos || ''}`;
                const textoBusqueda = `${nombre} ${registro.rut || ''} ${registro.cargo || ''} ${registro.sucursal || ''}`.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
                return (!search || textoBusqueda.includes(search)) && (!branchFilter || texto(registro.sucursal) === branchFilter);
            });
            if (!visible.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">No hay colaboradores que coincidan con los filtros.</td></tr>';
                return;
            }

            tbody.innerHTML = visible
                .map(registro => {
                    const nombre = `${registro.nombres || ''} ${registro.apellidos || ''}`.trim();
                    const supervisor = mapa.get(texto(registro.sucursal).toLowerCase()) || 'No asignado';

                    return `
                        <tr>
                            <td class="p-4 font-mono">${escaparHTML(registro.rut)}</td>
                            <td class="p-4"><b class="block">${escaparHTML(nombre)}</b><button type="button" onclick="verFichaColaborador('${escaparHTML(registro.rut).replace(/'/g, '&#39;')}')" class="mt-1 rounded-lg bg-gradient-to-r from-indigo-50 to-cyan-50 px-2.5 py-1.5 text-[10px] font-extrabold text-indigo-800 ring-1 ring-indigo-100 hover:from-indigo-100 hover:to-cyan-100">Ver ficha RR. HH.</button></td>
                            <td class="p-4">${escaparHTML(registro.cargo)}</td>
                            <td class="p-4">${escaparHTML(registro.sucursal)}</td>
                            <td class="p-4">${escaparHTML(supervisor)}</td>
                            <td class="p-4 text-emerald-700">Activo</td>
                        </tr>
                    `;
                })
                .join('');
        }

        function obtenerModalFichaColaborador() {
            let modal = document.getElementById('modal-ficha-colaborador');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'modal-ficha-colaborador';
            modal.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6';
            modal.innerHTML = `
                <div role="dialog" aria-modal="true" aria-labelledby="ficha-colaborador-title" class="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-white/40 bg-slate-50 shadow-2xl">
                    <div class="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-950 via-indigo-950 to-cyan-900 p-5 text-white sm:p-6">
                        <div><span class="text-[10px] font-extrabold uppercase tracking-[.2em] text-cyan-200">Expediente operativo · RR. HH.</span><h3 id="ficha-colaborador-title" class="mt-2 text-xl font-black">Ficha del colaborador</h3><p id="ficha-colaborador-subtitle" class="mt-1 text-xs text-slate-200">Licencias, vacaciones, asistencia y atrasos.</p></div>
                        <button type="button" onclick="cerrarFichaColaborador()" class="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20" aria-label="Cerrar ficha">Cerrar ✕</button>
                    </div>
                    <div id="ficha-colaborador-body" class="max-h-[calc(92vh-105px)] overflow-y-auto p-4 sm:p-6"><p class="text-sm text-slate-500">Consultando registros autorizados…</p></div>
                </div>`;
            modal.addEventListener('click', event => { if (event.target === modal) cerrarFichaColaborador(); });
            document.body.append(modal);
            return modal;
        }

        function cerrarFichaColaborador() {
            const modal = document.getElementById('modal-ficha-colaborador');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        }

        async function leerRegistrosColaborador(tabla, rut, columnaFecha) {
            const acumulados = [];
            const pageSize = 1000;
            for (let offset = 0; offset < 10000; offset += pageSize) {
                let query = _supabase.from(tabla).select('*').eq('rut', rut).order(columnaFecha, { ascending: false }).range(offset, offset + pageSize - 1);
                const { data, error } = await query;
                if (error) return { data: null, error };
                acumulados.push(...(data || []));
                if (!data || data.length < pageSize) break;
            }
            return { data: acumulados, error: null };
        }

        async function verFichaColaborador(rut) {
            const modal = obtenerModalFichaColaborador();
            const body = document.getElementById('ficha-colaborador-body');
            const title = document.getElementById('ficha-colaborador-title');
            const subtitle = document.getElementById('ficha-colaborador-subtitle');
            modal.classList.remove('hidden'); modal.classList.add('flex');
            body.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center"><div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent"></div><p class="text-sm font-semibold text-slate-600">Consultando licencias, vacaciones y marcas de asistencia…</p></div>';
            try {
                const [personResult, licensesResult, vacationsResult, attendanceResult] = await Promise.all([
                    _supabase.from('colaboradores').select('rut,nombres,apellidos,cargo,sucursal,estado').eq('rut', rut).maybeSingle(),
                    leerRegistrosColaborador('licencias_medicas', rut, 'fecha_inicio'),
                    leerRegistrosColaborador('vacaciones_historico', rut, 'fecha_inicio'),
                    leerRegistrosColaborador('registros_asistencia', rut, 'fecha')
                ]);
                if (personResult.error) throw personResult.error;
                const person = personResult.data;
                const nombre = person ? ((person.nombres || '') + ' ' + (person.apellidos || '')).trim() : 'Colaborador';
                if (title) title.textContent = nombre;
                if (subtitle) subtitle.textContent = (person?.rut || rut) + ' · ' + (person?.cargo || 'Cargo no informado') + ' · ' + (person?.sucursal || 'Sucursal no informada');
                const licenses = licensesResult.data || [];
                const vacations = vacationsResult.data || [];
                const attendance = attendanceResult.data || [];
                const atraso = row => {
                    const raw = String(row.atraso || row.horas_atraso || '').trim();
                    return row.tiene_atraso === true || (!!raw && !['0','-','00:00','00:00:00'].includes(raw));
                };
                const metric = (label, value, gradient) => `<div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-white ${gradient} p-4 shadow-sm"><span class="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">${label}</span><b class="mt-2 block text-3xl font-black text-slate-900">${value.toLocaleString('es-CL')}</b></div>`;
                const licenseRows = licenses.slice(0,12).map(x => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><div class="flex flex-wrap justify-between gap-2"><b class="text-sm">${escaparHTML(x.tipo_ausencia || x.tipo_licencia || x.tipo || 'Licencia médica')}</b><span class="text-[11px] text-slate-500">${escaparHTML(x.estado || x.estado_solicitud || 'Registrada')}</span></div><p class="mt-1 text-xs text-slate-600">${escaparHTML(x.fecha_inicio || '—')} a ${escaparHTML(x.fecha_fin || x.fecha_termino || '—')}</p></div>`).join('');
                const vacationRows = vacations.slice(0,12).map(x => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><div class="flex flex-wrap justify-between gap-2"><b class="text-sm">${escaparHTML(x.tipo_vacaciones || x.tipo || 'Vacaciones')}</b><span class="text-[11px] text-slate-500">${escaparHTML(x.estado_solicitud || x.estado || 'Registrada')}</span></div><p class="mt-1 text-xs text-slate-600">${escaparHTML(x.fecha_inicio || '—')} a ${escaparHTML(x.fecha_fin || '—')} · ${escaparHTML(x.dias ?? '—')} día(s)</p></div>`).join('');
                const attendanceRows = attendance.slice(0,12).map(x => {
                    const late = atraso(x), status = x.tipo_ausentismo || (x.sin_marca ? 'Sin marcas' : x.marca_incompleta ? 'Marca incompleta' : late ? 'Atraso' : x.estado || 'OK');
                    return `<div class="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div><b class="text-sm">${escaparHTML(x.fecha || '—')}</b><p class="mt-1 text-xs text-slate-600">Entrada ${escaparHTML(x.entrada || '—')} · Salida ${escaparHTML(x.salida || '—')}</p><p class="mt-1 text-[11px] text-slate-500">Atraso: ${escaparHTML(x.atraso || x.horas_atraso || '00:00')}</p></div><span class="h-fit rounded-full px-2 py-1 text-[10px] font-extrabold ${late ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">${escaparHTML(status)}</span></div>`;
                }).join('');
                const section = (titleText, icon, color, result, rows, rowsHtml, empty) => {
                    const content = result.error
                        ? '<p class="text-sm text-rose-700">No disponible para tu perfil: ' + escaparHTML(result.error.message) + '</p>'
                        : rows.length
                            ? rowsHtml + (rows.length > 12 ? '<p class="pt-2 text-[11px] text-slate-500">Se muestran los 12 registros más recientes de ' + rows.length + ' encontrados.</p>' : '')
                            : '<p class="text-sm text-slate-500">' + empty + '</p>';
                    return `<section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div class="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-${color}-50 p-4"><span class="grid h-9 w-9 place-items-center rounded-xl bg-${color}-100 text-lg">${icon}</span><div><h4 class="font-extrabold text-slate-900">${titleText}</h4><p class="text-[11px] text-slate-500">${result.error ? 'Fuente restringida' : rows.length + ' registro(s)'}</p></div></div><div class="space-y-2 p-4">${content}</div></section>`;
                };
                const licenseHtml = section('Licencias médicas','🩺','rose',licensesResult,licenses,licenseRows,'No hay licencias registradas para este RUT.');
                const vacationHtml = section('Vacaciones','🏖️','blue',vacationsResult,vacations,vacationRows,'No hay vacaciones registradas para este RUT.');
                const attendanceHtml = section('Asistencia y atrasos','⏱️','amber',attendanceResult,attendance,attendanceRows,'No hay marcas de asistencia registradas para este RUT.');
                body.innerHTML = `<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">${metric('Licencias', licensesResult.error ? 0 : licenses.length, 'to-rose-50')}${metric('Vacaciones', vacationsResult.error ? 0 : vacations.length, 'to-blue-50')}${metric('Marcas consultadas', attendanceResult.error ? 0 : attendance.length, 'to-cyan-50')}${metric('Atrasos detectados', attendanceResult.error ? 0 : attendance.filter(atraso).length, 'to-amber-50')}</div><div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">${licenseHtml}${vacationHtml}${attendanceHtml}</div><p class="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500">La ficha respeta los permisos de Supabase. Las cantidades corresponden a los registros consultados desde la base de datos; no se muestran diagnósticos médicos.</p>`;
            } catch (error) {
                body.innerHTML = '<p class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">No se pudo cargar la ficha: ' + escaparHTML(error.message || error) + '</p>';
            }
        }

        async function cargarTablaSucursales() {
            const tbody = document.getElementById('tabla-sucursales-body');

            const { data, error } = await _supabase
                .from('sucursales')
                .select('*');

            if (error) {
                throw error;
            }

            if (!data?.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center">Sin sucursales.</td></tr>';
                return;
            }

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
                cargarTablaColaboradores().catch(error => mostrarToast('No se pudo filtrar la nómina: ' + error.message, 'error'));
            }, 180);
        }

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
                .insert([registro]);

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
    