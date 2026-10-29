"""Parseo y normalización de reportes XLSX exportados por Talana.
No escribe en Supabase: valida encabezados y produce filas canónicas para el importador.
"""
from datetime import date, datetime
import re
import unicodedata
from pathlib import Path

from openpyxl import load_workbook


ALIASES = {
    "rut": ["rut", "rut colaborador", "rut trabajador", "rut empleado", "documento", "identificacion", "identificador"],
    "nombre": ["nombre", "nombre completo", "colaborador", "trabajador", "empleado", "nombre colaborador", "nombre trabajador"],
    "nombres": ["nombres", "primer nombre", "nombre(s)", "nombre"],
    "apellido_paterno": ["apellido paterno", "primer apellido"],
    "apellido_materno": ["apellido materno", "segundo apellido"],
    "apellidos": ["apellidos", "apellido", "apellidos colaborador"],
    "empresa": ["empresa", "razon social", "sociedad"],
    "razon_social": ["razon social", "empresa"],
    "cargo": ["cargo", "puesto", "cargo colaborador"],
    "sucursal": ["sucursal", "local", "centro de trabajo", "centro costo", "centro de costo"],
    "estado": ["estado", "estado colaborador", "situacion", "estatus", "vigente"],
    "fecha_ingreso": ["fecha ingreso", "fecha de ingreso", "fecha contratacion", "fecha de contratacion"],
    "tipo_ausencia": ["tipo ausencia", "tipo de ausencia", "tipo ausentismo", "tipo de ausentismo", "tipo licencia"],
    "motivo_ausencia": ["motivo ausencia", "motivo de ausencia", "motivo", "causal"],
    "dias_ausencia": ["dias ausencia", "dias de ausencia", "duracion", "dias licencia", "cantidad de dias"],
    "fecha_inicio": ["fecha inicio", "fecha de inicio", "fecha de inicio de ausencia", "fecha inicio de ausencia", "fecha inicio ausencia", "inicio ausencia", "inicio de ausencia", "desde", "fecha desde", "fecha inicial", "inicio vacaciones", "fecha inicio vacaciones", "fecha de inicio vacaciones"],
    "fecha_fin": ["fecha fin", "fecha fin ausencia", "fecha de fin de ausencia", "fin ausencia", "fin", "hasta", "fecha hasta", "fecha termino", "fecha término", "termino vacaciones", "fecha fin vacaciones", "fecha de fin vacaciones"],
    "fecha_solicitud": ["fecha solicitud", "fecha de solicitud", "fecha hora solicitud", "solicitado el", "fecha creacion solicitud"],
    "fecha_aprobacion": ["fecha aprobacion", "fecha de aprobacion", "fecha hora aprobacion rechazo", "aprobado el"],
    "fecha_retorno": ["fecha retorno", "fecha de retorno", "regreso", "fecha regreso"],
    "fecha_creacion": ["fecha creacion", "fecha de creacion"],
    "hora_inicio": ["hora inicio", "hora de inicio"],
    "hora_fin": ["hora fin", "hora de fin"],
    "numero_horas": ["numero horas", "numero de horas"],
    "numero_minutos": ["numero minutos", "numero de minutos"],
    "aprobado_por": ["aprobado por", "aprobada rechazada por", "autorizado por", "jefatura aprobadora"],
    "dias": ["dias", "dias solicitados", "cantidad dias", "dias habiles"],
    "jornada": ["jornada", "tipo jornada"],
    "tipo_vacaciones": ["tipo vacaciones", "tipo de vacaciones", "tipo solicitud", "tipo"],
    "observaciones": ["observaciones", "comentarios", "detalle", "glosa"],
    "gerencia": ["gerencia", "area", "área"],
    "centro_costo": ["centro costo", "centro de costo", "centro de costos"],
    "fecha": ["fecha", "dia", "día", "fecha asistencia", "fecha jornada"],
    "entrada": ["entrada", "hora entrada", "marcacion entrada", "marcación entrada", "primera marca"],
    "salida": ["salida", "hora salida", "marcacion salida", "marcación salida", "ultima marca"],
    "atraso": ["atraso", "atrasos", "tiempo atraso", "minutos atraso", "horas de atraso"],
    "salida_temprana": ["salida temprana", "retiro anticipado"],
    "horas_trabajadas": ["horas trabajadas", "total horas trabajadas"],
    "colacion": ["colacion", "tiempo colacion"],
    "horas_extra": ["horas extra", "horas extras"],
    "estado_edicion": ["estado edicion", "estado de edicion"],
    "comentario_empleado": ["comentario empleado", "comentario del empleado"],
    "editada": ["editada", "fue editada"],
    "editado_por": ["editado por"],
    "observacion": ["observacion", "observacion asistencia"],
    "unidad_organizacional": ["unidad organizacional"],
    "jefe": ["jefe", "supervisor"],
    "turno": ["turno", "jornada asignada", "horario"],
    "tipo_ausentismo": ["tipo ausentismo", "tipo de ausentismo", "ausentismo"],
    "sin_marca": ["sin marca", "sin marcacion", "sin marcación"],
    "marca_incompleta": ["marca incompleta", "marcacion incompleta", "marcación incompleta"],
    "tiene_atraso": ["tiene atraso", "presenta atraso"],
    "sin_turno_marcas": ["sin turno marcas", "sin turno con marcas"],
}

