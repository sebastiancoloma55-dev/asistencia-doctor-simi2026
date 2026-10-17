import { requireModuleAccess } from './server-auth.js';

export async function handleOllama({ headers = {}, body = {} }) {
  const access = await requireModuleAccess({ headers }, ['analista_ia', 'reportes']);
  if (!access.ok) return { status: access.status, body: { error: access.error } };
  const baseUrl = String(process.env.OLLAMA_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.OLLAMA_API_KEY || '').trim();
  const model = String(process.env.OLLAMA_MODEL || 'llama3.1:8b').trim();
  if (!baseUrl || !apiKey) return { status: 503, body: { error: 'Ollama aún no está configurado en este entorno. Faltan OLLAMA_BASE_URL y OLLAMA_API_KEY para el servidor seguro del equipo.' } };

  const prompt = String(body.prompt || '').trim();
  const fileName = String(body.fileName || 'archivo').slice(0, 180);
  const textData = typeof body.textData === 'string' ? body.textData : '';
  if (!prompt) return { status: 400, body: { error: 'Falta la solicitud de análisis.' } };
  if (prompt.length > 20000) return { status: 413, body: { error: 'La solicitud es demasiado extensa.' } };
  if (textData.length > 2000000) return { status: 413, body: { error: 'Los datos superan el tamaño permitido. Aplica filtros o reduce las columnas.' } };
  const history = Array.isArray(body.conversation) ? body.conversation.slice(-12).filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 12000) })) : [];
  const system = 'Eres un asistente conversacional útil, preciso y cordial. Puedes responder preguntas generales y ayudar con Recursos Humanos en Chile, redacción, Excel, análisis y planificación. No supongas que el usuario quiere un informe; responde naturalmente a lo que pregunta. Si no tienes acceso a datos internos o actualizados, dilo claramente. Si hay un archivo adjunto, analiza solo los datos proporcionados, no inventes cifras ni nombres, señala limitaciones y evita conclusiones legales definitivas. Responde en español salvo que te pidan otro idioma.';
  const userMessage = textData ? 'Archivo adjunto: ' + fileName + '\nPregunta: ' + prompt + '\n\nDatos del archivo (pueden ser una muestra, respeta la nota de cobertura):\n' + textData : prompt;
  const endpoint = baseUrl.endsWith('/v1') ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessage }], temperature: 0.2, max_tokens: 4096, stream: false }),
      signal: AbortSignal.timeout(120000)
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { return { status: 502, body: { error: 'El servicio Ollama devolvió una respuesta no válida.' } }; }
    if (!response.ok) return { status: response.status === 429 ? 429 : 502, body: { error: String(result?.error?.message || result?.error || 'No se pudo completar el análisis con Ollama.').slice(0, 400) } };
    const text = String(result?.choices?.[0]?.message?.content || '').trim();
    if (!text) return { status: 502, body: { error: 'Ollama no devolvió contenido para el análisis.' } };
    return { status: 200, body: { text, provider: 'ollama', model } };
  } catch {
    return { status: 502, body: { error: 'No se pudo conectar con el servidor Ollama del equipo. Revisa que esté encendido y que el acceso seguro esté disponible.' } };
  }
}
