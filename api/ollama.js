import { handleOllama } from '../lib/ollama-handler.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const result = await handleOllama({ headers: req.headers || {}, body: req.body || {} });
  return res.status(result.status).json(result.body);
}
