(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=v=>String(v||"").toUpperCase().replace(/[^0-9K]/g,"");
  const date=v=>v?new Date(v).toLocaleString("es-CL",{timeZone:"America/Santiago",dateStyle:"medium",timeStyle:"short"}):"—";
  const fields=[["nombres","Nombres"],["apellidos","Apellidos"],["cargo","Cargo"],["sucursal","Sucursal"],["estado","Estado"],["fecha_ingreso","Fecha de ingreso"]];
  function diff(row){
    const a=row.antes||{},b=row.despues||{};
    if(row.accion==="ALTA")return "Alta inicial: "+[b.nombres,b.apellidos,b.cargo,b.sucursal,b.estado].filter(Boolean).join(" · ");
    if(row.accion==="BAJA")return "Registro eliminado; datos anteriores conservados en auditoría.";
    const changes=fields.filter(([key])=>String(a[key]??"")!==String(b[key]??""));
    return changes.length?changes.map(([key,label])=>label+": "+(a[key]||"—")+" → "+(b[key]||"—")).join(" | "):"Se modificó el registro.";
  }
  async function cargarHistorialColaborador(){
    const raw=$("hist-colaborador-rut")?.value.trim()||"",rut=norm(raw),host=$("hist-colaborador-body"),status=$("hist-colaborador-estado");
    if(!rut){if(status)status.textContent="Ingresa un RUT válido.";return;}
    if(!/^[0-9]{6,9}[0-9K]$/.test(rut)){if(status)status.textContent="Revisa el RUT ingresado.";return;}
    if(status)status.textContent="Consultando historial…";
    if(host)host.innerHTML='<tr><td colspan="4" class="p-5 text-center text-slate-500">Cargando…</td></tr>';
    try{
      const {data,error}=await _supabase.from("historial_colaborador").select("id,rut,accion,antes,despues,actor_email,created_at").ilike("rut","%"+raw.replace(/[^0-9kK.-]/g,"")+"%").order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      const rows=(data||[]).filter(x=>norm(x.rut)===rut);
      if(host)host.replaceChildren();
      if(!rows.length){if(host)host.innerHTML='<tr><td colspan="4" class="p-5 text-center text-slate-500">No hay cambios registrados para este RUT desde la activación del historial.</td></tr>';if(status)status.textContent="Consulta terminada · 0 registros.";return;}
      rows.forEach(row=>{
        const tr=document.createElement("tr");
        const values=[date(row.created_at),row.accion,diff(row),row.actor_email||"sistema"];
        values.forEach((value,i)=>{const td=document.createElement("td");td.className="p-3 align-top";td.textContent=value;tr.append(td);});
        host.append(tr);
      });
      if(status)status.textContent=rows.length+" cambio(s) encontrado(s) · hora de Chile.";
    }catch(error){
      console.warn("Historial de colaborador:",error);
      if(host)host.innerHTML='<tr><td colspan="4" class="p-5 text-center text-rose-700">No se pudo consultar el historial. Revisa tu permiso de Colaboradores.</td></tr>';
      if(status)status.textContent="Consulta fallida.";
    }
  }
  window.cargarHistorialColaborador=cargarHistorialColaborador;
})();
