import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
  if(req.headers['authorization']!==`Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'No autorizado'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ahora=new Date().toISOString();
  const {data:tareas,error}=await db.from('tareas').select('id,titulo,responsable_rol_id,fecha_limite,estado').lt('fecha_limite',ahora).not('estado','in','("APROBADA","CANCELADA")');
  if(error)return res.status(500).json({error:error.message});
  const avisos=(tareas||[]).map(t=>({usuario_rol_id:t.responsable_rol_id,tipo:'TAREA_VENCIDA',titulo:'Tarea vencida',mensaje:`${t.titulo} venció el ${t.fecha_limite}`,entidad_tipo:'tarea',entidad_id:t.id}));
  if(avisos.length)await db.from('notificaciones').upsert(avisos,{onConflict:'usuario_rol_id,tipo,entidad_tipo,entidad_id',ignoreDuplicates:true});
  return res.status(200).json({procesadas:tareas?.length||0});
}
