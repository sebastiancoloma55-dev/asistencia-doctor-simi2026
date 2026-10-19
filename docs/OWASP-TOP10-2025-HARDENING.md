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
