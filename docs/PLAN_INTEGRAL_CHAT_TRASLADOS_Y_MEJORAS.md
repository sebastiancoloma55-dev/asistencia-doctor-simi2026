# Plan integral: chat, traslados y modernización de Asistencia Doctor Simi 2026

## Alcance y regla de publicación
Los cambios nuevos se trabajan en `feature/talana-bot-integration` y en migraciones versionadas de Supabase. No se debe fusionar a `main` ni activar automatizaciones hasta validar permisos, consultas, pruebas y despliegue. El proyecto de traslados encontrado en los archivos es una aplicación independiente; sus datos no se deben enlazar directamente porque usa otra instancia de Supabase. Se reutilizan sus flujos y diseño, pero se almacenan en el proyecto principal.

## Implementado en la rama de trabajo
- Módulo 20: chat interno privado y grupal.
- Lista de conversaciones, mensajes en tiempo real, indicador de mensajes sin leer y marca de lectura.
- Adjuntos privados de hasta 10 MB (PDF, Word, Excel, CSV, TXT, JPG, PNG, WEBP), con enlaces firmados de corta duración.
- Tablas de chat protegidas con RLS; solo participantes autorizados pueden leer mensajes y adjuntos.
- Permisos administrativos configurables: `chat`, `traslados` y `traslados_aprobar`.
- Módulo 21: solicitudes de traslado con colaborador, origen, destino, fecha inicial/final o indefinido, motivo, estado y revisor.\n- Las coberturas temporales se envían a la bandeja de traslados para aprobar o rechazar; aprobar una cobertura no cambia la sucursal permanente del colaborador.\n- Búsqueda por nombre/RUT en el formulario de traslado y filtros por nombre/RUT/sucursal en la nómina de colaboradores.\n- Acceso rápido desde el directorio de sucursales a la nómina filtrada de esa sucursal.\n- Seguimiento de fecha y hora de cargas en hora de Chile para archivos manuales y del bot. Las referencias iniciales están etiquetadas como seguimiento iniciado cuando no se conoce la fecha histórica original.\n- Mapa de sucursales con marcadores GPS por defecto y línea orientativa al seleccionar origen y destino; Google Maps mantiene el cálculo vial real.\n- Tarjetas interactivas de vigencia de vacaciones, mejoras visuales en asistencia y un generador KPI de tareas con filtros y exportación CSV.\n- Centro de reportes ampliado con nómina, sucursales, coberturas, tareas, traslados, papeletas, trazabilidad, auditoría, documentos, importaciones, bot Talana, solicitudes, historial, gestiones de correo, metadatos de chat y notificaciones. No exporta el contenido privado de mensajes ni el cuerpo de los correos.\n- Eliminación de papeletas restringida en base de datos al superadministrador principal.
- Aprobación mediante RPC con control de permisos. Si el traslado aprobado está vigente, actualiza la sucursal del colaborador; si es futuro, queda programado.
- Proceso diario existente `api/cron-alertas.js` ampliado para aplicar traslados aprobados que alcancen su fecha de inicio.
- Notificaciones para nuevos mensajes, nuevas solicitudes de traslado y decisiones de aprobación.
- Migraciones versionadas, restricciones de fechas, registros de revisión y permisos de servidor.
- Comprobación sintáctica de los scripts JavaScript afectados y comprobación de presencia de las tablas en Supabase. Esto no equivale a una prueba integral en navegador.

## Ideas del informe y del proyecto ZIP: estado de trabajo

### P0 — Seguridad e integridad (antes de producción)
- [x] Aplicar RLS a las nuevas tablas de chat y traslados.
- [x] Mantener adjuntos en un bucket privado con control por participantes.
- [x] Limitar la aprobación de traslados a permiso específico.
- [ ] Ejecutar pruebas de acceso positivo y negativo con cuentas reales de cada rol.\n- [x] Prueba transaccional reversible de aprobación de traslado permanente (actualiza maestro) y cobertura temporal (no cambia sucursal permanente).
- [ ] Auditar RLS de todas las tablas existentes y endpoints, no solo de los módulos nuevos.
- [ ] Probar importaciones con duplicados, fechas inválidas, turnos nocturnos y archivos parcialmente incorrectos.
- [ ] Confirmar restauración de backup y plan de reversión.

