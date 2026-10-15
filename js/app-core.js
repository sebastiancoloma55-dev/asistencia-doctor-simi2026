        // ============================================================
        // UTILIDADES
        // ============================================================
        function texto(valor, defecto = '') {
            if (valor === undefined || valor === null) {
                return defecto;
            }

            return String(valor).trim();
        }

        function escaparHTML(valor) {
            return String(valor ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        }

        function normalizarRut(valor) {
            return texto(valor)
                .replace(/\./g, '')
                .replace(/\s+/g, '')
                .toUpperCase();
        }

        function normalizarEncabezado(valor) {
            return texto(valor)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/\s+/g, ' ');
        }

        function obtenerCampo(fila, alternativas, defecto = '') {
            const mapa = {};

            Object.keys(fila).forEach(clave => {
                mapa[normalizarEncabezado(clave)] = fila[clave];
            });

            for (const alternativa of alternativas) {
                const clave = normalizarEncabezado(alternativa);

                if (Object.prototype.hasOwnProperty.call(mapa, clave)) {
                    return mapa[clave];
                }
            }

            return defecto;
        }

        function convertirHoraExcel(valor) {
            if (
                valor === undefined ||
                valor === null ||
                valor === '' ||
                valor === '-'
            ) {
                return '-';
            }

            if (
                typeof valor === 'string' &&
                valor.includes(':')
            ) {
                const partes = valor.trim().split(':');
                const hora = String(Number(partes[0])).padStart(2, '0');
                const minuto = String(Number(partes[1] || 0)).padStart(2, '0');
                const segundo = String(Number(partes[2] || 0)).padStart(2, '0');

                return `${hora}:${minuto}:${segundo}`;
            }

            const numero = Number(valor);

            if (
                Number.isFinite(numero) &&
                numero >= 0 &&
                numero < 1
            ) {
                const total = Math.round(numero * 86400) % 86400;
                const horas = Math.floor(total / 3600);
                const minutos = Math.floor((total % 3600) / 60);
                const segundos = total % 60;

                return [
                    String(horas).padStart(2, '0'),
                    String(minutos).padStart(2, '0'),
                    String(segundos).padStart(2, '0')
                ].join(':');
            }

            return texto(valor, '-');
        }

        function fechaISODesdeExcel(valor) {
            if (
                valor === undefined ||
                valor === null ||
                valor === ''
            ) {
                return null;
            }

            if (typeof valor === 'number') {
                const partes = XLSX.SSF.parse_date_code(valor);

                if (!partes) {
                    return null;
                }

                return [
                    String(partes.y).padStart(4, '0'),
                    String(partes.m).padStart(2, '0'),
                    String(partes.d).padStart(2, '0')
                ].join('-');
            }

            const cadena = texto(valor);

            // Admitir fechas chilenas con hora adjunta sin delegar a Date(), que interpreta
            // fechas con barras según la configuración regional del navegador.
            let match = cadena.match(
                /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:$|[T\s].*)/
            );

            if (match) {
                const dia = Number(match[1]);
                const mes = Number(match[2]);
                const anio = Number(match[3]);
                if (mes < 1 || mes > 12 || dia < 1 || dia > new Date(anio, mes, 0).getDate()) return null;
                return [
                    String(anio).padStart(4, '0'),
                    String(mes).padStart(2, '0'),
                    String(dia).padStart(2, '0')
                ].join('-');
            }

                        // Conservar la fecha escrita en cadenas ISO aunque incluyan hora y zona horaria.
            // Evita que medianoche UTC se convierta en el día anterior en Chile.
            match = cadena.match(
                /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s|$)/
            );

            if (match) {
                const anio = Number(match[1]);
                const mes = Number(match[2]);
                const dia = Number(match[3]);
                const valida = mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(anio, mes, 0).getDate();
                if (!valida) return null;

                return [
                    String(anio).padStart(4, '0'),
                    String(mes).padStart(2, '0'),
                    String(dia).padStart(2, '0')
                ].join('-');
            }

            const fecha = new Date(cadena);

            if (Number.isNaN(fecha.getTime())) {
                return null;
            }

            return [
                fecha.getFullYear(),
                String(fecha.getMonth() + 1).padStart(2, '0'),
                String(fecha.getDate()).padStart(2, '0')
            ].join('-');
        }

        function parsearFechaExcel(valor) {
            const iso = fechaISODesdeExcel(valor);

            if (!iso) {
                return null;
            }

            const [anio, mes, dia] = iso.split('-').map(Number);

            return new Date(
                anio,
                mes - 1,
                dia
            );
        }

        function mostrarToast(mensaje, tipo = 'info', duracion = 9000) {
            const contenedor = document.getElementById('toast-container');

            const colores = {
                success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                warning: 'border-amber-200 bg-amber-50 text-amber-800',
                error: 'border-red-200 bg-red-50 text-red-800',
                info: 'border-blue-200 bg-blue-50 text-blue-800'
            };

            const elemento = document.createElement('div');

            elemento.className = `flex items-start gap-3 rounded-xl border p-4 text-sm font-semibold shadow-lg ${colores[tipo] || colores.info}`;

            elemento.innerHTML = `
                <div class="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    ${escaparHTML(mensaje)}
                </div>

                <button class="opacity-60 hover:opacity-100">
                    <i data-lucide="x" class="h-4 w-4"></i>
                </button>
            `;

            elemento.querySelector('button').addEventListener(
                'click',
                () => elemento.remove()
            );

            contenedor.appendChild(elemento);
            lucide.createIcons();

            if (duracion > 0) {
                setTimeout(
                    () => elemento.remove(),
                    duracion
                );
            }
        }

        function errorSupabase(contexto, error) {
            console.error(contexto, error);

            const detalle = [
                error?.message,
                error?.details,
                error?.hint,
                error?.code ? `Código ${error.code}` : ''
            ]
                .filter(Boolean)
                .join(' | ');

            return new Error(
                `${contexto}: ${detalle || 'Error desconocido'}`
            );
        }

        async function leerExcel(file) {
            const buffer = await file.arrayBuffer();

            const workbook = XLSX.read(
                buffer,
                {
                    type: 'array',
                    cellDates: false
                }
            );

            if (!workbook.SheetNames.length) {
                throw new Error('El archivo no contiene hojas.');
            }

            const hoja = workbook.Sheets[workbook.SheetNames[0]];

            const filas = XLSX.utils.sheet_to_json(
                hoja,
                {
                    defval: '',
                    raw: true
                }
            );

            if (!filas.length) {
                throw new Error('La primera hoja no contiene registros.');
            }

            return filas;
        }

        // Trazabilidad de cargas: misma etiqueta para archivos manuales y bot en nube.
        const MODULOS_ACTUALIZACION = {
            colaboradores: 'Colaboradores',
            sucursales: 'Sucursales',
            config_sucursales: 'Configuración de sucursales',
            config_correos: 'Correos por sucursal',
            asistencia: 'Asistencia',
            licencias: 'Licencias médicas',
            vacaciones: 'Vacaciones',
            talana_bot: 'Reportes del bot Talana',
            talana_ausentismos: 'Reporte Talana de ausentismos',
            talana_vacaciones: 'Reporte Talana de vacaciones'
        };

        function formatoFechaActualizacion(valor) {
            if (!valor) return 'Sin cargas registradas';
            const fecha = new Date(valor);
            if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
            return fecha.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });
        }

        function pintarActualizacionFuente(registro) {
            if (!registro?.modulo) return;
            document.querySelectorAll('[data-update-stamp="' + registro.modulo + '"]').forEach(el => {
                const fecha = formatoFechaActualizacion(registro.actualizado_en);
                const origen = registro.origen === 'bot' ? 'Bot Talana' : registro.origen === 'manual' ? 'Carga manual' : 'Sistema';
                const archivo = registro.archivo ? ' · ' + registro.archivo : '';
                el.textContent = registro.actualizado_en
                    ? (registro.detalles?.baseline ? 'Seguimiento iniciado: ' + fecha + ' · carga histórica sin fecha original' : 'Última actualización: ' + fecha + ' · ' + origen + archivo)
                    : 'Sin cargas registradas';
                el.title = registro.usuario_email ? 'Registrado por ' + registro.usuario_email : '';
                el.dataset.updateState = registro.actualizado_en ? 'ok' : 'empty';
            });
        }

        async function cargarActualizacionesFuentes() {
            if (!_supabase?.auth) return;
            const { data: sessionData } = await _supabase.auth.getSession();
            if (!sessionData?.session) return;
            const { data, error } = await _supabase
                .from('actualizaciones_fuentes')
                .select('modulo,actualizado_en,archivo,origen,usuario_email,registros,detalles')
                .order('actualizado_en', { ascending: false });
            if (error) {
                console.warn('No se pudo consultar la trazabilidad de archivos:', error.message);
                return;
            }
            Object.keys(MODULOS_ACTUALIZACION).forEach(modulo => {
                if (!data?.some(x => x.modulo === modulo)) {
                    pintarActualizacionFuente({ modulo, actualizado_en: null });
                }
            });
            (data || []).forEach(pintarActualizacionFuente);
        }

        async function registrarActualizacionFuente(modulo, archivo, registros = null, origen = 'manual', detalles = {}) {
            try {
                const { data: sessionData } = await _supabase.auth.getSession();
                const payload = {
                    modulo,
                    actualizado_en: new Date().toISOString(),
                    archivo: String(archivo || '').slice(0, 240) || null,
                    origen: ['manual', 'bot', 'sistema'].includes(origen) ? origen : 'manual',
                    usuario_email: sessionData?.session?.user?.email || null,
                    registros: Number.isFinite(Number(registros)) && registros !== null ? Number(registros) : null,
                    detalles: detalles && typeof detalles === 'object' ? detalles : {}
                };
                const { data, error } = await _supabase
                    .from('actualizaciones_fuentes')
                    .upsert(payload, { onConflict: 'modulo' })
                    .select('modulo,actualizado_en,archivo,origen,usuario_email,registros,detalles')
                    .single();
                if (error) throw error;
                pintarActualizacionFuente(data);
                return true;
            } catch (error) {
                console.error('La carga terminó, pero no se pudo registrar su fecha:', error);
                const labels = document.querySelectorAll('[data-update-stamp="' + modulo + '"]');
                labels.forEach(el => { el.textContent = 'Datos guardados; no se pudo registrar la fecha de actualización'; });
                if (window.mostrarToast) mostrarToast('Los datos se guardaron, pero falló el registro de trazabilidad. ' + (error.message || ''), 'warning', 12000);
                return false;
            }
        }
        window.cargarActualizacionesFuentes = cargarActualizacionesFuentes;
        window.registrarActualizacionFuente = registrarActualizacionFuente;

        // Esta función resuelve el error 21000.
        // Conserva la última aparición de cada clave dentro del Excel completo.
        function deduplicarRegistros(registros, generarClave) {
            const mapa = new Map();
            const duplicados = [];
            const sinClave = [];

            registros.forEach((registro, indice) => {
                const clave = generarClave(registro);
                const filaExcel = indice + 2;

                if (!clave) {
                    sinClave.push(filaExcel);
                    return;
                }

                if (mapa.has(clave)) {
                    duplicados.push({
                        clave,
                        filaAnterior: mapa.get(clave)._filaExcel,
                        filaActual: filaExcel
                    });
                }

                mapa.set(
                    clave,
                    {
                        ...registro,
                        _filaExcel: filaExcel
                    }
                );
            });

            const unicos = Array.from(mapa.values()).map(registro => {
                const copia = { ...registro };
                delete copia._filaExcel;
                return copia;
            });

            return {
                registros: unicos,
                duplicados,
                sinClave
            };
        }

        async function guardarLotes(tabla, registros, opciones = {}) {
            if (!registros.length) {
                throw new Error(`No hay registros para guardar en ${tabla}.`);
            }
            invalidarCacheLecturas(tabla);

            let confirmados = 0;
            let lotesProcesados = 0;

            for (
                let inicio = 0;
                inicio < registros.length;
                inicio += TAMANO_LOTE
            ) {
                const lote = registros.slice(
                    inicio,
                    inicio + TAMANO_LOTE
                );

                const { data, error } = await _supabase
                    .from(tabla)
                    .upsert(
                        lote,
                        opciones
                    )
                    .select('id');

                if (error) {
                    throw errorSupabase(
                        `Error en ${tabla}, filas únicas ${inicio + 1} a ${inicio + lote.length}`,
                        error
                    );
                }

                confirmados += data?.length ?? lote.length;
                lotesProcesados++;
            }

            invalidarCacheLecturas(tabla);
            return {
                confirmados,
                lotesProcesados
            };
        }

        const consultasTablaCompletaEnCurso = new Map();
        // Caché temporal solo en memoria; no persiste datos personales ni licencias.
        const cacheLecturasTablaCompleta = new Map();
        const TTL_CACHE_LECTURAS_MS = 20000;

        function invalidarCacheLecturas(tabla = null) {
            if (!tabla) {
                cacheLecturasTablaCompleta.clear();
                return;
            }
            for (const clave of cacheLecturasTablaCompleta.keys()) {
                if (clave.startsWith(tabla + "::")) cacheLecturasTablaCompleta.delete(clave);
            }
        }
        window.invalidarCacheLecturas = invalidarCacheLecturas;
        if (_supabase?.auth?.onAuthStateChange) {
            _supabase.auth.onAuthStateChange(event => {
                if (event === 'SIGNED_OUT') invalidarCacheLecturas();
            });
        }

        async function leerTablaCompleta(tabla, columnaOrden = null) {
            const clave = tabla + "::" + (columnaOrden || "");
            const ahora = Date.now();
            const cache = cacheLecturasTablaCompleta.get(clave);
            if (cache && ahora - cache.timestamp < TTL_CACHE_LECTURAS_MS) return cache.data.slice();
            if (cache) cacheLecturasTablaCompleta.delete(clave);
            if (consultasTablaCompletaEnCurso.has(clave)) {
                return consultasTablaCompletaEnCurso.get(clave).then(rows => rows.slice());
            }

            const promesa = (async () => {
                const resultado = [];
                let desde = 0;
                const TAMANO_PAGINA = 1000;
                while (true) {
                    let consulta = _supabase.from(tabla).select('*');
                    if (columnaOrden) consulta = consulta.order(columnaOrden, { ascending: true });
                    const { data, error } = await consulta.range(desde, desde + TAMANO_PAGINA - 1);
                    if (error) throw error;
                    const pagina = data || [];
                    resultado.push(...pagina);
                    if (pagina.length < TAMANO_PAGINA) break;
                    desde += TAMANO_PAGINA;
                }
                cacheLecturasTablaCompleta.set(clave, { timestamp: Date.now(), data: resultado });
                return resultado;
            })();
            consultasTablaCompletaEnCurso.set(clave, promesa);
            try { return (await promesa).slice(); }
            finally { consultasTablaCompletaEnCurso.delete(clave); }
        }

        const CLAVE_NONCE_SESION_GLOBAL = 'doctor-simi-global-session-nonce';
        let temporizadorVigilanciaSesionGlobal = null;
        let cerrandoSesionPorControlGlobal = false;

        async function consultarNonceSesionGlobal(token) {
            const response = await fetch('/api/sesion-global', {
                method: 'GET',
                headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
                cache: 'no-store'
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'No se pudo comprobar la sesión global.');
            return String(body.nonce || '');
        }

        async function comprobarSesionGlobal(esInicioSesionNuevo = false) {
            const { data } = await _supabase.auth.getSession();
            const session = data?.session;
            if (!session?.access_token || cerrandoSesionPorControlGlobal) return;
            try {
                const nonceServidor = await consultarNonceSesionGlobal(session.access_token);
                if (!nonceServidor) return;
                let nonceLocal = '';
                try { nonceLocal = localStorage.getItem(CLAVE_NONCE_SESION_GLOBAL) || ''; } catch (_) {}
                if (esInicioSesionNuevo || !nonceLocal) {
                    try { localStorage.setItem(CLAVE_NONCE_SESION_GLOBAL, nonceServidor); } catch (_) {}
                    return;
                }
                if (nonceLocal !== nonceServidor) {
                    cerrandoSesionPorControlGlobal = true;
                    mostrarToast('El administrador cerró las sesiones para aplicar una actualización. Vuelve a iniciar sesión.', 'warning', 12000);
                    try { await _supabase.auth.signOut(); } catch (_) {}
                    perfilActualSistema = null;
                    modulosPermitidosActuales = [];
                    document.getElementById('login-overlay')?.classList.remove('hidden');
                    const errorBox = document.getElementById('login-error');
                    if (errorBox) {
                        errorBox.textContent = 'Tu sesión se cerró por una actualización general. Ingresa nuevamente.';
                        errorBox.classList.remove('hidden');
                    }
                    if (temporizadorVigilanciaSesionGlobal) clearInterval(temporizadorVigilanciaSesionGlobal);
                    temporizadorVigilanciaSesionGlobal = null;
                }
            } catch (error) {
                // Un fallo temporal de red no debe cerrar sesiones por error.
                console.warn('No se pudo comprobar el control de sesión global:', error.message || error);
            }
        }

        function iniciarVigilanciaSesionGlobal(esInicioSesionNuevo = false) {
            if (temporizadorVigilanciaSesionGlobal) clearInterval(temporizadorVigilanciaSesionGlobal);
            void comprobarSesionGlobal(esInicioSesionNuevo);
            temporizadorVigilanciaSesionGlobal = setInterval(() => void comprobarSesionGlobal(false), 15000);
        }

        async function cerrarSesionesDeTodos() {
            if (!esAdminPrincipalActual()) {
                mostrarToast('Solo el administrador principal puede cerrar todas las sesiones.', 'warning');
                return;
            }
            const confirmado = confirm('¿Cerrar las sesiones de TODOS los usuarios de Asistencia Doctor Simi, incluida la tuya? Tendrán que iniciar sesión nuevamente.');
            if (!confirmado) return;
            const boton = document.getElementById('btn-cerrar-sesiones-global');
            if (boton) { boton.disabled = true; boton.classList.add('opacity-60'); }
            try {
                const { data, error } = await _supabase.auth.getSession();
                if (error || !data?.session?.access_token) throw error || new Error('No hay una sesión activa.');
                const response = await fetch('/api/sesion-global', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer ' + data.session.access_token,
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify({ accion: 'CERRAR_TODAS' }),
                    cache: 'no-store'
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body.error || 'No se pudieron cerrar las sesiones.');
                mostrarToast('Cierre global solicitado. Los demás usuarios saldrán en un máximo aproximado de 15 segundos; tu sesión también se cerrará.', 'success', 10000);
                setTimeout(() => void cerrarSesion(), 900);
            } catch (error) {
                mostrarToast(error.message || 'No se pudo cerrar las sesiones.', 'error', 10000);
            } finally {
                if (boton) { boton.disabled = false; boton.classList.remove('opacity-60'); }
            }
        }

        function actualizarBienvenidaUsuario(user){
            const perfil=typeof perfilActualSistema!=='undefined'&&perfilActualSistema?perfilActualSistema:{};
            const meta=user?.user_metadata||{};
            const nombre=String(perfil.nombre||perfil.nombre_completo||meta.full_name||meta.name||'').trim();
            const email=String(user?.email||perfil.email||'').trim();
            const nombreVisible=nombre||email.split('@')[0]||'equipo de Asistencia';
            const nameEl=document.getElementById('dashboard-welcome-name');
            if(nameEl)nameEl.textContent=nombreVisible;
            const subtitle=document.getElementById('dashboard-welcome-subtitle');
            if(subtitle)subtitle.textContent=esAdminPrincipalActual()?'Tienes acceso de administrador principal a todos los módulos y herramientas del sistema.':'Tu centro de control para asistencia, ausentismo y operaciones.';
            const role=document.getElementById('dashboard-welcome-role');
            if(role)role.innerHTML='<i data-lucide="shield-check" class="h-4 w-4"></i> '+(esAdminPrincipalActual()?'Administrador principal':'Usuario autorizado');
            const botonCierreGlobal=document.getElementById('btn-cerrar-sesiones-global');
            if(botonCierreGlobal)botonCierreGlobal.classList.toggle('hidden',!esAdminPrincipalActual());
            if(window.lucide)lucide.createIcons();
        }

        function toggleSidebar(abrir) {
            document
                .getElementById('sidebar')
                .classList
                .toggle('open', abrir);
        }

        // ============================================================
        // INICIO Y AUTENTICACIÓN
        // ============================================================
        document.addEventListener(
            'DOMContentLoaded',
            async () => {
                document
                    .querySelectorAll('.menu-btn')
                    .forEach(boton => {
                        boton.className = 'menu-btn ui-button flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-300 hover:bg-simiNavyHover hover:text-white';
                    });

                lucide.createIcons();
                construirChecksPermisos();
                document.addEventListener('click',e=>{if(!e.target.closest('#pap-buscar')&&!e.target.closest('#pap-resultados'))document.getElementById('pap-resultados')?.classList.add('hidden');});
                await cambiarModulo('dashboard', false);

                const { data, error } = await _supabase.auth.getSession();

                if (error) {
                    mostrarToast(
                        `No se pudo comprobar la sesión: ${error.message}`,
                        'error'
                    );
                    return;
                }

                if (data.session) {
                    try{
                        await cargarPerfilPermisosActual(data.session.user);
                        actualizarBienvenidaUsuario(data.session.user);
                        document.getElementById('user-email-display').innerText=data.session.user.email;
                        document.getElementById('login-overlay').classList.add('hidden');
                        await cambiarModulo(tienePermisoModulo('dashboard')?'dashboard':modulosPermitidosActuales[0],false);
                        await inicializarDashboard();
                        if (window.cargarResumenEspacioDashboard) await window.cargarResumenEspacioDashboard();
                        await actualizarContadorNotificacionesTopbar();
                        iniciarVigilanciaSesionGlobal(false);
                    }catch(perfilError){
                        await _supabase.auth.signOut();
                        perfilActualSistema=null;modulosPermitidosActuales=[];
                        document.getElementById('login-overlay').classList.remove('hidden');
                        const eb=document.getElementById('login-error');if(eb){eb.textContent=perfilError.message;eb.classList.remove('hidden');}
                    }
                }
            }
        );

        _supabase.auth.onAuthStateChange(async(event)=>{if(event==='PASSWORD_RECOVERY'){const nueva=prompt('Escribe tu nueva clave (mínimo 8 caracteres):');if(!nueva)return;if(nueva.length<8)return mostrarToast('La clave debe tener al menos 8 caracteres.','warning');const repetir=prompt('Repite la nueva clave:');if(nueva!==repetir)return mostrarToast('Las claves no coinciden.','error');const {error}=await _supabase.auth.updateUser({password:nueva});if(error)mostrarToast(error.message,'error');else mostrarToast('Clave actualizada correctamente. Ya puedes iniciar sesión.','success',12000);}});

        function togglePasswordVisibility(){const i=document.getElementById('login-pass'),e=document.getElementById('password-eye-icon');if(!i)return;const v=i.type==='text';i.type=v?'password':'text';if(e)e.setAttribute('data-lucide',v?'eye':'eye-off');lucide.createIcons();}
        async function recuperarContrasena(){const email=document.getElementById('login-email')?.value.trim(),box=document.getElementById('login-error');box.classList.remove('hidden');if(!email){box.textContent='Ingresa tu correo corporativo.';return}const{error}=await _supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});box.textContent=error?error.message:'Revisa tu correo para continuar con la recuperación.';}
        const LOGIN_REMEMBER_EMAIL_KEY = 'doctor-simi-rrhh-login-email';

        function syncRememberedLoginEmail() {
            const emailInput = document.getElementById('login-email');
            const remember = document.getElementById('login-remember');
            if (!emailInput || !remember) return;
            try {
                if (remember.checked && emailInput.value.trim()) {
                    localStorage.setItem(LOGIN_REMEMBER_EMAIL_KEY, emailInput.value.trim());
                } else {
                    localStorage.removeItem(LOGIN_REMEMBER_EMAIL_KEY);
                }
            } catch (_) { /* El almacenamiento puede estar deshabilitado por el navegador. */ }
        }

        function initRememberedLoginEmail() {
            const emailInput = document.getElementById('login-email');
            const remember = document.getElementById('login-remember');
            if (!emailInput || !remember) return;
            try {
                const savedEmail = localStorage.getItem(LOGIN_REMEMBER_EMAIL_KEY);
                if (savedEmail && !emailInput.value) {
                    emailInput.value = savedEmail;
                    remember.checked = true;
                }
                remember.addEventListener('change', syncRememberedLoginEmail);
                emailInput.addEventListener('change', syncRememberedLoginEmail);
            } catch (_) { /* No bloquear el acceso si el almacenamiento está restringido. */ }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initRememberedLoginEmail, { once: true });
        } else {
            initRememberedLoginEmail();
        }

        async function iniciarSesion(event) {
            event.preventDefault();

            const boton = document.getElementById('btn-login');
            const errorBox = document.getElementById('login-error');
            const label = boton?.querySelector('.nova-v3-submit-label');
            const icon = boton?.querySelector('.nova-v3-submit-icon');

            syncRememberedLoginEmail();
            if (boton) {
                boton.disabled = true;
                boton.setAttribute('aria-busy', 'true');
                boton.classList.add('is-loading');
                if (label) label.textContent = 'Verificando acceso…';
                else boton.textContent = 'Verificando acceso…';
                if (icon) icon.innerHTML = '<i data-lucide="loader-circle"></i>';
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
            errorBox.classList.add('hidden');

            try {
                const { data, error } = await _supabase.auth.signInWithPassword({
                    email: document.getElementById('login-email').value.trim(),
                    password: document.getElementById('login-pass').value
                });

                if (error) throw error;

                await cargarPerfilPermisosActual(data.user);
                actualizarBienvenidaUsuario(data.user);
                document.getElementById('user-email-display').innerText = data.user.email;
                document.getElementById('login-overlay').classList.add('hidden');
                await cambiarModulo(tienePermisoModulo('dashboard') ? 'dashboard' : modulosPermitidosActuales[0], false);
                await inicializarDashboard();
                if (window.cargarResumenEspacioDashboard) await window.cargarResumenEspacioDashboard();
                await actualizarContadorNotificacionesTopbar();
                iniciarVigilanciaSesionGlobal(true);
            } catch (error) {
                try { await _supabase.auth.signOut(); } catch (_) {}
                perfilActualSistema = null;
                modulosPermitidosActuales = [];
                errorBox.textContent = error.message || 'Credenciales incorrectas.';
                errorBox.classList.remove('hidden');
            } finally {
                if (boton) {
                    boton.disabled = false;
                    boton.removeAttribute('aria-busy');
                    boton.classList.remove('is-loading');
                    if (label) label.textContent = 'Acceder al portal';
                    else boton.textContent = 'Acceder al portal';
                    if (icon) icon.innerHTML = '<i data-lucide="arrow-up-right"></i>';
                    if (window.lucide?.createIcons) window.lucide.createIcons();
                }
            }
        }

        async function cerrarSesion() {
            const { error } = await _supabase.auth.signOut();

            if (error) {
                mostrarToast(error.message, 'error');
                return;
            }

            perfilActualSistema=null;modulosPermitidosActuales=[];
            modulos.forEach(nombre=>document.getElementById('btn-'+nombre)?.classList.remove('hidden'));
            datosAsistenciaGlobal = [];
            datosLicenciasGlobal = [];
            asistenciaCargada = false;
            licenciasCargadas = false;

            document
                .getElementById('login-overlay')
                .classList
                .remove('hidden');
        }

        // ============================================================
        // NAVEGACIÓN
        // ============================================================
        let secuenciaCambioModulo = 0;
        let ultimaConsultaActualizacionesFuente = 0;
        async function cargarPanelInteligenteOperativo() {
            const estado=document.getElementById('pi-estado');
            const prioridades=document.getElementById('pi-prioridades');
            const setValue=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
            const fmt=value=>Number(value).toLocaleString('es-CL');
            if(estado)estado.textContent='Consultando datos reales…';
            if(prioridades)prioridades.textContent='Calculando prioridades…';
            const permitido=(modulo)=>(typeof esAdminPrincipalActual==='function'&&esAdminPrincipalActual())||(typeof tienePermisoModulo==='function'&&tienePermisoModulo(modulo));
            const cuenta=async(tabla,modulo,configurar)=>{
                if(!permitido(modulo))return {ok:false,value:null,error:'Sin permiso'};
                let q=_supabase.from(tabla).select('id',{count:'exact',head:true});
                if(configurar)q=configurar(q);
                const r=await q;
                return r.error?{ok:false,value:null,error:r.error.message}:{ok:true,value:r.count??0};
            };
            const resultados=await Promise.allSettled([
                cuenta('registros_asistencia','asistencia'),
                cuenta('registros_asistencia','asistencia',q=>q.eq('marca_incompleta',true)),
                cuenta('solicitudes_dotacion','amonestaciones',q=>q.eq('estado','PENDIENTE'))
            ]);
            const valores=resultados.map(r=>r.status==='fulfilled'?r.value:{ok:false,value:null,error:r.reason?.message||'Error de consulta'});
            setValue('pi-asistencia',valores[0].ok?fmt(valores[0].value):'No disponible');
            setValue('pi-incompletas',valores[1].ok?fmt(valores[1].value):'No disponible');
            setValue('pi-coberturas',valores[2].ok?fmt(valores[2].value):'No disponible');
            const importPermitido=permitido('integraciones');
            let importacion='No disponible',detalle=importPermitido?'No se pudo consultar el historial de importaciones':'Sin permiso para ver importaciones';
            if(importPermitido){
                try{
                    const r=await _supabase.from('importaciones').select('id,modulo,nombre_archivo,estado,created_at,finalizada_at,filas_error,filas_rechazadas').order('created_at',{ascending:false}).limit(1);
                    if(!r.error){
                        if(r.data&&r.data.length){const x=r.data[0];importacion=String(x.estado||'Registrada');detalle=(x.nombre_archivo||x.modulo||'Importación')+' · '+new Date(x.finalizada_at||x.created_at).toLocaleString('es-CL');}
                        else{importacion='Sin registros';detalle='Todavía no hay importaciones registradas';}
                    }else detalle=r.error.message;
                }catch(e){detalle=e.message||detalle;}
            }
            setValue('pi-importacion',importacion);
            setValue('pi-importacion-detalle',detalle);
            const items=[];
            if(valores[0].ok)items.push('Base de asistencia: '+fmt(valores[0].value)+' registros disponibles.');
            else items.push('Asistencia: no fue posible consultar el indicador ('+valores[0].error+').');
            if(valores[1].ok&&valores[1].value>0)items.push('Revisar '+fmt(valores[1].value)+' registros con marca incompleta.');
            else if(valores[1].ok)items.push('No hay registros marcados como incompletos en la consulta actual.');
            else items.push('Marcas incompletas: indicador no disponible; no se asume que el total sea cero.');
            if(valores[2].ok&&valores[2].value>0)items.push('Gestionar '+fmt(valores[2].value)+' solicitudes de cobertura pendientes.');
            else if(valores[2].ok)items.push('No hay solicitudes pendientes según la consulta actual.');
            else items.push('Coberturas: indicador no disponible; revisa permisos o conexión.');
            if(prioridades)prioridades.innerHTML=items.map(x=>'<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">'+escaparHTML(x)+'</div>').join('');
            const fallos=valores.filter(x=>!x.ok).length+(importacion==='No disponible'?1:0);
            if(estado)estado.textContent=(fallos?'Algunos indicadores no disponibles':'Datos reales actualizados')+' · '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
            setValue('pi-actualizado','Última consulta: '+new Date().toLocaleString('es-CL'));
            if(window.lucide)lucide.createIcons();
        }
        window.cargarPanelInteligenteOperativo=cargarPanelInteligenteOperativo;
        async function cambiarModulo(modulo, cargar = true) {
            const secuenciaActual = ++secuenciaCambioModulo;
            // No repetir una consulta a Supabase por cada clic de navegación.
            if (window.cargarActualizacionesFuentes && Date.now() - ultimaConsultaActualizacionesFuente > 30000) {
                ultimaConsultaActualizacionesFuente = Date.now();
                cargarActualizacionesFuentes().catch(error => {
                    ultimaConsultaActualizacionesFuente = 0;
                    console.warn('Trazabilidad de archivos:', error);
                });
            }
            if(perfilActualSistema&&!tienePermisoModulo(modulo)){mostrarToast('No tienes permiso para acceder a este apartado.','warning');const primero=modulos.find(nombre=>tienePermisoModulo(nombre));if(primero&&primero!==modulo)return cambiarModulo(primero,cargar);return;}
            modulos.forEach(nombre => {
                const boton = document.getElementById(`btn-${nombre}`);

                if (boton) {
                    const ocultoPorPermiso = boton.classList.contains('hidden');
                    boton.className = `menu-btn ui-button flex w-full items-center gap-3 rounded-lg px-3 py-2.5 ${nombre === modulo ? 'active font-semibold text-white' : 'text-slate-300 hover:bg-simiNavyHover hover:text-white'}${ocultoPorPermiso ? ' hidden' : ''}`;
                    if (nombre === modulo) boton.setAttribute('aria-current', 'page');
                    else boton.removeAttribute('aria-current');
                }

                const vista = document.getElementById(`view-${nombre}`);

                if (vista) {
                    vista.classList.remove('rrhh-view-enter');
                    vista.classList.add('hidden');
                }
            });

            document
                .getElementById('view-generic')
                .classList
                .add('hidden');

            const dashboardView=document.getElementById('view-dashboard');
            if(dashboardView)dashboardView.classList.toggle('hidden',modulo!=='dashboard');
            const dashboardPanel=document.getElementById('dashboard-panel-inteligente');
            if(dashboardPanel)dashboardPanel.classList.toggle('hidden',modulo!=='dashboard');
            document.getElementById('header-title').innerText =
                titulos[modulo] || modulo;

            const vista = document.getElementById(`view-${modulo}`);

            if (vista) {
                vista.classList.remove('hidden');
                requestAnimationFrame(() => {
                    if (secuenciaActual === secuenciaCambioModulo && !vista.classList.contains('hidden')) {
                        vista.classList.add('rrhh-view-enter');
                    }
                });
                vista.addEventListener('animationend', () => vista.classList.remove('rrhh-view-enter'), { once: true });
                if (window.actualizarContextoModulo) window.actualizarContextoModulo(modulo);
            } else {
                const generic = document.getElementById('view-generic');
                generic.classList.remove('hidden');
                requestAnimationFrame(() => {
                    if (secuenciaActual === secuenciaCambioModulo && !generic.classList.contains('hidden')) {
                        generic.classList.add('rrhh-view-enter');
                    }
                });
                generic.addEventListener('animationend', () => generic.classList.remove('rrhh-view-enter'), { once: true });
                document.getElementById('generic-title').innerText =
                    `${titulos[modulo]} - Módulo en desarrollo`;
            }

            toggleSidebar(false);
            lucide.createIcons();

            if (!cargar) {
                return;
            }

            try {
                if (modulo === 'espacio' && window.cargarEspacioTrabajo) await window.cargarEspacioTrabajo();
                if (modulo === 'dashboard') {
                    if (window.cargarPanelInteligenteOperativo) await window.cargarPanelInteligenteOperativo();
                    if (window.cargarResumenEspacioDashboard) {
                        Promise.resolve(window.cargarResumenEspacioDashboard())
                            .catch(error => console.warn('Resumen de Mi espacio:', error));
                    }
                    if (window.cargarResumenOperativoRRHH) window.cargarResumenOperativoRRHH();
                }
                if (modulo === 'chat' && window.cargarChatInterno) await window.cargarChatInterno();
                if (modulo === 'traslados' && window.iniciarModuloTraslados) await window.iniciarModuloTraslados();
                if (modulo === 'reportes') await prepararFiltrosReportesRRHH();
                if (modulo === 'colaboradores') {
                    await cargarTablaColaboradores();
                }

                if (modulo === 'sucursales') {
                    await cargarTablaSucursales();
                }

                if (modulo === 'asistencia') {
                    if (!asistenciaCargada) {
                        await cargarAsistenciaDesdeNube();
                    } else {
                        renderizarFiltrosAsistencia();
                    }
                }

                if (modulo === 'licencias') {
                    if (!licenciasCargadas) {
                        await cargarLicenciasDesdeNube();
                    } else {
                        poblarFiltrosLicencias();
                    }
                }

                if (modulo === 'vacaciones') {
                    if (!vacacionesCargadas) await cargarVacacionesDesdeNube();
                    else renderizarVacaciones();
                }
                if (modulo === 'papeletas') { await prepararModuloPapeletas(); await cargarPapeletas(); }
                if (modulo === 'sucursales') await prepararMapaYConfiguracionSucursales();
                if (modulo === 'correos') await prepararModuloCorreos();
                if (modulo === 'amonestaciones') await prepararModuloCoberturas();
                if (modulo === 'configcorreos') await prepararConfiguracionCorreos();
                if (modulo === 'mapas') await prepararMapa14();
                if (modulo === 'tareas') await prepararModuloTareas();
                if (modulo === 'operaciones') await cargarCentroOperaciones();
                if (modulo === 'calidad') await cargarPanelCalidad();
                if (modulo === 'notificaciones') await cargarCentroNotificaciones();
                if (modulo === 'integraciones') await cargarPanelIntegraciones();
                if (modulo === 'usuarios') await cargarUsuariosRoles();
                if (modulo === 'auditoria') await cargarAuditoria();
            } catch (error) {
                if (secuenciaActual === secuenciaCambioModulo) mostrarToast(error.message, 'error', 15000);
                else console.debug('Carga de módulo anterior omitida tras cambiar de vista:', modulo);
            }
        }




        // ============================================================
        // BUSCADOR GLOBAL · Navegación por teclado y permisos
        // ============================================================
        const etiquetasBusquedaGlobal={
            dashboard:['inicio','resumen','indicadores','kpi'],
            espacio:['notas','posit','post it','bitácora','recordatorios','mi espacio'],
            colaboradores:['personas','empleados','trabajadores','rut'],
            sucursales:['locales','farmacias','directorio','direcciones'],
            asistencia:['marcas','atrasos','entrada','salida','turnos'],
            licencias:['licencias médicas','ausentismo','iméd','medipass'],
            vacaciones:['feriado','descanso','solicitudes'],
            papeletas:['permisos','documentos','papeleta'],
            correos:['email','outlook','borradores','supervisores'],
            amonestaciones:['coberturas','reemplazos','sucursal'],
            reportes:['excel','csv','pdf','estadísticas','ia'],
            usuarios:['roles','accesos','permisos'],
            auditoria:['historial','trazabilidad','registro'],
            configcorreos:['correos sucursales','destinatarios','cc'],
            mapas:['distancia','ruta','kilómetros','gps'],
            tareas:['pendientes','asignaciones','productividad','kpi'],
            operaciones:['alertas','prioridades','vencimientos','centro de mando'],
            calidad:['importaciones','errores','coordenadas','integridad'],
            notificaciones:['avisos','sin leer','bandeja'],
            integraciones:['talana','imed','supabase','vercel','gemini','outlook']
        };
        function abrirBuscadorGlobal(){
            const ov=document.getElementById('global-search-overlay'),inp=document.getElementById('global-search-input');
            if(!ov||!inp)return;
            // No abrir la paleta sobre el login ni antes de cargar el perfil.
            if(typeof perfilActualSistema!=='undefined'&&!perfilActualSistema)return;
            ov.classList.remove('hidden');ov.removeAttribute('aria-hidden');ov.style.display='flex';
            document.body.classList.add('search-open');inp.value='';renderBuscadorGlobal();
            window.requestAnimationFrame(()=>inp.focus());
        }
        function cerrarBuscadorGlobal(){
            const ov=document.getElementById('global-search-overlay');
            if(ov){ov.classList.add('hidden');ov.setAttribute('aria-hidden','true');ov.style.display='none';}
            document.body.classList.remove('search-open');
        }
        function renderBuscadorGlobal(){
            const out=document.getElementById('global-search-results'),q=texto(document.getElementById('global-search-input')?.value).toLowerCase();if(!out)return;
            const found=modulos.filter(m=>tienePermisoModulo(m)&&((String(titulos[m]||m)+' '+m+' '+(etiquetasBusquedaGlobal[m]||[]).join(' ')).toLowerCase().includes(q)));
            out.innerHTML=found.length?found.map((m,i)=>'<button type="button" data-search-module="'+opsEsc(m)+'" onclick="navegarBuscadorGlobal(\''+opsEsc(m)+'\')" class="global-search-result '+(i===0?'selected':'')+'"><span class="global-search-result-icon"><i data-lucide="'+({dashboard:'layout-dashboard',colaboradores:'users',sucursales:'building',asistencia:'clock',licencias:'file-heart',vacaciones:'tree-palm',papeletas:'file-text',correos:'mail',amonestaciones:'folder-alert',reportes:'chart-no-axes-combined',usuarios:'shield-check',auditoria:'clock-arrow-down',configcorreos:'mail-cog',mapas:'map-pinned',tareas:'list-checks',operaciones:'gauge',calidad:'shield-check',notificaciones:'bell-ring',integraciones:'plug-zap'}[m]||'arrow-right')+'" class="h-4 w-4"></i></span><span class="min-w-0 flex-1"><strong class="block text-sm">'+opsEsc(titulos[m]||m)+'</strong><span class="mt-0.5 block text-xs text-slate-500">'+opsEsc((etiquetasBusquedaGlobal[m]||[]).slice(0,4).join(' · '))+'</span></span><i data-lucide="corner-down-left" class="h-4 w-4 text-slate-400"></i></button>').join(''):'<div class="p-8 text-center"><i data-lucide="search-x" class="mx-auto h-7 w-7 text-slate-300"></i><p class="mt-2 text-sm font-bold text-slate-600">No hay resultados</p><p class="mt-1 text-xs text-slate-400">Prueba con otro término o revisa tus permisos.</p></div>';
            if(!found.length&&typeof perfilActualSistema!=='undefined'&&perfilActualSistema){
                out.innerHTML='<div class="p-8 text-center"><i data-lucide="shield-alert" class="mx-auto h-7 w-7 text-amber-500"></i><p class="mt-2 text-sm font-bold text-slate-700">No hay módulos disponibles</p><p class="mt-1 text-xs text-slate-500">Solicita al administrador que revise los permisos de tu perfil.</p></div>';
            }
            if(window.lucide)lucide.createIcons();
        }
        function moverBuscadorGlobal(delta){
            const items=[...document.querySelectorAll('#global-search-results [data-search-module]')];if(!items.length)return;
            const idx=items.indexOf(document.activeElement),next=(idx+delta+items.length)%items.length;items[next].focus();
        }
        function navegarBuscadorGlobal(modulo){if(!tienePermisoModulo(modulo)){mostrarToast('No tienes permiso para abrir este módulo.','warning');return;}cerrarBuscadorGlobal();cambiarModulo(modulo);}
        document.addEventListener('keydown',function(e){
            if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){
                if(typeof perfilActualSistema!=='undefined'&&!perfilActualSistema)return;
                e.preventDefault();abrirBuscadorGlobal();return;
            }
            const overlay=document.getElementById('global-search-overlay'),abierto=overlay&&!overlay.classList.contains('hidden');
            if(e.key==='Escape'&&abierto){cerrarBuscadorGlobal();return;}
            if(abierto&&e.target?.id!=='global-search-input'&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moverBuscadorGlobal(e.key==='ArrowDown'?1:-1);}
        });

        // ============================================================
        // NOTIFICACIONES · Bandeja personal con actualización segura
        // ============================================================
        let notificacionesCentroGlobal=[];
        async function actualizarContadorNotificacionesTopbar(){
            const badge=document.getElementById('topbar-notif-count'),nav=document.getElementById('nav-notif-count');
            if(!badge&&!nav)return;
            try{
                const {count,error}=await _supabase.from('notificaciones').select('id',{count:'exact',head:true}).eq('leida',false);
                if(error)throw error;
                const n=Number(count||0);
                [badge,nav].filter(Boolean).forEach(node=>{node.textContent=n>99?'99+':String(n);node.classList.toggle('hidden',n===0);});
            }catch(error){console.warn('Contador de notificaciones:',error.message);}
        }
        async function cargarCentroNotificaciones(){
            const lista=document.getElementById('notif-lista');if(!lista)return;
            lista.innerHTML='<p class="text-sm text-slate-500">Consultando tu bandeja...</p>';
            const {data,error}=await _supabase.from('notificaciones').select('id,tipo,titulo,mensaje,entidad_tipo,entidad_id,leida,created_at,leida_at').order('created_at',{ascending:false}).limit(250);
            if(error){lista.innerHTML='<div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">No se pudieron cargar las notificaciones: '+opsEsc(error.message)+'</div>';return;}
            notificacionesCentroGlobal=data||[];renderizarCentroNotificaciones();
            const stamp=document.getElementById('notif-actualizado');if(stamp)stamp.textContent='Actualizado '+new Date().toLocaleString('es-CL');
        }
        function renderizarCentroNotificaciones(){
            const lista=document.getElementById('notif-lista'),k=document.getElementById('notif-kpis');if(!lista||!k)return;
            const unread=notificacionesCentroGlobal.filter(x=>!x.leida).length,filter=document.getElementById('notif-filtro')?.value||'TODAS';
            const rows=notificacionesCentroGlobal.filter(x=>filter==='TODAS'||(filter==='PENDIENTES'?!x.leida:!!x.leida));
            const card=(t,v,d,ic)=>'<div class="ui-card p-5"><div class="flex items-center justify-between"><span class="text-xs font-bold uppercase tracking-wide text-slate-500">'+opsEsc(t)+'</span><i data-lucide="'+ic+'" class="h-5 w-5 text-blue-600"></i></div><strong class="mt-3 block text-3xl font-black">'+opsEsc(v)+'</strong><p class="mt-1 text-xs text-slate-500">'+opsEsc(d)+'</p></div>';
            k.innerHTML=card('Total cargadas',notificacionesCentroGlobal.length,'Máximo 250 más recientes','bell')+card('Sin leer',unread,'Requieren atención','bell-dot')+card('Leídas',notificacionesCentroGlobal.length-unread,'Avisos revisados','check-check');
            const navBadge=document.getElementById('nav-notif-count');if(navBadge){navBadge.textContent=unread>99?'99+':String(unread);navBadge.classList.toggle('hidden',unread===0);}
            const topBadge=document.getElementById('topbar-notif-count');if(topBadge){topBadge.textContent=unread>99?'99+':String(unread);topBadge.classList.toggle('hidden',unread===0);}
            lista.innerHTML=rows.length?rows.map(x=>'<article class="notif-item flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-start '+(!x.leida?'unread':'')+'"><span class="notif-symbol"><i data-lucide="'+(/error|urg|venc/i.test((x.tipo||'')+' '+(x.titulo||''))?'alert-triangle':'bell')+'" class="h-5 w-5"></i></span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">'+opsEsc(x.titulo||'Notificación')+'</strong>'+(!x.leida?'<span class="notif-pill">Nueva</span>':'')+'</div><p class="mt-1 whitespace-pre-wrap text-sm text-slate-600">'+opsEsc(x.mensaje||'Sin detalle adicional')+'</p><p class="mt-2 text-xs text-slate-400">'+opsEsc(x.tipo||'Aviso')+' · '+opsEsc(x.created_at?new Date(x.created_at).toLocaleString('es-CL'):'Fecha no disponible')+'</p></div>'+(!x.leida?'<button type="button" class="notif-mark" onclick="marcarNotificacionLeida('+Number(x.id)+')"><i data-lucide="check" class="h-4 w-4"></i> Marcar leída</button>':'<span class="self-center text-xs text-slate-400">Leída</span>')+'</article>').join(''):'<div class="rounded-xl border border-dashed border-slate-300 p-8 text-center"><i data-lucide="bell-off" class="mx-auto h-8 w-8 text-slate-400"></i><p class="mt-3 font-bold text-slate-700">No hay notificaciones en esta vista</p><p class="mt-1 text-sm text-slate-500">Cuando se registren avisos para tu perfil, aparecerán aquí.</p></div>';
            if(window.lucide)lucide.createIcons();
        }
        async function marcarNotificacionLeida(id){
            const item=notificacionesCentroGlobal.find(x=>Number(x.id)===Number(id));if(!item||item.leida)return;
            const {error}=await _supabase.from('notificaciones').update({leida:true,leida_at:new Date().toISOString()}).eq('id',id);
            if(error){mostrarToast('No se pudo marcar la notificación: '+error.message,'error');return;}
            item.leida=true;item.leida_at=new Date().toISOString();renderizarCentroNotificaciones();mostrarToast('Notificación marcada como leída.','success');
        }
        async function marcarTodasNotificacionesLeidas(){
            const ids=notificacionesCentroGlobal.filter(x=>!x.leida).map(x=>x.id);if(!ids.length){mostrarToast('No hay notificaciones pendientes.','info');return;}
            const ahora=new Date().toISOString();
            const {error}=await _supabase.from('notificaciones').update({leida:true,leida_at:ahora}).in('id',ids);
            if(error){mostrarToast('No se pudieron actualizar las notificaciones: '+error.message,'error');return;}
            notificacionesCentroGlobal.forEach(x=>{if(ids.includes(x.id)){x.leida=true;x.leida_at=ahora;}});
            renderizarCentroNotificaciones();mostrarToast('Todas las notificaciones visibles están leídas.','success');
        }

        // ============================================================
        // INTEGRACIONES · No confundir presencia de código con conexión
        // ============================================================
        async function cargarPanelIntegraciones(){
            if(!esAdminPrincipalActual()){mostrarToast('Este panel está reservado a la cuenta administradora principal.','warning');return;}
            const k=document.getElementById('integ-kpis'),lista=document.getElementById('integ-lista');if(!k||!lista)return;
            k.innerHTML='<div class="ui-card p-5">Comprobando...</div>'.repeat(4);lista.innerHTML='<p class="text-sm text-slate-500">Consultando estado de la plataforma...</p>';
            let db={ok:false,count:null,error:null};
            try{const r=await _supabase.from('sucursales').select('id',{count:'exact',head:true});db={ok:!r.error,count:r.count??0,error:r.error?.message||null};}catch(e){db={ok:false,count:null,error:e.message};}
            const last=await _supabase.from('importaciones').select('id,modulo,estado,created_at,finalizada_at,filas_error,filas_rechazadas').order('created_at',{ascending:false}).limit(1);
            const cards=[
                {t:'Base de datos',v:db.ok?'Conectada':'No verificada',d:db.ok?db.count+' sucursales accesibles':'Consulta fallida',i:'database',state:db.ok?'ok':'warn'},
                {t:'API de IA',v:'Ruta en proyecto',d:'Endpoint api/gemini.js; requiere validar secretos y respuesta en runtime',i:'brain-circuit',state:'info'},
                {t:'Geocodificación',v:'Ruta en proyecto',d:'Endpoint api/geocodificar.js; proveedor externo sujeto a disponibilidad',i:'map-pinned',state:'info'},
                {t:'Importaciones',v:last.error?'No disponible':(last.data?.length?'Con historial':'Sin historial'),d:last.error?'No se pudo consultar':(last.data?.[0]?'Último proceso: '+new Date(last.data[0].created_at).toLocaleString('es-CL'):'No hay procesos registrados'),i:'file-up',state:last.error?'warn':last.data?.length?'ok':'info'}
            ];
            k.innerHTML=cards.map(x=>'<div class="ui-card p-5"><div class="flex items-center justify-between gap-3"><span class="text-xs font-bold uppercase tracking-wide text-slate-500">'+opsEsc(x.t)+'</span><i data-lucide="'+x.i+'" class="h-5 w-5 text-blue-600"></i></div><strong class="mt-3 block text-lg font-black text-slate-900">'+opsEsc(x.v)+'</strong><p class="mt-2 text-xs text-slate-500">'+opsEsc(x.d)+'</p></div>').join('');
            const items=[
                {name:'Supabase',type:'Base de datos',status:db.ok?'Verificada en vivo':'Error de consulta',detail:db.ok?'La sesión actual pudo consultar sucursales ('+db.count+' registros visibles).':db.error||'No se obtuvo una respuesta válida.',kind:db.ok?'ok':'warn'},
                {name:'Vercel Functions · Gemini',type:'API backend',status:'Implementada en el repositorio',detail:'Existe api/gemini.js. La presencia del archivo no garantiza que la variable de entorno del proveedor esté configurada ni que el servicio responda.',kind:'info'},
                {name:'Geocodificación',type:'API backend',status:'Implementada en el repositorio',detail:'Existe api/geocodificar.js. La resolución de direcciones depende del proveedor, los límites de uso y las coordenadas guardadas.',kind:'info'},
                {name:'Talana',type:'Sistema externo',status:'Conector automático no identificado',detail:'No se encontró un endpoint dedicado de sincronización de Talana en el inventario de este proyecto. Requiere API oficial, permisos y credenciales de servidor.',kind:'warn'},
                {name:'IMED / Medipass',type:'Sistema externo',status:'Conector automático no identificado',detail:'No se encontró un endpoint dedicado de sincronización de licencias IMED/Medipass en este proyecto. No debe considerarse sincronizado hasta probar un flujo real.',kind:'warn'},
                {name:'Outlook',type:'Correo',status:'Exportación EML manual',detail:'La aplicación prepara archivos para abrir en Outlook; esto no confirma envío automático ni seguimiento de entrega.',kind:'info'},
                {name:'Historial de importaciones',type:'Trazabilidad',status:last.error?'No disponible':(last.data?.length?'Última ejecución registrada':'Sin ejecuciones'),detail:last.error?last.error.message:(last.data?.[0]?'Módulo: '+(last.data[0].modulo||'—')+' · Estado: '+(last.data[0].estado||'—'):'Cuando se ejecuten importaciones, el historial aparecerá aquí.'),kind:last.error?'warn':last.data?.length?'ok':'info'}
            ];
            lista.innerHTML=items.map(x=>'<div class="integ-row flex flex-col gap-3 sm:flex-row sm:items-start"><span class="integ-status '+x.kind+'">'+opsEsc(x.status)+'</span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">'+opsEsc(x.name)+'</strong><span class="text-xs text-slate-400">'+opsEsc(x.type)+'</span></div><p class="mt-1 text-sm text-slate-600">'+opsEsc(x.detail)+'</p></div></div>').join('');
            const stamp=document.getElementById('integ-actualizado');if(stamp)stamp.textContent='Comprobado '+new Date().toLocaleString('es-CL');
            if(window.lucide)lucide.createIcons();
            if(window.cargarPanelBotTalana) await window.cargarPanelBotTalana();
        }

        // ============================================================
        // CENTRO DE OPERACIONES · Indicadores limitados por permisos
        // ============================================================
        function opsEsc(v){return escaparHTML(v==null?'':String(v));}
        function opsTiene(...permisos){return esAdminPrincipalActual()||permisos.some(p=>tienePermisoModulo(p));}
        async function opsConsultar(tabla,campos,permisos,configurar){
            if(!opsTiene(...permisos))return {disponible:false,data:[],count:null,error:null};
            try{
                let q=_supabase.from(tabla).select(campos||'id',{count:'exact'});
                if(configurar)q=configurar(q);
                const r=await q.limit(500);
                if(r.error)return {disponible:false,data:[],count:null,error:r.error.message};
                return {disponible:true,data:r.data||[],count:r.count??(r.data||[]).length,error:null};
            }catch(e){return {disponible:false,data:[],count:null,error:e.message};}
        }
        async function opsContar(tabla,permisos,configurar){
            if(!opsTiene(...permisos))return {disponible:false,count:null,error:null};
            try{let q=_supabase.from(tabla).select('id',{count:'exact',head:true});if(configurar)q=configurar(q);const r=await q;return r.error?{disponible:false,count:null,error:r.error.message}:{disponible:true,count:r.count??0,error:null};}
            catch(e){return {disponible:false,count:null,error:e.message};}
        }
        async function cargarCentroOperaciones(){
            const kpis=document.getElementById('ops-kpis'),alertas=document.getElementById('ops-alertas'),accesos=document.getElementById('ops-accesos');
            if(!kpis||!alertas||!accesos)return;
            kpis.innerHTML='<div class="ui-card p-5"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>'.repeat(4);
            alertas.innerHTML='<p class="text-sm text-slate-500">Consultando fuentes autorizadas...</p>';
            const ahoraIso=new Date().toISOString();
            const consultas=await Promise.all([
                opsConsultar('tareas','id,titulo,estado,fecha_limite,prioridad,responsable:usuarios_roles!tareas_responsable_rol_id_fkey(nombre,email),sucursal:sucursales(nombre)',['tareas'],q=>q.order('fecha_limite',{ascending:true})),
                opsConsultar('gestiones_correo','id,asunto,estado,plazo_respuesta,supervisor',['correos'],q=>q.order('plazo_respuesta',{ascending:true})),
                opsContar('tareas',['tareas'],q=>q.not('estado','in','("APROBADA","CANCELADA")')),
                opsContar('tareas',['tareas'],q=>q.not('estado','in','("APROBADA","CANCELADA")').lt('fecha_limite',ahoraIso)),
                opsContar('gestiones_correo',['correos'],q=>q.not('estado','in','("RESPONDIDO","CERRADO","CANCELADO")')),
                opsContar('gestiones_correo',['correos'],q=>q.not('estado','in','("RESPONDIDO","CERRADO","CANCELADO")').lt('plazo_respuesta',ahoraIso)),
                opsContar('registros_asistencia',['asistencia','reportes'],q=>q.or('sin_marca.eq.true,marca_incompleta.eq.true,sin_turno_marcas.eq.true')),
                opsContar('notificaciones',['tareas'],q=>q.eq('leida',false))
            ]);
            const [t,c,tp,tv,cp,cv,incidencias,notificacionesSinLeer]=consultas,disponible=x=>x.disponible,now=new Date();
            const tareas=t.data||[],tPend=tareas.filter(x=>!['APROBADA','CANCELADA'].includes(String(x.estado||'').toUpperCase())),tVenc=tPend.filter(x=>x.fecha_limite&&new Date(x.fecha_limite)<now);
            const correos=c.data||[],cPend=correos.filter(x=>!['RESPONDIDO','CERRADO','CANCELADO'].includes(String(x.estado||'').toUpperCase())),cVenc=cPend.filter(x=>x.plazo_respuesta&&new Date(x.plazo_respuesta)<now);
            const metricas=[
                {label:'Tareas abiertas',value:tp.disponible?tp.count:'—',desc:tp.disponible?(tv.disponible?tv.count+' vencidas':'Plazos vencidos no disponibles'):'Sin permiso de tareas',icon:'list-checks',color:'blue',module:'tareas'},
                {label:'Gestiones de correo abiertas',value:cp.disponible?cp.count:'—',desc:cp.disponible?(cv.disponible?cv.count+' con plazo vencido':'Plazos vencidos no disponibles'):'Sin permiso de correos',icon:'mail-clock',color:'cyan',module:'correos'},
                {label:'Incidencias de asistencia',value:incidencias.disponible?incidencias.count:'—',desc:incidencias.disponible?'Marcas o turnos por revisar':'Sin permiso de asistencia',icon:'clock-alert',color:'amber',module:'asistencia'},
                {label:'Notificaciones sin leer',value:notificacionesSinLeer.disponible?notificacionesSinLeer.count:'—',desc:notificacionesSinLeer.disponible?'Notificaciones visibles para tu usuario':'Sin permiso de tareas',icon:'bell-ring',color:'violet',module:'tareas'}
            ];
            kpis.innerHTML=metricas.map(m=>'<button type="button" '+(tienePermisoModulo(m.module)?'onclick="cambiarModulo(\''+m.module+'\')"':'disabled')+' class="ui-card ops-kpi text-left p-5"><div class="flex items-start justify-between gap-3"><span class="text-xs font-bold uppercase tracking-wide text-slate-500">'+opsEsc(m.label)+'</span><span class="ops-icon '+m.color+'"><i data-lucide="'+m.icon+'" class="h-5 w-5"></i></span></div><strong class="mt-3 block text-3xl font-black text-slate-900">'+opsEsc(m.value)+'</strong><span class="mt-2 block text-xs text-slate-500">'+opsEsc(m.desc)+'</span></button>').join('');
            const items=[];
            tVenc.slice(0,5).forEach(x=>items.push({tipo:'Tarea vencida',titulo:x.titulo,detalle:(x.responsable?.nombre||x.responsable?.email||'Sin responsable')+' · '+(x.sucursal?.nombre||'Sin sucursal'),fecha:x.fecha_limite,modulo:'tareas',urgente:true}));
            cVenc.slice(0,5).forEach(x=>items.push({tipo:'Correo fuera de plazo',titulo:x.asunto,detalle:x.supervisor||'Gestión de correo',fecha:x.plazo_respuesta,modulo:'correos',urgente:true}));
            tPend.filter(x=>x.fecha_limite&&new Date(x.fecha_limite)>=now&&new Date(x.fecha_limite)-now<48*60*60*1000).slice(0,3).forEach(x=>items.push({tipo:'Tarea próxima a vencer',titulo:x.titulo,detalle:x.responsable?.nombre||x.responsable?.email||'Sin responsable',fecha:x.fecha_limite,modulo:'tareas',urgente:false}));
            cPend.filter(x=>x.plazo_respuesta&&new Date(x.plazo_respuesta)>=now&&new Date(x.plazo_respuesta)-now<48*60*60*1000).slice(0,3).forEach(x=>items.push({tipo:'Respuesta próxima a vencer',titulo:x.asunto,detalle:x.supervisor||'Gestión de correo',fecha:x.plazo_respuesta,modulo:'correos',urgente:false}));
            items.sort((x,y)=>new Date(x.fecha)-new Date(y.fecha));
            const fuentesAlertas=[tp, tv, cp, cv, incidencias, notificacionesSinLeer];
            const fuentesDisponibles=fuentesAlertas.filter(f=>f&&f.disponible).length;
            const fuentesNoDisponibles=fuentesAlertas.length-fuentesDisponibles;
            const listaAlertas=items.length?items.slice(0,10).map(x=>'<button type="button" onclick="cambiarModulo(\''+x.modulo+'\')" class="ops-alert-row flex w-full items-start gap-3 rounded-xl p-3 text-left"><span class="ops-alert-dot '+(x.urgente?'urgent':'soon')+'"></span><span class="min-w-0 flex-1"><strong class="block truncate text-sm">'+opsEsc(x.titulo||x.tipo)+'</strong><span class="mt-1 block text-xs text-slate-500">'+opsEsc(x.tipo)+' · '+opsEsc(x.detalle)+'</span></span><span class="shrink-0 text-right text-xs '+(x.urgente?'text-rose-600':'text-amber-700')+'">'+opsEsc(new Date(x.fecha).toLocaleDateString('es-CL'))+'</span></button>').join(''):'';
            if(items.length){alertas.innerHTML=listaAlertas;}
            else if(fuentesDisponibles===0){
                alertas.innerHTML='<div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><strong>No se pudo confirmar el estado de las alertas.</strong><p class="mt-1 text-xs">Todas las fuentes consultadas están no disponibles o no autorizadas. Actualiza la consulta o revisa los permisos antes de concluir que no hay pendientes.</p></div>';
            }else if(fuentesNoDisponibles>0){
                alertas.innerHTML='<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>No se detectan alertas en las fuentes disponibles.</strong><p class="mt-1 text-xs">'+fuentesNoDisponibles+' de '+fuentesAlertas.length+' consultas no están disponibles. El resumen es parcial y no confirma que todos los módulos estén al día.</p></div>';
            }else{
                alertas.innerHTML='<div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>No se detectan vencimientos próximos en las fuentes consultadas.</strong><p class="mt-1 text-xs">Todas las consultas de alertas terminaron correctamente.</p></div>';
            }
            const links=[['Asistencia','clock','asistencia'],['Licencias','file-heart','licencias'],['Correos y seguimiento','mail','correos'],['Tareas diarias','list-checks','tareas'],['Reportes','chart-no-axes-combined','reportes'],['Mapa de sucursales','map-pinned','mapas']];
            accesos.innerHTML=links.filter(x=>tienePermisoModulo(x[2])).map(x=>'<button type="button" onclick="cambiarModulo(\''+x[2]+'\')" class="ops-shortcut flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left"><span class="ops-shortcut-icon"><i data-lucide="'+x[1]+'" class="h-4 w-4"></i></span><span class="flex-1 text-sm font-bold">'+opsEsc(x[0])+'</span><i data-lucide="arrow-up-right" class="h-4 w-4 text-slate-400"></i></button>').join('')||'<p class="text-sm text-slate-500">No hay accesos disponibles para los permisos actuales.</p>';
            const stamp=document.getElementById('ops-actualizado');if(stamp)stamp.textContent='Actualizado '+now.toLocaleString('es-CL');
            if(window.lucide)lucide.createIcons();
        }

        // ============================================================
        // CALIDAD DE DATOS · Solo lectura y solo administrador principal
        // ============================================================
        async function calidadCount(tabla,configurar){
            try{let q=_supabase.from(tabla).select('id',{count:'exact',head:true});if(configurar)q=configurar(q);const r=await q;return r.error?{ok:false,count:null,error:r.error.message}:{ok:true,count:r.count??0};}
            catch(e){return {ok:false,count:null,error:e.message};}
        }
        async function cargarPanelCalidad(){
            if(!esAdminPrincipalActual()){mostrarToast('Este panel está reservado para la cuenta administradora principal.','warning');return;}
            const k=document.getElementById('calidad-kpis'),im=document.getElementById('calidad-importaciones'),h=document.getElementById('calidad-hallazgos');if(!k||!im||!h)return;
            k.innerHTML='<div class="ui-card p-5">Revisando...</div>'.repeat(4);im.innerHTML='<p class="p-5 text-sm text-slate-500">Consultando historial...</p>';h.innerHTML='<p class="text-sm text-slate-500">Analizando...</p>';
            const [suc,coords,asist,marcas,turnos,errs,imports]=await Promise.all([
                calidadCount('sucursales'),
                calidadCount('sucursales',q=>q.or('latitud.is.null,longitud.is.null')),
                calidadCount('registros_asistencia'),
                calidadCount('registros_asistencia',q=>q.eq('sin_marca',true)),
                calidadCount('registros_asistencia',q=>q.eq('sin_turno_marcas',true)),
                calidadCount('importaciones_errores'),
                _supabase.from('importaciones').select('id,modulo,nombre_archivo,modo,estado,filas_totales,filas_nuevas,filas_actualizadas,filas_rechazadas,filas_error,usuario_email,created_at,finalizada_at').order('created_at',{ascending:false}).limit(12)
            ]);
            const card=(label,v,desc,icon)=>'<div class="ui-card p-5"><div class="flex items-center justify-between gap-3"><span class="text-xs font-bold uppercase tracking-wide text-slate-500">'+opsEsc(label)+'</span><i data-lucide="'+icon+'" class="h-5 w-5 text-blue-600"></i></div><strong class="mt-3 block text-3xl font-black text-slate-900">'+opsEsc(v==null?'No disponible':Number(v).toLocaleString('es-CL'))+'</strong><span class="mt-2 block text-xs text-slate-500">'+opsEsc(desc)+'</span></div>';
            k.innerHTML=card('Sucursales registradas',suc.ok?suc.count:null,'Registros disponibles','building-2')+card('Sucursales sin GPS completo',coords.ok?coords.count:null,'Requieren revisión de latitud y longitud','map-pin')+card('Marcas sin entrada registrada',marcas.ok?marcas.count:null,'Marcadas por el sistema como sin marca','clock-alert')+card('Sin turno asociado',turnos.ok?turnos.count:null,'Incidencias marcadas sin turno','calendar-x');
            const hallazgos=[];
            if(!coords.ok)hallazgos.push({nivel:'info',txt:'No se pudo consultar la integridad de coordenadas: '+coords.error});
            else if(coords.count>0)hallazgos.push({nivel:'warn',txt:coords.count+' sucursales tienen latitud o longitud pendiente. Completa las coordenadas para mejorar el mapa.'});
            else hallazgos.push({nivel:'ok',txt:'Todas las sucursales tienen latitud y longitud registradas.'});
            if(!marcas.ok)hallazgos.push({nivel:'info',txt:'No se pudo contar incidencias de marcas: '+marcas.error});
            else if(marcas.count>0)hallazgos.push({nivel:'warn',txt:marcas.count+' registros están marcados como sin marca; revisa el origen antes de regularizar.'});
            if(!turnos.ok)hallazgos.push({nivel:'info',txt:'No se pudo contar incidencias sin turno: '+turnos.error});
            else if(turnos.count>0)hallazgos.push({nivel:'warn',txt:turnos.count+' registros tienen la bandera sin turno; contrasta con la programación.'});
            if(!errs.ok)hallazgos.push({nivel:'info',txt:'No se pudo consultar el historial de errores de importación: '+errs.error});
            else if(errs.count>0)hallazgos.push({nivel:'warn',txt:errs.count+' errores de importación están registrados. Abre el historial y revisa las filas rechazadas.'});
            if(imports.error)hallazgos.push({nivel:'info',txt:'No se pudo cargar el historial de importaciones: '+imports.error.message});
            h.innerHTML=hallazgos.map(x=>'<div class="flex items-start gap-3 py-3"><span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full '+(x.nivel==='warn'?'bg-amber-500':x.nivel==='ok'?'bg-emerald-500':'bg-blue-500')+'"></span><p class="text-sm text-slate-700">'+opsEsc(x.txt)+'</p></div>').join('');
            const rows=imports.data||[];
            im.innerHTML=imports.error?'<p class="p-5 text-sm text-rose-600">'+opsEsc(imports.error.message)+'</p>':rows.length?'<table class="w-full min-w-[700px] text-left text-sm"><thead><tr><th>Fecha</th><th>Módulo</th><th>Archivo</th><th>Estado</th><th>Filas</th><th>Errores</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+opsEsc(x.created_at?new Date(x.created_at).toLocaleString('es-CL'):'—')+'</td><td>'+opsEsc(x.modulo)+'</td><td>'+opsEsc(x.nombre_archivo)+'</td><td><span class="rounded-full px-2 py-1 text-xs font-bold '+(/error|fall/i.test(x.estado||'')?'bg-rose-100 text-rose-700':/parcial|rechaz/i.test(x.estado||'')?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700')+'">'+opsEsc(x.estado)+'</span></td><td>'+opsEsc(x.filas_totales)+'</td><td>'+opsEsc(Number(x.filas_error||0)+Number(x.filas_rechazadas||0))+'</td></tr>').join('')+'</tbody></table>':'<p class="p-5 text-sm text-slate-500">Todavía no hay importaciones registradas.</p>';
            const stamp=document.getElementById('calidad-actualizado');if(stamp)stamp.textContent='Revisado '+new Date().toLocaleString('es-CL');
            if(window.lucide)lucide.createIcons();
        }

        function mostrarFechasPersonalizadas() {
            const personalizado = document.getElementById('dashboard-periodo')?.value === 'personalizado';
            ['dashboard-fecha-desde-wrap', 'dashboard-fecha-hasta-wrap'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('hidden', !personalizado);
            });
        }

        function cambiarPeriodoDashboard() {
            mostrarFechasPersonalizadas();
            const periodo = document.getElementById('dashboard-periodo')?.value || 'mes';
            if (periodo === 'personalizado') {
                const desde = document.getElementById('dashboard-fecha-desde')?.value || '';
                const hasta = document.getElementById('dashboard-fecha-hasta')?.value || '';
                if (!desde || !hasta) {
                    const label = document.getElementById('dashboard-indicadores-periodo');
                    const errorBox = document.getElementById('dashboard-indicadores-error');
                    if (errorBox) { errorBox.classList.add('hidden'); errorBox.textContent = ''; }
                    if (label) label.textContent = 'Selecciona las fechas Desde y Hasta para actualizar el período personalizado.';
                    return;
                }
                if (desde > hasta) {
                    const errorBox = document.getElementById('dashboard-indicadores-error');
                    if (errorBox) { errorBox.textContent = 'La fecha Desde no puede ser posterior a Hasta.'; errorBox.classList.remove('hidden'); }
                    return;
                }
            }
            const errorBox = document.getElementById('dashboard-indicadores-error');
            if (errorBox) { errorBox.classList.add('hidden'); errorBox.textContent = ''; }
            return actualizarIndicadoresAsistencia();
        }
        window.cambiarPeriodoDashboard = cambiarPeriodoDashboard;

        function obtenerRangoDashboard() {
            const partes = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(new Date());
            const parte = tipo => partes.find(x => x.type === tipo)?.value || '';
            const hoy = new Date(Number(parte('year')), Number(parte('month')) - 1, Number(parte('day')), 12, 0, 0, 0);
            const iso = fecha => [String(fecha.getFullYear()).padStart(4, '0'), String(fecha.getMonth() + 1).padStart(2, '0'), String(fecha.getDate()).padStart(2, '0')].join('-');
            const periodo = document.getElementById('dashboard-periodo')?.value || 'mes';
            let desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            let hasta = new Date(hoy);
            if (periodo === '7' || periodo === '30' || periodo === '90') {
                desde = new Date(hoy);
                desde.setDate(desde.getDate() - (Number(periodo) - 1));
                hasta = new Date(hoy);
            } else if (periodo === 'personalizado') {
                const valorDesde = document.getElementById('dashboard-fecha-desde')?.value;
                const valorHasta = document.getElementById('dashboard-fecha-hasta')?.value;
                if (!valorDesde || !valorHasta) throw new Error('Selecciona las fechas Desde y Hasta para calcular el rango personalizado.');
                if (valorDesde > valorHasta) throw new Error('La fecha Desde no puede ser posterior a la fecha Hasta.');
                return { desde: valorDesde, hasta: valorHasta, etiqueta: valorDesde + ' al ' + valorHasta };
            }
            return { desde: iso(desde), hasta: iso(hasta), etiqueta: iso(desde) + ' al ' + iso(hasta) };
        }

        async function actualizarIndicadoresAsistencia() {
            const loading = document.getElementById('dashboard-indicadores-loading');
            const errorBox = document.getElementById('dashboard-indicadores-error');
            const periodoLabel = document.getElementById('dashboard-indicadores-periodo');
            if (errorBox) { errorBox.classList.add('hidden'); errorBox.textContent = ''; }
            if (loading) loading.classList.remove('hidden');

            try {
                const rango = obtenerRangoDashboard();
                const sucursal = document.getElementById('dashboard-sucursal')?.value || '';
                const contarAsistencia = (filtro) => {
                    if(!esAdminPrincipalActual()&&!['asistencia','correos','reportes'].some(tienePermisoModulo))return Promise.resolve({count:0,error:null});
                    let consulta = _supabase.from('registros_asistencia')
                        .select('id', { count: 'exact', head: true })
                        .gte('fecha', rango.desde).lte('fecha', rango.hasta);
                    if (sucursal) consulta = consulta.eq('sucursal', sucursal);
                    if (filtro) consulta = filtro(consulta);
                    return consulta;
                };
                const hoy = new Date();
                const isoHoy = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                const futuro = new Date(hoy);
                futuro.setDate(futuro.getDate() + 7);
                const isoFuturo = new Date(futuro.getTime() - futuro.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

                const contarLicencias = (filtro) => {
                    if(!esAdminPrincipalActual()&&!['licencias','reportes'].some(tienePermisoModulo))return Promise.resolve({count:0,error:null});
                    let consulta = _supabase.from('licencias_medicas').select('id', { count: 'exact', head: true })
                        .ilike('tipo_ausencia', '%licencia%');
                    if (sucursal) consulta = consulta.eq('sucursal', sucursal);
                    return filtro(consulta);
                };
                const respuestas = await Promise.all([
                    contarAsistencia(),
                    contarAsistencia(q => q.eq('tiene_atraso', true)),
                    contarAsistencia(q => q.eq('marca_incompleta', true)),
                    contarAsistencia(q => q.eq('sin_marca', true)),
                    contarAsistencia(q => q.ilike('tipo_ausentismo', 'Falta injustificada')),
                    contarAsistencia(q => q.eq('estado', 'Inexistente')),
                    contarAsistencia(q => q.in('estado', ['Anomalía', 'En revisión'])),
                    contarLicencias(q => q.lte('fecha_inicio', isoHoy).gte('fecha_fin', isoHoy)),
                    contarLicencias(q => q.gte('fecha_fin', isoHoy).lte('fecha_fin', isoFuturo))
                ]);
                for (const respuesta of respuestas) {
                    if (respuesta.error) throw respuesta.error;
                }

                const valores = [
                    ['ind-total', respuestas[0].count],
                    ['ind-atrasos', respuestas[1].count],
                    ['ind-incompletas', respuestas[2].count],
                    ['ind-sin-marca', respuestas[3].count],
                    ['ind-faltas', respuestas[4].count],
                    ['ind-inexistentes', respuestas[5].count],
                    ['ind-anomalias', respuestas[6].count],
                    ['ind-licencias-vigentes', respuestas[7].count],
                    ['ind-licencias-proximas', respuestas[8].count]
                ];
                valores.forEach(([id, valor]) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = Number(valor ?? 0).toLocaleString('es-CL');
                });
                renderDashboardGerencialCharts();
                if (periodoLabel) periodoLabel.textContent = 'Período de asistencia: ' + rango.etiqueta + (sucursal ? ' · ' + sucursal : ' · Todas las sucursales');
            } catch (error) {
                if (errorBox) {
                    errorBox.textContent = 'No se pudieron calcular los indicadores: ' + (error?.message || 'Error desconocido');
                    errorBox.classList.remove('hidden');
                }
            } finally {
                if (loading) loading.classList.add('hidden');
                if (window.lucide) lucide.createIcons();
            }
        }

        function renderDashboardGerencialCharts(){
            const read=id=>{const el=document.getElementById(id);return Math.max(0,Number(String(el?.textContent||'0').replace(/[^0-9-]/g,''))||0);};
            const total=read('ind-total'),atrasos=read('ind-atrasos'),incompletas=read('ind-incompletas'),sinMarca=read('ind-sin-marca'),faltas=read('ind-faltas'),inexistentes=read('ind-inexistentes'),anomalias=read('ind-anomalias'),licVig=read('ind-licencias-vigentes'),licProx=read('ind-licencias-proximas');
            const bars=document.getElementById('dashboard-chart-incidencias'),gauge=document.getElementById('dashboard-chart-atrasos'),load=document.getElementById('dashboard-chart-carga');
            if(!bars||!gauge||!load)return;
            const items=[{label:'Atrasos',value:atrasos,color:'#f59e0b'},{label:'Marcas incompletas',value:incompletas,color:'#f97316'},{label:'Sin marca',value:sinMarca,color:'#e11d48'},{label:'Faltas injustificadas',value:faltas,color:'#be123c'},{label:'Anomalías / revisión',value:anomalias,color:'#7c3aed'}];
            const max=Math.max(1,...items.map(x=>x.value));
            bars.innerHTML=items.map(x=>'<div><div class="mb-1 flex items-center justify-between gap-3"><span class="text-xs font-semibold text-slate-600">'+escaparHTML(x.label)+'</span><b class="text-xs text-slate-800">'+x.value.toLocaleString('es-CL')+'</b></div><div class="dash-bar-track"><div class="dash-bar-fill" style="width:'+Math.max(x.value?2:0,Math.min(100,x.value/max*100))+'%;background:'+x.color+'"></div></div></div>').join('');
            const rate=total?Math.min(100,atrasos/total*100):0,angle=rate/100*360;
            gauge.innerHTML='<div class="dash-gauge" style="--angle:'+angle+'deg"><div><strong class="block text-2xl font-black text-slate-900">'+rate.toLocaleString('es-CL',{maximumFractionDigits:1})+'%</strong><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Atrasos</span></div></div><p class="mt-4 text-center text-xs text-slate-500">'+atrasos.toLocaleString('es-CL')+' de '+total.toLocaleString('es-CL')+' registros de asistencia.</p><div class="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Indicador descriptivo del período. No equivale a una tasa de personas únicas.</div>';
            const loadItems=[{label:'Licencias vigentes',value:licVig,color:'#0891b2'},{label:'Licencias próximas a terminar',value:licProx,color:'#6366f1'},{label:'Registros inexistentes',value:inexistentes,color:'#64748b'},{label:'Incidencias / revisión',value:anomalias,color:'#8b5cf6'}];
            const maxLoad=Math.max(1,...loadItems.map(x=>x.value));
            load.innerHTML=loadItems.map(x=>'<div class="mb-4"><div class="mb-1 flex items-center justify-between gap-2"><span class="text-xs font-semibold text-slate-600">'+escaparHTML(x.label)+'</span><b class="text-xs">'+x.value.toLocaleString('es-CL')+'</b></div><div class="dash-bar-track"><div class="dash-bar-fill" style="width:'+Math.max(x.value?2:0,Math.min(100,x.value/maxLoad*100))+'%;background:'+x.color+'"></div></div></div>').join('')+'<p class="mt-2 border-t border-slate-100 pt-3 text-[10px] text-slate-400">Conteos independientes; una persona o jornada puede aparecer en más de una categoría.</p>';
        }

        async function inicializarDashboard() {
            const box = document.getElementById('connection-box');
            if (!box) return;

            box.className = 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600';
            box.textContent = 'Consultando Supabase...';

            try {
                const puedeVerDatos=(...permisos)=>esAdminPrincipalActual()||permisos.some(p=>tienePermisoModulo(p));
                const contarSiPermitido=async(tabla,permisos)=>{
                    if(!puedeVerDatos(...permisos))return {count:0,data:[],error:null};
                    return _supabase.from(tabla).select('id',{count:'exact',head:true});
                };
                const respuestas = await Promise.all([
                    contarSiPermitido('colaboradores',['colaboradores','asistencia','licencias','vacaciones','papeletas','coberturas','reportes','tareas','correos']),
                    contarSiPermitido('sucursales',['dashboard','sucursales','configcorreos','correos','mapas','coberturas','papeletas','asistencia','licencias','vacaciones','tareas','colaboradores','reportes']),
                    contarSiPermitido('registros_asistencia',['asistencia','correos','reportes']),
                    contarSiPermitido('licencias_medicas',['licencias','reportes']),
                    puedeVerDatos('dashboard','sucursales','configcorreos','correos','mapas','coberturas','papeletas','asistencia','licencias','vacaciones','tareas','colaboradores','reportes')
                        ? _supabase.from('sucursales').select('nombre').order('nombre')
                        : Promise.resolve({data:[],error:null})
                ]);

                for (const respuesta of respuestas) {
                    if (respuesta.error) throw respuesta.error;
                }

                const metricas = [
                    { kpi: 'kpi-colaboradores', count: 'bar-count-colaboradores', bar: 'bar-colaboradores', valor: respuestas[0].count ?? 0 },
                    { kpi: 'kpi-sucursales', count: 'bar-count-sucursales', bar: 'bar-sucursales', valor: respuestas[1].count ?? 0 },
                    { kpi: 'kpi-asistencia', count: 'bar-count-asistencia', bar: 'bar-asistencia', valor: respuestas[2].count ?? 0 },
                    { kpi: 'kpi-licencias', count: 'bar-count-licencias', bar: 'bar-licencias', valor: respuestas[3].count ?? 0 }
                ];
                const maximo = Math.max(1, ...metricas.map(m => Number(m.valor) || 0));
                metricas.forEach(m => {
                    const kpi = document.getElementById(m.kpi);
                    const contador = document.getElementById(m.count);
                    const barra = document.getElementById(m.bar);
                    if (kpi) kpi.innerText = Number(m.valor).toLocaleString('es-CL');
                    if (contador) contador.innerText = Number(m.valor).toLocaleString('es-CL');
                    if (barra) barra.style.width = Math.max(0, Math.min(100, (Number(m.valor) / maximo) * 100)) + '%';
                });

                const sucursalSelect = document.getElementById('dashboard-sucursal');
                if (sucursalSelect && sucursalSelect.options.length <= 1) {
                    (respuestas[4].data || []).forEach(item => {
                        if (!item.nombre) return;
                        const option = document.createElement('option');
                        option.value = item.nombre;
                        option.textContent = item.nombre;
                        sucursalSelect.appendChild(option);
                    });
                }
                box.className = 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800';
                box.textContent = 'Base de datos conectada y disponible. Los indicadores se actualizaron correctamente.';
                const actualizado = document.getElementById('dashboard-updated-at');
                if (actualizado) actualizado.textContent = 'Última actualización: ' + new Date().toLocaleString('es-CL');
                mostrarFechasPersonalizadas();
                await actualizarIndicadoresAsistencia();
                if (window.lucide) lucide.createIcons();
            } catch (error) {
                box.className = 'rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800';
                box.textContent = 'No se pudieron actualizar los indicadores: ' + (error?.message || 'Error de conexión');
                const actualizado = document.getElementById('dashboard-updated-at');
                if (actualizado) actualizado.textContent = 'Actualización fallida. Intenta nuevamente.';
            }
        }

        // El supervisor se obtiene del directorio oficial de sucursales.
        // No se modifica el histórico cuando no existe una coincidencia segura.
        let mapaSupervisoresDirectorio = null;
        let cargaMapaSupervisoresDirectorio = null;
        function claveSucursalDirectorio(valor) {
            return String(valor || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        }
        async function obtenerMapaSupervisoresDirectorio() {
            if (mapaSupervisoresDirectorio) return mapaSupervisoresDirectorio;
            if (!cargaMapaSupervisoresDirectorio) {
                cargaMapaSupervisoresDirectorio = (async () => {
                    const { data, error } = await _supabase
                        .from('sucursales')
                        .select('nombre,supervisor');
                    if (error) throw errorSupabase('No se pudo cargar el directorio de sucursales', error);
                    const mapa = new Map();
                    (data || []).forEach(item => {
                        const clave = claveSucursalDirectorio(item.nombre);
                        if (clave) mapa.set(clave, texto(item.supervisor) || 'Sin supervisor asignado');
                    });
                    mapaSupervisoresDirectorio = mapa;
                    return mapa;
                })();
            }
            try { return await cargaMapaSupervisoresDirectorio; }
            catch (error) { cargaMapaSupervisoresDirectorio = null; throw error; }
        }
        function supervisorDeSucursal(nombre) {
            const clave = claveSucursalDirectorio(nombre);
            if (!clave) return 'Sin sucursal';
            if (!mapaSupervisoresDirectorio) return 'Directorio no cargado';
            return mapaSupervisoresDirectorio.get(clave) || 'No figura en directorio';
        }

