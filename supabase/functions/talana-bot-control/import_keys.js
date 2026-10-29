/**
 * Stable natural keys for Talana imports.
 * Keys ignore mutable end dates and normalize RUT/date/text representations
 * so XLSX strings and PostgreSQL text/date serializations compare consistently.
 */
export const IMPORT_KEY_FIELDS = Object.freeze({
  ausentismos_historico: Object.freeze(["rut", "fecha_inicio", "tipo_ausencia", "fecha_creacion", "hora_inicio", "hora_fin"]),
  solicitudes_vacaciones_historicas: Object.freeze(["rut", "fecha_inicio", "tipo_vacaciones"]),
  maestro_empleado: Object.freeze(["rut"]),
  reporte_jornadas_asistencia: Object.freeze(["rut", "fecha"]),
});

export function normalizeImportValue(value) {
  let normalized = String(value ?? "").trim().toLowerCase();
  if (["-", "—", "–", "n/a", "na"].includes(normalized)) return "";
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

function normalizeIdentityValue(field, value) {
  if (field !== "fecha_solicitud") return normalizeImportValue(value);
  let normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || ["-", "—", "–", "n/a", "na"].includes(normalized)) return "";
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[t\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso) normalized = iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0") + " " + iso[4].padStart(2, "0") + ":" + iso[5] + ":" + (iso[6] || "00");
  else {
    const dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s*-?\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dmy) normalized = dmy[3] + "-" + dmy[2].padStart(2, "0") + "-" + dmy[1].padStart(2, "0") + " " + dmy[4].padStart(2, "0") + ":" + dmy[5] + ":" + (dmy[6] || "00");
  }
  return normalized.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}
export function importStableKey(reportType, row) {
  const fields = importKeyFields(reportType);
  if (!fields || !row || typeof row !== "object") return null;
  // Attendance is refreshed by employee + date: changed marks, shift or absence
  // fields replace the previous values for that same employee/day.
  const requiredFields = reportType === "reporte_jornadas_asistencia" ? ["rut", "fecha"] : reportType === "ausentismos_historico" ? ["rut", "fecha_inicio", "tipo_ausencia"] : reportType === "solicitudes_vacaciones_historicas" ? ["rut", "fecha_inicio", "tipo_vacaciones"] : fields;
  for (const field of requiredFields) {
    const value = row[field];
    if (value === null || value === undefined || String(value).trim() === "" || normalizeImportValue(value) === "") return null;
  }
  const values = fields.map((field) => {
    const value = row[field];
    if (field === "rut") return normalizeImportRut(value);
    return normalizeIdentityValue(field, value);
  });
  return values.join("|");
}
