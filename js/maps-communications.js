        // ============================================================
        // MAPA, SUCURSALES, CORREOS, COBERTURAS Y GEMINI
        // ============================================================
        async function obtenerSucursalesConfig() { const {data,error}=await _supabase.from('sucursales').select('*').order('nombre'); if(error)throw error; return data||[]; }
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
        async function cargarDestinatariosDotacion(){
            const select=document.getElementById('dot-destinatario');
            if(!select)return;
            select.innerHTML='<option value="" disabled>Cargando usuarios activos…</option>';
            try{
                const {data,error}=await _supabase.rpc('listar_destinatarios_cobertura');
                if(error)throw error;
                const usuarios=(data||[]).filter(u=>u&&u.id!=null);
                if(!usuarios.length){
                    select.innerHTML='<option value="" disabled>No hay usuarios disponibles</option>';
                    return;
                }
                select.innerHTML=usuarios.map(u=>{
                    const nombre=String(u.nombre||u.email||('Usuario '+u.id));
                    const detalle=[u.rol,u.email].filter(Boolean).join(' · ');
                    return '<option value="'+escaparHTML(u.id)+'">'+escaparHTML(nombre)+(detalle?' — '+escaparHTML(detalle):'')+'</option>';
                }).join('');
            }catch(error){
                console.error('Cargar destinatarios de cobertura:',error);
                select.innerHTML='<option value="" disabled>No fue posible cargar usuarios</option>';
                mostrarToast('No se pudieron cargar los usuarios destinatarios. Verifica permisos y conexión.','error',8000);
            }
        }
        async function crearSolicitudDotacion(event){
            event.preventDefault();
            const status=document.getElementById('dot-estado'),form=document.getElementById('form-alerta-dotacion');
            const sucursalId=document.getElementById('dot-sucursal')?.value,opcion=document.getElementById('dot-sucursal')?.selectedOptions?.[0];
            const inicio=document.getElementById('dot-inicio')?.value,fin=document.getElementById('dot-fin')?.value;
            const turno=document.getElementById('dot-turno')?.value,horaini=document.getElementById('dot-hora-inicio')?.value||null,horafin=document.getElementById('dot-hora-fin')?.value||null;
            const destinatarios=Array.from(document.getElementById('dot-destinatario')?.selectedOptions||[]).map(o=>Number(o.value)).filter(Number.isInteger);
            if(!sucursalId||!inicio||!fin||fin<inicio)return mostrarToast('Selecciona una sucursal y revisa las fechas de la solicitud.','warning');
            if(!destinatarios.length)return mostrarToast('Selecciona al menos un usuario que deba recibir la alerta.','warning');
            if(horaini&&horafin&&horafin<=horaini)return mostrarToast('La hora de término debe ser posterior a la hora de inicio.','warning');
            try{
                if(status)status.textContent='Guardando la necesidad y enviando la notificación…';
                const payload={
                    p_sucursal_id:sucursalId,
                    p_sucursal_nombre:opcion?.textContent||'',
                    p_fecha_inicio:inicio,
                    p_fecha_fin:fin,
                    p_cantidad:Number(document.getElementById('dot-cantidad')?.value||1),
                    p_cargo_requerido:document.getElementById('dot-cargo')?.value||'AF',
                    p_turno:turno,
                    p_hora_inicio:horaini,
                    p_hora_fin:horafin,
                    p_motivo:document.getElementById('dot-motivo')?.value?.trim(),
                    p_observaciones:document.getElementById('dot-observaciones')?.value?.trim()||null,
                    p_destinatarios_ids:destinatarios
                };
                const {data,error}=await _supabase.rpc('crear_solicitud_dotacion_con_destinatarios',payload);
                if(error)throw error;
                const solicitudId=data;
                await registrarAuditoria('coberturas','CREA_ALERTA_DOTACION',payload.p_sucursal_nombre+' · '+payload.p_cargo_requerido+' · '+payload.p_turno+' · '+payload.p_fecha_inicio+' a '+payload.p_fecha_fin+' · destinatarios '+destinatarios.join(', '));
                if(status)status.textContent='Necesidad guardada y notificación enviada. Queda pendiente de encontrar y confirmar a la persona. Solicitud '+String(solicitudId).slice(0,8)+'.';
                form?.reset();
                const dias=document.getElementById('dot-dias');if(dias)dias.value='';
                actualizarHorarioDotacion();
                await cargarDestinatariosDotacion();
                mostrarToast('Necesidad guardada y alerta enviada a '+destinatarios.length+' usuario(s). No se creó ningún traslado.','success',9000);
                if(typeof cargarSolicitudesDotacion==='function')await cargarSolicitudesDotacion();
            }catch(error){
                console.error('Crear alerta dotación:',error);
                if(status)status.textContent='No se pudo guardar la solicitud: '+(error.message||'Error desconocido');
                mostrarToast('No se pudo guardar la necesidad o notificar al destinatario: '+(error.message||''),'error',10000);
            }
        }
                async function prepararMapaYConfiguracionSucursales(){
            const lista=await obtenerSucursalesConfig(), opts='<option value="">Seleccione sucursal</option>'+lista.map(x=>`<option value="${escaparHTML(direccionSucursal(x))}">${escaparHTML(x.nombre)}</option>`).join('');
            document.getElementById('map-origen').innerHTML=opts;document.getElementById('map-destino').innerHTML=opts;
            await cargarSucursalesDotacion();
            await cargarDestinatariosDotacion();
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
        async function prepararModuloCorreos() {
            if (!asistenciaCargada) await cargarAsistenciaDesdeNube();
            sucursalesConfiguracionGlobal = await obtenerSucursalesConfig();
            if(!sucursalesConfiguracionGlobal.length)throw new Error('No se cargaron sucursales desde Supabase. Revisa los permisos del usuario y vuelve a intentar.');
            const hoy = new Date().toISOString().slice(0, 10);
            document.getElementById('correo-hasta').value ||= hoy;
            document.getElementById('correo-desde').value ||= hoy;
            document.getElementById('correo-sucursales').innerHTML = sucursalesConfiguracionGlobal.map(x => `<option value="${escaparHTML(x.nombre)}">${escaparHTML(x.nombre)}</option>`).join('');
            const supervisores = [...new Set(sucursalesConfiguracionGlobal.map(x => texto(x.supervisor)).filter(Boolean))].sort();
            document.getElementById('correo-supervisores').innerHTML = supervisores.map(x => `<option value="${escaparHTML(x)}">${escaparHTML(x)}</option>`).join('');
            if(window.actualizarContadoresSelectores2026)window.actualizarContadoresSelectores2026();
        }
        function crearCuerpoCorreo(grupo, casos, desde, hasta) {
            const nombreGrupo = grupo.tipo === 'SUPERVISOR' ? `sucursales a cargo de ${grupo.nombre}` : `sucursal ${grupo.nombre}`;
            const filas = casos.map((x, i) => {
                return `${i + 1}. ${x.fecha} | ${x.rut} | ${x.nombre} | ${x.sucursal}\n   ${x.detalles.join('\n   ')}`;
            }).join('\n\n');
            const firma = texto(grupo.firma) || 'Saludos cordiales,\nDepartamento de Recursos Humanos\nFarmacias de Similares Chile S.A.\nRUT: 59.111.330-5';
            return `Estimados/as,\n\nJunto con saludar, se informa el siguiente detalle de incumplimientos detectados en asistencia para ${nombreGrupo}, correspondiente al periodo ${desde} al ${hasta}.\n\n${filas}\n\nFavor revisar y gestionar los casos indicados. Para cada registro, agradeceremos confirmar el motivo y adjuntar el respaldo correspondiente.\n\n${firma}`;
        }
        async function guardarLoteBorradoresNube(desde,hasta,agrupar,filtroSuc,filtroSup,minimo) {
            const {data:sesion,error:errSesion}=await _supabase.auth.getUser();
            if(errSesion||!sesion?.user?.email)throw new Error('No se pudo verificar la sesión para guardar en la nube.');
            const borradores=(borradoresGeneradosGlobal||[]).map(b=>({id:b.id,nombre:b.nombre,para:b.para,cc:b.cc,asunto:b.asunto,cuerpo:b.cuerpo,cantidad:Number(b.cantidad||0)}));
            const totalCasos=borradores.reduce((n,b)=>n+b.cantidad,0);
            const fila={usuario_email:String(sesion.user.email).trim().toLowerCase(),usuario_rol_id:perfilActualSistema?.id||null,fecha_desde:desde,fecha_hasta:hasta,agrupacion:agrupar,filtros:{sucursales:filtroSuc,supervisores:filtroSup,minimo_atraso:minimo,tipos:{atraso:!!document.getElementById('correo-t-atraso')?.checked,salida_temprana:!!document.getElementById('correo-t-temprana')?.checked,sin_turno:!!document.getElementById('correo-t-sinturno')?.checked,sin_marca:!!document.getElementById('correo-t-sinmarca')?.checked}},borradores,total_borradores:borradores.length,total_casos:totalCasos};
            const {error}=await _supabase.from('borradores_correo_usuario').insert([fila]);
            if(error)throw new Error(error.message||'No se pudo guardar el historial de correos.');
        }
        async function cargarHistorialBorradoresNube(notificar=false) {
            const cont=document.getElementById('correo-nube-historial');if(!cont)return;
            cont.innerHTML='<p class="text-sm text-slate-500">Cargando tu historial...</p>';
            const {data:sesion,error:errSesion}=await _supabase.auth.getUser();
            if(errSesion||!sesion?.user?.email){cont.innerHTML='<p class="text-sm text-rose-700">No se pudo verificar la sesión.</p>';return;}
            const {data,error}=await _supabase.from('borradores_correo_usuario').select('id,fecha_desde,fecha_hasta,agrupacion,total_borradores,total_casos,created_at').order('created_at',{ascending:false}).limit(10);
            if(error){cont.innerHTML='<p class="text-sm text-amber-700">No se pudo cargar el historial en la nube. Revisa permisos o conexión.</p>';if(notificar)mostrarToast('No se pudo cargar el historial de borradores.','warning');return;}
            if(!data?.length){cont.innerHTML='<p class="text-sm text-slate-500">Todavía no tienes generaciones guardadas.</p>';return;}
            cont.innerHTML=data.map(x=>{const fecha=x.created_at?new Date(x.created_at).toLocaleString('es-CL'):'Fecha no disponible';return `<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><b class="text-sm">${escaparHTML(x.fecha_desde)} a ${escaparHTML(x.fecha_hasta)}</b><p class="text-xs text-slate-500">${escaparHTML(fecha)} · ${Number(x.total_borradores||0)} borradores · ${Number(x.total_casos||0)} casos · agrupado por ${escaparHTML(x.agrupacion||'sucursal')}</p></div><button type="button" onclick="restaurarBorradoresNube('${x.id}')" class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Restaurar</button></div>`;}).join('');
            if(notificar)mostrarToast('Historial actualizado desde la nube.','success');
        }
        async function restaurarBorradoresNube(id) {
            if(!id)return;
            const {data,error}=await _supabase.from('borradores_correo_usuario').select('borradores').eq('id',id).maybeSingle();
            if(error||!data){mostrarToast('No se pudo restaurar ese historial o no tienes acceso.','error');return;}
            borradoresGeneradosGlobal=Array.isArray(data.borradores)?data.borradores:[];
            renderizarBorradoresMasivos();
            mostrarToast('Borradores restaurados desde tu historial privado. Revisa los destinatarios antes de abrirlos.','success',9000);
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
            const config = new Map(sucursalesConfiguracionGlobal.map(x => [texto(x.nombre).toLowerCase(), x]));
            const grupos = new Map();
            datosAsistenciaGlobal.filter(x => x.fecha >= desde && x.fecha <= hasta).forEach(x => {
                const cfg = config.get(texto(x.sucursal).toLowerCase()) || {};
                if (filtroSuc.length && !filtroSuc.includes(x.sucursal)) return;
                if (filtroSup.length && !filtroSup.includes(cfg.supervisor)) return;
                const detalles = [];
                if (document.getElementById('correo-t-atraso').checked && x.tiene_atraso && minutosAtraso(x.atraso) >= minimo) detalles.push(`Atraso: ${x.atraso}. Favor indicar motivo.`);
                if (document.getElementById('correo-t-temprana').checked && x.salida_temprana && x.salida_temprana !== '-') detalles.push(`Salida anticipada: ${x.salida_temprana}. Favor indicar motivo.`);
                if (document.getElementById('correo-t-sinturno').checked && x.sin_turno_marcas) detalles.push('Presenta marcas sin turno asignado. Favor aclarar la jornada realizada.');
                if (document.getElementById('correo-t-sinmarca').checked && x.sin_marca && !x.tipo_ausentismo) detalles.push('No registra marcas durante la jornada. Favor confirmar asistencia o justificar inasistencia.');
                if (!detalles.length) return;
                const clave = agrupar === 'SUPERVISOR' ? (cfg.supervisor || 'Sin supervisor') : (x.sucursal || 'Sin sucursal');
                if (!grupos.has(clave)) grupos.set(clave, []);
                grupos.get(clave).push({ ...x, detalles, cfg });
            });
            borradoresGeneradosGlobal = [...grupos].map(([nombre, casos], indice) => {
                const configs = [...new Set(casos.map(x => x.sucursal))].map(s => config.get(texto(s).toLowerCase()) || {});
                const para = [...new Set(configs.map(x => x.correo_sucursal).filter(Boolean))].join(';');
                const cc = [...new Set(configs.flatMap(x => texto(x.correo_copia).split(/[;,]/)).filter(Boolean))].join(';');
                const firma = configs.map(x => x.firma_correo).find(Boolean) || '';
                const grupo = { tipo: agrupar, nombre, firma };
                return { id: `borrador-${indice}`, nombre, para, cc, asunto: `Importancia alta - Incumplimientos de asistencia - ${nombre} - ${desde} a ${hasta}`, cuerpo: crearCuerpoCorreo(grupo, casos, desde, hasta), cantidad: casos.length };
            });
            renderizarBorradoresMasivos();
            if(borradoresGeneradosGlobal.length){
                try {
                    await guardarLoteBorradoresNube(desde,hasta,agrupar,filtroSuc,filtroSup,minimo);
                    mostrarToast('Borradores guardados en la nube en tu historial privado. Abrirlos en Outlook no envía el correo automáticamente.','success',9000);
                    await cargarHistorialBorradoresNube(false);
                } catch(error) {
                    mostrarToast('Los borradores están preparados en esta sesión, pero no se guardaron en la nube: '+(error.message||'error desconocido'),'warning',12000);
                }
            } else {
                await cargarHistorialBorradoresNube(false);
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
            if (!borradoresGeneradosGlobal.length) { cont.innerHTML = '<div class="ui-card p-6 text-center text-slate-500"><i data-lucide="check-circle-2" class="mx-auto mb-2 h-8 w-8 text-emerald-600"></i><b>No se encontraron casos</b><p class="mt-1 text-sm">Prueba ampliar el período o revisar los filtros de sucursal y tipo de incidencia.</p></div>';if(window.lucide)lucide.createIcons();return; }
            cont.innerHTML = borradoresGeneradosGlobal.map(b => `<div class="ui-card mail-card p-5"><div class="flex flex-wrap items-start justify-between gap-3"><label class="flex items-start gap-3"><input type="checkbox" class="borrador-check mt-1" value="${b.id}" checked><span><b class="text-base">${escaparHTML(b.nombre)}</b><br><span class="text-xs text-slate-500">${b.cantidad} caso(s)</span><span class="mt-2 block text-xs ${b.para?'text-emerald-700':'font-bold text-rose-700'}">${b.para?'Para: '+escaparHTML(b.para):'Falta configurar correo destinatario'}${b.cc?' · CC: '+escaparHTML(b.cc):''}</span></span></label><button onclick="abrirUnBorrador('${b.id}')" class="corp-button"><i data-lucide="mail" class="mr-1 inline h-4 w-4"></i>Revisar en Outlook</button></div><div class="mt-3 rounded-lg bg-slate-50 p-3 text-xs"><b>Asunto:</b> ${escaparHTML(b.asunto)}</div><details class="mt-3"><summary class="cursor-pointer text-xs font-bold text-slate-600">Ver contenido completo del correo</summary><pre class="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs">${escaparHTML(b.cuerpo)}</pre></details></div>`).join('');
            if(window.lucide)lucide.createIcons();
        }
        function seleccionarTodosBorradores(valor) {
            document.querySelectorAll('.borrador-check').forEach(x => x.checked = valor);
        }
        function urlOutlookBorrador(b) {
            // mailto: entrega el borrador al cliente de correo predeterminado de Windows.
            // Si Outlook escritorio está configurado como aplicación predeterminada, se abrirá allí.
            return `mailto:${encodeURIComponent(b.para||'')}?cc=${encodeURIComponent(b.cc||'')}&subject=${encodeURIComponent(b.asunto||'')}&body=${encodeURIComponent(b.cuerpo||'')}`;
        }
        function abrirUnBorrador(id) {
            const b = borradoresGeneradosGlobal.find(x => x.id === id);
            if (!b) return;
            window.open(urlOutlookBorrador(b), '_blank', 'noopener');
        }
        function textoMimeBase64(value){const bytes=new TextEncoder().encode(String(value||''));let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
        function crearEmlOutlook(b){const safe=v=>String(v||'').replace(/[\r\n]+/g,' ').trim(),subject=textoMimeBase64(safe(b.asunto)),body=String(b.cuerpo||'').replace(/\r?\n/g,'\r\n');return 'To: '+safe(b.para)+'\r\n'+(safe(b.cc)?'Cc: '+safe(b.cc)+'\r\n':'')+'Subject: =?UTF-8?B?'+subject+'?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\nX-Unsent: 1\r\n\r\n'+body+'\r\n';}
        async function descargarBorradoresOutlookZip(){const ids=[...document.querySelectorAll('.borrador-check:checked')].map(x=>x.value),list=borradoresGeneradosGlobal.filter(x=>ids.includes(x.id));if(!list.length)return mostrarToast('Selecciona uno o más borradores antes de descargar el ZIP.','warning');if(!window.JSZip)return mostrarToast('No se pudo cargar el generador ZIP. Recarga la página.','error');const zip=new JSZip(),folder=zip.folder('Borradores_Outlook');list.forEach((b,i)=>{const slug=String(b.nombre||'Borrador_'+(i+1)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60)||'Borrador_'+(i+1);folder.file(String(i+1).padStart(3,'0')+'_'+slug+'.eml',crearEmlOutlook(b));});zip.file('LEEME.txt','Borradores para Outlook de escritorio. Extrae el ZIP, abre los archivos .eml con Outlook, revisa destinatarios y contenido y pulsa Enviar. No se envían automáticamente.');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Borradores_Outlook_'+new Date().toISOString().slice(0,10)+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);mostrarToast('ZIP descargado con '+list.length+' borradores .eml para revisar y enviar desde Outlook.','success',10000);}
        async function abrirBorradoresMasivos() {
            if(!puedePrepararCorreosActual())return mostrarToast('No tienes autorización para abrir borradores.','warning');
            const ids = [...document.querySelectorAll('.borrador-check:checked')].map(x => x.value);
            const seleccionados = borradoresGeneradosGlobal.filter(x => ids.includes(x.id));
            if (!seleccionados.length) return mostrarToast('Selecciona al menos un borrador.', 'warning');
            for (let i = 0; i < seleccionados.length; i++) {
                window.open(urlOutlookBorrador(seleccionados[i]), '_blank', 'noopener');
                await new Promise(r => setTimeout(r, 500));
            }
            mostrarToast(`Se solicitaron ${seleccionados.length} borradores. Si falta alguno, permite ventanas emergentes.`, 'success', 12000);
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
            cont.innerHTML = lista.map(x => `<article class="config-sucursal-card" data-id="${x.id}">
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
            const input = event?.target;
            const archivo = input?.files?.[0];
            if (!archivo) return;
            const normalizarClaveSucursal = valor => String(valor ?? '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
            const normalizarCorreo = valor => String(valor ?? '').trim().replace(/^mailto:/i, '').toLowerCase();
            const emailValido = valor => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(valor);
            const obtenerCorreoCopia = valor => String(valor ?? '')
                .split(/[;,\n]+/).map(normalizarCorreo).filter(Boolean);
            try {
                const filas = await leerExcel(archivo);
                if (!Array.isArray(filas) || !filas.length) {
                    throw new Error('El Excel no contiene filas de datos. Descarga la plantilla oficial y vuelve a intentarlo.');
                }
                const { data: sucursales, error: errorSucursales } = await _supabase
                    .from('sucursales').select('id,nombre,supervisor,correo_sucursal,correo_copia,horario_apertura,horario_cierre,firma_correo');
                if (errorSucursales) {
                    if (/firma_correo|schema cache|column/i.test(errorSucursales.message || '')) {
                        throw new Error('La base de datos no reconoce la columna firma_correo. Primero debe aplicarse la migración SQL de la plataforma; no se modificó ninguna sucursal.');
                    }
                    throw errorSucursales;
                }
                const porNombre = new Map((sucursales || []).map(s => [normalizarClaveSucursal(s.nombre), s]));
                const preparadas = [];
                const errores = [];
                const nombresVistos = new Set();
                let filasVacias = 0;
                for (let i = 0; i < filas.length; i++) {
                    const f = filas[i];
                    const nombre = texto(obtenerCampo(f, ['nombre', 'Sucursal', 'Nombre Sucursal', 'Nombre exacto de la sucursal']));
                    if (!nombre || /^nombre exacto de la sucursal$/i.test(nombre)) { filasVacias++; continue; }
                    const clave = normalizarClaveSucursal(nombre);
                    if (nombresVistos.has(clave)) { errores.push('Fila ' + (i + 2) + ': sucursal duplicada en el Excel: ' + nombre); continue; }
                    nombresVistos.add(clave);
                    const sucursal = porNombre.get(clave);
                    if (!sucursal) { errores.push('Fila ' + (i + 2) + ': no existe una sucursal con el nombre "' + nombre + '".'); continue; }
                    const leer = (nombres, actual) => {
                        const raw = obtenerCampo(f, nombres, undefined);
                        return raw === undefined || raw === null || String(raw).trim() === '' ? actual : String(raw).trim();
                    };
                    const cambios = {
                        supervisor: leer(['supervisor', 'Supervisor'], sucursal.supervisor || ''),
                        correo_sucursal: normalizarCorreo(leer(['correo_sucursal', 'Correo Sucursal', 'Correo principal'], sucursal.correo_sucursal || '')),
                        correo_copia: obtenerCorreoCopia(leer(['correo_copia', 'Correo Copia', 'CC'], sucursal.correo_copia || '')).join(';'),
                        horario_apertura: leer(['horario_apertura', 'Horario Apertura', 'Hora de apertura'], sucursal.horario_apertura || ''),
                        horario_cierre: leer(['horario_cierre', 'Horario Cierre', 'Hora de cierre'], sucursal.horario_cierre || ''),
                        firma_correo: leer(['firma_correo', 'Firma Correo', 'Firma institucional'], sucursal.firma_correo || '')
                    };
                    if (cambios.correo_sucursal && !emailValido(cambios.correo_sucursal)) {
                        errores.push('Fila ' + (i + 2) + ' (' + nombre + '): correo principal inválido: "' + cambios.correo_sucursal + '".');
                    }
                    const copiasInvalidas = obtenerCorreoCopia(cambios.correo_copia).filter(email => !emailValido(email));
                    if (copiasInvalidas.length) {
                        errores.push('Fila ' + (i + 2) + ' (' + nombre + '): correo(s) en copia inválido(s): ' + copiasInvalidas.join(', ') + '.');
                    }
                    if (cambios.horario_apertura && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cambios.horario_apertura)) {
                        errores.push('Fila ' + (i + 2) + ' (' + nombre + '): hora de apertura debe usar HH:MM.');
                    }
                    if (cambios.horario_cierre && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cambios.horario_cierre)) {
                        errores.push('Fila ' + (i + 2) + ' (' + nombre + '): hora de cierre debe usar HH:MM.');
                    }
                    preparadas.push({ id: sucursal.id, nombre: sucursal.nombre, cambios });
                }
                if (!preparadas.length) throw new Error('No se encontró ninguna sucursal válida para importar. Revisa la columna nombre.');
                if (errores.length) {
                    const resumen = errores.slice(0, 8).join('\n') + (errores.length > 8 ? '\nY ' + (errores.length - 8) + ' error(es) adicional(es).' : '');
                    throw new Error('Importación cancelada: se encontraron ' + errores.length + ' problema(s). No se modificó ninguna sucursal.\n' + resumen);
                }
                let actualizadas = 0;
                for (const fila of preparadas) {
                    const { error } = await _supabase.from('sucursales').update(fila.cambios).eq('id', fila.id);
                    if (error) {
                        throw new Error('La importación se detuvo al actualizar "' + fila.nombre + '" (' + (actualizadas) + ' actualizadas antes del error): ' + error.message + '. Revisa la columna firma_correo y los permisos de Supabase.');
                    }
                    actualizadas++;
                }
                await prepararConfiguracionCorreos();
                await registrarActualizacionFuente('config_correos', archivo.name || 'Plantilla de correos', actualizadas, 'manual');
                mostrarToast('Importación finalizada: ' + actualizadas + ' sucursal(es) actualizadas. Las celdas vacías conservaron los valores existentes.', 'success', 8000);
            } catch (e) {
                console.error('Importación de correos de sucursales:', e);
                mostrarToast(e.message || 'No se pudo importar el Excel.', 'error', 12000);
            } finally {
                if (input) input.value = '';
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

        function inicializarMapa14(lista = mapa14Sucursales) {
            const host = document.getElementById('mapa14-frame');
            const status = document.getElementById('mapa14-status');
            if (!host || !window.L) {
                if (status) status.textContent = 'No se pudo cargar el mapa interactivo. Los enlaces a Google Maps siguen disponibles.';
                return;
            }
            if (!mapa14Leaflet) {
                mapa14Leaflet = L.map(host, { scrollWheelZoom: true }).setView([-33.45, -70.66], 5);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(mapa14Leaflet);
                mapa14Marcadores = L.layerGroup().addTo(mapa14Leaflet);
                setTimeout(() => mapa14Leaflet && mapa14Leaflet.invalidateSize(), 200);
            }
            mapa14Marcadores.clearLayers();
            if (mapa14Ruta) { mapa14Leaflet.removeLayer(mapa14Ruta); mapa14Ruta = null; }
            const conGps = lista.map(x => ({ sucursal: x, punto: coordenadasSucursalMapa(x) })).filter(x => x.punto);
            conGps.forEach(({sucursal, punto}) => {
                const marker = L.marker([punto.lat, punto.lon]).bindPopup(
                    '<strong>' + escaparHTML(sucursal.nombre) + '</strong><br>' +
                    escaparHTML([sucursal.direccion, sucursal.comuna].filter(Boolean).join(', ')) +
                    '<br><small>' + escaparHTML(sucursal.supervisor || 'Supervisor no asignado') + '</small>'
                );
                marker.addTo(mapa14Marcadores);
            });
            if (conGps.length) {
                const bounds = L.latLngBounds(conGps.map(x => [x.punto.lat, x.punto.lon]));
                mapa14Leaflet.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
            } else {
                mapa14Leaflet.setView([-33.45, -70.66], 5);
            }
            if (status) status.textContent = conGps.length + ' sucursal(es) con coordenadas en el mapa · ' + (lista.length - conGps.length) + ' sin GPS registrado. Puedes ver todas las ubicaciones disponibles aunque no hayas elegido origen o destino.';
            setTimeout(() => mapa14Leaflet && mapa14Leaflet.invalidateSize(), 150);
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
        function mostrarRutaMapa14() {
            const selOrigen = document.getElementById('map14-origen'), selDestino = document.getElementById('map14-destino');
            const origen = selOrigen.value, destino = selDestino.value, modo = document.getElementById('map14-modo').value;
            const nombreOrigen = selOrigen.selectedOptions[0]?.dataset.nombre || selOrigen.selectedOptions[0]?.textContent || origen;
            const nombreDestino = selDestino.selectedOptions[0]?.dataset.nombre || selDestino.selectedOptions[0]?.textContent || destino;
            if (!origen || !destino) return mostrarToast('Selecciona una sucursal de origen y otra de destino.', 'warning');
            if (origen === destino) return mostrarToast('El origen y el destino deben ser diferentes.', 'warning');
            const travelmode = modo === 'w' ? 'walking' : modo === 'r' ? 'transit' : 'driving';
            const externo = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origen)}&destination=${encodeURIComponent(destino)}&travelmode=${travelmode}`;
            const frame=document.getElementById('mapa14-frame');
            frame.dataset.rutaCargada = '1';
            frame.setAttribute('title',`Mapa de ruta: ${nombreOrigen} a ${nombreDestino}`);
            const mapaStatus=document.getElementById('mapa14-status');if(mapaStatus)mapaStatus.textContent='Buscando coordenadas y calculando la ruta…';
            const enlace = document.getElementById('mapa14-externo');
            enlace.href = externo; enlace.classList.remove('hidden');
            const fallback=document.getElementById('mapa14-fallback-link');if(fallback)fallback.href=externo;
            const modoTexto = modo === 'w' ? 'Caminando' : modo === 'r' ? 'Transporte público' : 'Auto';
            document.getElementById('mapa14-resumen').textContent = `${nombreOrigen} → ${nombreDestino} · ${modoTexto}`;
            const p1 = { lat: Number(selOrigen.selectedOptions[0]?.dataset.lat), lon: Number(selOrigen.selectedOptions[0]?.dataset.lon) };
            const p2 = { lat: Number(selDestino.selectedOptions[0]?.dataset.lat), lon: Number(selDestino.selectedOptions[0]?.dataset.lon) };
            if (mapa14Leaflet && Number.isFinite(p1.lat) && Number.isFinite(p1.lon) && Number.isFinite(p2.lat) && Number.isFinite(p2.lon) && (p1.lat !== 0 || p1.lon !== 0) && (p2.lat !== 0 || p2.lon !== 0)) {
                if (mapa14Ruta) mapa14Leaflet.removeLayer(mapa14Ruta);
                mapa14Ruta = L.polyline([[p1.lat,p1.lon],[p2.lat,p2.lon]], { color: '#06b6d4', weight: 4, opacity: .9, dashArray: '8 7' }).addTo(mapa14Leaflet);
                mapa14Leaflet.fitBounds(mapa14Ruta.getBounds(), { padding: [36,36], maxZoom: 12 });
                const status = document.getElementById('mapa14-status');
                if (status) status.textContent = 'Vista previa de ruta recta entre las coordenadas guardadas. Abre Google Maps para el recorrido vial real.';
            } else {
                const status = document.getElementById('mapa14-status');
                if (status) status.textContent = 'Una o ambas sucursales no tienen GPS. La ruta vial está disponible en Google Maps.';
            }
            if (window.lucide) lucide.createIcons();
        }

        async function prepararModuloCoberturas(){const lista=await obtenerSucursalesConfig();document.getElementById('cob-destino').innerHTML='<option value="">Local a cubrir</option>'+lista.map(x=>`<option>${escaparHTML(x.nombre)}</option>`).join('');await cargarCoberturas();}
        function buscarCoberturaPersona(){const q=document.getElementById('cob-buscar').value.toLowerCase().trim(),p=document.getElementById('cob-resultados');if(q.length<2){p.classList.add('hidden');return;}const r=colaboradoresPapeleta.filter(x=>`${x.nombres} ${x.apellidos} ${x.rut} ${x.cargo}`.toLowerCase().includes(q)).slice(0,20);p.innerHTML=r.map(x=>`<button type="button" class="autocomplete-item" onclick="seleccionarCoberturaPersona('${x.id}')"><b>${escaparHTML(`${x.nombres||''} ${x.apellidos||''}`)}</b><br>${escaparHTML(x.rut)} · ${escaparHTML(x.cargo)} · ${escaparHTML(x.sucursal)}</button>`).join('');p.classList.remove('hidden');}
        function seleccionarCoberturaPersona(id){const x=colaboradoresPapeleta.find(a=>String(a.id)===String(id));if(!x)return;document.getElementById('cob-id').value=x.id;document.getElementById('cob-buscar').value=`${x.nombres} ${x.apellidos} · ${x.rut}`;document.getElementById('cob-nombre').value=`${x.nombres} ${x.apellidos}`.trim();document.getElementById('cob-rut').value=x.rut||'';document.getElementById('cob-origen').value=x.sucursal||'';document.getElementById('cob-tipo').value=x.cargo||'';document.getElementById('cob-resultados').classList.add('hidden');}
        function calcularDiasCobertura(){const a=parsearFechaExcel(document.getElementById('cob-inicio').value),b=parsearFechaExcel(document.getElementById('cob-fin').value);if(a&&b&&b>=a)document.getElementById('cob-dias').value=Math.floor((b-a)/86400000)+1;}
        async function guardarCobertura(e) {
            e.preventDefault();
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
                const {data:coverage,error:coverageError} = await _supabase.from('coberturas').insert([{...registro,colaborador_id:String(person.id)}]).select('id').single();
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
                await cargarCoberturas();
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
            const {data,error}=await _supabase.from('coberturas').select('*').order('fecha_inicio',{ascending:false});
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
        async function prepararFiltrosReportesRRHH(){try{const list=await obtenerSucursalesConfig(),sel=document.getElementById('rep-sucursal');sel.innerHTML='<option value="">Todas las sucursales</option>'+list.map(x=>'<option value="'+escaparHTML(x.nombre)+'">'+escaparHTML(x.nombre)+'</option>').join('');const today=new Date(),iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10),from=new Date(today);from.setDate(from.getDate()-29);document.getElementById('rep-desde').value ||= iso(from);document.getElementById('rep-hasta').value ||= iso(today);}catch(e){document.getElementById('rep-estado').textContent='Error cargando filtros: '+e.message;}}
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
                const {data:rows,error}=await _supabase.from(table).select(columns).limit(5000);
                if(error){unavailable.push(label+': '+error.message);data[label]=[{Estado:'No disponible por permisos o conexión',Detalle:error.message}];continue;}
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

