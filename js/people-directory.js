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
                            <td class="p-4 font-bold">${escaparHTML(nombre)}</td>
                            <td class="p-4">${escaparHTML(registro.cargo)}</td>
                            <td class="p-4">${escaparHTML(registro.sucursal)}</td>
                            <td class="p-4">${escaparHTML(supervisor)}</td>
                            <td class="p-4 text-emerald-700">Activo</td>
                        </tr>
                    `;
                })
                .join('');
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
    