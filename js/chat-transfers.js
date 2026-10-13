(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateTime = value => value ? new Date(value).toLocaleString("es-CL",{timeZone:"America/Santiago",dateStyle:"medium",timeStyle:"short"}) : "—";
  const dateOnly = value => value ? new Date(value+"T12:00:00").toLocaleDateString("es-CL",{timeZone:"America/Santiago"}) : "—";
  const setStatus = (id, message, error=false) => { const node=$(id); if(node){node.textContent=message;node.className="mt-3 text-xs "+(error?"text-rose-700":"text-slate-500");} };
  const norm = value => String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("es-CL");
  let currentRoleId = null, chatUsers = [], activeConversation = null, chatChannel = null, chatInboxChannel = null, chatBusy = false;
  const notifiedMessageIds = new Set();
  let chatAudioContext = null;
  let chatAudioUnlocked = false;

  async function desbloquearSonidoChat() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      if (!chatAudioContext) chatAudioContext = new AudioCtx();
      if (chatAudioContext.state === "suspended") await chatAudioContext.resume();
      chatAudioUnlocked = chatAudioContext.state === "running";
      return chatAudioUnlocked;
    } catch (e) { console.debug("No se pudo activar el sonido del chat:", e); return false; }
  }

  // El navegador exige una interacción real para habilitar audio. Se intenta
  // desbloquearlo en el primer clic/tecla del usuario, no después de un await.
  document.addEventListener("pointerdown", () => { if (!chatAudioUnlocked) desbloquearSonidoChat(); }, { passive: true });
  document.addEventListener("keydown", () => { if (!chatAudioUnlocked) desbloquearSonidoChat(); }, { passive: true });

  function reproducirAvisoChat() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!chatAudioContext) chatAudioContext = new AudioCtx();
      if (chatAudioContext.state === "suspended") { chatAudioContext.resume().catch(() => {}); return; }
      if (!chatAudioUnlocked) return;
      const ctx = chatAudioContext, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (e) { console.debug("Aviso sonoro no disponible:", e); }
  }

  function notificarMensajeEntrante(msg, conversations) {
    if (!msg || Number(msg.remitente_id) === Number(currentRoleId) || notifiedMessageIds.has(String(msg.id))) return;
    notifiedMessageIds.add(String(msg.id));
    if (notifiedMessageIds.size > 300) notifiedMessageIds.delete(notifiedMessageIds.values().next().value);
    reproducirAvisoChat();
    const conversation = (conversations || []).find(item => String(item.id) === String(msg.conversacion_id));
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      const sender = chatUsers.find(user => Number(user.id) === Number(msg.remitente_id));
      const body = msg.adjunto_nombre ? "Adjunto: " + msg.adjunto_nombre : String(msg.contenido || "Nuevo mensaje").slice(0, 140);
      try {
        const notice = new Notification((sender?.nombre || sender?.email || "Nuevo mensaje") + " · " + (conversation?.titulo || "Chat interno"), { body, tag: "chat-" + msg.conversacion_id, icon: "/favicon.ico" });
        notice.onclick = () => { window.focus(); if (conversation) abrirConversacionChat(conversation.id); notice.close(); };
      } catch (e) { console.debug("Notificación de escritorio no disponible:", e); }
    }
  }

  async function iniciarAvisosChat() {
    // No crear/reanudar audio aquí: esta función se ejecuta tras awaits y el navegador
    // puede rechazarlo. El primer clic/tecla real desbloquea el sonido.
    if ("Notification" in window && Notification.permission === "default" && !window.__chatNotificationPermissionAsked) {
      window.__chatNotificationPermissionAsked = true;
      try { await Notification.requestPermission(); } catch (_) {}
    }
  }

  async function suscribirAvisosChat(conversations) {
    if (chatInboxChannel) { try { await _supabase.removeChannel(chatInboxChannel); } catch (_) {} chatInboxChannel = null; }
    chatInboxChannel = _supabase.channel("chat-inbox-" + currentRoleId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes" }, payload => {
        const msg = payload.new;
        if (msg && (conversations || []).some(item => String(item.id) === String(msg.conversacion_id))) notificarMensajeEntrante(msg, conversations);
      }).subscribe();
  }
  let collaborators = [], branches = [], canApproveTransfers = false;
  let solicitudesDotacionCache = [], solicitudesDotacionError = null;

  async function currentUserId() {
    if (currentRoleId) return currentRoleId;
    const {data,error}=await _supabase.rpc("chat_usuario_actual_id");
    if(error) throw error;
    if(!data) throw new Error("Tu cuenta no tiene un perfil activo asignado en Usuarios y roles.");
    currentRoleId=data;
    return data;
  }

  async function loadChatUsers() {
    const {data,error}=await _supabase.rpc("chat_listar_usuarios");
    if(error) throw error;
    chatUsers=data||[];
    const select=$("chat-usuarios-nuevos");
    if(select){
      const {data:me}=await _supabase.rpc("chat_usuario_actual_id");
      select.replaceChildren();
      chatUsers.filter(u=>Number(u.id)!==Number(me)).forEach(u=>{
        const option=document.createElement("option");
        option.value=String(u.id);
        option.textContent=(u.nombre||u.email)+" · "+(u.rol||"Usuario");
        select.append(option);
      });
    }
  }

  async function cargarChatInterno() {
    const status=$("chat-estado");
    if(status) status.textContent="Conectando con el chat seguro…";
    try {
      await iniciarAvisosChat();
      await currentUserId();
      await loadChatUsers();
      const {data,error}=await _supabase.rpc("chat_listar_conversaciones");
      if(error) throw error;
      await suscribirAvisosChat(data||[]);
      renderConversations(data||[]);
      if(status) status.textContent="Conectado · mensajes protegidos por participante · hora de Chile";
      if(activeConversation && !(data||[]).some(c=>c.id===activeConversation)) activeConversation=null;
      if(!activeConversation && data?.length) await abrirConversacionChat(data[0].id);
      else if(activeConversation) await abrirConversacionChat(activeConversation);
    } catch(error) {
      console.warn("Chat interno:",error);
      if(status) status.textContent=error.message||"No se pudo conectar al chat. Revisa que tengas asignado el permiso chat.";
      if($("chat-conversaciones-list")) $("chat-conversaciones-list").innerHTML='<p class="text-sm text-rose-700">No se pudieron cargar las conversaciones. Comprueba el permiso de Chat interno.</p>';
    }
  }

  function renderConversations(items) {
    const host=$("chat-conversaciones-list"); if(!host)return;
    host.replaceChildren();
    if(!items.length){host.append(Object.assign(document.createElement("p"),{className:"text-sm text-slate-500",textContent:"Todavía no tienes conversaciones. Selecciona participantes y crea una."}));return;}
    items.forEach(item=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="w-full rounded-xl border p-3 text-left transition "+(item.id===activeConversation?"border-blue-300 bg-blue-50":"border-slate-200 bg-white hover:bg-slate-100");
      const title=document.createElement("span");title.className="block truncate text-sm font-bold text-slate-800";title.textContent=item.titulo||"Conversación";
      const meta=document.createElement("span");meta.className="mt-1 block text-[11px] text-slate-500";meta.textContent=(item.tipo==="GRUPO"?"Grupo":"Privada")+" · "+dateTime(item.last_message_at||item.updated_at);
      const unread=Number(item.unread_count||0);
      if(unread>0){const badge=document.createElement("span");badge.className="mt-2 inline-flex rounded-full bg-blue-700 px-2 py-1 text-[10px] font-extrabold text-white";badge.textContent=unread+" sin leer";btn.append(title,meta,badge);}
      else btn.append(title,meta);
      btn.addEventListener("click",()=>abrirConversacionChat(item.id));host.append(btn);
    });
  }

  async function crearConversacionChat() {
    if(chatBusy)return;
    const chosen=Array.from($("chat-usuarios-nuevos")?.selectedOptions||[]).map(o=>Number(o.value)).filter(Number.isFinite);
    if(!chosen.length){setStatus("chat-estado","Selecciona al menos un usuario además de ti.",true);return;}
    chatBusy=true;
    try{
      const me=await currentUserId();
      const title=$("chat-titulo-nuevo")?.value.trim();
      const chosenUsers=chatUsers.filter(u=>chosen.includes(Number(u.id)));
      const finalTitle=title||(chosenUsers.length===1?(chosenUsers[0].nombre||chosenUsers[0].email):"Grupo de Recursos Humanos");
      const {data:conversation,error}=await _supabase.from("chat_conversaciones").insert({
        titulo:finalTitle.slice(0,80),tipo:chosenUsers.length===1?"PRIVADA":"GRUPO",creado_por:me
      }).select("id,titulo,tipo,updated_at").single();
      if(error)throw error;
      const participants=[...new Set([Number(me),...chosen])].map(usuario_rol_id=>({conversacion_id:conversation.id,usuario_rol_id,agregado_por:me}));
      const {error:memberError}=await _supabase.from("chat_participantes").insert(participants);
      if(memberError)throw memberError;
      $("chat-titulo-nuevo").value="";
      Array.from($("chat-usuarios-nuevos").options).forEach(o=>o.selected=false);
      activeConversation=conversation.id;
      await cargarChatInterno();
    }catch(error){console.error("Crear conversación:",error);setStatus("chat-estado",error.message||"No se pudo crear la conversación.",true);}
    finally{chatBusy=false;}
  }

  async function abrirConversacionChat(id) {
    activeConversation=id;
    if(chatChannel){try{await _supabase.removeChannel(chatChannel);}catch(_){}chatChannel=null;}
    const host=$("chat-mensajes");if(host)host.innerHTML='<p class="text-sm text-slate-500">Cargando mensajes…</p>';
    try{
      const {data:conv,error:convError}=await _supabase.from("chat_conversaciones").select("id,titulo,tipo,updated_at").eq("id",id).single();
      if(convError)throw convError;
      if($("chat-conversacion-titulo"))$("chat-conversacion-titulo").innerHTML='<h4 class="font-extrabold">'+esc(conv.titulo)+'</h4><p class="mt-1 text-xs text-slate-500">'+(conv.tipo==="GRUPO"?"Conversación grupal":"Conversación privada")+' · actualizado '+esc(dateTime(conv.updated_at))+'</p>';
      const {data,error}=await _supabase.from("chat_mensajes").select("id,conversacion_id,remitente_id,contenido,created_at,adjunto_path,adjunto_nombre,adjunto_mime,adjunto_bytes").eq("conversacion_id",id).is("eliminado_at",null).order("created_at",{ascending:true}).limit(300);
      if(error)throw error;
      renderMessages(data||[]);
      if($("chat-mensaje-input"))$("chat-mensaje-input").disabled=false;
      if($("chat-archivo"))$("chat-archivo").disabled=false;
      if($("chat-enviar"))$("chat-enviar").disabled=false;
      await _supabase.rpc("chat_marcar_leido",{p_conversacion:id});
      chatChannel=_supabase.channel("chat-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_mensajes",filter:"conversacion_id=eq."+id},payload=>{
        const msg=payload.new;
        if(msg && msg.conversacion_id===activeConversation) {
          const current= $("chat-mensajes");
          if(current && !current.querySelector('[data-chat-msg="'+msg.id+'"]')) appendMessage(msg);
          _supabase.rpc("chat_marcar_leido",{p_conversacion:id});
        }
      }).subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Canal de mensajes del chat:", status, err || "");
          if ($("chat-estado")) $("chat-estado").textContent = "Conexión de mensajes interrumpida · revisa tu conexión";
        }
      });
      if($("chat-estado"))$("chat-estado").textContent="Conversación conectada · mensajes en tiempo real";
      const {data:list}=await _supabase.rpc("chat_listar_conversaciones");
      renderConversations(list||[]);
    }catch(error){
      console.warn("Abrir conversación:",error);
      if(host)host.innerHTML='<p class="text-sm text-rose-700">No tienes acceso a esta conversación o no se pudo cargar.</p>';
      if($("chat-mensaje-input"))$("chat-mensaje-input").disabled=true;
      if($("chat-archivo"))$("chat-archivo").disabled=true;
      if($("chat-enviar"))$("chat-enviar").disabled=true;
    }
  }

  function renderMessages(items) {
    const host=$("chat-mensajes");if(!host)return;
    host.replaceChildren();
    if(!items.length){host.append(Object.assign(document.createElement("p"),{className:"text-sm text-slate-500",textContent:"No hay mensajes todavía. Envía el primero."}));return;}
    items.forEach(appendMessage);
    host.scrollTop=host.scrollHeight;
  }
  function appendMessage(msg) {
    const host=$("chat-mensajes");if(!host||host.querySelector('[data-chat-msg="'+msg.id+'"]'))return;
    const sender=chatUsers.find(u=>Number(u.id)===Number(msg.remitente_id));
    const row=document.createElement("div");row.dataset.chatMsg=msg.id;row.className="flex "+(Number(msg.remitente_id)===Number(currentRoleId)?"justify-end":"justify-start");
    const bubble=document.createElement("div");bubble.className="max-w-[88%] rounded-2xl px-4 py-3 "+(Number(msg.remitente_id)===Number(currentRoleId)?"bg-blue-700 text-white":"border border-slate-200 bg-slate-50 text-slate-800");
    const name=document.createElement("div");name.className="mb-1 text-[10px] font-bold opacity-75";name.textContent=(sender?.nombre||sender?.email||"Usuario")+" · "+dateTime(msg.created_at);
    const body=document.createElement("p");body.className="whitespace-pre-wrap break-words text-sm";body.textContent=msg.contenido||"Mensaje eliminado";
    bubble.append(name,body);
    if(msg.adjunto_path){
      const fileBtn=document.createElement("button");fileBtn.type="button";fileBtn.className="mt-2 block max-w-full break-all text-left text-xs font-bold underline";fileBtn.textContent="📎 "+(msg.adjunto_nombre||"Descargar archivo");fileBtn.dataset.chatDownload=msg.adjunto_path;fileBtn.dataset.chatFilename=msg.adjunto_nombre||"archivo";
      bubble.append(fileBtn);
    }
    row.append(bubble);host.append(row);host.scrollTop=host.scrollHeight;
  }

  async function enviarMensajeChat(event) {
    event?.preventDefault();
    const input=$("chat-mensaje-input"),content=input?.value.trim(),file=$("chat-archivo")?.files?.[0];
    if(!activeConversation||(!content&&!file)||chatBusy)return;
    if(file&&file.size>10*1024*1024){setStatus("chat-estado","El archivo supera el límite de 10 MB.",true);return;}
    chatBusy=true;let uploadedPath=null;
    try{
      const me=await currentUserId();let attachment={};
      if(file){
        const allowed=["application/pdf","image/jpeg","image/png","image/webp","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel","text/csv"];
        if(file.type&&!allowed.includes(file.type))throw new Error("Tipo de archivo no permitido. Usa PDF, Word, Excel, CSV, TXT, JPG, PNG o WEBP.");
        const safeName=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-100)||"archivo";
        uploadedPath=activeConversation+"/"+Date.now()+"-"+safeName;
        const {error:uploadError}=await _supabase.storage.from("chat-adjuntos").upload(uploadedPath,file,{upsert:false,contentType:file.type||"application/octet-stream"});
        if(uploadError)throw uploadError;
        attachment={adjunto_path:uploadedPath,adjunto_nombre:file.name,adjunto_mime:file.type||null,adjunto_bytes:file.size};
      }
      const messageContent=content||(file?"Archivo adjunto: "+file.name:"");
      const {data,error}=await _supabase.from("chat_mensajes").insert({conversacion_id:activeConversation,remitente_id:me,contenido:messageContent,...attachment}).select("id,conversacion_id,remitente_id,contenido,created_at,adjunto_path,adjunto_nombre,adjunto_mime,adjunto_bytes").single();
      if(error)throw error;
      input.value="";if($("chat-archivo"))$("chat-archivo").value="";
      appendMessage(data);
      if($("chat-estado"))$("chat-estado").textContent="Mensaje enviado · "+dateTime(data.created_at);
    }catch(error){
      if(uploadedPath){try{await _supabase.storage.from("chat-adjuntos").remove([uploadedPath]);}catch(_){}}
      console.error("Enviar mensaje:",error);setStatus("chat-estado",error.message||"No se pudo enviar el mensaje.",true);
    }finally{chatBusy=false;input?.focus();}
  }

  function fillSelect(select,items,placeholder,selectedValue) {
    if(!select)return;select.replaceChildren();
    const blank=document.createElement("option");blank.value="";blank.textContent=placeholder;select.append(blank);
    items.forEach(item=>{const o=document.createElement("option");o.value=item.id;o.textContent=item.nombre;o.selected=String(item.id)===String(selectedValue||"");select.append(o);});
  }

  async function iniciarModuloTraslados() {
    try{
      await currentUserId();
      const [collabResult,branchResult,permissionResult]=await Promise.all([
        _supabase.from("colaboradores").select("id,rut,nombres,apellidos,cargo,sucursal_id,sucursal,estado").order("apellidos").limit(3000),
        _supabase.from("sucursales").select("id,nombre,activa").eq("activa",true).order("nombre").limit(1000),
        _supabase.rpc("usuario_tiene_permiso",{p_permiso:"traslados_aprobar"})
      ]);
      if(collabResult.error)throw collabResult.error;
      if(branchResult.error)throw branchResult.error;
      collaborators=(collabResult.data||[]).filter(c=>!c.estado||!["INACTIVO","INACTIVA","DESVINCULADO"].includes(String(c.estado).toUpperCase()));
      branches=branchResult.data||[];
      const {data:sessionData}=await _supabase.auth.getSession();
      canApproveTransfers=!!permissionResult.data||String(sessionData?.session?.user?.email||"").toLowerCase()==="scoloma@farmaciasdoctorsimi.cl";
      filtrarColaboradoresTraslado();
      $("traslado-buscar-colaborador")?.addEventListener("input",filtrarColaboradoresTraslado);
      fillSelect($("traslado-origen"),branches.map(b=>({id:b.id,nombre:b.nombre})),"Selecciona origen");
      fillSelect($("traslado-destino"),branches.map(b=>({id:b.id,nombre:b.nombre})),"Selecciona destino");
      $("traslado-colaborador")?.addEventListener("change",autofillTransferOrigin);
      $("traslado-indefinido")?.addEventListener("change",()=>{
        const term=$("traslado-termino");if(term){term.disabled=$("traslado-indefinido").checked;if(term.disabled)term.value="";}
      });
      await Promise.all([cargarTrasladosPersonal(),cargarSolicitudesDotacion()]);
    }catch(error){
      console.error("Módulo de traslados:",error);
      setStatus("traslado-estado",error.message||"No se pudieron cargar los datos de traslados. Comprueba tus permisos.",true);
      if($("traslado-tabla-body"))$("traslado-tabla-body").innerHTML='<tr><td colspan="7" class="p-6 text-center text-rose-700">No se pudo cargar el módulo. Comprueba tu permiso de Traslados de personal.</td></tr>';
    }
  }

  function filtrarColaboradoresTraslado() {
    const select=$("traslado-colaborador");if(!select)return;
    const query=norm($("traslado-buscar-colaborador")?.value||"");
    const previous=select.value;
    const filtered=collaborators.filter(c=>norm([c.nombres,c.apellidos,c.rut,c.cargo,c.sucursal].join(" ")).includes(query)).slice(0,3000);
    select.replaceChildren();
    const blank=document.createElement("option");blank.value="";blank.textContent=query?"Selecciona coincidencia ("+filtered.length+")":"Selecciona colaborador";select.append(blank);
    filtered.forEach(c=>{const option=document.createElement("option");option.value=String(c.id);option.textContent=((c.nombres||"")+" "+(c.apellidos||"")).trim()+" · "+(c.rut||"Sin RUT")+(c.sucursal?" · "+c.sucursal:"");select.append(option);});
    if(filtered.some(c=>String(c.id)===previous))select.value=previous;
    if(query&&filtered.length===1){select.value=String(filtered[0].id);autofillTransferOrigin();}
  }

  function autofillTransferOrigin() {
    const c=collaborators.find(x=>String(x.id)===$("traslado-colaborador")?.value);if(!c)return;
    const branch=branches.find(b=>String(b.id)===String(c.sucursal_id))||branches.find(b=>norm(b.nombre)===norm(c.sucursal));
    if(branch)$("traslado-origen").value=String(branch.id);
  }

  async function crearSolicitudTraslado(event) {
    event?.preventDefault();
    const form=$("traslado-form");if(!form)return;
    const c=collaborators.find(x=>String(x.id)===$("traslado-colaborador")?.value);
    const origin=branches.find(x=>String(x.id)===$("traslado-origen")?.value);
    const dest=branches.find(x=>String(x.id)===$("traslado-destino")?.value);
    const start=$("traslado-inicio")?.value, indefinite=$("traslado-indefinido")?.checked||false, end=$("traslado-termino")?.value||null;
    const reason=$("traslado-motivo")?.value.trim();
    if(!c||!origin||!dest||!start||!reason){setStatus("traslado-estado","Completa colaborador, origen, destino, inicio y motivo.",true);return;}
    if(origin.id===dest.id){setStatus("traslado-estado","La sucursal de origen y destino deben ser diferentes.",true);return;}
    if(!indefinite&&end&&end<start){setStatus("traslado-estado","La fecha de término no puede ser anterior al inicio.",true);return;}
    try{
      const me=await currentUserId();
      const row={colaborador_id:c.id,rut:c.rut||null,colaborador_nombre:((c.nombres||"")+" "+(c.apellidos||"")).trim(),cargo:c.cargo||null,
        sucursal_origen_id:origin.id,sucursal_origen_nombre:origin.nombre,sucursal_destino_id:dest.id,sucursal_destino_nombre:dest.nombre,
        fecha_inicio:start,fecha_termino:indefinite?null:end,indefinido:indefinite,motivo:reason,solicitado_por:me,estado:"SOLICITADO"};
      const {error}=await _supabase.from("traslados_personal").insert(row);
      if(error)throw error;
      form.reset();$("traslado-termino").disabled=false;
      setStatus("traslado-estado","Solicitud registrada en la nube. Queda pendiente de revisión.");
      await cargarTrasladosPersonal();
    }catch(error){console.error("Crear traslado:",error);setStatus("traslado-estado",error.message||"No se pudo guardar la solicitud. Verifica el permiso Traslados de personal.",true);}
  }

  async function cargarTrasladosPersonal() {
    const host=$("traslado-tabla-body");if(!host)return;
    host.innerHTML='<tr><td colspan="7" class="p-6 text-center text-slate-500">Cargando solicitudes…</td></tr>';
    try{
      const {data,error}=await _supabase.from("traslados_personal").select("id,colaborador_id,rut,colaborador_nombre,cargo,sucursal_origen_id,sucursal_origen_nombre,sucursal_destino_id,sucursal_destino_nombre,fecha_inicio,fecha_termino,indefinido,motivo,estado,aplicado_en,created_at,solicitado_por,revisado_por,tipo_movimiento,cobertura_id").order("created_at",{ascending:false}).limit(1000);
      if(error)throw error;
      const allRows=data||[];
      renderTransferCalendar(allRows);
      renderTransferStaffing(allRows);
      const filter=$("traslado-filtro-estado")?.value||"TODOS";
      const rows=allRows.filter(r=>filter==="TODOS"||r.estado===filter);
      host.replaceChildren();
      if(!rows.length){host.innerHTML='<tr><td colspan="7" class="p-6 text-center text-slate-500">No hay solicitudes para este filtro.</td></tr>';return;}
      rows.forEach(r=>{
        const tr=document.createElement("tr");
        const dateText=dateOnly(r.fecha_inicio)+" – "+(r.indefinido?"Indefinido":dateOnly(r.fecha_termino));
        const stateClass=r.estado==="APROBADO"?"bg-emerald-50 text-emerald-700":r.estado==="RECHAZADO"||r.estado==="CANCELADO"?"bg-rose-50 text-rose-700":"bg-amber-50 text-amber-800";
        let actions='<span class="text-slate-400">Sin acciones</span>';
        if(canApproveTransfers&&r.estado==="SOLICITADO")actions='<div class="flex gap-2"><button type="button" data-transfer-action="APROBADO" data-id="'+esc(r.id)+'" class="rounded-lg bg-emerald-600 px-2 py-1.5 font-bold text-white">Aprobar</button><button type="button" data-transfer-action="RECHAZADO" data-id="'+esc(r.id)+'" class="rounded-lg bg-rose-600 px-2 py-1.5 font-bold text-white">Rechazar</button></div>';
        const stateLabel=r.estado==="APROBADO"?(r.aplicado_en?"APROBADO · APLICADO":"APROBADO · PROGRAMADO"):r.estado;
        const movementLabel=r.tipo_movimiento==="COBERTURA"?"Cobertura temporal · ":"";
        const cells=[movementLabel+(r.colaborador_nombre||"")+" · "+(r.rut||"Sin RUT"),r.sucursal_origen_nombre,r.sucursal_destino_nombre,dateText,r.motivo,stateLabel,actions];
        cells.forEach((v,i)=>{const td=document.createElement("td");td.className="p-3 align-top";if(i===5)td.innerHTML='<span class="rounded-full px-2 py-1 font-bold '+stateClass+'">'+esc(v)+'</span>';else if(i===6)td.innerHTML=v;else td.textContent=v||"—";tr.append(td);});
        host.append(tr);
      });
    }catch(error){console.error("Listar traslados:",error);host.innerHTML='<tr><td colspan="7" class="p-6 text-center text-rose-700">No se pudieron consultar los traslados. Revisa el permiso del módulo.</td></tr>';}
  }

  function todayChileISO(){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return values.year+"-"+values.month+"-"+values.day;
  }
  function addDaysISO(iso,days){
    const [y,m,d]=iso.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
  }
  function renderTransferCalendar(rows){
    const host=$("traslado-calendario");if(!host)return;
    const today=todayChileISO(),end=addDaysISO(today,90);
    const items=rows.filter(r=>["SOLICITADO","APROBADO"].includes(r.estado)&&r.fecha_inicio>=today&&r.fecha_inicio<=end)
      .sort((a,b)=>a.fecha_inicio.localeCompare(b.fecha_inicio)).slice(0,100);
    host.replaceChildren();
    if(!items.length){host.append(Object.assign(document.createElement("p"),{className:"text-sm text-slate-500",textContent:"No hay movimientos registrados para los próximos 90 días."}));return;}
    items.forEach(r=>{
      const card=document.createElement("div");card.className="flex items-start justify-between gap-3 py-3";
      const info=document.createElement("div");info.className="min-w-0";
      const title=document.createElement("b");title.className="block text-sm text-slate-800";title.textContent=r.colaborador_nombre||"Colaborador";
      const route=document.createElement("p");route.className="mt-1 text-xs text-slate-600";route.textContent=(r.sucursal_origen_nombre||"Origen")+" → "+(r.sucursal_destino_nombre||"Destino");
      const dateNode=document.createElement("p");dateNode.className="mt-1 text-[11px] text-slate-500";dateNode.textContent=dateOnly(r.fecha_inicio)+" · "+(r.indefinido?"Indefinido":r.fecha_termino?("hasta "+dateOnly(r.fecha_termino)):"Sin fecha de término");
      info.append(title,route,dateNode);
      const badge=document.createElement("span");badge.className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold "+(r.estado==="APROBADO"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-800");badge.textContent=r.estado==="APROBADO"?(r.aplicado_en?"Aplicado":"Aprobado"):"Solicitado";
      card.append(info,badge);host.append(card);
    });
  }
  function renderTransferStaffing(rows){
    const host=$("traslado-dotacion");if(!host)return;
    const today=todayChileISO();
    const scheduled=rows.filter(r=>r.estado==="APROBADO"&&!r.aplicado_en&&r.fecha_inicio>today);
    const pending=rows.filter(r=>r.estado==="SOLICITADO");
    const counts=branches.map(branch=>{
      const active=collaborators.filter(c=>String(c.sucursal_id||"")===String(branch.id)||norm(c.sucursal)===norm(branch.nombre)).length;
      const incoming=scheduled.filter(r=>String(r.sucursal_destino_id||"")===String(branch.id)).length;
      const outgoing=scheduled.filter(r=>String(r.sucursal_origen_id||"")===String(branch.id)).length;
      const waiting=pending.filter(r=>String(r.sucursal_destino_id||"")===String(branch.id)).length;
      return {name:branch.nombre,active,incoming,outgoing,waiting};
    }).filter(x=>x.active||x.incoming||x.outgoing||x.waiting).sort((a,b)=>a.name.localeCompare(b.name,"es"));
    host.replaceChildren();
    if(!counts.length){host.append(Object.assign(document.createElement("p"),{className:"text-sm text-slate-500",textContent:"No hay datos de dotación disponibles para las sucursales activas."}));return;}
    counts.forEach(item=>{
      const card=document.createElement("div");card.className="py-3";
      const top=document.createElement("div");top.className="flex items-center justify-between gap-2";
      const name=document.createElement("b");name.className="text-sm text-slate-800";name.textContent=item.name;
      const total=document.createElement("span");total.className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-extrabold text-slate-700";total.textContent=item.active+" activos";
      top.append(name,total);
      const detail=document.createElement("p");detail.className="mt-1 text-xs text-slate-500";detail.textContent="Entradas aprobadas: "+item.incoming+" · Salidas aprobadas: "+item.outgoing+" · Solicitudes por revisar: "+item.waiting;
      card.append(top,detail);host.append(card);
    });
  }

  function renderSolicitudesDotacion(){
    const host=$("dotacion-alertas-lista");
    if(!host)return;
    const summary=$("dotacion-filter-summary");
    if(solicitudesDotacionError){
      if(summary)summary.textContent="No se pudieron consultar las solicitudes. Revisa tu permiso de acceso.";
      host.innerHTML='<tr><td colspan="7" class="p-5 text-center text-rose-700">No se pudieron cargar las alertas: '+esc(solicitudesDotacionError)+'</td></tr>';
      return;
    }
    const q=norm($("dotacion-filtro-buscar")?.value||"");
    const stateFilter=$("dotacion-filtro-estado")?.value||"TODOS";
    const from=$("dotacion-filtro-desde")?.value||"";
    const to=$("dotacion-filtro-hasta")?.value||"";
    const total=solicitudesDotacionCache.length;
    const pending=solicitudesDotacionCache.filter(r=>r.estado==="PENDIENTE");
    const requestedPeople=pending.reduce((sum,r)=>sum+Math.max(0,Number(r.cantidad||1)),0);
    const rows=solicitudesDotacionCache.filter(r=>{
      if(stateFilter!=="TODOS"&&String(r.estado||"")!==stateFilter)return false;
      const start=String(r.fecha_inicio||"");
      if(from&&start<from)return false;
      if(to&&start>to)return false;
      if(q){
        const haystack=norm([r.sucursal_nombre,r.cargo_requerido,r.turno,r.hora_inicio,r.hora_fin,r.motivo,r.observaciones,r.estado].join(" "));
        if(!haystack.includes(q))return false;
      }
      return true;
    });
    if(summary)summary.textContent=rows.length+" de "+total+" solicitudes · "+pending.length+" pendientes · "+requestedPeople+" persona(s) requeridas en solicitudes pendientes";
    host.replaceChildren();
    if(!rows.length){
      const tr=document.createElement("tr"),td=document.createElement("td");
      td.colSpan=7;td.className="p-6 text-center text-slate-500";
      td.textContent=total?"Ninguna solicitud coincide con los filtros elegidos.":"No hay alertas de necesidad de personal todavía.";
      tr.append(td);host.append(tr);return;
    }
    const cargoLabel={QF:"QF",AF:"AF",OTRO:"Otro cargo"};
    const turnoLabel={AM:"AM · Apertura",PM:"PM · Cierre",COMPLETO:"Turno completo",FLEXIBLE:"Flexible"};
    const statusClass={APROBADA:"bg-emerald-50 text-emerald-700",CUBIERTA:"bg-emerald-50 text-emerald-700",RECHAZADA:"bg-rose-50 text-rose-700",CANCELADA:"bg-rose-50 text-rose-700",PENDIENTE:"bg-amber-50 text-amber-800"};
    rows.forEach(r=>{
      const tr=document.createElement("tr");
      const period=dateOnly(r.fecha_inicio)+" – "+dateOnly(r.fecha_fin);
      const shift=(turnoLabel[r.turno]||r.turno||"Turno no indicado")+(r.hora_inicio&&r.hora_fin?" · "+String(r.hora_inicio).slice(0,5)+"–"+String(r.hora_fin).slice(0,5):"");
      const values=[
        String(r.sucursal_nombre||"Sucursal sin nombre")+" · "+(cargoLabel[r.cargo_requerido]||r.cargo_requerido||"Cargo no definido"),
        period,shift,String(r.cantidad||1),String(r.motivo||"—"),String(r.estado||"Sin estado")
      ];
      values.forEach((value,index)=>{
        const td=document.createElement("td");td.className="p-3 align-top";
        if(index===5){const badge=document.createElement("span");badge.className="rounded-full px-2 py-1 font-bold "+(statusClass[r.estado]||"bg-slate-100 text-slate-700");badge.textContent=value;td.append(badge);}
        else td.textContent=value;
        tr.append(td);
      });
      const actions=document.createElement("td");actions.className="p-3 align-top";
      if(canApproveTransfers&&r.estado==="PENDIENTE"){
        const rowActions=document.createElement("div");rowActions.className="flex flex-wrap gap-2";
        [["APROBADA","Aceptar","rounded-lg bg-emerald-600 px-2 py-1.5 font-bold text-white"],["RECHAZADA","Rechazar","rounded-lg bg-rose-600 px-2 py-1.5 font-bold text-white"]].forEach(([action,label,style])=>{
          const button=document.createElement("button");button.type="button";button.dataset.dotacionAction=action;button.dataset.id=String(r.id);button.className=style;button.textContent=label;rowActions.append(button);
        });
        actions.append(rowActions);
      }else actions.textContent=r.created_at?("Registrada "+dateTime(r.created_at)):"—";
      tr.append(actions);host.append(tr);
    });
  }

  function filtrarSolicitudesDotacion(){renderSolicitudesDotacion();}

  function limpiarFiltrosSolicitudesDotacion(){
    ["dotacion-filtro-buscar","dotacion-filtro-desde","dotacion-filtro-hasta"].forEach(id=>{const node=$(id);if(node)node.value="";});
    const state=$("dotacion-filtro-estado");if(state)state.value="TODOS";
    renderSolicitudesDotacion();
  }

  async function cargarSolicitudesDotacion(){
    const host=$("dotacion-alertas-lista");
    if(!host)return;
    host.innerHTML='<tr><td colspan="7" class="p-5 text-center text-slate-500">Consultando solicitudes de dotación…</td></tr>';
    const summary=$("dotacion-filter-summary");if(summary)summary.textContent="Cargando solicitudes y conteos…";
    try{
      const {data,error}=await _supabase.from("solicitudes_dotacion")
        .select("id,sucursal_nombre,fecha_inicio,fecha_fin,cantidad,cargo_requerido,turno,hora_inicio,hora_fin,motivo,observaciones,estado,created_at,solicitada_por")
        .order("created_at",{ascending:false}).limit(500);
      if(error)throw error;
      solicitudesDotacionCache=data||[];
      solicitudesDotacionError=null;
      renderSolicitudesDotacion();
    }catch(error){
      console.error("Solicitudes de dotación:",error);
      solicitudesDotacionCache=[];
      solicitudesDotacionError=error.message||"Error desconocido";
      renderSolicitudesDotacion();
    }
  }

  async function resolverSolicitudDotacion(id,state){
    if(!canApproveTransfers||!["APROBADA","RECHAZADA"].includes(state))return;
    try{
      const {error}=await _supabase.from("solicitudes_dotacion").update({estado:state,revisada_por:currentRoleId,revisada_en:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("estado","PENDIENTE");
      if(error)throw error;
      setStatus("traslado-estado",state==="APROBADA"?"Necesidad de personal aprobada. Coordina la asignación con el equipo responsable.":"Solicitud de dotación rechazada.");
      await cargarSolicitudesDotacion();
      mostrarToast(state==="APROBADA"?"Alerta aprobada.":"Alerta rechazada.", "success");
    }catch(error){console.error("Resolver solicitud de dotación:",error);setStatus("traslado-estado",error.message||"No se pudo actualizar la alerta.",true);}
  }

  async function resolverTraslado(id,state) {
    if(!canApproveTransfers||!["APROBADO","RECHAZADO"].includes(state))return;
    try{
      const {data,error}=await _supabase.rpc("resolver_traslado_personal",{p_id:id,p_estado:state});
      if(error)throw error;
      const updated=data?.maestro_actualizado;
      const coverage=data?.cobertura_temporal||data?.tipo_movimiento==="COBERTURA";
      setStatus("traslado-estado",state==="APROBADO"?(coverage?"Cobertura temporal aprobada. La sucursal maestra del colaborador se mantiene sin cambios.":updated?"Solicitud aprobada y sucursal del colaborador actualizada.":"Solicitud aprobada. El cambio de sucursal se aplicará cuando comience el traslado."):"Solicitud rechazada.");
      await cargarTrasladosPersonal();
    }catch(error){console.error("Resolver traslado:",error);setStatus("traslado-estado",error.message||"No se pudo actualizar el estado. Comprueba el permiso traslados_aprobar.",true);}
  }

  document.addEventListener("click",async event=>{
    const dotacionBtn=event.target.closest("[data-dotacion-action]");
    if(dotacionBtn){resolverSolicitudDotacion(dotacionBtn.dataset.id,dotacionBtn.dataset.dotacionAction);return;}
    const transferBtn=event.target.closest("[data-transfer-action]");
    if(transferBtn){resolverTraslado(transferBtn.dataset.id,transferBtn.dataset.transferAction);return;}
    const fileBtn=event.target.closest("[data-chat-download]");
    if(fileBtn){
      try{
        const {data,error}=await _supabase.storage.from("chat-adjuntos").createSignedUrl(fileBtn.dataset.chatDownload,60);
        if(error)throw error;
        if(data?.signedUrl)window.open(data.signedUrl,"_blank","noopener,noreferrer");
      }catch(error){console.warn("Descarga de adjunto:",error);setStatus("chat-estado","No se pudo generar el enlace privado de descarga.",true);}
    }
  });

  _supabase.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_OUT"){
      currentRoleId=null;activeConversation=null;chatUsers=[];collaborators=[];branches=[];canApproveTransfers=false;
      if(chatChannel){_supabase.removeChannel(chatChannel);chatChannel=null;}
      ["chat-conversaciones-list","chat-mensajes"].forEach(id=>{const node=$(id);if(node)node.replaceChildren();});
      if(chatInboxChannel){_supabase.removeChannel(chatInboxChannel);chatInboxChannel=null;}
      if($("chat-mensaje-input"))$("chat-mensaje-input").disabled=true;
      if($("chat-archivo"))$("chat-archivo").disabled=true;
      if($("chat-enviar"))$("chat-enviar").disabled=true;
    } else if(["SIGNED_IN","TOKEN_REFRESHED"].includes(event)){
      currentRoleId=null;
    }
  });

  window.cargarChatInterno=cargarChatInterno;
  window.crearConversacionChat=crearConversacionChat;
  window.abrirConversacionChat=abrirConversacionChat;
  window.enviarMensajeChat=enviarMensajeChat;
  window.iniciarModuloTraslados=iniciarModuloTraslados;
  window.crearSolicitudTraslado=crearSolicitudTraslado;
  window.cargarTrasladosPersonal=cargarTrasladosPersonal;
  window.cargarSolicitudesDotacion=cargarSolicitudesDotacion;
  window.filtrarSolicitudesDotacion=filtrarSolicitudesDotacion;
  window.limpiarFiltrosSolicitudesDotacion=limpiarFiltrosSolicitudesDotacion;
})();
