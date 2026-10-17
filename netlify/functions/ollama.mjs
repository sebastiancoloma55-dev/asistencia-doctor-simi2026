import { handleOllama } from '../../lib/ollama-handler.js';

export default async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Método no permitido.' }) };
  }
  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Solicitud JSON no válida.' }) }; }
  const result = await handleOllama({ headers: event.headers || {}, body });
  return { statusCode: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(result.body) };
};
