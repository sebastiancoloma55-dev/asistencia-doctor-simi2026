import { requireModuleAccess } from '../lib/server-auth.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const access = await requireModuleAccess(req, 'reportes');
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'El servicio de IA no está configurado en el servidor.' });

  try {
    const { prompt, base64, textData, mimeType, fileName } = req.body || {};
    const solicitud = String(prompt || '').trim();
    const datos = typeof textData === 'string' ? textData : '';
    const archivo = typeof base64 === 'string' ? base64 : '';

    if (!solicitud) return res.status(400).json({ error: 'Falta la solicitud de análisis.' });
    if (solicitud.length > 20000) return res.status(413).json({ error: 'La solicitud es demasiado extensa.' });
    if (datos.length > 2000000 || archivo.length > 7000000) {
      return res.status(413).json({ error: 'El archivo o los datos superan el tamaño permitido.' });
    }

    const parts = [{
      text: `Actúa como analista senior de RR. HH. en Chile. No inventes datos. Analiza ${String(fileName || 'el archivo').slice(0, 180)} y responde exactamente: ${solicitud}. Incluye metodología, cifras, hallazgos, limitaciones, conclusiones y recomendaciones.`
    }];
    if (datos) parts.push({ text: `Datos proporcionados:\n${datos}` });
    if (archivo) parts.push({ inlineData: { mimeType: String(mimeType || 'application/pdf').slice(0, 100), data: archivo } });

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 16384 }
        })
      }
    );

    const raw = await response.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'El proveedor de IA devolvió una respuesta no válida.' });
    }
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: response.status === 429
          ? (result?.error?.message || 'El servicio de IA alcanzó su cuota temporal.')
          : 'No se pudo completar el análisis con el proveedor de IA.'
      });
    }

    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('\n')
      .trim();
    if (!text) return res.status(502).json({ error: 'El proveedor de IA no devolvió contenido para el análisis.' });
    return res.status(200).json({ text });
  } catch {
    return res.status(500).json({ error: 'Ocurrió un error interno al procesar el análisis.' });
  }
}
