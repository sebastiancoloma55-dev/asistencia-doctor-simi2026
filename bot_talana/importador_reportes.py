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
    "nombres": ["nombres", "primer nombre", "nombre(s)"],
    "apellidos": ["apellidos", "apellido", "apellidos colaborador"],
    "empresa": ["empresa", "razon social", "sociedad"],
    "cargo": ["cargo", "puesto", "cargo colaborador"],
    "sucursal": ["sucursal", "local", "centro de trabajo", "centro costo", "centro de costo"],
    "estado": ["estado", "estado colaborador", "situacion", "estatus"],
    "fecha_ingreso": ["fecha ingreso", "fecha de ingreso", "fecha contratacion", "fecha de contratacion"],
    "tipo_ausencia": ["tipo ausencia", "tipo de ausencia", "tipo ausentismo", "tipo de ausentismo", "tipo licencia"],
    "motivo_ausencia": ["motivo ausencia", "motivo de ausencia", "motivo", "causal"],
    "dias_ausencia": ["dias ausencia", "dias de ausencia", "duracion", "dias licencia", "cantidad de dias"],
    "fecha_inicio": ["fecha inicio", "inicio", "desde", "fecha desde", "fecha inicial", "inicio vacaciones", "fecha inicio vacaciones"],
    "fecha_fin": ["fecha fin", "fin", "hasta", "fecha hasta", "fecha termino", "fecha término", "termino vacaciones", "fecha fin vacaciones"],
    "fecha_solicitud": ["fecha solicitud", "fecha de solicitud", "solicitado el", "fecha creacion solicitud"],
    "fecha_aprobacion": ["fecha aprobacion", "fecha de aprobacion", "aprobado el"],
    "fecha_retorno": ["fecha retorno", "fecha de retorno", "regreso", "fecha regreso"],
    "aprobado_por": ["aprobado por", "autorizado por", "jefatura aprobadora"],
    "dias": ["dias", "dias solicitados", "cantidad dias", "dias habiles"],
    "jornada": ["jornada", "tipo jornada"],
    "tipo_vacaciones": ["tipo vacaciones", "tipo de vacaciones", "tipo solicitud", "tipo"],
    "observaciones": ["observaciones", "comentarios", "detalle", "glosa"],
    "gerencia": ["gerencia", "area", "área"],
    "centro_costo": ["centro costo", "centro de costo", "centro de costos"],
    "fecha": ["fecha", "dia", "día", "fecha asistencia", "fecha jornada"],
    "entrada": ["entrada", "hora entrada", "marcacion entrada", "marcación entrada", "primera marca"],
    "salida": ["salida", "hora salida", "marcacion salida", "marcación salida", "ultima marca"],
    "atraso": ["atraso", "atrasos", "tiempo atraso", "minutos atraso"],
    "salida_temprana": ["salida temprana", "retiro anticipado"],
    "turno": ["turno", "jornada asignada", "horario"],
    "tipo_ausentismo": ["tipo ausentismo", "tipo de ausentismo", "ausentismo"],
    "sin_marca": ["sin marca", "sin marcacion", "sin marcación"],
    "marca_incompleta": ["marca incompleta", "marcacion incompleta", "marcación incompleta"],
    "tiene_atraso": ["tiene atraso", "presenta atraso"],
    "sin_turno_marcas": ["sin turno marcas", "sin turno con marcas"],
}

REPORT_FIELDS = {
    "ausentismos_historico": ["rut", "nombre", "empresa", "cargo", "sucursal", "tipo_ausencia", "motivo_ausencia", "dias_ausencia", "fecha_inicio", "fecha_fin", "observaciones"],
    "solicitudes_vacaciones_historicas": ["rut", "nombre", "empresa", "cargo", "gerencia", "sucursal", "centro_costo", "fecha_solicitud", "fecha_aprobacion", "aprobado_por", "estado", "fecha_inicio", "fecha_fin", "fecha_retorno", "dias", "jornada", "tipo_vacaciones", "observaciones"],
    "maestro_empleado": ["rut", "nombres", "apellidos", "cargo", "sucursal", "fecha_ingreso", "estado"],
    "reporte_jornadas_asistencia": ["rut", "nombre", "sucursal", "fecha", "entrada", "salida", "atraso", "estado", "turno", "tipo_ausentismo", "salida_temprana", "sin_marca", "marca_incompleta", "tiene_atraso", "sin_turno_marcas"],
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
    return text if text else None


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
    minimum = 2 if report_type == "maestro_empleado" else 3
    if not best or best[0] < minimum:
        raise ValueError(
            f"No pude identificar los encabezados del reporte {report_type}. "
            "No se importaron datos; revisa los títulos de columnas del Excel."
        )
    return best[1], best[2]


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
            if not item.get("rut"):
                row_errors.append(f"fila {line_number}: falta RUT")
                continue
            item["rut"] = re.sub(r"\s+", "", str(item["rut"])).upper()
            if report_type == "maestro_empleado":
                if "nombre" in mapping:
                    item["nombre"] = _clean(values[mapping["nombre"]])
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
                    if any(x in status for x in ("inactivo", "cesado", "finiquitado", "desvinculado", "terminado", "retirado")):
                        item["estado"] = "inactivo"
                    elif any(x in status for x in ("activo", "vigente", "contratado", "active")):
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
        if not output:
            raise ValueError(f"No se encontraron filas importables en {path.name}. Encabezados detectados: {', '.join(mapping.keys())}")
        return output, row_errors, {"sheet": sheet.title, "header_row": header_row + 1, "rows_found": len(output), "row_errors": row_errors[:100]}
    finally:
        workbook.close()
