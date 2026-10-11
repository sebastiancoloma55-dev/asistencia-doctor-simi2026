# Integración Talana → Asistencia Doctor Simi
La función `talana-bot-control` está desplegada en Supabase. La base de datos contiene tablas de control, historial y un bucket privado `talana-reportes`.

## Secreto del bot
En Supabase Dashboard → Edge Functions → Secrets, crea `TALANA_BOT_SECRET` con un valor aleatorio fuerte (32 bytes o más). No lo subas a GitHub ni al frontend. El agente Windows y la función deben usar el mismo valor.
URL: `https://zcfbglbhqhysnptkfwba.supabase.co/functions/v1/talana-bot-control`

Crea un archivo .env LOCAL, nunca en GitHub:
```dotenv
TALANA_BOT_URL=https://zcfbglbhqhysnptkfwba.supabase.co/functions/v1/talana-bot-control
TALANA_BOT_SECRET=REEMPLAZAR_POR_SECRETO_CONFIGURADO_EN_SUPABASE
TALANA_USER=TU_USUARIO_TALANA
TALANA_PASSWORD=TU_CLAVE_TALANA
```
Añade `.env` a `.gitignore`. Cambia la contraseña de Talana si estuvo escrita en código o compartida.

## Cargar archivos desde el proceso actual
```python
from integracion_supabase import TalanaBotCloud
cloud = TalanaBotCloud()
run_id = cloud.start_run("manual")  # "automatic" si se ejecutó por horario
try:
    cloud.upload_file(run_id, "ausentismos_historico", ruta_excel_ausentismos)
    cloud.upload_file(run_id, "solicitudes_vacaciones_historicas", ruta_excel_vacaciones)
    cloud.finish_run(run_id, "success", downloaded=2)
except Exception as exc:
    cloud.finish_run(run_id, "failed", errors=[str(exc)])
    raise
```
El cliente carga los archivos originales, no convierte automáticamente sus filas en registros de la base de datos.

## Automatización en la nube (GitHub Actions)

El workflow `.github/workflows/talana-hourly.yml` programa comprobaciones horarias de lunes a viernes. El guardia `holiday_schedule_guard.py` permite solo las 08:00–17:59 en hora de Santiago, excluye fines de semana y feriados nacionales de Chile y falla de forma segura si no puede consultar el calendario.

En GitHub → Settings → Secrets and variables → Actions configura los secretos `TALANA_BOT_URL`, `TALANA_BOT_SECRET`, `TALANA_USER` y `TALANA_PASSWORD`. `TALANA_BOT_SECRET` debe ser idéntico al secreto de Supabase. No guardes valores reales en el repositorio.

El ejecutor en nube consulta primero la configuración del panel: si el bot está pausado, no descarga; respeta el modo automático/manual y puede reclamar una solicitud manual en cola. Ejecuta `python bot_talana/agent_cloud.py --check` para verificar elegibilidad y `python bot_talana/agent_cloud.py --once` para una sola corrida.

La programación automática de GitHub requiere que el workflow esté en la rama por defecto. Antes de fusionar, verifica la compilación y realiza una prueba controlada de inicio de sesión, descarga y subida a Storage. La cuota gratuita de Actions puede limitar ejecuciones; no se configura facturación mediante esta integración.

## Alternativa local de Windows

Si prefieres ejecutar el agente residente en un PC, el agente Windows debe mantenerse abierto, consultar la configuración/cola y ejecutar el proceso Playwright existente. El equipo debe permanecer encendido y conectado. Supabase no puede abrir Chrome de tu PC por sí solo. Para automatización local desatendida, inicia el agente con el Programador de tareas de Windows y evita ejecuciones simultáneas.


## Ejecución manual desde el panel

Configura `GITHUB_ACTIONS_TOKEN` en Supabase Edge Functions Secrets con un token fine-grained limitado a este repositorio y permiso **Actions: Read and write**. Despliega la Edge Function actualizada para que el botón Ejecución manual dispare `workflow_dispatch` inmediatamente. No guardes este token en el frontend ni en el repositorio.
