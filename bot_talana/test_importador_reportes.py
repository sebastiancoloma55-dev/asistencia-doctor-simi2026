import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from importador_reportes import parse_report, _dedupe_rows


class ReportParserTests(unittest.TestCase):
    def make_xlsx(self, headers, rows):
        temp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        temp.close()
        path = Path(temp.name)
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        workbook.save(path)
        workbook.close()
        self.addCleanup(lambda: path.unlink(missing_ok=True))
        return path

    def test_vacation_report_maps_required_fields(self):
        path = self.make_xlsx(
            ["RUT", "Nombre", "Fecha solicitud", "Fecha inicio", "Fecha fin", "Estado"],
            [["12.345.678-5", "Ana Pérez", "2026-10-01", "2026-11-02", "2026-11-06", "Aprobada"]],
        )
        rows, errors, metadata = parse_report(path, "solicitudes_vacaciones_historicas")
        self.assertEqual(rows[0]["rut"], "12.345.678-5")
        self.assertEqual(rows[0]["tipo_vacaciones"], "vacaciones")
        self.assertEqual(rows[0]["fecha_inicio"], "2026-11-02")
        self.assertEqual(errors, [])
        self.assertEqual(metadata["rows_found"], 1)

    def test_employee_report_maps_status_and_names(self):
        path = self.make_xlsx(
            ["RUT", "Nombre completo", "Cargo", "Sucursal", "Estado"],
            [["9.876.543-K", "Ana María Pérez Soto", "QF", "Centro", "Activo"]],
        )
        rows, errors, _ = parse_report(path, "maestro_empleado")
        self.assertEqual(rows[0]["nombres"], "Ana María")
        self.assertEqual(rows[0]["apellidos"], "Pérez Soto")
        self.assertEqual(rows[0]["estado"], "activo")
        self.assertEqual(errors, [])

    def test_attendance_flags_are_normalized(self):
        path = self.make_xlsx(
            ["RUT", "Nombre", "Sucursal", "Fecha", "Entrada", "Salida", "Turno", "Atraso"],
            [["12.345.678-5", "Ana Pérez", "Centro", "2026-10-01", "08:10", None, "Apertura", "00:10"]],
        )
        rows, errors, _ = parse_report(path, "reporte_jornadas_asistencia")
        self.assertTrue(rows[0]["marca_incompleta"])
        self.assertTrue(rows[0]["tiene_atraso"])
        self.assertFalse(rows[0]["sin_marca"])
        self.assertEqual(errors, [])

    def test_absence_report_maps_generic_tipo_column_to_absence_type(self):
        path = self.make_xlsx(
            ["RUT", "Nombre", "Tipo", "Fecha inicio", "Fecha fin"],
            [["12.345.678-5", "Ana Pérez", "Licencia médica", "2026-10-01", "2026-10-10"]],
        )
        rows, errors, _ = parse_report(path, "ausentismos_historico")
        self.assertEqual(rows[0]["tipo_ausencia"], "Licencia médica")
        self.assertEqual(errors, [])

    def test_absence_report_maps_fecha_de_inicio_header(self):
        path = self.make_xlsx(
            ["RUT", "Nombre", "Tipo de ausencia", "Fecha de inicio", "Fecha de término"],
            [["12.345.678-5", "Ana Pérez", "Licencia médica", "2026-10-01", "2026-10-10"]],
        )
        rows, errors, _ = parse_report(path, "ausentismos_historico")
        self.assertEqual(rows[0]["fecha_inicio"], "2026-10-01")
        self.assertEqual(rows[0]["tipo_ausencia"], "Licencia médica")
        self.assertEqual(errors, [])

    def test_exact_talana_absence_headers(self):
        path = self.make_xlsx(
            ["Rut", "Nombre", "Empresa", "Cargo", "Gerencia", "Sucursal", "Centro de Costo",
             "Tipo de Ausencia", "Motivo de Ausencia", "Número de días de Ausencia",
             "Fecha Inicio Ausencia", "Fecha Fin Ausencia", "Hora Inicio", "Hora Fin",
             "Número Horas", "Número Minutos", "Fecha de Creación", "Observaciones"],
            [["15539483-8", "EDUARDO ANDRES GREZ", "Farmacias", "Auxiliar", "Ventas", "Cumming",
              "Cumming", "licencia medica", "Enfermedad", 11, "2019-01-09 00:00:00",
              "2019-01-19 00:00:00", "-", "-", "-", "-", "2026-03-26 00:00:00", ""]],
        )
        rows, errors, _ = parse_report(path, "ausentismos_historico")
        self.assertEqual(rows[0]["fecha_inicio"], "2019-01-09")
        self.assertEqual(rows[0]["fecha_fin"], "2019-01-19")
        self.assertEqual(rows[0]["tipo_ausencia"], "licencia medica")
        self.assertEqual(rows[0]["gerencia"], "Ventas")
        self.assertEqual(errors, [])

    def test_exact_talana_vacation_headers(self):
        path = self.make_xlsx(
            ["Rut", "Nombre", "Empresa", "Cargo", "Gerencia", "Sucursal", "Centro de Costo",
             "Fecha/Hora Solicitud", "Fecha/Hora Aprobación/Rechazo", "Aprobada/Rechazada por",
             "Estado", "Fecha Inicio Vacaciones", "Fecha Fin Vacaciones", "Fecha Retorno",
             "Número de días de Vacaciones", "Jornada", "Tipo de Vacaciones", "Observaciones"],
            [["13851330-0", "RODRIGO HUGO BALCAZAR", "Farmacias", "Auxiliar", "Farmacia",
              "Villa Alemana 3", "Villa Alemana 3", "01/09/2026 - 09:40:09",
              "01/09/2026 - 09:40:28", "JAVIERA PAZ SAAVEDRA", "Aprobada",
              "2026-09-01 00:00:00", "2026-10-02 00:00:00", "2026-10-05 00:00:00",
              23, "-", "Vacaciones Proporcionales", ""]],
        )
        rows, errors, _ = parse_report(path, "solicitudes_vacaciones_historicas")
        self.assertEqual(rows[0]["fecha_solicitud"], "2026-09-01 09:40:09")
        self.assertEqual(rows[0]["fecha_inicio"], "2026-09-01")
        self.assertEqual(rows[0]["fecha_fin"], "2026-10-02")
        self.assertEqual(rows[0]["tipo_vacaciones"], "Vacaciones Proporcionales")
        self.assertEqual(errors, [])

    def test_exact_talana_employee_headers(self):
        path = self.make_xlsx(
            ["RUT", "Nombre", "Apellido Paterno", "Apellido Materno", "Cargo",
             "Sucursal", "Fecha de Ingreso", "Vigente"],
            [["11834733-1", "Ada Paola", "Pino", "Vasquez", "AUXILIAR DE FARMACIA",
              "PUENTE ALTO 2", "2022-03-22 00:00:00", "Si"]],
        )
        rows, errors, _ = parse_report(path, "maestro_empleado")
        self.assertEqual(rows[0]["nombres"], "Ada Paola")
        self.assertEqual(rows[0]["apellidos"], "Pino Vasquez")
        self.assertEqual(rows[0]["estado"], "activo")
        self.assertEqual(errors, [])

    def test_exact_talana_attendance_headers_and_dash_placeholders(self):
        path = self.make_xlsx(
            ["Fecha", "Estado", "Rut", "Nombre", "Sucursal", "Centro de Costo", "Razón Social",
             "Turno", "Entrada", "Salida", "Horas Trabajadas", "Colación", "Horas Extra",
             "Horas de Atraso", "Estado de edición", "Comentario del empleado", "Editada",
             "Editado Por", "Observación", "Unidad Organizacional", "Jefe", "Tipo de Ausentismo"],
            [["01/10/2026", "Justificada", "14186582-K", "DANIELA ANDREA ABARCA", "LAS REJAS",
              "LAS REJAS", "Farmacias", "08:30-17:30 (00:30)", "-", "-", "00:00", "-", "00:00",
              "00:00", "Solicitada", "", "No", "", "", "FARMACIA", "", "Día vacaciones"]],
        )
        rows, errors, _ = parse_report(path, "reporte_jornadas_asistencia")
        self.assertEqual(rows[0]["fecha"], "2026-10-01")
        self.assertIsNone(rows[0]["entrada"])
        self.assertIsNone(rows[0]["salida"])
        self.assertEqual(rows[0]["horas_trabajadas"], "00:00")
        self.assertEqual(rows[0]["tipo_ausentismo"], "Día vacaciones")
        self.assertTrue(rows[0]["sin_marca"])
        self.assertEqual(errors, [])

    def test_duplicate_absence_rows_merge_non_empty_fields(self):
        path = self.make_xlsx(
            ["Rut", "Nombre", "Tipo de Ausencia", "Motivo de Ausencia",
             "Número de días de Ausencia", "Fecha Inicio Ausencia", "Fecha Fin Ausencia"],
            [["10826263-K", "MARJORIE DINAMARCA", "licencia medica", None, 15,
              "2026-03-30 00:00:00", "2026-04-13 00:00:00"],
             ["10826263-K", "MARJORIE DINAMARCA", "licencia medica", "enfermedad común", 15,
              "2026-03-30 00:00:00", "2026-04-13 00:00:00"]],
        )
        rows, errors, metadata = parse_report(path, "ausentismos_historico")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["motivo_ausencia"], "enfermedad común")
        self.assertEqual(metadata["rows_deduplicated"], 1)
        self.assertEqual(errors, [])

    def test_attendance_entry_and_exit_rows_merge_into_latest_employee_day(self):
        path = self.make_xlsx(
            ["Fecha", "Rut", "Nombre", "Sucursal", "Turno", "Entrada", "Salida", "Estado"],
            [["02/10/2026", "11131144-7", "RAFAEL LEON", "DISTRIBUCION", "CENTRAL 2026",
              "07:32:14", "-", "Invalida"],
             ["02/10/2026", "11131144-7", "RAFAEL LEON", "DISTRIBUCION", "-", "-",
              "22:36:04", "Invalida"]],
        )
        rows, errors, metadata = parse_report(path, "reporte_jornadas_asistencia")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["entrada"], "07:32:14")
        self.assertEqual(rows[0]["salida"], "22:36:04")
        self.assertEqual(errors, [])

    def test_same_absence_identity_with_different_creation_date_is_preserved(self):
        path = self.make_xlsx(
            ["Rut", "Nombre", "Tipo de Ausencia", "Fecha Inicio Ausencia",
             "Fecha Fin Ausencia", "Fecha de Creación", "Hora Inicio", "Hora Fin"],
            [["10826263-K", "MARJORIE DINAMARCA", "licencia medica", "2026-03-30",
              "2026-04-13", "2026-03-30 08:00:00", "08:00", "17:00"],
             ["10826263-K", "MARJORIE DINAMARCA", "licencia medica", "2026-03-30",
              "2026-04-13", "2026-03-31 09:00:00", "08:00", "17:00"]],
        )
        rows, errors, _ = parse_report(path, "ausentismos_historico")
        self.assertEqual(len(rows), 2)
        self.assertEqual(errors, [])

    def test_same_vacation_start_with_distinct_request_timestamps_is_preserved(self):
        path = self.make_xlsx(
            ["Rut", "Nombre", "Fecha/Hora Solicitud", "Fecha Inicio Vacaciones",
             "Fecha Fin Vacaciones", "Tipo de Vacaciones", "Jornada"],
            [["12345678-5", "ANA PEREZ", "01/09/2026 - 09:40:09", "2026-11-02",
              "2026-11-06", "Vacaciones", "Completa"],
             ["12345678-5", "ANA PEREZ", "02/09/2026 - 10:15:22", "2026-11-02",
              "2026-11-06", "Vacaciones", "Completa"]],
        )
        rows, errors, _ = parse_report(path, "solicitudes_vacaciones_historicas")
        self.assertEqual(len(rows), 2)
        self.assertEqual(errors, [])

    def test_unrecognized_headers_fail_closed(self):
        path = self.make_xlsx(["Columna A", "Columna B"], [["x", "y"]])
        with self.assertRaises(ValueError):
            parse_report(path, "ausentismos_historico")


