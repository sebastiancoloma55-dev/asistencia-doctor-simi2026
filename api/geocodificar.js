import { requireModuleAccess } from '../lib/server-auth.js';

const cache = new Map();
let ultimo = 0;

async function consultarNominatim(consulta) {
  const espera = Math.max(0, 1100 - (Date.now() - ultimo));
  if (espera) await new Promise(resolve => setTimeout(resolve, espera));
  ultimo = Date.now();

  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&q=' + encodeURIComponent(consulta);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RRHH-Doctor-Simi/1.0 (contacto: rrhh@farmaciasdoctorsimi.cl)',
      'Accept-Language': 'es'
    }
  });
  if (!response.ok) throw new Error('No se pudo consultar el geocodificador.');
  const data = await response.json();
  return data?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const access = await requireModuleAccess(req, 'mapas');
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const direccion = String(req.query.direccion || '').trim().slice(0, 220);
  const nombre = String(req.query.nombre || '').trim().slice(0, 160);
  const comuna = String(req.query.comuna || '').trim().slice(0, 120);
  if (!direccion && !nombre) return res.status(400).json({ error: 'Falta dirección o nombre de sucursal.' });

  const key = [direccion, nombre, comuna].join('|');
  if (cache.has(key)) return res.status(200).json(cache.get(key));

  const candidatos = [
    direccion,
    [nombre, comuna, 'Chile'].filter(Boolean).join(', '),
    [direccion, comuna, 'Chile'].filter(Boolean).join(', '),
    [nombre, 'Chile'].filter(Boolean).join(', ')
  ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);

  try {
    let hit = null;
    for (const consulta of candidatos) {
      hit = await consultarNominatim(consulta);
      if (hit) break;
    }
    if (!hit) {
      return res.status(404).json({ error: 'No se encontró la dirección. Completa calle y comuna en el directorio de sucursales.' });
    }
    const output = { latitud: Number(hit.lat), longitud: Number(hit.lon), nombre: hit.display_name };
    cache.set(key, output);
    return res.status(200).json(output);
  } catch {
    return res.status(502).json({ error: 'No se pudo consultar el geocodificador. Intenta nuevamente más tarde.' });
  }
}
