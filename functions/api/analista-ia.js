export async function onRequestPost({ request, env }) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Sesión requerida.' }, 401);
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  if (!url || !anonKey || !serviceKey) return json({ error: 'La autenticación del servidor no está configurada en Cloudflare Pages.' }, 503);
  if (!geminiKey) return json({ error: 'El servicio de IA no está configurado en Cloudflare Pages. Añade GEMINI_API_KEY como variable secreta; no la publiques en GitHub.' }, 503);
  try {
    const authRes = await fetch(url + '/auth/v1/user', { headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + token } });
    if (!authRes.ok) return json({ error: 'La sesión no es válida o ha expirado.' }, 401);
    const user = await authRes.json();
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'La sesión no tiene un correo válido.' }, 401);

    const profileRes = await fetch(url + '/rest/v1/usuarios_roles?select=email,rol,activo,permisos,acceso_global,auth_user_id&email=eq.' + encodeURIComponent(email) + '&limit=1', {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    });
    if (!profileRes.ok) return json({ error: 'No se pudo validar el perfil de acceso.' }, 500);
    const rows = await profileRes.json();
    const profile = rows[0];
    if (!profile || profile.activo === false) return json({ error: 'El usuario no tiene un perfil activo.' }, 403);
    if (profile.auth_user_id && profile.auth_user_id !== user.id) return json({ error: 'El perfil no corresponde a la sesión actual.' }, 403);
    const role = String(profile.rol || '').trim().toUpperCase();
    const isPrincipal = email === 'scoloma@farmaciasdoctorsimi.cl' && role === 'ADMIN';
    const globalAccess = isPrincipal || profile.acceso_global === true || ['ADMIN','ADMINISTRADOR','SUPERADMIN','SUPER_ADMIN','ADMIN_PRINCIPAL','ADMINISTRADOR_PRINCIPAL'].includes(role);
    if (!globalAccess && !(Array.isArray(profile.permisos) && profile.permisos.includes('analista_ia'))) {
      return json({ error: 'No tienes permiso para utilizar el Analista de RR. HH. con IA.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return json({ error: 'Escribe una consulta para el analista.' }, 400);
    if (prompt.length > 12000) return json({ error: 'La consulta supera el tamaño permitido.' }, 413);
    const systemContext = [
      'Eres el Analista de Recursos Humanos de Farmacias Doctor Simi Chile.',
      'Responde en español de Chile, con tono profesional, claro y práctico.',
      'Ayuda a analizar asistencia, turnos, atrasos, marcaciones, licencias, ausentismo, vacaciones, coberturas y operación de RR. HH.',
      'No inventes cifras, personas, políticas internas ni resultados de consultas a bases de datos.',
      'No afirmes haber revisado registros reales: en esta solicitud no se adjuntan datos de trabajadores ni resultados de base de datos.',
      'Si la pregunta requiere cifras reales, explica qué reporte o datos agregados se necesitan y cómo obtenerlos en la plataforma.',
      'No solicites ni expongas datos médicos o personales innecesarios. Distingue hechos, supuestos y recomendaciones.',
      'Entrega pasos accionables y señala limitaciones o validaciones legales para Chile.'
    ].join(' ');
    const aiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemContext + '\n\nConsulta del usuario:\n' + prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } })
    });
    const raw = await aiRes.text();
    let result;
    try { result = JSON.parse(raw); } catch { return json({ error: 'El proveedor de IA devolvió una respuesta no válida.' }, 502); }
    if (!aiRes.ok) return json({ error: aiRes.status === 429 ? 'El servicio de IA alcanzó su cuota temporal. Intenta más tarde.' : 'No se pudo completar la consulta con el proveedor de IA.' }, aiRes.status === 429 ? 429 : 502);
    const text = (result.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n').trim();
    if (!text) return json({ error: 'La IA no devolvió una respuesta.' }, 502);
    return json({ text });
  } catch (error) {
    console.error('Analista IA Pages Function:', error?.message || error);
    return json({ error: 'Ocurrió un error interno al consultar al analista.' }, 500);
  }
}
