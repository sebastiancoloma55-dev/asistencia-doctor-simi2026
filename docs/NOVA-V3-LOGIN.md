# NOVA V3 — acceso de Recursos Humanos

## Objetivo
Reemplazar el login anterior por una identidad visual original para la plataforma interna de RR. HH. de Farmacias de Similares Chile, manteniendo la autenticación real de Supabase y los identificadores consumidos por el código existente.

## Cambios
- Nueva composición visual oscura en tonos grafito y verde turquesa, sin reutilizar la tarjeta morada del diseño anterior.
- Escena orbital animada con capas de profundidad y tarjetas flotantes para Asistencia, Personas y Operaciones.
- Formulario adaptativo con estados de foco, error, carga y envío.
- Compatibilidad con movimiento reducido y mejoras de foco visible/teclado.
- Recordar correo corporativo opcional. Solo se guarda el correo en el almacenamiento local del navegador; nunca se guarda la contraseña.
- Conserva los IDs de autenticación existentes: `login-overlay`, `login-email`, `login-pass`, `login-remember`, `login-error` y `btn-login`.
- Mantiene la función de recuperación de contraseña existente.

## Archivos
- `index.html`: interfaz NOVA V3 y estilos responsivos.
- `js/app-core.js`: estado de carga de autenticación y recordar correo.
- `scripts/validate-structure.mjs`: validaciones estructurales del nuevo login.
- `supabase/functions/talana-bot-control/`: fuente del bot de Talana, sin despliegue nuevo como parte del cambio visual.
- `supabase/migrations/20261011120000_talana_importer_privileges_and_key_contract.sql`: migración existente de permisos del importador, pendiente de validación/aplicación independiente.

## Publicación
Estos cambios se guardan en la rama `fix/ui-layout-login-polish-20261011` y no se fusionan automáticamente con `main`. No se publicó el frontend ni se desplegó una nueva versión de Edge Functions. La función activa de Talana y su base de datos no se modificaron por esta actualización visual.

## Validaciones recomendadas antes de publicar
1. Ejecutar `npm run check`.
2. Probar acceso válido e inválido con cuentas de prueba.
3. Probar recordar/desmarcar correo, recuperación de contraseña y cierre de sesión.
4. Verificar diseño a 1440 px, 1024 px, 390 px y con altura de pantalla reducida.
5. Confirmar que el logo `/doctor-simi-logo.jpg` se sirve correctamente desde el despliegue.
