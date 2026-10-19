# Plan de hardening OWASP Top 10 — 2025

## Cambios incluidos en esta rama
- Migración SQL propuesta para retirar políticas RLS abiertas en auditoría, coberturas, papeletas y vacaciones, y combinar permiso de módulo + alcance de sucursal en una sola política por operación.
- Cabeceras de seguridad en Vercel: nosniff, anti-framing, política de referrer, HSTS y restricción de cámara/micrófono.
- No se incluye CSP estricta todavía: la aplicación usa scripts/estilos inline y dependencias externas; una CSP se debe diseñar después de inventariar y fijar los orígenes permitidos para evitar romper módulos.

## Riesgos priorizados
1. Broken Access Control: políticas RLS permisivas se combinan con OR; una policy USING/WITH CHECK true puede neutralizar controles más específicos.
2. Security Misconfiguration: faltaban cabeceras de respuesta.
3. Software Supply Chain: inventariar CDN, scripts externos y referencias de versión flotante; fijar versiones y añadir SRI cuando aplique.
4. Cryptographic Failures: revisar manejo de secretos, datos sensibles y almacenamiento; no introducir claves privilegiadas en frontend.
5. Injection: revisar cada uso de innerHTML y asegurar que datos de usuarios se insertan como texto o se sanitizan con una biblioteca mantenida.
6. Insecure Design: documentar autorización por módulo y sucursal como regla común.
7. Authentication Failures: probar cuentas desactivadas, cierre/invalidez de sesión y protección de endpoints administrativos.
8. Software/Data Integrity: verificar integridad de dependencias y artefactos de despliegue.
9. Logging/Alerting: mantener bitácora no editable por usuarios ordinarios y verificar que eventos de seguridad se registran sin secretos.
10. Exceptional Conditions: comprobar errores, límites, validación de métodos, entradas y respuestas API.

## Verificación antes de producción
- [ ] Ejecutar scripts/validate-structure.mjs.
- [ ] Aplicar la migración primero en una base de pruebas o staging.
- [ ] Probar perfiles administrador, RR. HH., supervisor de sucursal y usuario sin permisos.
- [ ] Verificar acceso a sucursal autorizada y rechazo de sucursal no asignada.
- [ ] Confirmar que auditoría solo la lee quien tiene permiso y que solo el administrador principal puede editar/borrar.
- [ ] Confirmar los flujos de cobertura, papeletas y vacaciones con usuarios reales de prueba.
- [ ] Revisar cabeceras HTTP de la URL Preview.
- [ ] Ejecutar pruebas de regresión de los módulos antes de cualquier despliegue productivo.

## Límite de esta entrega
La migración queda versionada en una rama de trabajo; no se ejecuta automáticamente contra Supabase. La seguridad de las APIs, las dependencias y los usos de HTML dinámico requiere revisión adicional y pruebas específicas antes de declarar cerrado OWASP Top 10.

## Hallazgos adicionales de los asesores de Supabase (19-10-2026)
- **Alta prioridad:** las políticas RLS permisivas en auditoría, coberturas, papeletas y vacaciones permiten que políticas separadas se combinen mediante OR; la migración propuesta las consolida por operación.
- **Funciones SECURITY DEFINER:** el asesor reporta 24 funciones ejecutables por authenticated. No se deben revocar en bloque: varias son RPC intencionales y validan permisos dentro del cuerpo. Hay que revisar individualmente su autorización y search_path.
- **Funciones trigger:** `notificar_asignacion_tarea()` y `tg_auditar_envio_licencia_manual()` son handlers de trigger, no endpoints RPC de negocio. La migración propuesta fija su search_path vacío porque sus referencias a tablas están calificadas por esquema.
- **Recordatorios de tareas:** `tareas_recordatorios` tiene RLS habilitado y ninguna política. Eso deniega acceso a los roles API ordinarios; puede ser correcto si solo escribe un trigger/servidor. Verificar el flujo antes de añadir políticas.
- **Protección de contraseñas filtradas:** está desactivada en Supabase Auth. Requiere habilitarla en la configuración de Auth del proyecto y comprobar el impacto sobre altas y cambios de contraseña.
- **Rendimiento:** el asesor encontró cinco claves foráneas sin índice. Son optimizaciones, no correcciones de seguridad; añadir índices tras confirmar el volumen y los planes de consulta.


## Correcciones adicionales de hardening (19-10-2026)
- El middleware de autorización ahora falla de forma cerrada: solo permite continuar cuando `usuarios_roles.activo` es explícitamente `true`; valores nulos o ausentes no conceden acceso.
- La API administrativa de usuarios ya no devuelve al cliente los mensajes de error de Supabase ni detalles internos; los detalles permanecen en logs del servidor.
- La API de geocodificación limita la caché en memoria a 300 entradas y cancela consultas al proveedor después de 8 segundos, reduciendo riesgo de consumo descontrolado de memoria y solicitudes colgadas.
- Vercel añade `X-Permitted-Cross-Domain-Policies: none` y `X-DNS-Prefetch-Control: off`; los validadores estáticos comprueban también estas cabeceras y las nuevas protecciones.
- No se agregó una CSP estricta porque el sitio todavía depende de scripts/estilos inline y CDNs; una política incorrecta puede romper el login y los módulos. Requiere inventario de orígenes y una fase de pruebas específica.
- GitHub Actions permanecía en estado `queued` en la última consulta; por ello no se declara la CI aprobada. La compilación/preview de Vercel también debe terminar y probarse manualmente.


## Incidencia de timeout en Licencias y Ausentismo (19-10-2026)
- Diagnóstico de solo lectura: `public.licencias_medicas` contiene 40.589 filas. El administrador principal evita el filtro por sucursal, mientras que los usuarios normales están sujetos a una política RLS que llama a `private.usuario_puede_ver_sucursal(NULL::uuid, sucursal)` por fila.
- La lectura del módulo solicita todas las columnas y recorre el histórico completo en páginas de 1.000 filas. Esto aumenta el trabajo bajo RLS y concuerda con el timeout observado para usuarios con alcance limitado.
- Se preparó `20261019130000_optimize_licencias_rls_timeout.sql`: calcula las sucursales visibles como una lista por sentencia, combina permiso de módulo y alcance en políticas explícitas para SELECT/INSERT/UPDATE/DELETE, y agrega un índice por `lower(btrim(sucursal))`.
- La migración NO se ha aplicado a la base activa. Debe probarse con una cuenta no administradora y una cuenta con acceso global antes de producción, porque modifica políticas de autorización.
- En el commit de esta migración, las validaciones automáticas de aplicación, proyecto y OWASP terminaron correctamente; esto valida estructura estática, no prueba la política contra usuarios reales.

No se ha aplicado esta migración ni cambiado configuración de Auth en el proyecto activo.
