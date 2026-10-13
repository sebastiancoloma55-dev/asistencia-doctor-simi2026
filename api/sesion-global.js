import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';
const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Método no permitido.');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(res, 401, 'Sesión requerida.');

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
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

    let { data, error } = await admin.from('control_sesion_global')
      .select('nonce,updated_at').eq('id', 1).maybeSingle();
    if (error) {
      console.error('Error leyendo control_sesion_global:', error);
      return fail(res, 500, 'Supabase no pudo leer control_sesion_global. Verifica que la tabla exista y que la clave de servicio corresponda al proyecto conectado.');
    }
    // Autorreparación segura si la tabla existe pero todavía no tiene la fila singleton.
    if (!data) {
      const initialNonce = randomUUID();
      const { error: insertError } = await admin.from('control_sesion_global')
        .upsert({ id: 1, nonce: initialNonce, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (insertError) {
        console.error('Error inicializando control_sesion_global:', insertError);
        return fail(res, 500, 'La tabla control_sesion_global existe, pero no se pudo inicializar su registro de control.');
      }
      data = { nonce: initialNonce, updated_at: new Date().toISOString() };
    }
    return res.status(200).json({ nonce: data.nonce, updated_at: data.updated_at });
  } catch (error) {
    console.error('Control de sesión global:', error);
    return fail(res, 500, 'Falló el servidor al consultar el control de sesiones. Revisa los registros de ejecución de Vercel.');
  }
}
