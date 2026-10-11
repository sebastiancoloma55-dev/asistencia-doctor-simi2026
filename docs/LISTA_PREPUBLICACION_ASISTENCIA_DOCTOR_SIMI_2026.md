# Lista de verificación previa a publicación — Asistencia Doctor Simi 2026

Estado del documento: **revisión previa; no autoriza el despliegue**.

Este proyecto solo debe considerarse listo cuando estén aprobados los checks del PR, se aplique el cambio de base de datos correspondiente, la Edge Function actualizada se despliegue con sus dependencias y se complete una ejecución real de extremo a extremo. La validación estática por sí sola no demuestra que Talana pueda descargar los cuatro reportes en la sesión real.

## 1. Código e interfaz

- [ ] El PR de la rama de trabajo fue revisado.
- [ ] Los workflows **Validar aplicación** y **Validación del proyecto RRHH** terminan en verde en el último commit del PR.
- [ ] El login, la barra superior, las notificaciones, el buscador, el selector de apariencia y la navegación lateral se prueban en navegador.
- [ ] Se confirma que la distribución y el orden de los módulos se mantienen y que la firma «Gestionado por el equipo de Asistencia» queda visible en el pie del menú sin tapar datos.
- [ ] Revisar el diseño en claro/oscuro, y en escritorio/tablet/móvil.
- [ ] Revisar con una cuenta administradora y una cuenta con permisos limitados, sin conceder permisos adicionales.

## 2. Supabase: cambio pendiente de aplicar

La migración añadida en esta rama es:

`supabase/migrations/20261011120000_talana_importer_privileges_and_key_contract.sql`

Incluye permisos de servidor limitados para `service_role` en las tablas necesarias para la importación y permisos de uso de secuencias identity. **La migración está versionada en esta rama, pero no se ha aplicado a la base de datos activa.** Antes de aplicarla, comparar con la migración registrada y seguir el proceso de cambios de base de datos aprobado para evitar ejecutar migraciones pendientes ajenas a este PR.

No se añade acceso `anon` a estas tablas.

## 3. Talana y la Edge Function

El importador alineó sus claves de comparación con los índices únicos que existen en Supabase:

| Reporte Talana | Tabla destino | Clave usada |
| --- | --- | --- |
| Detalle Ausentismos histórico | `licencias_medicas` | RUT + inicio + fin + tipo de ausencia |
| Detalle solicitudes de vacaciones históricas | `vacaciones_historico` | RUT + inicio + fin + tipo de vacaciones |
| Maestro empleado | `colaboradores` | RUT |
| Reporte de Jornadas | `registros_asistencia` | RUT + fecha |

Esto corrige la discrepancia detectada en los logs de vacaciones (respuestas HTTP 409) y evita usar `fecha_solicitud` o `turno` como parte de claves que no coinciden con los índices reales. Si una clave necesaria llega incompleta, la fila se rechaza para no crear coincidencias falsas.

Antes del despliegue, confirmar que la Edge Function `talana-bot-control` incluya el archivo auxiliar `supabase/functions/talana-bot-control/import_keys.js`. La función y su archivo auxiliar deben publicarse juntos como una única versión coherente.

### Secretos y permisos externos que hay que comprobar sin mostrarlos

- En Supabase Edge Functions: `TALANA_BOT_SECRET` y `GITHUB_ACTIONS_TOKEN`.
- En los secretos del repositorio de GitHub Actions: `TALANA_BOT_URL`, `TALANA_BOT_SECRET`, `TALANA_USER` y `TALANA_PASSWORD`.
- Confirmar que el token de GitHub permita ejecutar el workflow `talana-hourly.yml`.
- No pegar claves, contraseñas ni tokens en logs, capturas o tickets.

No se puede comprobar por lectura del repositorio que todos esos secretos estén configurados ni que las credenciales actuales de Talana permitan iniciar sesión.

### Prueba funcional obligatoria

- [ ] Ejecutar manualmente el bot desde el panel de RR. HH. en una ventana autorizada.
- [ ] Confirmar que se descarguen los cuatro reportes y que se guarden en el almacenamiento privado.
- [ ] Confirmar que cada reporte se importe en su tabla destino y que se registre su estado y el conteo de insertados/actualizados/omitidos/fallidos.
- [ ] Ejecutar una segunda vez con los mismos datos y confirmar que no cree duplicados.
- [ ] Verificar que un cambio de una fila existente actualice el registro correspondiente.
- [ ] Investigar y corregir cualquier error en el reporte de Jornadas si vuelve a aparecer «No se encontró el control de descarga»; esa interacción depende de la pantalla real de Talana y todavía necesita prueba de navegador.

## 4. Vercel y publicación web

En la revisión actual, Vercel devolvió el estado **“Deployment rate limited — retry in 24 hours”**. Es un bloqueo de cuota de compilación, no una demostración de que el código esté roto. Hasta que Vercel permita una vista previa, la interfaz no se ha podido verificar visualmente en la versión construida de este PR.

- [ ] Esperar a que se libere el límite de compilación de Vercel.
- [ ] Generar y abrir una vista previa de la rama/PR.
- [ ] Resolver errores de consola, desbordamientos y problemas responsive antes de fusionar/publicar.
- [ ] Verificar la autenticación real, permisos, persistencia de preferencias y consultas Supabase en la vista previa.

## 5. Qué está validado y qué no

**Validado por CI:** comprobaciones de estructura/permisos, sintaxis de JavaScript, tests del parser Python, nuevos tests de claves naturales y compilación de sintaxis de la Edge Function.

**Pendiente de evidencia real:** ejecución del último commit de CI, renderizado real en navegador (limitado por Vercel), descarga de Jornadas en la sesión actual de Talana, importación completa con la versión nueva de Edge Function y verificación posterior de duplicados, secretos y cuentas con diferentes permisos.

No marcar como «listo para producción» hasta que todos los puntos obligatorios anteriores estén confirmados.
