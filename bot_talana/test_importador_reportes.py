import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from importador_reportes import parse_report


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
            ["RUT", "Nombres", "Apellidos", "Cargo", "Sucursal", "Estado"],
            [["9.876.543-K", "Ana María", "Pérez Soto", "QF", "Centro", "Activo"]],
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

    def test_unrecognized_headers_fail_closed(self):
        path = self.make_xlsx(["Columna A", "Columna B"], [["x", "y"]])
        with self.assertRaises(ValueError):
            parse_report(path, "ausentismos_historico")


if __name__ == "__main__":
    unittest.main()
