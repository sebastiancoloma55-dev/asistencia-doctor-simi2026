/**
 * Stable natural keys for Talana imports.
 * Keys ignore mutable end dates and normalize RUT/date/text representations
 * so XLSX strings and PostgreSQL text/date serializations compare consistently.
 */
export const IMPORT_KEY_FIELDS = Object.freeze({
  ausentismos_historico: Object.freeze(["rut", "fecha_inicio", "tipo_ausencia"]),
  solicitudes_vacaciones_historicas: Object.freeze(["rut", "fecha_inicio", "tipo_vacaciones"]),
  maestro_empleado: Object.freeze(["rut"]),
  reporte_jornadas_asistencia: Object.freeze(["rut", "fecha"]),
});

export function normalizeImportValue(value) {
  let normalized = String(value ?? "").trim().toLowerCase();
  // PostgreSQL text columns may contain ISO timestamps while XLSX has a date.
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/);
  if (iso) {
    normalized = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  } else {
    const dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
    if (dmy) normalized = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  normalized = normalized.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/\s+/g, " ");
}

export function normalizeImportRut(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[.\s]/g, "")
    .replace(/[‐‑‒–—]/g, "-");
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
