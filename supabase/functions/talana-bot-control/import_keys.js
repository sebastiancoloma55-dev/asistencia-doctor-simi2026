/**
 * Stable natural keys for Talana imports.
 * Keys ignore mutable end dates and normalize RUT/date/text representations
 * so XLSX strings and PostgreSQL text/date serializations compare consistently.
 */
export const IMPORT_KEY_FIELDS = Object.freeze({
  ausentismos_historico: Object.freeze(["rut", "fecha_inicio", "tipo_ausencia", "fecha_creacion", "hora_inicio", "hora_fin"]),
  solicitudes_vacaciones_historicas: Object.freeze(["rut", "fecha_inicio", "tipo_vacaciones", "fecha_solicitud", "jornada"]),
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
  // Attendance exports can contain separate entry and exit rows for the same
  // employee/day. RUT and date are required; marks/type are optional discriminators.
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


/** Parse Talana date values consistently without relying on the runner's locale. */
export function parseDateISO(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0");
  return null;
}

/** Monday for the current calendar week in Chile, returned as YYYY-MM-DD. */
export function chileMondayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const day = new Date(part("year") + "-" + part("month") + "-" + part("day") + "T00:00:00Z");
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return day.toISOString().slice(0, 10);
}
