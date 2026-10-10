import { createClient } from '@supabase/supabase-js';

const jsonError = (res, status, message, detail = '') =>
  res.status(status).json({ error: detail ? `${message}: ${detail}` : message });

async function buscarUsuarioAuthPorEmail(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const usuario = (data?.users || []).find(
      (u) => String(u.email || '').toLowerCase() === email
    );
    if (usuario) return usuario;
    if ((data?.users || []).length < 1000) break;
  }
  return null;
}

async function guardarFicha(admin, body, correo) {
  const registro = {
    email: correo,
    nombre: String(body.nombre || '').trim(),
    rol: body.rol || 'CONSULTA',
    permisos: Array.isArray(body.permisos) ? body.permisos : [],
    activo: body.activo !== false,
    puede_asignar_tareas: Boolean(body.puede_asignar_tareas),
    puede_revisar_tareas: Boolean(body.puede_revisar_tareas),
    puede_preparar_correos: Boolean(body.puede_preparar_correos),
    acceso_global: Boolean(body.acceso_global)
  };

  const { data: ficha, error } = await admin
    .from('usuarios_roles')
    .upsert([registro], { onConflict: 'email' })
    .select('id,email,auth_user_id')
    .single();
  if (error) throw error;

  const { error: borrarSupError } = await admin
    .from('usuarios_supervisores')
    .delete()
    .eq('usuario_rol_id', ficha.id);
  if (borrarSupError) throw borrarSupError;

  const { error: borrarSucError } = await admin
    .from('usuarios_sucursales')
    .delete()
    .eq('usuario_rol_id', ficha.id);
  if (borrarSucError) throw borrarSucError;

  const supervisores = Array.isArray(body.supervisores) ? body.supervisores : [];
  if (supervisores.length) {
    const { error: supError } = await admin
      .from('usuarios_supervisores')
      .insert(supervisores.map((supervisor) => ({
        usuario_rol_id: ficha.id,
        supervisor: String(supervisor)
      })));
    if (supError) throw supError;
  }

  const sucursales = Array.isArray(body.sucursales) ? body.sucursales : [];
  if (sucursales.length) {
    const { error: sucError } = await admin
      .from('usuarios_sucursales')
      .insert(sucursales.map((sucursal_id) => ({
        usuario_rol_id: ficha.id,
        sucursal_id: String(sucursal_id)
      })));
    if (sucError) throw sucError;
  }

  return ficha;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Metodo no permitido');
  }

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return jsonError(res, 401, 'Sesion requerida');

    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !secret) {
      return jsonError(res, 500, 'Faltan variables de Supabase en Vercel');
    }

    const sessionClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: me, error: meError } = await sessionClient.auth.getUser(token);
    if (meError || !me?.user) return jsonError(res, 401, 'Sesion invalida', meError?.message || '');

    const admin = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: rol, error: rolError } = await admin
      .from('usuarios_roles')
      .select('rol,activo')
      .eq('auth_user_id', me.user.id)
      .maybeSingle();
    if (rolError) throw rolError;
    if (!rol?.activo || rol.rol !== 'ADMIN') {
      return jsonError(res, 403, 'Solo un administrador puede gestionar accesos');
    }

    const body = req.body || {};
    const accion = String(body.accion || '').trim().toUpperCase();
    const correo = String(body.email || '').trim().toLowerCase();
    if (!correo) return jsonError(res, 400, 'Falta el correo');

    if (accion === 'GUARDAR_FICHA') {
      await guardarFicha(admin, body, correo);
      return res.status(200).json({ message: 'Usuario, supervisores y permisos guardados.' });
    }

    if (accion === 'CREAR_CON_CLAVE') {
      const password = String(body.password || '');
      if (password.length < 8) return jsonError(res, 400, 'La clave debe tener al menos 8 caracteres');

      let usuario = await buscarUsuarioAuthPorEmail(admin, correo);
      if (usuario) {
        const { data, error } = await admin.auth.admin.updateUserById(usuario.id, {
          password,
          email_confirm: true,
          user_metadata: { ...(usuario.user_metadata || {}), nombre: body.nombre || '' }
        });
        if (error) throw error;
        usuario = data.user;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: correo,
          password,
          email_confirm: true,
          user_metadata: { nombre: body.nombre || '' }
        });
        if (error) throw error;
        usuario = data.user;
      }

      const { error: vinculoError } = await admin
        .from('usuarios_roles')
        .upsert([{ email: correo, nombre: body.nombre || '', activo: true, auth_user_id: usuario.id }], { onConflict: 'email' });
      if (vinculoError) throw vinculoError;

      return res.status(200).json({
        message: 'Usuario creado y confirmado. Ya puede ingresar con la clave asignada.',
        userId: usuario.id
      });
    }

    if (accion === 'CAMBIAR_CLAVE') {
      const password = String(body.password || '');
      if (password.length < 8) return jsonError(res, 400, 'La clave debe tener al menos 8 caracteres');

      const usuario = await buscarUsuarioAuthPorEmail(admin, correo);
      if (!usuario) return jsonError(res, 404, 'El usuario no existe en Authentication - Users');

      const { error } = await admin.auth.admin.updateUserById(usuario.id, {
        password,
        email_confirm: true
      });
      if (error) throw error;

      const { error: vinculoError } = await admin
        .from('usuarios_roles')
        .update({ auth_user_id: usuario.id, activo: true })
        .eq('email', correo);
      if (vinculoError) throw vinculoError;

      return res.status(200).json({ message: 'Clave actualizada. El usuario ya puede ingresar.' });
    }

    if (accion === 'INVITAR') {
      const existente = await buscarUsuarioAuthPorEmail(admin, correo);
      if (existente) {
        await admin.from('usuarios_roles').update({ auth_user_id: existente.id, activo: true }).eq('email', correo);
        return res.status(200).json({ message: 'El usuario ya existe en Authentication. Usa Cambiar clave o Enviar recuperacion.' });
      }

      const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
        redirectTo: body.redirectTo || undefined,
        data: { nombre: body.nombre || '' }
      });
      if (error) throw error;
      const { error: vinculoError } = await admin
        .from('usuarios_roles')
        .upsert([{ email: correo, nombre: body.nombre || '', auth_user_id: data.user.id, activo: true }], { onConflict: 'email' });
      if (vinculoError) throw vinculoError;
      return res.status(200).json({ message: 'Invitacion enviada.' });
    }

    if (accion === 'RECUPERAR') {
      const publicClient = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { error } = await publicClient.auth.resetPasswordForEmail(correo, {
        redirectTo: body.redirectTo || undefined
      });
      if (error) throw error;
      return res.status(200).json({ message: 'Correo de recuperacion enviado.' });
    }

    if (accion === 'ELIMINAR') {
      const { data: ficha, error: fichaError } = await admin
        .from('usuarios_roles')
        .select('id,auth_user_id,email')
        .eq('email', correo)
        .maybeSingle();
      if (fichaError) throw fichaError;
      if (!ficha) return jsonError(res, 404, 'No existe una ficha para ese correo');

      let authUserId = ficha.auth_user_id;
      if (!authUserId) {
        const usuario = await buscarUsuarioAuthPorEmail(admin, correo);
        authUserId = usuario?.id || null;
      }
      if (authUserId === me.user.id) {
        return jsonError(res, 400, 'No puedes eliminar tu propio acceso mientras estas conectado');
      }
      if (authUserId) {
        const { error } = await admin.auth.admin.deleteUser(authUserId, false);
        if (error && !/not found/i.test(error.message || '')) throw error;
      }

      const { error: supError } = await admin.from('usuarios_supervisores').delete().eq('usuario_rol_id', ficha.id);
      if (supError) throw supError;
      const { error: sucError } = await admin.from('usuarios_sucursales').delete().eq('usuario_rol_id', ficha.id);
      if (sucError) throw sucError;
      const { error: updateError } = await admin
        .from('usuarios_roles')
        .update({ activo: false, auth_user_id: null, permisos: [] })
        .eq('id', ficha.id);
      if (updateError) throw updateError;

      await admin.from('auditoria_eventos').insert([{
        usuario_email: me.user.email || '',
        modulo: 'usuarios',
        accion: 'ELIMINA_ACCESO',
        detalle: `Acceso eliminado: ${correo}`
      }]);

      return res.status(200).json({
        message: authUserId
          ? 'Cuenta eliminada de Authentication. La ficha quedo inactiva y el historial se conservo.'
          : 'La ficha no tenia cuenta en Authentication. Se desactivo y se retiraron sus permisos.'
      });
    }

    return jsonError(res, 400, `Accion no valida: ${accion || '(vacia)'}`);
  } catch (error) {
    console.error('usuarios-auth:', error);
    return jsonError(res, 500, 'Error interno', error?.message || String(error));
  }
}
