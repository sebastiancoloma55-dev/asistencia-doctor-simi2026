import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';
const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Método no permitido.');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(res, 401, 'Sesión requerida.');

  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return fail(res, 500, 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');

  try {
    // El JWT se valida en Supabase Auth; el cliente de servicio solo se usa en servidor.
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return fail(res, 401, 'La sesión no es válida o ha expirado.');

    const email = String(authData.user.email || '').trim().toLowerCase();

    if (req.method === 'POST') {
      if (email !== ADMIN_PRINCIPAL) {
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
    return fail(res, 500, 'No se pudo consultar el control de sesiones. Revisa las variables de Supabase y la tabla control_sesion_global.');
  }
}
