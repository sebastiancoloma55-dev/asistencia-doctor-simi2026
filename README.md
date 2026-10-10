# Asistencia Doctor Simi · RR. HH.

Plataforma web interna para apoyar la operación de Asistencia y Ausentismo, con interfaz web, autenticación de Supabase, base de datos central y funciones de servidor en Vercel.

## Arquitectura actual

- `index.html`: estructura de la interfaz y estilos.
- `js/app-config.js`: configuración del cliente, variables globales y catálogo de módulos.
- `js/app-core.js`: utilidades, autenticación, permisos, navegación, buscador global, centro de operaciones, notificaciones y paneles administrativos.
- `js/attendance-leave.js`: asistencia, atrasos y licencias médicas.
- `js/workflows.js`: vacaciones, papeletas, reportes, usuarios y auditoría.
- `js/maps-communications.js`: mapas, sucursales, correo, coberturas y análisis con IA.
- `js/people-directory.js`: colaboradores y directorio de sucursales.
- `api/usuarios-auth.js`: operaciones de administración de cuentas, reservadas a la cuenta administradora principal.
- `api/gemini.js`: análisis asistido por IA. Requiere sesión válida y permiso de reportes.
- `api/geocodificar.js`: búsqueda de coordenadas. Requiere sesión válida y permiso de mapas.
- `api/cron-alertas.js`: proceso programado que genera notificaciones para tareas vencidas o próximas a vencer.
- `lib/server-auth.js`: validación compartida de sesión, perfil activo y permisos para endpoints del servidor.

Los archivos JavaScript se cargan como scripts clásicos en el orden definido en `index.html`; se están separando por dominio funcional para facilitar mantenimiento sin cambiar de golpe el comportamiento existente.
- `vercel.json`: programación del proceso de alertas.
- Supabase: autenticación, datos, políticas RLS y almacenamiento persistente.

## Módulos de la aplicación

1. Dashboard
2. Colaboradores
3. Sucursales
4. Asistencia y atrasos
5. Licencias y ausentismo
6. Vacaciones
7. Papeletas
8. Borradores de correo
9. Coberturas
10. Reportes
11. Usuarios y roles
12. Auditoría
13. Correos sucursales
14. Mapa y distancias
15. Tareas diarias
16. Centro de operaciones
17. Calidad de datos (administrador principal)
18. Notificaciones
19. Integraciones y monitoreo (administrador principal)

El centro de operaciones consulta indicadores de las fuentes que el perfil tenga autorizadas. La bandeja de notificaciones utiliza la tabla `notificaciones`; su acceso depende del permiso de tareas y de las políticas RLS.

## Variables de entorno de Vercel

Configurar en el proyecto de Vercel (no en el navegador):

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_ANON_KEY`: clave pública/anon para validar sesiones en servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privilegiada usada exclusivamente en funciones de servidor.
- `GEMINI_API_KEY`: clave del proveedor de IA.
- `CRON_SECRET`: secreto que autoriza las llamadas al endpoint de alertas.

No publicar valores de estas variables en commits, capturas, archivos descargables ni código frontend. Si una clave privilegiada se expone accidentalmente, rotarla en el proveedor correspondiente.

## Integraciones: alcance confirmado

- **Supabase:** la aplicación consulta la base central. La pantalla de monitoreo prueba una consulta real durante la sesión.
- **IA:** existe una función de servidor para Gemini; requiere variable de entorno y permiso de reportes.
- **Geocodificación:** existe una función de servidor para buscar coordenadas; requiere permiso de mapas y disponibilidad del proveedor.
- **Talana:** este repositorio no contiene actualmente un conector automático dedicado de sincronización. Requiere acceso a API oficial, autorización y credenciales de servidor.
- **IMED / Medipass:** no se ha identificado un conector automático dedicado en este repositorio. La sincronización no debe considerarse operativa sin una prueba real de extremo a extremo.
- **Outlook:** la aplicación puede preparar/exportar borradores para abrirlos en Outlook. Eso no equivale a envío automático ni confirma entrega.

## Despliegue y validación

1. Mantener los cambios en GitHub y comprobar que Vercel termine el despliegue.
2. Iniciar sesión con una cuenta de prueba y verificar que el menú respete sus permisos.
3. Confirmar que los módulos 16 y 18 muestran únicamente datos accesibles para esa cuenta.
4. Probar el módulo 17 con la cuenta administradora principal y comprobar que las cifras de calidad coincidan con Supabase.
5. En el módulo 19, distinguir la conexión comprobada en vivo de las rutas que solo están presentes en el código.
6. Probar los endpoints de IA y geocodificación con un usuario autorizado y otro sin permiso; el segundo debe recibir 403.
7. Revisar la consola del navegador, registros de Vercel y errores de Supabase.
8. No realizar pruebas destructivas con datos laborales reales; usar registros de prueba o un entorno separado.

## Próximas mejoras técnicas recomendadas

- Seguir dividiendo los módulos funcionales grandes en componentes y servicios reutilizables, manteniendo pruebas de regresión para cada cambio.
- Añadir pruebas automatizadas de permisos, cálculos, filtros, exportaciones y flujos críticos.
- Crear un entorno de staging y un procedimiento de reversión.
- Verificar copias de seguridad y restauración.
- Añadir límites de uso y métricas de errores a las integraciones externas.
- Implementar sincronización Talana e IMED solo con API oficial, autorización y validación de datos.
- Añadir generación automática de tareas recurrentes si se requiere que la recurrencia cree instancias, ya que registrar la recurrencia no es lo mismo que ejecutar el calendario.
- Revisar periódicamente las políticas RLS y validar cada perfil con pruebas de acceso positivo y negativo.
