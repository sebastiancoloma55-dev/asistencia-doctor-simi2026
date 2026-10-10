# Programación en la nube del bot Talana

## Horario
- Frecuencia prevista: una comprobación por hora, de lunes a viernes.
- Ventana efectiva: 08:00 a 17:59, hora local de Santiago.
- Sábados, domingos y feriados nacionales chilenos: no ejecutar.
- Si no se puede verificar el calendario de feriados, se omite la ejecución por seguridad.
- El cron usa UTC; `holiday_schedule_guard.py` aplica la zona horaria `America/Santiago`.
- GitHub Actions debe tener el workflow en la rama por defecto para activar la programación automática.
- La cuota gratuita de minutos puede limitar las ejecuciones. No se configura facturación ni se debe añadir tarjeta para este procedimiento.

## Secretos que debes crear

No escribas valores de claves en el código, commits, archivos `.env` del repositorio ni en conversaciones. En GitHub, entra al repositorio → **Settings → Secrets and variables → Actions → New repository secret** y crea estos cuatro secretos:

| Nombre exacto | Valor |
|---|---|
| `TALANA_BOT_URL` | `https://zcfbglbhqhysnptkfwba.supabase.co/functions/v1/talana-bot-control` |
| `TALANA_BOT_SECRET` | Secreto aleatorio fuerte que crearás tú y guardarás también en Supabase |
| `TALANA_USER` | Usuario de inicio de sesión de Talana |
| `TALANA_PASSWORD` | Contraseña de Talana |

### Crear y compartir el secreto del bot de forma segura

1. Genera un valor aleatorio de al menos 32 bytes en tu propio equipo usando un administrador de contraseñas o un generador criptográfico confiable.
2. En Supabase Dashboard, abre el proyecto correspondiente → **Edge Functions → Secrets** y guarda el valor bajo el nombre exacto `TALANA_BOT_SECRET`.
3. Guarda el mismo valor como secreto `TALANA_BOT_SECRET` en GitHub Actions. No lo pongas en `index.html`, JavaScript, el repositorio ni en el chat.
4. Confirma que la Edge Function `talana-bot-control` está desplegada y que su configuración usa ese mismo secreto.

El secreto de la función no es la contraseña de Talana: son valores diferentes. La URL de la función no es confidencial, pero debe guardarse como secreto en GitHub para simplificar la configuración.

## Antes de activar la automatización

La programación por sí sola no demuestra que el bot funcione. En la rama de integración deben estar incluidos el ejecutor de una sola corrida y el descargador completo `talana_downloader.py`; luego hay que probar el inicio de sesión, la descarga y la carga de archivos a Supabase Storage.

El workflow está preparado para buscar `bot_talana/agent_cloud.py`, `bot_talana/talana_downloader.py` y `bot_talana/requirements.txt`. Si falta alguno, no ejecutará la descarga. La ejecución automática se activa solo cuando los cambios estén en la rama por defecto.

## Qué se guarda
El cliente sube archivos de reporte originales al bucket privado de Supabase. No convierte automáticamente las filas de Excel en registros de las tablas de asistencia.
