import { requireModuleAccess } from '../lib/server-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const access = await requireModuleAccess(req, 'analista_ia');
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'El servicio de IA no está configurado en el servidor. Configura GEMINI_API_KEY en las variables de entorno del hosting; no la publiques en GitHub.' });

  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'Escribe una consulta para el analista.' });
    if (prompt.length > 12000) return res.status(413).json({ error: 'La consulta supera el tamaño permitido.' });

    const systemContext = [
      'Eres el Analista de Recursos Humanos de Farmacias Doctor Simi Chile.',
      'Responde en español de Chile, con tono profesional, claro y práctico.',
      'Ayuda a analizar asistencia, turnos, atrasos, marcaciones, licencias, ausentismo, vacaciones, coberturas y operación de RR. HH.',
      'No inventes cifras, personas, políticas internas ni resultados de consultas a bases de datos.',
      'No afirmes haber revisado registros reales: en esta solicitud no se adjuntan datos de trabajadores ni resultados de base de datos.',
      'Si la pregunta requiere cifras reales, explica qué reporte o datos agregados se necesitan y cómo obtenerlos en la plataforma.',
      'No solicites ni expongas datos médicos o personales innecesarios. Distingue hechos, supuestos y recomendaciones.',
      'Entrega pasos accionables y, cuando corresponda, indica limitaciones y validaciones legales para Chile.'
    ].join(' ');

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemContext + '\n\nConsulta del usuario:\n' + prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      })
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'El proveedor de IA devolvió una respuesta no válida.' }); }
    if (!response.ok) {
      return res.status(response.status === 429 ? 429 : 502).json({
        error: response.status === 429
          ? 'El servicio de IA alcanzó su cuota temporal. Intenta más tarde.'
          : 'No se pudo completar la consulta con el proveedor de IA.'
      });
    }
    const text = (result.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
    if (!text) return res.status(502).json({ error: 'La IA no devolvió una respuesta.' });
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Analista IA:', error?.message || error);
    return res.status(500).json({ error: 'Ocurrió un error interno al consultar al analista.' });
  }
}
