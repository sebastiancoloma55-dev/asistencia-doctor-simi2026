# Programación en la nube del bot Talana

- Programación de referencia: una comprobación por hora, lunes a viernes.
- Ventana efectiva: 08:00 a 17:59, hora local de Santiago.
- Sábados, domingos y feriados: el guardia bloquea la ejecución.
- Si el servicio de feriados no responde, se omite la ejecución por seguridad.
- La ejecución manual de GitHub Actions también pasa por el mismo guardia horario/feriados.
- El cron de GitHub usa UTC; por eso la comprobación local con `America/Santiago` es la autoridad final.
- La programación usa GitHub Actions y no requiere tarjeta para crearla. La cuota gratuita puede limitar ejecuciones si se agotan los minutos disponibles.

## Estado de activación
El workflow comprueba si están presentes `bot_talana/agent_cloud.py` y `bot_talana/talana_downloader.py`. Mientras falte alguno, informa que no se hizo ninguna descarga. No debe considerarse el bot activado hasta incorporar el descargador real, configurar los secretos de GitHub/Supabase y validar una ejecución real.

## Secretos requeridos en GitHub Actions
En Settings → Secrets and variables → Actions, configurar:
- `TALANA_BOT_URL`: URL de la Edge Function de Supabase.
- `TALANA_BOT_SECRET`: secreto compartido con Supabase.
- `TALANA_USER`: usuario de Talana.
- `TALANA_PASSWORD`: contraseña de Talana.

Nunca guardar credenciales en archivos del repositorio ni enviarlas por chat.