### P1 — Operación diaria
- [x] Chat interno con participantes autorizados, lectura y adjuntos privados.
- [x] Solicitudes de traslados, aprobación/rechazo e historial de estado.
- [x] Notificaciones para eventos de chat y traslados.
- [ ] Bandeja unificada de aprobaciones: tareas por validar, vacaciones, permisos, coberturas, correcciones y traslados.
- [x] Historial automático de cambios del maestro de colaborador (RUT, nombres, cargo, sucursal, estado y fecha de ingreso), con usuario y fecha; consulta por RUT.
- [ ] Conciliación de asistencia contra turno programado y bandeja de excepciones.
- [x] Calendario de solicitudes y traslados aprobados para los próximos 90 días, más resumen de dotación activa y movimientos por sucursal.\n- [ ] Ampliar el calendario para incluir turnos, ausencias, coberturas, feriados y vencimientos.
- [x] Búsqueda por nombre/RUT en colaboradores y traslados; acceso desde sucursal a nómina filtrada.\n- [x] Tarjetas de vacaciones interactivas, mapa con sucursales GPS por defecto y mejoras visuales en asistencia/traslados.\n- [ ] Completar paginación, pruebas de accesibilidad y navegación móvil.
- [ ] Completar auditoría de cambios críticos con actor, hora, objeto y resultado.

### P2 — Planificación y automatización
- [ ] Planificación de dotación por sucursal y turno: requerido vs. disponible, déficit y propuesta de cobertura.
- [ ] Documentos laborales con vencimientos, permisos y alertas.
- [ ] Portal de solicitudes para que el colaborador solicite vacaciones, permisos y correcciones y consulte el estado.
- [x] Centro de reportes con datasets de los módulos disponibles, filtros por período/sucursal y Excel/CSV/ZIP/PDF.\n- [ ] Reportes programados con destinatarios autorizados, formato, período y registro de ejecución.
- [x] Generador de KPI de tareas con filtros por fecha/sucursal, métricas de cumplimiento y exportación CSV.\n- [ ] Definir fórmulas oficiales de KPI, fecha de corte y señal de datos incompletos.
- [x] Vista de calendario y resumen de dotación actual/movimientos entrantes y salientes por sucursal.\n- [ ] Ampliar el proyecto de traslados con calendario mensual, filtros por supervisor/sucursal, control de solapamientos y exportación.

### P3 — Analítica y conocimiento
- [ ] Indicadores históricos comparables por sucursal, período y tipo de incidencia.
- [ ] Auditoría avanzada con filtros, exportación controlada y alertas de actividad inusual.
- [ ] Base de conocimiento con procedimientos y plantillas versionadas por rol.
- [ ] Definir qué datos pueden salir a servicios externos de IA o geocodificación.
- [ ] Medir rendimiento, tiempos de carga, errores de importación y cumplimiento de KPI.

## Criterios para dar por terminado el trabajo
1. Cada módulo nuevo se ve solo a los usuarios autorizados y las mismas reglas se aplican en base de datos.
2. Dos usuarios no participantes no pueden consultar mensajes ni adjuntos de una conversación privada.
3. Los traslados se pueden crear, revisar y auditar; los traslados futuros se aplican en su fecha sin duplicarse.
4. El cron diario está configurado y ejecuta el proceso con variables de servidor válidas.
5. La aplicación inicia sesión y navega sin carga infinita; se comprueba en móvil y escritorio.
6. Las migraciones y pruebas pasan en la rama y el despliegue de Vercel se confirma antes de fusionar a `main`.

## Nota de honestidad técnica
La creación de tablas y políticas en Supabase y la validación sintáctica de JavaScript sí se comprobaron. Se probaron por transacción reversible las reglas de aprobación de traslado permanente y cobertura temporal. Aún falta una prueba funcional completa en navegador con varias cuentas reales, subida/descarga real de adjuntos y confirmar el despliegue de esta rama en producción. Los puntos marcados como pendientes no deben considerarse terminados.
