export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Configura GEMINI_API_KEY en Vercel'
    });
  }

  try {
    const {
      prompt,
      base64,
      textData,
      mimeType,
      fileName
    } = req.body || {};

    if (!prompt) {
      return res.status(400).json({
        error: 'Falta la solicitud del reporte'
      });
    }

    const parts = [
      {
        text: [
          'Actua como analista senior de Recursos Humanos en Chile.',
          'No inventes datos.',
          `Analiza ${fileName || 'el archivo'} y sigue exactamente esta solicitud:`,
          prompt,
          'Entrega metodologia, hallazgos, cifras, casos relevantes,',
          'conclusiones, limitaciones y recomendaciones accionables.',
          'Si faltan datos para responder, indicalo expresamente.'
        ].join(' ')
      }
    ];

    if (textData) {
      parts.push({
        text: `Datos extraidos del Excel o CSV en formato JSON:\n${textData}`
      });
    }

    if (base64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: base64
        }
      });
    }

    const endpoint = [
      'https://generativelanguage.googleapis.com/v1beta/models/',
      'gemini-3.8-flash:generateContent'
    ].join('');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 16384
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Error de Gemini'
      });
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('\n')
      .trim();

    if (!text) {
      return res.status(502).json({
        error: 'Gemini no devolvio contenido para esta solicitud'
      });
    }

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Error interno'
    });
  }
}
