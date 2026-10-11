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
- [ ] Revisar el resumen operativo nuevo del Dashboard: tareas abiertas/vencidas, dotación pendiente, avisos y salud del bot. Los fallos de consulta deben aparecer como “No disponible”, no como cero.
- [ ] Probar los filtros de cobertura/dotación por texto, estado y rango de fechas; confirmar que se actualizan los conteos y que limpiar filtros restaura la lista.
- [ ] Confirmar que el panel Talana muestra estado de última ejecución, archivos relacionados, duración y detalle del último error sin exponer secretos.
- [ ] Cambiar repetidamente de módulos; la navegación debe seguir respondiendo sin mensajes tardíos de error de un módulo anterior.
- [ ] Verificar la animación breve de entrada en el cambio de módulo y comprobar que con “reducir movimiento” del sistema no se anima.
- [ ] Probar el Dashboard, la cobertura y el panel Talana en escritorio, tablet y móvil, incluidos anchos de 320–420 px.

## 2. Supabase: migración aplicada y versionada

La función talana-bot-control está activa en la versión **14**. Las tablas de notas/bitácora también están creadas con RLS.

La concesión de permisos service_role del importador se aplicó directamente al proyecto y Supabase la registra con la versión **20261011073437**. El repositorio ahora usa el mismo identificador en:

supabase/migrations/20261011073437_talana_importer_privileges_and_key_contract_20261011.sql

La migración concede SELECT, INSERT y UPDATE solamente a service_role en las tablas necesarias para la importación y uso de secuencias de identidad. No agrega acceso a anon. Se eliminó el nombre alternativo con marca horaria distinta para no duplicar la misma operación durante una publicación futura.

Antes de fusionar, confirma que el repositorio contiene esta única versión de la migración y no ejecutes manualmente de nuevo el mismo bloque de permisos.

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

### Estado verificado del bot al 11 de octubre de 2026

- La configuración de Supabase está habilitada, en modo automático/manual y con frecuencia de 60 minutos. La lista de reportes se actualizó a los cuatro tipos: ausentismos históricos, vacaciones históricas, maestro de empleado y jornadas/asistencia.
- Las comprobaciones de permisos a nivel de PostgreSQL confirman que service_role tiene SELECT/INSERT/UPDATE sobre vacaciones históricas y permisos de escritura en las tablas importadas, con uso de secuencias.
- La última ejecución registrada sigue siendo parcial y es anterior a la aplicación de los permisos del importador. Los fallos registrados incluían permiso denegado para vacaciones/maestro y que el flujo de Talana no identificó el control de descarga de Jornadas.
- Por lo tanto, los permisos de base de datos están corregidos, pero **la importación completa de los cuatro archivos aún no está certificada**. La siguiente ejecución manual debe confirmar el funcionamiento después de esos cambios sin asumir éxito por la sola validación estática.

### Prueba funcional obligatoria

- [ ] Ejecutar manualmente el bot desde el panel de RR. HH. en una ventana autorizada.
- [ ] Confirmar que se descarguen los cuatro reportes y que se guarden en el almacenamiento privado.
- [ ] Confirmar que cada reporte se importe en su tabla destino y que se registre su estado y el conteo de insertados/actualizados/omitidos/fallidos.
- [ ] Ejecutar una segunda vez con los mismos datos y confirmar que no cree duplicados.
- [ ] Verificar que un cambio de una fila existente actualice el registro correspondiente.
- [ ] Investigar y corregir cualquier error en el reporte de Jornadas si vuelve a aparecer «No se encontró el control de descarga»; esa interacción depende de la pantalla real de Talana y todavía necesita prueba de navegador.

## 4. Vercel y publicación web

En la revisión actual, Vercel devolvió **“Deployment rate limited — retry in 24 hours”** y la autorización conectada no permite administrar el equipo simi23. Como alternativa, Cloudflare Pages generó una vista previa exitosa del último commit validado 8e55170: https://41928d1f.asistencia-doctor-simi-preview.pages.dev. Vercel debe revisarse por separado antes de fusionar o decidir el proveedor final.

- [ ] Esperar a que se libere el límite de compilación de Vercel.
- [ ] Generar y abrir una vista previa de la rama/PR.
- [ ] Resolver errores de consola, desbordamientos y problemas responsive antes de fusionar/publicar.
- [ ] Verificar la autenticación real, permisos, persistencia de preferencias y consultas Supabase en la vista previa.

## 5. Qué está validado y qué no

**Validado por CI:** comprobaciones de estructura/permisos, sintaxis de JavaScript, tests del parser Python, nuevos tests de claves naturales y compilación de sintaxis de la Edge Function.

**Pendiente de evidencia real:** ejecución del último commit de CI, renderizado real en navegador (limitado por Vercel), descarga de Jornadas en la sesión actual de Talana, importación completa con la versión nueva de Edge Function y verificación posterior de duplicados, secretos y cuentas con diferentes permisos.

No marcar como «listo para producción» hasta que todos los puntos obligatorios anteriores estén confirmados.
