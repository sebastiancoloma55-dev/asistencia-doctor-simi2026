import { createClient } from '@supabase/supabase-js';

const fail = (res, status, error) => res.status(status).json({ error });

async function findAuthUser(admin, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = (data?.users || []).find(u => String(u.email || '').toLowerCase() === email);
    if (user) return user;
    if ((data?.users || []).length < 1000) break;
  }
  return null;
}

async function saveProfile(admin, body, email, authUserId = undefined) {
  const row = {
    email,
    nombre: String(body.nombre || '').trim(),
    rol: body.rol || 'CONSULTA',
    permisos: Array.isArray(body.permisos) ? body.permisos : [],
    activo: body.activo !== false,
    puede_asignar_tareas: !!body.puede_asignar_tareas,
    puede_revisar_tareas: !!body.puede_revisar_tareas,
    puede_preparar_correos: !!body.puede_preparar_correos,
    acceso_global: !!body.acceso_global
  };
  if (authUserId !== undefined) row.auth_user_id = authUserId;

  const { data: profile, error } = await admin.from('usuarios_roles')
    .upsert([row], { onConflict: 'email' }).select('id').single();
  if (error) throw error;

  const { error: e1 } = await admin.from('usuarios_supervisores').delete().eq('usuario_rol_id', profile.id);
  if (e1) throw e1;
  const { error: e2 } = await admin.from('usuarios_sucursales').delete().eq('usuario_rol_id', profile.id);
  if (e2) throw e2;

  const supervisors = Array.isArray(body.supervisores) ? body.supervisores : [];
  if (supervisors.length) {
    const { error: e } = await admin.from('usuarios_supervisores').insert(
      supervisors.map(supervisor => ({ usuario_rol_id: profile.id, supervisor: String(supervisor) }))
    );
    if (e) throw e;
  }
  const branches = Array.isArray(body.sucursales) ? body.sucursales : [];
  if (branches.length) {
    const { error: e } = await admin.from('usuarios_sucursales').insert(
      branches.map(sucursal_id => ({ usuario_rol_id: profile.id, sucursal_id: String(sucursal_id) }))
    );
    if (e) throw e;
  }
  return profile;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Metodo no permitido');
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 401, 'Sesion requerida');
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !secret) return fail(res, 500, 'Faltan variables de Supabase en Vercel');

    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me, error: meError } = await client.auth.getUser(token);
    if (meError || !me?.user) return fail(res, 401, 'Sesión no válida o expirada');

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    
const ADMIN_PRINCIPAL = 'scoloma@farmaciasdoctorsimi.cl';

const correoSesion = String(me.user.email || '').trim().toLowerCase();

if (correoSesion !== ADMIN_PRINCIPAL) {
  return fail(res, 403, 'Acceso restringido al administrador principal');
}

const { data: role, error: roleError } = await admin
  .from('usuarios_roles')
  .select('rol,activo,email')
  .eq('auth_user_id', me.user.id)
  .maybeSingle();

if (roleError) throw roleError;

if (
  !role ||
  !role.activo ||
  role.rol !== 'ADMIN' ||
  String(role.email || '').trim().toLowerCase() !== ADMIN_PRINCIPAL
) {
  return fail(res, 403, 'La cuenta no está autorizada como administrador principal');
}
    const body = req.body || {};
    const action = String(body.accion || '').toUpperCase();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return fail(res, 400, 'Falta el correo');

    if (action === 'GUARDAR_FICHA') {
      await saveProfile(admin, body, email);
      return res.status(200).json({ message: 'Usuario, supervisores y permisos guardados.' });
    }

    if (action === 'CREAR_CON_CLAVE') {
      const password = String(body.password || '');
      if (password.length < 8) return fail(res, 400, 'La clave debe tener al menos 8 caracteres');
      let user = await findAuthUser(admin, email);
      let createdNow = false;
      if (user) {
        const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { ...(user.user_metadata || {}), nombre: body.nombre || '' } });
        if (error) throw error;
        user = data.user;
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre: body.nombre || '' } });
        if (error) throw error;
        user = data.user;
        createdNow = true;
      }
      try {
        await saveProfile(admin, body, email, user.id);
      } catch (e) {
        if (createdNow) await admin.auth.admin.deleteUser(user.id, false);
        throw e;
      }
      return res.status(200).json({ message: 'Usuario creado y confirmado. Ya puede ingresar con la clave.', userId: user.id });
    }

    if (action === 'CAMBIAR_CLAVE') {
      const password = String(body.password || '');
      if (password.length < 8) return fail(res, 400, 'La clave debe tener al menos 8 caracteres');
      const user = await findAuthUser(admin, email);
      if (!user) return fail(res, 404, 'El usuario no existe en Authentication - Users');
      const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      if (error) throw error;
      await admin.from('usuarios_roles').update({ auth_user_id: user.id, activo: true }).eq('email', email);
      return res.status(200).json({ message: 'Clave actualizada correctamente.' });
    }

    if (action === 'INVITAR') {
      const existing = await findAuthUser(admin, email);
      if (existing) return fail(res, 409, 'El usuario ya existe. Usa Cambiar clave o Enviar recuperacion.');
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: body.redirectTo || undefined, data: { nombre: body.nombre || '' } });
      if (error) throw error;
      await saveProfile(admin, body, email, data.user.id);
      return res.status(200).json({ message: 'Invitacion enviada.' });
    }

    if (action === 'RECUPERAR') {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: body.redirectTo || undefined });
      if (error) throw error;
      return res.status(200).json({ message: 'Correo de recuperacion enviado.' });
    }

    if (action === 'CAMBIAR_ESTADO') {
      const { error } = await admin.from('usuarios_roles').update({ activo: !!body.activo }).eq('email', email);
      if (error) throw error;
      return res.status(200).json({ message: body.activo ? 'Usuario activado.' : 'Usuario desactivado.' });
    }

    if (action === 'ELIMINAR') {
      const { data: profile, error: profileError } = await admin.from('usuarios_roles').select('id,auth_user_id').eq('email', email).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return fail(res, 404, 'No existe una ficha para ese correo');
      let userId = profile.auth_user_id;
      if (!userId) userId = (await findAuthUser(admin, email))?.id || null;
      if (userId === me.user.id) return fail(res, 400, 'No puedes eliminar tu propia cuenta conectada');
      if (userId) {
        const { error } = await admin.auth.admin.deleteUser(userId, false);
        if (error && !/not found/i.test(error.message || '')) throw error;
      }
      const { error: e1 } = await admin.from('usuarios_supervisores').delete().eq('usuario_rol_id', profile.id);
      if (e1) throw e1;
      const { error: e2 } = await admin.from('usuarios_sucursales').delete().eq('usuario_rol_id', profile.id);
      if (e2) throw e2;
      const { error: deleteProfileError } = await admin.from('usuarios_roles').delete().eq('id', profile.id);
      if (deleteProfileError) {
        const { error: fallbackError } = await admin.from('usuarios_roles').update({ activo: false, auth_user_id: null, permisos: [] }).eq('id', profile.id);
        if (fallbackError) throw fallbackError;
        return res.status(200).json({ message: 'La cuenta fue eliminada de Authentication. La ficha se dejo inactiva porque tiene historial relacionado.' });
      }
      return res.status(200).json({ message: 'Usuario eliminado de Authentication y de la lista de accesos.' });
    }

    return fail(res, 400, 'Acción no válida');
  } catch (error) {
    console.error('usuarios-auth', error);
    return fail(res, 500, 'No se pudo completar la operación. Revisa los registros del servidor.');
  }
}
