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

## Automatización
La web permite configurar la frecuencia y encolar una ejecución manual. El agente local debe mantenerse abierto, consultar configuración/cola y ejecutar el proceso Playwright existente. El PC debe estar encendido y conectado. Supabase no puede abrir Chrome del PC por sí solo. Para automatización desatendida, inicia el agente con el Programador de tareas de Windows y evita ejecuciones simultáneas.
