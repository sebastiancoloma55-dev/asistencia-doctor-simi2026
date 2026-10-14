-- Required by the "Destinatarios y firma por sucursal" module.
-- Safe to run repeatedly; preserves all existing branch records.
ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS firma_correo text;

COMMENT ON COLUMN public.sucursales.firma_correo IS
  'Firma institucional utilizada en los borradores de correo de asistencia por sucursal.';
