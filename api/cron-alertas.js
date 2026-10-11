
import { createClient } from '@supabase/supabase-js';

const ESTADOS_CERRADOS = ['APROBADA', 'CANCELADA'];
const HORAS_ANTICIPACION = 24;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;

  if (
    !cronSecret ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Faltan variables de entorno de Supabase'
    });
  }

  const db = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  const ahora = new Date();
  const limite = new Date(
    ahora.getTime() + HORAS_ANTICIPACION * 60 * 60 * 1000
  );

  try {
    // Apply only approved transfers whose effective date has arrived.
    // The service-role key stays server-side and is never returned to the browser.
    const { data: trasladosAplicados, error: trasladosError } = await db.rpc(
      'aplicar_traslados_personal_vigentes'
    );
    if (trasladosError) throw trasladosError;

    const estadosExcluidos =
      `("${ESTADOS_CERRADOS.join('","')}")`;

    const consultaBase = () =>
      db
        .from('tareas')
        .select(
          'id,titulo,responsable_rol_id,fecha_limite,estado'
        )
        .not('estado', 'in', estadosExcluidos)
        .not('responsable_rol_id', 'is', null);

    const [
      vencidasResult,
      proximasResult
    ] = await Promise.all([
      consultaBase().lt(
        'fecha_limite',
        ahora.toISOString()
      ),
      consultaBase()
        .gte('fecha_limite', ahora.toISOString())
        .lte('fecha_limite', limite.toISOString())
    ]);

    if (vencidasResult.error) {
      throw vencidasResult.error;
    }

    if (proximasResult.error) {
      throw proximasResult.error;
    }

    const vencidas = vencidasResult.data || [];
    const proximas = proximasResult.data || [];

    const generarAviso = (tarea, tipo, titulo) => ({
      usuario_rol_id: tarea.responsable_rol_id,
      tipo,
      titulo,
      mensaje:
        `${tarea.titulo} — fecha límite: ` +
        `${tarea.fecha_limite}`,
      entidad_tipo: 'tarea',
      entidad_id: tarea.id
    });

    const avisos = [
      ...vencidas.map(t =>
        generarAviso(
          t,
          'TAREA_VENCIDA',
          'Tarea vencida'
        )
      ),
      ...proximas.map(t =>
        generarAviso(
          t,
          'TAREA_POR_VENCER',
          'Tarea próxima a vencer'
        )
      )
    ];

    let guardadas = 0;

    if (avisos.length > 0) {
      const { data, error } = await db
        .from('notificaciones')
        .upsert(avisos, {
          onConflict:
            'usuario_rol_id,tipo,entidad_tipo,entidad_id',
          ignoreDuplicates: true
        })
        .select('id');

      if (error) {
        throw error;
      }

      guardadas = data?.length || 0;
    }

    return res.status(200).json({
      ok: true,
      revisadas: vencidas.length + proximas.length,
      vencidas: vencidas.length,
      proximasAVencer: proximas.length,
      avisosNuevos: guardadas,
      trasladosAplicados: trasladosAplicados || 0,
      ejecutadoEn: ahora.toISOString()
    });
  } catch (error) {
    console.error('cron-alertas:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudieron procesar las alertas'
    });
  }
}
