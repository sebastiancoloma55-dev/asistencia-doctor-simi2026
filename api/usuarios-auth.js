import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Metodo no permitido'});
 try{
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'Sesion requerida'});
  const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.SUPABASE_ANON_KEY;
  if(!url||!service||!anon)return res.status(500).json({error:'Faltan variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY'});
  const authClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:me,error:meError}=await authClient.auth.getUser(token);if(meError||!me.user)return res.status(401).json({error:'Sesion invalida'});
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:rol}=await admin.from('usuarios_roles').select('rol,activo').eq('auth_user_id',me.user.id).maybeSingle();
  if(!rol?.activo||rol.rol!=='ADMIN')return res.status(403).json({error:'Solo un administrador puede gestionar accesos'});
  const {accion,email,nombre,redirectTo}=req.body||{};if(!email)return res.status(400).json({error:'Falta el correo'});
  if(accion==='INVITAR'){
   const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:redirectTo||undefined,data:{nombre:nombre||''}});
   if(error){if(/already|registered|exists/i.test(error.message))return res.status(409).json({error:'El usuario ya existe. Usa Enviar recuperación de clave.'});throw error;}
   await admin.from('usuarios_roles').update({auth_user_id:data.user.id}).eq('email',email.toLowerCase());
   return res.status(200).json({message:'Invitación enviada. La persona podrá crear su propia clave desde el correo.'});
  }
  if(accion==='RECUPERAR'){
   const client=createClient(url,anon);const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirectTo||undefined});if(error)throw error;
   return res.status(200).json({message:'Correo de recuperación enviado. La persona podrá definir una nueva clave.'});
  }
  return res.status(400).json({error:'Accion no valida'});
 }catch(e){return res.status(500).json({error:e.message||'Error interno'})}
}
