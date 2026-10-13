import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';
const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Método no permitido.');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(res, 401, 'Sesión requerida.');

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return fail(res, 500, 'La autenticación del servidor no está configurada.');

  try {
    const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) return fail(res, 401, 'La sesión no es válida o ha expirado.');

    const user = authData.user;
    const email = String(user.email || '').trim().toLowerCase();
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin
      .from('usuarios_roles')
      .select('email,rol,activo,auth_user_id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.activo === false || (profile.auth_user_id && profile.auth_user_id !== user.id)) {
      return fail(res, 403, 'El usuario no tiene un perfil activo.');
    }

    if (req.method === 'POST') {
      if (email !== ADMIN_PRINCIPAL || String(profile.rol || '').toUpperCase() !== 'ADMIN') {
        return fail(res, 403, 'Solo el administrador principal puede cerrar las sesiones globalmente.');
      }
      const nonce = randomUUID();
      const { error } = await admin.from('control_sesion_global').upsert({
        id: 1, nonce, updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (error) throw error;
      return res.status(200).json({ ok: true, nonce, message: 'Se solicitó cerrar las sesiones de todos los usuarios.' });
    }

    const { data, error } = await admin.from('control_sesion_global').select('nonce,updated_at').eq('id', 1).single();
    if (error) throw error;
    return res.status(200).json({ nonce: data.nonce, updated_at: data.updated_at });
  } catch (error) {
    console.error('Control de sesión global:', error);
    return fail(res, 500, 'No se pudo consultar el control de sesiones.');
  }
}
