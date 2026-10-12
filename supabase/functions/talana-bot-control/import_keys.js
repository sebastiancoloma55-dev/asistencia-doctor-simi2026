/**
 * Natural keys for Talana imports.
 *
 * These keys intentionally match the unique indexes in Supabase:
 * Matching keys identify a continuing record, not every mutable field.
 * - licencias_medicas: (rut, fecha_inicio, tipo_ausencia)
 * - vacaciones_historico: (rut, fecha_inicio, tipo_vacaciones)
 * - registros_asistencia: (rut, fecha)
 * Database unique indexes remain stricter and are still respected on insert.
 * - registros_asistencia: (rut, fecha)
 * - colaboradores: (rut)
 */
export const IMPORT_KEY_FIELDS = Object.freeze({
  ausentismos_historico: Object.freeze(["rut", "fecha_inicio", "tipo_ausencia"]),
  solicitudes_vacaciones_historicas: Object.freeze(["rut", "fecha_inicio", "tipo_vacaciones"]),
  maestro_empleado: Object.freeze(["rut"]),
  reporte_jornadas_asistencia: Object.freeze(["rut", "fecha"]),
});

export function normalizeImportValue(value) {
  let normalized = String(value ?? "").trim().toLowerCase();
  const dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    normalized = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return normalized.replace(/\s+/g, " ");
}

export function normalizeImportRut(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[.\s]/g, "");
}

export function importKeyFields(reportType) {
  return IMPORT_KEY_FIELDS[reportType] ?? null;
}

export function importStableKey(reportType, row) {
  const fields = importKeyFields(reportType);
  if (!fields || !row || typeof row !== "object") return null;

  const values = [];
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined || String(value).trim() === "") return null;
    values.push(field === "rut" ? normalizeImportRut(value) : normalizeImportValue(value));
  }
  if (values.some((value) => !value)) return null;
  return values.join("|");
}
