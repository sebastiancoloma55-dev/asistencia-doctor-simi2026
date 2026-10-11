-- Mi espacio de trabajo RR. HH.: notas adhesivas persistentes y bitácora privada/compartida.
-- Additivo y aislado: no altera datos ni políticas de módulos existentes.

CREATE TABLE IF NOT EXISTS public.rrhh_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_email text NOT NULL DEFAULT '',
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 160),
  contenido text NOT NULL DEFAULT '' CHECK (char_length(contenido) <= 12000),
  categoria text NOT NULL DEFAULT 'General' CHECK (categoria IN ('General','Seguimiento','Asistencia','Licencias','Cobertura','Sucursal','Reunión','Urgente')),
  color text NOT NULL DEFAULT 'amarillo' CHECK (color IN ('amarillo','menta','celeste','lila','rosa','neutro')),
  fijada boolean NOT NULL DEFAULT false,
  visibilidad text NOT NULL DEFAULT 'PERSONAL' CHECK (visibilidad IN ('PERSONAL','COMPARTIDA')),
  estado text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','RESUELTA','ARCHIVADA')),
  vence_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rrhh_notas_user_updated
  ON public.rrhh_notas(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrhh_notas_shared_updated
  ON public.rrhh_notas(visibilidad, estado, updated_at DESC);

ALTER TABLE public.rrhh_notas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrhh_notas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrhh_notas TO authenticated;

DROP POLICY IF EXISTS rrhh_notas_select_2026 ON public.rrhh_notas;
CREATE POLICY rrhh_notas_select_2026
  ON public.rrhh_notas FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      visibilidad = 'COMPARTIDA'
      AND (public.usuario_es_admin_principal_2026()
        OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[]))
    )
  );

DROP POLICY IF EXISTS rrhh_notas_insert_2026 ON public.rrhh_notas;
CREATE POLICY rrhh_notas_insert_2026
  ON public.rrhh_notas FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      visibilidad = 'PERSONAL'
      OR public.usuario_es_admin_principal_2026()
      OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[])
    )
  );

DROP POLICY IF EXISTS rrhh_notas_update_2026 ON public.rrhh_notas;
CREATE POLICY rrhh_notas_update_2026
  ON public.rrhh_notas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.usuario_es_admin_principal_2026()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      visibilidad = 'PERSONAL'
      OR public.usuario_es_admin_principal_2026()
      OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[])
    )
  );

DROP POLICY IF EXISTS rrhh_notas_delete_2026 ON public.rrhh_notas;
CREATE POLICY rrhh_notas_delete_2026
  ON public.rrhh_notas FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.usuario_es_admin_principal_2026());

CREATE TABLE IF NOT EXISTS public.rrhh_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_email text NOT NULL DEFAULT '',
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 180),
  detalle text NOT NULL CHECK (char_length(btrim(detalle)) BETWEEN 1 AND 16000),
  categoria text NOT NULL DEFAULT 'Gestión' CHECK (categoria IN ('Gestión','Incidencia','Seguimiento','Decisión','Reunión','Cobertura','Asistencia','Licencias','Otro')),
  modulo text NOT NULL DEFAULT 'general' CHECK (modulo IN ('general','dashboard','colaboradores','sucursales','asistencia','licencias','vacaciones','papeletas','correos','amonestaciones','reportes','usuarios','auditoria','configcorreos','mapas','tareas','operaciones','calidad','notificaciones','integraciones','chat','traslados')),
  sucursal text NOT NULL DEFAULT '' CHECK (char_length(sucursal) <= 180),
  ocurrio_en timestamptz NOT NULL DEFAULT now(),
  visibilidad text NOT NULL DEFAULT 'PERSONAL' CHECK (visibilidad IN ('PERSONAL','COMPARTIDA')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rrhh_bitacora_user_event
  ON public.rrhh_bitacora(user_id, ocurrio_en DESC);
CREATE INDEX IF NOT EXISTS idx_rrhh_bitacora_shared_event
  ON public.rrhh_bitacora(visibilidad, ocurrio_en DESC);

ALTER TABLE public.rrhh_bitacora ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrhh_bitacora FROM anon;
GRANT SELECT, INSERT ON public.rrhh_bitacora TO authenticated;

DROP POLICY IF EXISTS rrhh_bitacora_select_2026 ON public.rrhh_bitacora;
CREATE POLICY rrhh_bitacora_select_2026
  ON public.rrhh_bitacora FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      visibilidad = 'COMPARTIDA'
      AND (public.usuario_es_admin_principal_2026()
        OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[]))
    )
  );

DROP POLICY IF EXISTS rrhh_bitacora_insert_2026 ON public.rrhh_bitacora;
CREATE POLICY rrhh_bitacora_insert_2026
  ON public.rrhh_bitacora FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      visibilidad = 'PERSONAL'
      OR public.usuario_es_admin_principal_2026()
      OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[])
    )
  );

COMMENT ON TABLE public.rrhh_notas IS 'Notas adhesivas de RR. HH. con ámbito personal/compartido y metadatos de seguimiento.';
COMMENT ON TABLE public.rrhh_bitacora IS 'Registro cronológico inmutable de gestiones operativas de RR. HH. con acceso personal/compartido.';
