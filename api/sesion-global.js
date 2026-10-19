import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';
const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Método no permitido.');
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(res, 401, 'Sesión requerida.');

  // All project URLs and keys come from server environment variables; never embed keys in source.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !service || !publicKey) {
    console.error('Control de sesión global: faltan variables de entorno requeridas.');
    return fail(res, 500, 'El control de sesiones no está configurado en el servidor.');
  }

  try {
    const authClient = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) return fail(res, 401, 'La sesión no es válida o ha expirado.');

    const email = String(authData.user.email || '').trim().toLowerCase();
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (req.method === 'POST') {
      if (email !== ADMIN_PRINCIPAL) {
        return fail(res, 403, 'Solo el administrador principal puede cerrar las sesiones globalmente.');
      }

      // Validate both the identity and the active administrator profile before a global action.
      const { data: profile, error: profileError } = await admin
        .from('usuarios_roles')
        .select('rol,activo,email,auth_user_id')
        .eq('email', ADMIN_PRINCIPAL)
        .maybeSingle();
      if (profileError) throw profileError;
      if (
        !profile ||
        profile.activo !== true ||
        String(profile.rol || '').toUpperCase() !== 'ADMIN' ||
        String(profile.email || '').trim().toLowerCase() !== email ||
        (profile.auth_user_id && profile.auth_user_id !== authData.user.id)
      ) {
        return fail(res, 403, 'La cuenta no está autorizada como administrador principal.');
      }

      const nonce = randomUUID();
      const { error } = await admin.from('control_sesion_global').upsert({
        id: 1,
        nonce,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (error) throw error;
      return res.status(200).json({
        ok: true,
        nonce,
        message: 'Se solicitó cerrar las sesiones de todos los usuarios.'
      });
    }

    let { data, error } = await admin.from('control_sesion_global')
      .select('nonce,updated_at').eq('id', 1).maybeSingle();
    if (error) throw error;

    // Initialize the singleton if the table exists but has no row yet.
    if (!data) {
      const initialNonce = randomUUID();
      const { error: insertError } = await admin.from('control_sesion_global')
        .upsert({ id: 1, nonce: initialNonce, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (insertError) throw insertError;
      data = { nonce: initialNonce, updated_at: new Date().toISOString() };
    }

    return res.status(200).json({ nonce: data.nonce, updated_at: data.updated_at });
  } catch (error) {
    // Detailed diagnostics stay in server logs; do not expose database/configuration details to clients.
    console.error('Control de sesión global:', error);
    return fail(res, 500, 'No se pudo procesar el control de sesiones.');
  }
}
