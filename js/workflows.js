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

        async function cargarUsuariosRoles(){
            const tbody=document.getElementById('tabla-usuarios-body');
            if(tbody)tbody.innerHTML='<tr><td colspan="6" class="p-8 text-center text-slate-500"><span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="h-4 w-4 animate-spin"></i> Cargando matriz de permisos…</span></td></tr>';
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
            const html=users.map(({u,index})=>{
                const role=rolNormalizadoUsuario(u.rol);
                const global=usuarioTieneAlcanceGlobal(u);
                const roleClass=role==='CONSULTA'?'role-view':global?'role-admin':'';
                const assignedModules=recursosEfectivosUsuario(u);
                const modules=assignedModules.map(p=>'<span class="usr-resource-chip is-granted">'+escaparHTML(etiquetasPermisosUsuarios[p]||p)+'</span>').join('');
                const supervisors=(u.usuarios_supervisores||[]).map(x=>String(x.supervisor||'').trim()).filter(Boolean);
                const branches=nombresSucursalesUsuario(u);
                const scopeHtml='<div class="usr-scope-list">'+
                    '<span class="usr-scope-line"><i data-lucide="layers-3"></i><span>'+ (global?'Acceso global a módulos':assignedModules.length+' módulo(s) asignado(s)')+'</span></span>'+
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
                    '<td class="p-3"><span class="usr-role-pill '+roleClass+'">'+escaparHTML(etiquetaRolUsuario(u.rol))+'</span>'+(global?'<div><span class="usr-role-pill role-global">Global</span></div>':'')+'</td>'+
                    '<td class="p-3">'+scopeHtml+'</td>'+
                    '<td class="p-3"><div class="usr-resource-summary">'+modules+'</div>'+fullResources+'</td>'+
                    '<td class="p-3">'+status+'</td>'+
                    '<td class="p-3"><div class="usr-row-actions"><button type="button" data-user-action="edit" data-index="'+index+'">Editar perfil</button><button type="button" data-user-action="toggle" data-index="'+index+'">'+(u.activo===true?'Desactivar':'Activar')+'</button><button type="button" class="is-danger" data-user-action="delete" data-index="'+index+'">Eliminar acceso</button></div></td>'+
                    '</tr>';
            }).join('');
            tbody.innerHTML=html;
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
        function exportarKpiTareasCSV(){
            const desde=document.getElementById('tarea-kpi-desde')?.value||'',hasta=document.getElementById('tarea-kpi-hasta')?.value||'',sucursal=document.getElementById('tarea-kpi-sucursal')?.value||'';
            const isoChile=x=>x?new Date(x).toLocaleDateString('sv-SE',{timeZone:'America/Santiago'}):'';
            const rows=tareasGlobal.filter(t=>{const d=isoChile(t.created_at||t.fecha_limite);return(!desde||d>=desde)&&(!hasta||d<=hasta)&&(!sucursal||String(t.sucursal_id||'')===sucursal);});
            const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
            const lines=[['ID','Tarea','Responsable','Estado','Prioridad','Vencimiento','Creada','Actualizada','Sucursal'].map(csvCell).join(',')];
            rows.forEach(t=>lines.push([t.id,t.titulo,t.responsable?.nombre||t.responsable?.email,t.estado_calculado,t.prioridad,t.fecha_limite,t.created_at,t.updated_at,t.sucursal?.nombre||''].map(csvCell).join(',')));
            const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='KPI_Tareas_RRHH_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
        }

        function renderizarTareas(){
            const estado=document.getElementById('tarea-filtro-estado')?.value||'TODOS',responsableFiltro=document.getElementById('tarea-filtro-responsable')?.value||'TODOS',q=texto(document.getElementById('tarea-filtro-buscar')?.value).toLowerCase();
            let f=tareasGlobal;if(estado!=='TODOS')f=f.filter(x=>x.estado_calculado===estado);if(responsableFiltro!=='TODOS')f=f.filter(x=>String(x.responsable_rol_id)===responsableFiltro);if(q)f=f.filter(x=>`${x.titulo} ${x.descripcion} ${x.responsable?.nombre} ${x.responsable?.email} ${x.sucursal?.nombre}`.toLowerCase().includes(q));
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
            document.getElementById('tabla-tareas').innerHTML=f.length?f.map(t=>`<tr><td><b>${escaparHTML(t.titulo)}</b><br><span class="text-xs text-slate-500">${escaparHTML(t.descripcion)}</span></td><td>${escaparHTML(t.responsable?.nombre||t.responsable?.email||'Sin asignar')}</td><td>${escaparHTML(t.revisor?.nombre||t.revisor?.email||'—')}</td><td><span class="rounded-full px-2 py-1 text-xs font-bold ${t.prioridad==='URGENTE'?'bg-rose-100 text-rose-800':t.prioridad==='ALTA'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}">${escaparHTML(t.prioridad)}</span></td><td>${new Date(t.fecha_limite).toLocaleString('es-CL')}</td><td><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">${t.estado_calculado}</span></td><td><select aria-label="Cambiar estado de tarea" class="form-field min-w-40" onchange="cambiarEstadoTarea(${t.id},this.value)"><option value="">Actualizar estado…</option>${(esAdminPrincipalActual()||(puedeRevisarTareasActual()&&String(t.revisor_rol_id)===String(perfilActualSistema?.id))?['EN_PROCESO','COMPLETADA_POR_VALIDAR','APROBADA','DEVUELTA','CANCELADA']:(String(t.responsable_rol_id)===String(perfilActualSistema?.id)?['EN_PROCESO','COMPLETADA_POR_VALIDAR']:[])).map(e=>`<option>${e}</option>`).join('')}</select></td></tr>`).join(''):'<tr><td colspan="7" class="p-8 text-center text-sm text-slate-500">No hay tareas para estos filtros.</td></tr>';
        }
        async function cambiarEstadoTarea(id,estado){if(!estado)return;const tarea=tareasGlobal.find(x=>String(x.id)===String(id));if(!tarea)return mostrarToast('No se encontró la tarea.','error');const idActual=String(perfilActualSistema?.id||'');const esResp=String(tarea.responsable_rol_id)===idActual;const esRev=String(tarea.revisor_rol_id)===idActual;if(!esAdminPrincipalActual()&&(['APROBADA','DEVUELTA','CANCELADA'].includes(estado)?(!puedeRevisarTareasActual()||!esRev):(!esResp&&!esRev)))return mostrarToast('No tienes permiso para cambiar este estado.','warning');const motivo=['DEVUELTA','CANCELADA'].includes(estado)?prompt('Indica el motivo del cambio:')||'Sin motivo':'';const {data:{session}}=await _supabase.auth.getSession();const {error}=await _supabase.from('tareas').update({estado,updated_at:new Date().toISOString()}).eq('id',id);if(error)return mostrarToast(error.message,'error');await _supabase.from('tareas_eventos').insert([{tarea_id:id,accion:'CAMBIO_ESTADO',estado_nuevo:estado,usuario_email:session?.user?.email||'',detalle:motivo}]);await cargarTareas();}

        async function registrarAuditoria(modulo,accion,detalle){try{const {data:{session}}=await _supabase.auth.getSession();await _supabase.from('auditoria_eventos').insert([{usuario_email:session?.user?.email||'sin sesión',modulo,accion,detalle}]);}catch(e){console.warn('Auditoría no registrada',e);}}
        async function cargarAuditoria(){const {data,error}=await _supabase.from('auditoria_eventos').select('*').order('created_at',{ascending:false}).limit(2000);if(error){mostrarToast(error.message,'error');return;}datosAuditoriaGlobal=data||[];renderizarAuditoria();}
        function renderizarAuditoria(){const buscar=document.getElementById('audit-buscar')?.value.toLowerCase().trim()||'',desde=document.getElementById('audit-desde')?.value||'',hasta=document.getElementById('audit-hasta')?.value||'';let f=datosAuditoriaGlobal.filter(a=>(!desde||a.created_at.slice(0,10)>=desde)&&(!hasta||a.created_at.slice(0,10)<=hasta));if(buscar)f=f.filter(a=>`${a.usuario_email} ${a.modulo} ${a.accion} ${a.detalle}`.toLowerCase().includes(buscar));document.getElementById('contador-auditoria').innerText=f.length;document.getElementById('tabla-auditoria-body').innerHTML=f.length?f.map(a=>`<tr><td class="p-3 font-mono">${escaparHTML(a.created_at?.replace('T',' ').slice(0,19))}</td><td class="p-3">${escaparHTML(a.usuario_email)}</td><td class="p-3">${escaparHTML(a.modulo)}</td><td class="p-3 font-bold">${escaparHTML(a.accion)}</td><td class="p-3">${escaparHTML(a.detalle)}</td></tr>`).join(''):'<tr><td colspan="5" class="p-8 text-center text-slate-400">Sin eventos.</td></tr>';}

        document.getElementById('usr-rol')?.addEventListener('change',event=>{const node=document.getElementById('usr-rol-description');if(node)node.textContent=descripcionRolUsuario(event.target.value);});

