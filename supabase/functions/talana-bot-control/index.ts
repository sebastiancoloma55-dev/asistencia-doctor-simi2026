import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importKeyFields, importStableKey, normalizeImportValue, normalizeImportRut } from "./import_keys.js";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-bot-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, botSecret=Deno.env.get("TALANA_BOT_SECRET")||"";
const admin=createClient(url,service,{auth:{persistSession:false}});
const adminEmail="scoloma@farmaciasdoctorsimi.cl";
const githubActionsToken=Deno.env.get("GITHUB_ACTIONS_TOKEN")||"";
const githubRepo="sebastiancoloma55-dev/asistencia-doctor-simi2026";
const githubWorkflow="talana-hourly.yml";
const safeName=(v:string)=>v.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,160)||"reporte.bin";
function decodeBase64(v:string){const raw=atob(v.replace(/^data:[^,]+,/,""));const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
async function isAdmin(req:Request){const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token||!anon)return false;const c=createClient(url,anon,{auth:{persistSession:false}});const {data,error}=await c.auth.getUser(token);return !error&&data.user?.email?.toLowerCase()===adminEmail;}
const isBot=(req:Request)=>!!botSecret&&req.headers.get("x-bot-secret")===botSecret;
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
try{const b=await req.json(),a=String(b.action||"");const botActions=new Set(["bot_config","bot_claim_manual","bot_start","bot_upload","bot_import","bot_finish","bot_generate_recurring_tasks"]);if(botActions.has(a)){if(!isBot(req))return json({error:"Unauthorized bot"},401);}else if(!await isAdmin(req))return json({error:"Acceso reservado a la administración principal"},403);
if(a==="admin_get"){const [{data:config,error:ce},{data:runs,error:re},{data:files,error:fe}]=await Promise.all([admin.from("talana_bot_config").select("*").eq("id",1).single(),admin.from("talana_bot_runs").select("*").order("started_at",{ascending:false}).limit(30),admin.from("talana_bot_files").select("*").order("uploaded_at",{ascending:false}).limit(30)]);if(ce||re||fe)return json({error:ce?.message||re?.message||fe?.message},500);return json({config,runs,files});}
if(a==="admin_update"){const enabled=Boolean(b.enabled),interval=Number(b.interval_minutes),mode=String(b.run_mode||"both");if(interval!==60)return json({error:"La programación en nube está configurada una vez por hora, entre las 08:00 y las 17:00 de Chile, de lunes a viernes salvo feriados."},400);if(!["both","manual","automatic"].includes(mode))return json({error:"Modo inválido"},400);const {data,error}=await admin.from("talana_bot_config").update({enabled,interval_minutes:interval,run_mode:mode,updated_at:new Date().toISOString(),updated_by:adminEmail}).eq("id",1).select("*").single();if(error)return json({error:error.message},500);return json({config:data});}
if(a==="admin_manual_run"){const {data:c,error:ce}=await admin.from("talana_bot_config").select("run_mode").eq("id",1).single();if(ce)return json({error:ce.message},500);if(c.run_mode==="automatic")return json({error:"El modo actual no permite ejecuciones manuales"},409);if(!githubActionsToken)return json({error:"Falta configurar el secreto GITHUB_ACTIONS_TOKEN en Supabase Edge Functions. No se creó ninguna ejecución."},503);const {data:run,error}=await admin.from("talana_bot_runs").insert({trigger_type:"manual",status:"queued",requested_by:adminEmail}).select("*").single();if(error)return json({error:error.message},500);try{const dispatch=await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/${githubWorkflow}/dispatches`,{method:"POST",headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${githubActionsToken}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:{mode:"full_import",confirm_write:"CONFIRMO_IMPORTACION"}})});if(!dispatch.ok){const detail=(await dispatch.text()).slice(0,500);throw new Error(`GitHub Actions respondió HTTP ${dispatch.status}: ${detail}`);}return json({run,message:"Ejecución manual enviada a GitHub Actions. El panel actualizará su estado cuando el ejecutor la reclame y termine."},202);}catch(dispatchError){const message=dispatchError instanceof Error?dispatchError.message:"No se pudo iniciar GitHub Actions.";await admin.from("talana_bot_runs").update({status:"failed",finished_at:new Date().toISOString(),error_summary:message.slice(0,4000)}).eq("id",run.id).eq("status","queued");return json({error:message,run_id:run.id},502);}}
if(a==="admin_download"){const id=String(b.file_id||"");const {data:f,error}=await admin.from("talana_bot_files").select("storage_path,file_name").eq("id",id).single();if(error||!f)return json({error:"Archivo no encontrado"},404);const {data:s,error:se}=await admin.storage.from("talana-reportes").createSignedUrl(f.storage_path,120);if(se)return json({error:se.message},500);return json({url:s.signedUrl,file_name:f.file_name});}
if(a==="bot_generate_recurring_tasks"){const {data,error}=await admin.rpc("generar_tareas_recurrentes");if(error)return json({error:error.message},500);return json({created:Number(data||0)});}
if(a==="bot_config"){const [{data:config,error:ce},{data:pending,error:pe}]=await Promise.all([admin.from("talana_bot_config").select("enabled,interval_minutes,run_mode,report_types").eq("id",1).single(),admin.from("talana_bot_runs").select("id,trigger_type,started_at").eq("status","queued").eq("trigger_type","manual").order("started_at").limit(1)]);if(ce||pe)return json({error:ce?.message||pe?.message},500);return json({config,pending_manual_run:pending?.[0]||null,server_time:new Date().toISOString()});}
if(a==="bot_claim_manual"){const {data:config,error:configError}=await admin.from("talana_bot_config").select("enabled").eq("id",1).single();if(configError)return json({error:configError.message},500);if(!config?.enabled)return json({error:"El bot está pausado desde la configuración. Actívalo antes de ejecutar una tarea manual."},409);const {data,error}=await admin.from("talana_bot_runs").update({status:"running"}).eq("id",String(b.run_id||"")).eq("status","queued").select("*").maybeSingle();if(error)return json({error:error.message},500);return json({claimed:!!data,run:data||null});}
if(a==="bot_start"){const {data:config,error:configError}=await admin.from("talana_bot_config").select("enabled").eq("id",1).single();if(configError)return json({error:configError.message},500);if(!config?.enabled)return json({error:"El bot está pausado desde la configuración. Actívalo antes de iniciar una ejecución."},409);const trigger=b.trigger_type==="manual"?"manual":"automatic";const {data,error}=await admin.from("talana_bot_runs").insert({trigger_type:trigger,status:"running",requested_by:b.requested_by||null}).select("*").single();if(error)return json({error:error.message},500);return json({run:data});}
if(a==="bot_upload"){const runId=String(b.run_id||""),reportType=String(b.report_type||"reporte").slice(0,80),fileName=safeName(String(b.file_name||"reporte.bin")),mimeType=String(b.mime_type||"application/octet-stream").slice(0,120),base64=String(b.base64||"");if(!runId||!base64)return json({error:"Faltan run_id o base64"},400);if(base64.length>28000000)return json({error:"Archivo supera el máximo aproximado de 20 MB"},413);const bytes=decodeBase64(base64),path=runId+"/"+crypto.randomUUID()+"_"+fileName;const {error:ue}=await admin.storage.from("talana-reportes").upload(path,bytes,{contentType:mimeType,upsert:false});if(ue)return json({error:ue.message},500);const {data,error}=await admin.from("talana_bot_files").insert({run_id:runId,report_type:reportType,file_name:fileName,storage_path:path,mime_type:mimeType,size_bytes:bytes.byteLength,sha256:b.sha256||null}).select("*").single();if(error){await admin.storage.from("talana-reportes").remove([path]);return json({error:error.message},500);}const trackingModules=reportType==="ausentismos_historico"?["talana_bot","talana_ausentismos"]:reportType==="solicitudes_vacaciones_historicas"?["talana_bot","talana_vacaciones"]:["talana_bot"];let trackingRegistered=true;for(const moduleName of trackingModules){const {error:trackingError}=await admin.from("actualizaciones_fuentes").upsert({modulo:moduleName,actualizado_en:new Date().toISOString(),archivo:fileName,origen:"bot",usuario_email:"Bot Talana",registros:null,detalles:{report_type:reportType,run_id:runId}},{onConflict:"modulo"});if(trackingError){trackingRegistered=false;console.error("No se pudo registrar la fecha de actualización del bot:",trackingError.message);}}return json({file:data,tracking_registered:trackingRegistered});}
if(a==="bot_import"){
 const reportType=String(b.report_type||""), rows=Array.isArray(b.rows)?b.rows:[], parseErrors=Array.isArray(b.parse_errors)?b.parse_errors:[];
 const dryRun=b.dry_run===true;
 if(!["ausentismos_historico","solicitudes_vacaciones_historicas","maestro_empleado","reporte_jornadas_asistencia"].includes(reportType))return json({error:"Tipo de reporte no permitido para importación."},400);
 if(rows.length>150)return json({error:"Máximo 150 filas por lote."},413);
 const table=reportType==="ausentismos_historico"?"licencias_medicas":reportType==="solicitudes_vacaciones_historicas"?"vacaciones_historico":reportType==="maestro_empleado"?"colaboradores":"registros_asistencia";
 const allowed={
  licencias_medicas:["rut","nombre","empresa","cargo","gerencia","sucursal","centro_costo","tipo_ausencia","motivo_ausencia","dias_ausencia","fecha_inicio","fecha_fin","hora_inicio","hora_fin","numero_horas","numero_minutos","fecha_creacion","observaciones"],
  vacaciones_historico:["rut","nombre","empresa","cargo","gerencia","sucursal","centro_costo","fecha_solicitud","fecha_aprobacion","aprobado_por","estado","fecha_inicio","fecha_fin","fecha_retorno","dias","jornada","tipo_vacaciones","observaciones"],
  colaboradores:["rut","nombres","apellidos","cargo","sucursal","fecha_ingreso","estado"],
  registros_asistencia:["rut","nombre","sucursal","fecha","razon_social","entrada","salida","horas_trabajadas","colacion","horas_extra","atraso","estado","estado_edicion","comentario_empleado","editada","editado_por","observacion","unidad_organizacional","jefe","turno","tipo_ausentismo","salida_temprana","sin_marca","marca_incompleta","tiene_atraso","sin_turno_marcas"]
 }[table];
 const norm=normalizeImportValue; const normRut=normalizeImportRut;
 const rutLookupVariants=(value:any)=>{
  const raw=String(value??"").trim(), normalized=normRut(value);
  const match=normalized.match(/^(\d{7,8})-([0-9K])$/i);
  const dotted=match?match[1].replace(/\B(?=(\d{3})+(?!\d))/g,".")+"-"+match[2]:null;
  return [...new Set([raw,normalized,normalized.toLowerCase(),normalized.replace(/-/g,""),dotted,dotted?.toLowerCase()].filter(Boolean))];
 };
 const keyOf=(r:any)=>importStableKey(reportType,r);
 const clean=(r:any)=>Object.fromEntries(allowed.filter((k:string)=>r[k]!==undefined&&r[k]!==null&&r[k]!=="").map((k:string)=>[k,r[k]]));
 const errors:string[]=[...parseErrors.map((x:any)=>String(x).slice(0,250))], valid:any[]=[];
 const missingKeyFieldCounts:Record<string,number>={};
 let inserted=0,updated=0,skipped=0,failed=parseErrors.length;
 for(let i=0;i<rows.length;i++){const row=clean(rows[i]);if(reportType==="reporte_jornadas_asistencia"){for(const field of allowed){if(!(field in row))row[field]=null;}}if(!row.rut){errors.push("lote fila "+(i+1)+": falta RUT");failed++;continue;}
  if(table==="vacaciones_historico"&&(!row.fecha_inicio||!row.fecha_fin||!row.tipo_vacaciones)){errors.push("lote fila "+(i+1)+": faltan campos obligatorios de vacaciones");failed++;continue;}
  if(table==="registros_asistencia"&&!row.fecha){errors.push("lote fila "+(i+1)+": falta fecha de asistencia");failed++;continue;}
  // Existing employees may have incomplete name cells in historical exports.
  // Their stored names are reconciled below; new employees still require both fields.
  const requiredKeyFields=reportType==="reporte_jornadas_asistencia"?["rut","fecha"]:reportType==="ausentismos_historico"?["rut","fecha_inicio","tipo_ausencia"]:reportType==="solicitudes_vacaciones_historicas"?["rut","fecha_inicio","tipo_vacaciones"]:(importKeyFields(reportType)||[]);
  const missingKeyFields=requiredKeyFields.filter((field:string)=>row[field]===undefined||row[field]===null||String(row[field]).trim()===""||norm(row[field])==="");
  if(missingKeyFields.length){for(const field of missingKeyFields)missingKeyFieldCounts[field]=(missingKeyFieldCounts[field]||0)+1;errors.push("lote fila "+(i+1)+": faltan campos de identificación para evitar duplicados ("+missingKeyFields.join(", ")+")");failed++;continue;}
  if(table==="registros_asistencia"){row.sin_marca=Boolean(row.sin_marca);row.marca_incompleta=Boolean(row.marca_incompleta);row.tiene_atraso=Boolean(row.tiene_atraso);row.sin_turno_marcas=Boolean(row.sin_turno_marcas);}
  valid.push(row);
 }
 let incomingRowsMerged=0;
 if(reportType==="ausentismos_historico"){
  // Identidad segura: RUT + inicio + tipo + fecha de creación + horas.
  // Dos licencias con la misma fecha y tipo pueden ser distintas; solo se
  // fusionan filas con la misma clave completa. Los casos ambiguos se rechazan.
  const byLicense=new Map<string,any>();
  for(const row of valid){
   const identity=keyOf(row);
   const previous=byLicense.get(identity);
   if(!previous){byLicense.set(identity,{...row});continue;}
   incomingRowsMerged++;
   for(const field of allowed){
    const value=row[field];
    if(value!==null&&value!==undefined&&String(value).trim()!=="")previous[field]=value;
   }
  }
  valid.splice(0,valid.length,...byLicense.values());
 }
 if(reportType==="reporte_jornadas_asistencia"){
  // El XLSX más reciente manda para cada trabajador/día. Si el propio archivo trae filas partidas (por ejemplo, entrada y salida en filas separadas), consolidarlas antes de reemplazar el día existente.
  const byEmployeeDay=new Map<string,any>();
  const booleanFields=new Set(["sin_marca","marca_incompleta","tiene_atraso","sin_turno_marcas"]);
  for(const row of valid){const key=keyOf(row);const previous=byEmployeeDay.get(key);if(!previous){byEmployeeDay.set(key,{...row});continue;}for(const field of allowed){if(field==="rut"||field==="fecha"||booleanFields.has(field))continue;const value=row[field];if(value!==null&&value!==undefined&&String(value).trim()!=="")previous[field]=value;}for(const field of booleanFields)previous[field]=Boolean(previous[field])||Boolean(row[field]);}
  valid.splice(0,valid.length,...byEmployeeDay.values());
 }
 if(table==="colaboradores"){
  const unique=new Map<string,any>();for(const row of valid)unique.set(normRut(row.rut),row);
  const rutList=[...new Set([...unique.values()].flatMap((r:any)=>rutLookupVariants(r.rut)))];
  const {data:existing,error:lookupError}=await admin.from(table).select("rut,estado,nombres,apellidos").in("rut",rutList);
  if(lookupError)return json({error:lookupError.message},500);
  const existingMap=new Map((existing||[]).map((r:any)=>[normRut(r.rut),r]));
  const toUpsert:any[]=[];
  for(const row of unique.values()){
   const old=existingMap.get(normRut(row.rut));
   const nombres=row.nombres||old?.nombres||null;
   const apellidos=row.apellidos||old?.apellidos||null;
   if(!nombres||!apellidos){errors.push("Colaborador "+row.rut+": no se importó porque faltan nombres/apellidos y no existe un nombre previo para completar el registro.");failed++;continue;}
   if(!row.estado&&!old){errors.push("Colaborador "+row.rut+": no se importó porque el Excel no incluye estado para un nuevo registro.");failed++;continue;}
   toUpsert.push({...row,nombres,apellidos,rut:old?.rut||row.rut,estado:row.estado||old?.estado||"activo"});
  }
  if(dryRun){
   inserted=toUpsert.filter((row:any)=>!existingMap.has(normRut(row.rut))).length;
   updated=toUpsert.filter((row:any)=>existingMap.has(normRut(row.rut))).length;
   skipped+=valid.length-toUpsert.length;
   return json({dry_run:true,write_performed:false,report_type:reportType,table,received:rows.length,valid:valid.length,planned_inserted:inserted,planned_updated:updated,skipped,failed,errors:errors.slice(0,100),diagnostics:{missing_key_fields:missingKeyFieldCounts,incoming_rows_merged:incomingRowsMerged}});
  }
  if(toUpsert.length){const {data,error}=await admin.from(table).upsert(toUpsert,{onConflict:"rut"}).select("rut");if(error){return json({error:"No se pudieron actualizar colaboradores: "+error.message,inserted,updated,skipped,failed:failed+toUpsert.length,errors:errors.slice(0,100)},500);}
   for(const r of data||[]){if(existingMap.has(normRut(r.rut)))updated++;else inserted++;}
  }
  skipped+=valid.length-toUpsert.length;
 }else{
  const ruts=[...new Set(valid.flatMap((r:any)=>rutLookupVariants(r.rut)))];
  const selectCols=table==="licencias_medicas"?"id,rut,fecha_inicio,fecha_fin,tipo_ausencia,fecha_creacion,hora_inicio,hora_fin":table==="vacaciones_historico"?"id,rut,fecha_inicio,fecha_fin,tipo_vacaciones,fecha_solicitud,jornada":"id,rut,fecha,entrada,salida,tipo_ausentismo";
  let existingRows:any[]=[];
  // Read complete rows so batch upserts preserve fields absent from this export.
  if(ruts.length){
   // Paginar la consulta de existentes: un límite fijo de 20.000 podía truncar
   // historiales extensos y hacer que una fila ya importada pareciera nueva.
   const pageSize=1000;let offset=0;
   while(true){
    const {data,error}=await admin.from(table).select("*").in("rut",ruts).order("id",{ascending:false}).range(offset,offset+pageSize-1);
    if(error)return json({error:error.message},500);
    const page=data||[];existingRows.push(...page);
    if(page.length<pageSize)break;
    offset+=page.length;
    if(offset>=100000){return json({error:"La consulta de existentes superó el límite de seguridad de 100.000 filas por lote; se detuvo para evitar una comparación incompleta."},413);}
   }
  }
  const existingByKey=new Map<string,any>();
  const existingMatchesByKey=new Map<string,any[]>();
  const attendanceFallback=reportType==="reporte_jornadas_asistencia";
  const legacyFields=reportType==="ausentismos_historico"?["rut","fecha_inicio","tipo_ausencia"]:reportType==="solicitudes_vacaciones_historicas"?["rut","fecha_inicio","tipo_vacaciones"]:attendanceFallback?["rut","fecha"]:null;
  const legacyDiscriminators=reportType==="ausentismos_historico"?["fecha_creacion","hora_inicio","hora_fin"]:reportType==="solicitudes_vacaciones_historicas"?["fecha_solicitud","jornada"]:null;
  const legacyCandidates=new Map<string,any[]>();
  const legacyKey=(r:any)=>legacyFields?legacyFields.map((field:string)=>field==="rut"?normRut(r[field]):norm(r[field])).join("|"):null;
  const mergeExactRows=(records:any[])=>{
   const merged={...records[0]}, conflicts:string[]=[];
   for(const record of records.slice(1)){
    for(const field of allowed){
     const current=merged[field], incoming=record[field];
     const currentPresent=current!==null&&current!==undefined&&String(current).trim()!=="";
     const incomingPresent=incoming!==null&&incoming!==undefined&&String(incoming).trim()!=="";
     if(currentPresent&&incomingPresent&&norm(current)!==norm(incoming)){conflicts.push(field);continue;}
     if(!currentPresent&&incomingPresent)merged[field]=incoming;
    }
   }
   return {merged,conflicts:[...new Set(conflicts)]};
  };
  for(const old of existingRows){
   const oldKey=keyOf(old);if(oldKey){if(!existingByKey.has(oldKey))existingByKey.set(oldKey,old);const matches=existingMatchesByKey.get(oldKey)||[];matches.push(old);existingMatchesByKey.set(oldKey,matches);}
   // Attendance can change its entry/exit marks between exports. Reconcile by
   // employee + date only when exactly one stored row exists for that day.
   // If multiple shifts/records exist, refuse the fallback rather than duplicate or overwrite.
   const shouldCollectAttendance=attendanceFallback;
   const shouldCollectLegacy=!!(legacyFields&&legacyDiscriminators&&legacyDiscriminators.some((field:string)=>old[field]===null||old[field]===undefined||String(old[field]).trim()===""));
   if(shouldCollectAttendance||shouldCollectLegacy){
    const lk=legacyKey(old);if(lk){const list=legacyCandidates.get(lk)||[];list.push(old);legacyCandidates.set(lk,list);}
   }
  }
  const seenIncoming=new Set<string>(), pending:any[]=[], pendingUpdates:any[]=[];
  let ambiguousLegacyMerged=0, blockedAmbiguousLegacy=0, blockedExistingDuplicateConflicts=0, duplicateRowsRemoved=0, duplicateRowsDetected=0;

  for(const row of valid){
   const k=keyOf(row);
   if(!k){failed++;errors.push(table+" RUT "+row.rut+": clave natural incompleta; fila rechazada para no generar duplicados.");continue;}
   if(seenIncoming.has(k)){skipped++;continue;}
   seenIncoming.add(k);
   let old=existingByKey.get(k);
   let legacyDuplicateIds:string[]=[];
   if(!old&&legacyFields){
    const candidates=legacyCandidates.get(legacyKey(row))||[];
    if(candidates.length===1)old=candidates[0];
    else if(candidates.length>1){
      const groups=new Map<string,any[]>();
      for(const candidate of candidates){const candidateKey=keyOf(candidate)||"__incomplete__:"+String(candidate.id);const group=groups.get(candidateKey)||[];group.push(candidate);groups.set(candidateKey,group);}
      if(groups.size===1){
       const sameKey=[...groups.values()][0], merged=mergeExactRows(sameKey);
       // Same complete natural key means the incoming Talana export is authoritative.
       // Preserve the canonical row id, let incoming non-empty values replace old values,
       // and retire other rows with this exact identity even if their fields conflict.
       old=merged.merged;
       legacyDuplicateIds=sameKey.filter((candidate:any)=>candidate.id!==old.id).map((candidate:any)=>candidate.id);
       ambiguousLegacyMerged+=legacyDuplicateIds.length;
      }else{
       // Distintas licencias/solicitudes comparten la clave parcial: no se puede
       // decidir automáticamente cuál actualizar sin arriesgar datos.
       skipped++;blockedAmbiguousLegacy++;continue;
      }
    }
   }
   if(old){
    const exactMatches=(existingMatchesByKey.get(k)||[]).filter((candidate:any)=>candidate.id!==old.id);
    let canonical={...old};
    if(exactMatches.length){
     const merged=mergeExactRows([old,...exactMatches]);
     // A repeated complete natural key is the same business record. Do not block
     // the refresh because legacy values differ: the incoming export wins below,
     // and all other rows with this exact key are removed after the canonical update.
     canonical=merged.merged;
    }
    pendingUpdates.push({id:old.id,row,old:canonical,duplicateIds:[...new Set([...exactMatches.map((candidate:any)=>candidate.id),...legacyDuplicateIds])]});
   }else pending.push(row);
  }
  const safeDuplicateIds=[...new Set(pendingUpdates.flatMap((item:any)=>item.duplicateIds||[]))];
  if(dryRun){
   const diagnostics:any={missing_key_fields:missingKeyFieldCounts,incoming_rows_merged:incomingRowsMerged,ambiguous_legacy_rows_merged:ambiguousLegacyMerged,blocked_ambiguous_legacy_rows:blockedAmbiguousLegacy,blocked_existing_duplicate_conflicts:blockedExistingDuplicateConflicts,planned_duplicate_rows_removed:safeDuplicateIds.length,existing_duplicate_rows_detected:safeDuplicateIds.length};
   if(attendanceFallback){
    const countByDate=(items:any[])=>{const counts:Record<string,number>={};for(const item of items){const day=norm(item.fecha);if(day)counts[day]=(counts[day]||0)+1;}return counts;};
    const incomingByDate=countByDate(valid), plannedByDate=countByDate(pending);
    const existingByDate=countByDate(existingRows);
    const dates=Object.keys(incomingByDate).sort();
    diagnostics.attendance={date_min:dates[0]||null,date_max:dates[dates.length-1]||null,unique_employee_ids:[...new Set(valid.map((r:any)=>normRut(r.rut)))].length,unique_dates:dates.length,incoming_by_date:incomingByDate,planned_new_by_date:plannedByDate,existing_by_date:existingByDate};
   }
   return json({dry_run:true,write_performed:false,report_type:reportType,table,received:rows.length,valid:valid.length,planned_inserted:pending.length,planned_updated:pendingUpdates.length,skipped,failed,errors:errors.slice(0,100),diagnostics});
  }
  // One database request updates the whole batch instead of one request per row.
  // Merge incoming non-empty values into the stored row to avoid erasing fields
  // that are not present in this particular Talana export.
  if(pendingUpdates.length){
   const updatesToUpsert=pendingUpdates.map((item:any)=>{
    const merged=attendanceFallback?{...item.row,id:item.id}:{...item.old};
    if(!attendanceFallback){for(const [field,value] of Object.entries(item.row)){if(value!==undefined&&value!==null&&value!=="")merged[field]=value;}}
    merged.id=item.id;
    for(const field of importKeyFields(reportType)||[]){merged[field]=reportType==="ausentismos_historico"?(item.row[field]??item.old[field]??merged[field]):(item.old[field]??merged[field]);}
    return merged;
   });
   const {error}=await admin.from(table).upsert(updatesToUpsert,{onConflict:"id"});
   if(error){failed+=pendingUpdates.length;errors.push(table+": falló la actualización por lote ("+error.message.slice(0,180)+").");}
   else {
    updated+=pendingUpdates.length;
    for(const item of pendingUpdates){
     const ids=[...new Set(item.duplicateIds||[])];
     if(!ids.length)continue;
     const {data:deleted,error:deleteError}=await admin.from(table).delete().in("id",ids).select("id");
     if(deleteError){failed++;errors.push(table+" RUT "+item.row.rut+": se actualizó el registro principal, pero no se pudieron retirar "+ids.length+" duplicados seguros ("+deleteError.message.slice(0,140)+").");}
     else duplicateRowsRemoved+=(deleted||[]).length;
    }
    duplicateRowsDetected=safeDuplicateIds.length;
   }
  }
  if(pending.length){const {data,error}=await admin.from(table).insert(pending).select("id");if(error){
    for(const row of pending){
     const {error:oneError}=await admin.from(table).insert(row);
     if(!oneError){inserted++;continue;}
     const duplicateConflict=(oneError as any).code==="23505"||(oneError as any).status===409;
     if(duplicateConflict){
      // Match using the normalized natural key; exact SQL equality fails when
      // RUT punctuation or date serialization differs between XLSX and PostgreSQL.
      const rutVariants=rutLookupVariants(row.rut);
      const {data:candidates,error:lookupError}=await admin.from(table).select(selectCols).in("rut",rutVariants).order("id",{ascending:false}).limit(500);
      const rowKey=keyOf(row);
      const existing=(candidates||[]).find((candidate:any)=>keyOf(candidate)===rowKey);
      if(!lookupError&&existing){
       const updateRow={...row};
       for(const field of importKeyFields(reportType)||[]){updateRow[field]=existing[field]??updateRow[field];}
       const {error:updateError}=await admin.from(table).update(updateRow).eq("id",existing.id);
       if(!updateError){updated++;continue;}
       errors.push(table+" RUT "+row.rut+": conflicto duplicado; no se pudo actualizar el registro existente ("+updateError.message.slice(0,120)+").");
      }else if(lookupError){
       errors.push(table+" RUT "+row.rut+": falló la búsqueda tras conflicto de unicidad ("+lookupError.message.slice(0,120)+").");
      }
     }
     failed++;errors.push(table+" RUT "+row.rut+": "+oneError.message.slice(0,180));
    }
   }else inserted=(data||[]).length;}
 }
 const moduleNames=reportType==="ausentismos_historico"?["talana_bot","licencias","talana_ausentismos"]:reportType==="solicitudes_vacaciones_historicas"?["talana_bot","vacaciones","talana_vacaciones"]:reportType==="maestro_empleado"?["talana_bot","colaboradores"]:["talana_bot","asistencia","talana_asistencia"];
 let trackingRegistered=true;
 if(b.final_batch!==false){
  for(const moduleName of moduleNames){const {error}=await admin.from("actualizaciones_fuentes").upsert({modulo:moduleName,actualizado_en:new Date().toISOString(),archivo:String(b.file_name||"Talana"),origen:"bot",usuario_email:"Bot Talana",registros:inserted+updated,detalles:{report_type:reportType,run_id:b.run_id||null,inserted,updated,skipped,failed}},{onConflict:"modulo"});if(error){trackingRegistered=false;console.error("Tracking de importación:",error.message);}}
 }
 return json({report_type:reportType,table,received:rows.length,inserted,updated,skipped,failed,errors:errors.slice(0,100),diagnostics:{missing_key_fields:missingKeyFieldCounts,incoming_rows_merged:incomingRowsMerged,ambiguous_legacy_rows_merged:ambiguousLegacyMerged,blocked_ambiguous_legacy_rows:blockedAmbiguousLegacy,blocked_existing_duplicate_conflicts:blockedExistingDuplicateConflicts,planned_duplicate_rows_removed:0,existing_duplicate_rows_detected:duplicateRowsDetected,duplicate_rows_removed:duplicateRowsRemoved},tracking_registered:trackingRegistered});
}
if(a==="bot_finish"){const runId=String(b.run_id||""),status=["success","partial","failed"].includes(b.status)?b.status:"success";const {count,error:ce}=await admin.from("talana_bot_files").select("id",{count:"exact",head:true}).eq("run_id",runId);if(ce)return json({error:ce.message},500);const {data,error}=await admin.from("talana_bot_runs").update({status,finished_at:new Date().toISOString(),reports_downloaded:Number(b.reports_downloaded||0),reports_uploaded:count||0,error_summary:b.error_summary?String(b.error_summary).slice(0,4000):null,details:b.details&&typeof b.details==="object"?b.details:{}}).eq("id",runId).select("*").single();if(error)return json({error:error.message},500);return json({run:data});}
return json({error:"Acción desconocida"},400);
}catch(e){return json({error:e instanceof Error?e.message:"Error interno"},500);}});