REPORT_FIELDS = {
    "ausentismos_historico": ["rut", "nombre", "empresa", "cargo", "gerencia", "sucursal", "centro_costo", "tipo_ausencia", "motivo_ausencia", "dias_ausencia", "fecha_inicio", "fecha_fin", "hora_inicio", "hora_fin", "numero_horas", "numero_minutos", "fecha_creacion", "observaciones"],
    "solicitudes_vacaciones_historicas": ["rut", "nombre", "empresa", "cargo", "gerencia", "sucursal", "centro_costo", "fecha_solicitud", "fecha_aprobacion", "aprobado_por", "estado", "fecha_inicio", "fecha_fin", "fecha_retorno", "dias", "jornada", "tipo_vacaciones", "observaciones"],
    "maestro_empleado": ["rut", "nombres", "apellidos", "cargo", "sucursal", "fecha_ingreso", "estado"],
    "reporte_jornadas_asistencia": ["rut", "nombre", "sucursal", "fecha", "razon_social", "entrada", "salida", "horas_trabajadas", "colacion", "horas_extra", "atraso", "estado", "estado_edicion", "comentario_empleado", "editada", "editado_por", "observacion", "unidad_organizacional", "jefe", "turno", "tipo_ausentismo", "salida_temprana", "sin_marca", "marca_incompleta", "tiene_atraso", "sin_turno_marcas"],
}


