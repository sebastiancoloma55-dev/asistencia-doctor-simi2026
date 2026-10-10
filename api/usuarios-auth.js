import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sesion requerida' });
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !secret) return res.status(500).json({ error: 'Faltan variables de Supabase en Vercel' });

    const sessionClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: me, error: meError } = await sessionClient.auth.getUser(token);
    if (meError || !me.user) return res.status(401).json({ error: 'Sesion invalida' });

    const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: rol, error: rolError } = await admin.from('usuarios_roles').select('rol,activo').eq('auth_user_id', me.user.id).maybeSingle();
    if (rolError) throw rolError;
    if (!rol?.activo || rol.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo un administrador puede gestionar accesos' });

    const { accion, email, nombre, redirectTo } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    if (!correo) return res.status(400).json({ error: 'Falta el correo' });

    if (accion === 'INVITAR') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, { redirectTo: redirectTo || undefined, data: { nombre: nombre || '' } });
      if (error) throw error;
      await admin.from('usuarios_roles').update({ auth_user_id: data.user.id, activo: true }).eq('email', correo);
      return res.status(200).json({ message: 'Invitacion enviada.' });
    }

    if (accion === 'RECUPERAR') {
      const publicClient = createClient(url, anon);
      const { error } = await publicClient.auth.resetPasswordForEmail(correo, { redirectTo: redirectTo || undefined });
      if (error) throw error;
      return res.status(200).json({ message: 'Correo de recuperacion enviado.' });
    }

    if (accion === 'ELIMINAR') {
      const { data: ficha, error: fichaError } = await admin.from('usuarios_roles').select('id,auth_user_id,email').eq('email', correo).maybeSingle();
      if (fichaError) throw fichaError;
      if (!ficha) return res.status(404).json({ error: 'No existe una ficha para ese correo' });
      if (ficha.auth_user_id === me.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio acceso mientras estas conectado' });
      if (ficha.auth_user_id) {
        const { error } = await admin.auth.admin.deleteUser(ficha.auth_user_id, false);
        if (error) throw error;
      }
      await admin.from('usuarios_supervisores').delete().eq('usuario_rol_id', ficha.id);
      await admin.from('usuarios_sucursales').delete().eq('usuario_rol_id', ficha.id);
      const { error: updateError } = await admin.from('usuarios_roles').update({ activo: false, auth_user_id: null, permisos: [] }).eq('id', ficha.id);
      if (updateError) throw updateError;
      await admin.from('auditoria_eventos').insert([{ usuario_email: me.user.email || '', modulo: 'usuarios', accion: 'ELIMINA_ACCESO', detalle: `Acceso eliminado: ${correo}` }]);
      return res.status(200).json({ message: 'Cuenta eliminada. La ficha quedo inactiva y el historial se conservo.' });
    }
    return res.status(400).json({ error: 'Accion no valida' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error interno' });
  }
}
