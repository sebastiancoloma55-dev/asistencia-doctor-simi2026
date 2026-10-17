import { createClient } from '@supabase/supabase-js';

const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';

export async function requireModuleAccess(req, permission) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Sesión requerida.' };

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return { ok: false, status: 500, error: 'La autenticación del servidor no está configurada.' };
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) return { ok: false, status: 401, error: 'La sesión no es válida o ha expirado.' };

    const user = data.user;
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return { ok: false, status: 401, error: 'La sesión no tiene un correo verificado.' };

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: profile, error: profileError } = await adminClient
      .from('usuarios_roles')
      .select('id,email,rol,activo,permisos,acceso_global,auth_user_id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      return { ok: false, status: 500, error: 'No se pudo validar el perfil de acceso.' };
    }
    if (!profile || profile.activo === false) {
      return { ok: false, status: 403, error: 'El usuario no tiene un perfil activo.' };
    }
    if (profile.auth_user_id && profile.auth_user_id !== user.id) {
      return { ok: false, status: 403, error: 'El perfil no corresponde a la sesión actual.' };
    }

    const isPrincipal = email === ADMIN_PRINCIPAL && String(profile.rol || '').toUpperCase() === 'ADMIN';
    const permissions = Array.isArray(profile.permisos) ? profile.permisos : [];
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];
    if (!isPrincipal && !profile.acceso_global && !requiredPermissions.some(required => permissions.includes(required))) {
      return { ok: false, status: 403, error: 'No tienes permiso para utilizar esta función.' };
    }

    return { ok: true, user, profile, admin: isPrincipal };
  } catch (error) {
    return { ok: false, status: 500, error: 'No se pudo verificar la sesión.' };
  }
}
