import { requireModuleAccess } from './server-auth.js';

export async function handleOllama({ headers = {}, body = {} }) {
  const access = await requireModuleAccess({ headers }, ['analista_ia', 'reportes']);
  if (!access.ok) return { status: access.status, body: { error: access.error } };

  const baseUrl = String(process.env.OLLAMA_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.OLLAMA_API_KEY || '').trim();
  const model = String(process.env.OLLAMA_MODEL || 'llama3.1:8b').trim();
  if (!baseUrl || !apiKey) {
    return { status: 503, body: { error: 'Ollama no está configurado en el entorno de vista previa. Se requieren OLLAMA_BASE_URL y OLLAMA_API_KEY como variables del servidor, nunca en el navegador.' } };
  }

  const prompt = String(body.prompt || '').trim();
  const fileName = String(body.fileName || 'archivo').slice(0, 180);
  const textData = typeof body.textData === 'string' ? body.textData : '';
  if (!prompt) return { status: 400, body: { error: 'Falta la solicitud de análisis.' } };
  if (prompt.length > 20000) return { status: 413, body: { error: 'La solicitud es demasiado extensa.' } };
  if (textData.length > 2000000) return { status: 413, body: { error: 'Los datos superan el tamaño permitido. Aplica filtros o reduce las columnas.' } };

  const history = Array.isArray(body.conversation)
    ? body.conversation.slice(-12)
      .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }))
    : [];
  const system = 'Eres un asistente conversacional útil, preciso y cordial. Puedes responder preguntas generales y ayudar con Recursos Humanos en Chile, redacción, Excel, análisis y planificación. No supongas que el usuario quiere un informe; responde naturalmente a lo que pregunta. Si no tienes acceso a datos internos o actualizados, dilo claramente. Si hay un archivo adjunto, analiza solo los datos proporcionados, no inventes cifras ni nombres, señala limitaciones y evita conclusiones legales definitivas. Responde en español salvo que te pidan otro idioma.';
  const userMessage = textData
    ? 'Archivo adjunto: ' + fileName + '\nPregunta: ' + prompt + '\n\nDatos del archivo (pueden ser una muestra, respeta la nota de cobertura):\n' + textData
    : prompt;
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessage }];
  const rootUrl = baseUrl.replace(/\/v1$/, '');
  const endpoint = baseUrl.endsWith('/v1') ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions';
  const headersOut = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };

  try {
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: headersOut,
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4096, stream: false }),
      signal: AbortSignal.timeout(120000)
    });
    let raw = await response.text();
    let result = null;
    try { result = JSON.parse(raw); } catch { result = null; }

    // Algunos servidores Ollama exponen solo su API nativa; intentar esa ruta cuando
    // el endpoint compatible con OpenAI no exista, sin ocultar errores de conectividad.
    if ((response.status === 404 || response.status === 405) && rootUrl) {
      response = await fetch(rootUrl + '/api/chat', {
        method: 'POST',
        headers: headersOut,
        body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.2, num_predict: 4096 } }),
        signal: AbortSignal.timeout(120000)
      });
      raw = await response.text();
      try { result = JSON.parse(raw); } catch { result = null; }
      if (response.ok) {
        const nativeText = String(result?.message?.content || '').trim();
        if (nativeText) return { status: 200, body: { text: nativeText, provider: 'ollama', model } };
      }
    }

    if (!result) {
      return { status: 502, body: { error: 'El servidor configurado respondió con contenido no válido. Revisa que OLLAMA_BASE_URL apunte a un endpoint Ollama compatible y que el servicio esté accesible desde Netlify.' } };
    }
    if (!response.ok) {
      const upstreamError = String(result?.error?.message || result?.error || '').slice(0, 250);
      return { status: response.status === 429 ? 429 : 502, body: { error: upstreamError || 'Ollama rechazó la solicitud. Verifica que el modelo configurado exista en el servidor y que el endpoint sea correcto.' } };
    }
    const text = String(result?.choices?.[0]?.message?.content || '').trim();
    if (!text) return { status: 502, body: { error: 'Ollama respondió sin texto. Comprueba que el modelo esté descargado y listo en el servidor.' } };
    return { status: 200, body: { text, provider: 'ollama', model } };
  } catch (error) {
    const code = String(error?.cause?.code || error?.code || '');
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const detail = timeout
      ? 'La respuesta de Ollama superó los 120 segundos.'
      : code === 'ENOTFOUND' ? 'No se pudo resolver el host de OLLAMA_BASE_URL.'
      : code === 'ECONNREFUSED' ? 'El host respondió, pero rechazó la conexión al puerto configurado.'
      : 'Netlify no pudo conectarse con el servidor configurado.';
    return { status: 502, body: { error: detail + ' El servidor debe ser accesible desde la función de Netlify; localhost del computador de un usuario no funciona para todo el equipo.' } };
  }
}