def _norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _clean(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    text = str(value).strip()
    if not text or text in {"-", "—", "–", "N/A", "NA"}:
        return None
    return text


def _normalize_date_text(value):
    """Normalize Talana date strings to ISO without changing empty/placeholder values."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"-", "—", "–", "N/A", "NA"}:
        return None
    for fmt in ("%d/%m/%Y - %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return text


def _normalize_datetime_text(value):
    """Normalize creation/request timestamps while preserving time as an identity discriminator."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"-", "—", "–", "N/A", "NA"}:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return _normalize_date_text(value)

def _boolean(value):
    if isinstance(value, bool):
        return value
    text = _norm(value)
    if text in ("si", "sí", "true", "1", "x", "yes"):
        return True
    if text in ("no", "false", "0"):
        return False
    return None


def _number(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return value
    match = re.search(r"-?\d+(?:[.,]\d+)?", str(value).replace(" ", ""))
    if not match:
        return None
    number = float(match.group(0).replace(",", "."))
    return int(number) if number.is_integer() else number


def _header_map(header):
    by_norm = {_norm(v): i for i, v in enumerate(header) if v is not None}
    result = {}
    for field, aliases in ALIASES.items():
        candidates = [_norm(field), *(_norm(alias) for alias in aliases)]
        for candidate in candidates:
            if candidate in by_norm:
                result[field] = by_norm[candidate]
                break
    return result


def _find_header(rows, report_type):
    expected = set(REPORT_FIELDS[report_type])
    best = None
    for idx, row in enumerate(rows[:15]):
        mapping = _header_map(row)
        score = len(expected.intersection(mapping))
        if best is None or score > best[0]:
            best = (score, idx, mapping)
    # Talana exports sometimes label the absence category simply as "Tipo".
    # The generic alias maps that header to tipo_vacaciones; in an absence report
    # it must instead become tipo_ausencia so the deduplication key is complete.
    if report_type == "ausentismos_historico" and best:
        mapping = best[2]
        if "tipo_ausencia" not in mapping and "tipo_vacaciones" in mapping:
            mapping["tipo_ausencia"] = mapping["tipo_vacaciones"]
            best = (best[0] + 1, best[1], mapping)
    minimum = 2 if report_type == "maestro_empleado" else 3
    if not best or best[0] < minimum:
        raise ValueError(
            f"No pude identificar los encabezados del reporte {report_type}. "
            "No se importaron datos; revisa los títulos de columnas del Excel."
        )
    return best[1], best[2]


def _dedupe_rows(report_type, rows):
    """Merge duplicate source rows without discarding non-empty information."""
    identity_fields = {
        "ausentismos_historico": ("rut", "fecha_inicio", "tipo_ausencia", "fecha_creacion", "hora_inicio", "hora_fin"),
        "solicitudes_vacaciones_historicas": ("rut", "fecha_inicio", "tipo_vacaciones"),
        "maestro_empleado": ("rut",),
        # Separate entry/exit marks for one person/day are distinct records.
        "reporte_jornadas_asistencia": ("rut", "fecha"),
    }[report_type]
    merged, by_key = [], {}
    for row in rows:
        parts = []
        for field in identity_fields:
            value = row.get(field)
            parts.append(_norm(value) if value not in (None, "") else "")
        key = tuple(parts)
        if key not in by_key:
            copy = dict(row)
            by_key[key] = copy
            merged.append(copy)
            continue
        existing = by_key[key]
        # For repeated records, the newest row in the Talana export wins.
        # Empty cells do not erase previously known values.
        for field, value in row.items():
            if value not in (None, ""):
                existing[field] = value
    return merged


def parse_report(path, report_type):
    if report_type not in REPORT_FIELDS:
        raise ValueError(f"Tipo de reporte no reconocido: {report_type}")
    path = Path(path)
    if path.suffix.lower() not in (".xlsx", ".xlsm"):
        raise ValueError(f"El archivo {path.name} no es un Excel XLSX compatible.")
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            raise ValueError(f"El reporte {path.name} está vacío.")
        header_row, mapping = _find_header(rows, report_type)
        output, row_errors = [], []
        for line_number, values in enumerate(rows[header_row + 1:], start=header_row + 2):
            if not any(v not in (None, "") for v in values):
                continue
            item = {}
            for field in REPORT_FIELDS[report_type]:
                pos = mapping.get(field)
                item[field] = _clean(values[pos]) if pos is not None and pos < len(values) else None
            for date_field in ("fecha", "fecha_inicio", "fecha_fin", "fecha_retorno", "fecha_solicitud", "fecha_aprobacion", "fecha_ingreso", "fecha_creacion"):
                if item.get(date_field):
                    normalizer = _normalize_datetime_text if date_field == "fecha_solicitud" else _normalize_date_text
                    item[date_field] = normalizer(item[date_field])
            if not item.get("rut"):
                row_errors.append(f"fila {line_number}: falta RUT")
                continue
            item["rut"] = re.sub(r"\s+", "", str(item["rut"])).upper()
            if report_type == "maestro_empleado":
                # Talana's Maestro Empleado export separates given names and both surnames.
                if "nombre" in mapping:
                    item["nombre"] = _clean(values[mapping["nombre"]])
                    item["nombres"] = item.get("nombre")
                surname_parts = []
                for surname_field in ("apellido_paterno", "apellido_materno"):
                    pos = mapping.get(surname_field)
                    surname = _clean(values[pos]) if pos is not None and pos < len(values) else None
                    if surname:
                        surname_parts.append(str(surname).strip())
                if surname_parts:
                    item["apellidos"] = " ".join(surname_parts)
                if not item.get("nombres") or not item.get("apellidos"):
                    full_name = item.get("nombre")
                    if full_name:
                        parts = str(full_name).split()
                        if len(parts) == 2:
                            item["nombres"], item["apellidos"] = parts[0], parts[1]
                        elif len(parts) > 2:
                            # Solo se usa como fallback si Talana entrega nombre completo en una columna.
                            item["nombres"], item["apellidos"] = " ".join(parts[:-2]), " ".join(parts[-2:])
                if not item.get("nombres") or not item.get("apellidos"):
                    row_errors.append(f"fila {line_number}: faltan nombres o apellidos")
                    continue
                if item.get("estado"):
                    status = _norm(item["estado"])
                    if status in ("no", "false", "0") or any(x in status for x in ("inactivo", "cesado", "finiquitado", "desvinculado", "terminado", "retirado")):
                        item["estado"] = "inactivo"
                    elif status in ("si", "sí", "true", "1") or any(x in status for x in ("activo", "vigente", "contratado", "active")):
                        item["estado"] = "activo"
                    else:
                        row_errors.append(f"fila {line_number}: estado no reconocido ({item['estado']})")
                        continue
            elif report_type == "solicitudes_vacaciones_historicas":
                item["dias"] = _number(item.get("dias"))
                if not item.get("fecha_inicio") or not item.get("fecha_fin"):
                    row_errors.append(f"fila {line_number}: faltan fecha_inicio o fecha_fin")
                    continue
                item["tipo_vacaciones"] = item.get("tipo_vacaciones") or "vacaciones"
            elif report_type == "ausentismos_historico":
                item["dias_ausencia"] = _number(item.get("dias_ausencia"))
            elif report_type == "reporte_jornadas_asistencia":
                if not item.get("fecha"):
                    row_errors.append(f"fila {line_number}: falta fecha")
                    continue
                for field in ("sin_marca", "marca_incompleta", "tiene_atraso", "sin_turno_marcas"):
                    if item.get(field) is not None:
                        item[field] = _boolean(item[field])
                item["sin_marca"] = item.get("sin_marca") if item.get("sin_marca") is not None else not item.get("entrada") and not item.get("salida")
                item["marca_incompleta"] = item.get("marca_incompleta") if item.get("marca_incompleta") is not None else bool(item.get("entrada")) != bool(item.get("salida"))
                item["tiene_atraso"] = item.get("tiene_atraso") if item.get("tiene_atraso") is not None else bool(item.get("atraso") and _norm(item.get("atraso")) not in ("0", "no", "sin atraso", "00 00"))
                item["sin_turno_marcas"] = item.get("sin_turno_marcas") if item.get("sin_turno_marcas") is not None else bool((item.get("entrada") or item.get("salida")) and not item.get("turno"))
            output.append(item)
        source_rows = len(output)
        output = _dedupe_rows(report_type, output)
        if not output:
            raise ValueError(f"No se encontraron filas importables en {path.name}. Encabezados detectados: {', '.join(mapping.keys())}")
        return output, row_errors, {"sheet": sheet.title, "header_row": header_row + 1, "rows_source": source_rows, "rows_found": len(output), "rows_deduplicated": source_rows - len(output), "row_errors": row_errors[:100]}
    finally:
        workbook.close()