if __name__ == "__main__":
    unittest.main()

class LatestRowWinsTests(unittest.TestCase):
    def test_duplicate_vacation_record_uses_latest_nonempty_values(self):
        old = {"rut": "12.345.678-5", "fecha_inicio": "2026-11-02", "tipo_vacaciones": "vacaciones", "fecha_fin": "2026-11-06", "estado": "Pendiente"}
        latest = {"rut": "12.345.678-5", "fecha_inicio": "2026-11-02", "tipo_vacaciones": "vacaciones", "fecha_fin": "2026-11-09", "estado": "Aprobada", "observaciones": None}
        merged = _dedupe_rows("solicitudes_vacaciones_historicas", [old, latest])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["fecha_fin"], "2026-11-09")
        self.assertEqual(merged[0]["estado"], "Aprobada")

    def test_duplicate_attendance_record_overwrites_old_marks_and_shift(self):
        old = {"rut": "12.345.678-5", "fecha": "2026-10-26", "entrada": "08:00", "salida": "17:00", "turno": "Apertura"}
        latest = {"rut": "12.345.678-5", "fecha": "2026-10-26", "entrada": "09:00", "salida": "18:00", "turno": "Cierre"}
        merged = _dedupe_rows("reporte_jornadas_asistencia", [old, latest])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["entrada"], "09:00")
        self.assertEqual(merged[0]["salida"], "18:00")
        self.assertEqual(merged[0]["turno"], "Cierre")
