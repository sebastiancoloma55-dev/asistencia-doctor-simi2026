"""Pruebas de regresión del parser de reportes Talana; no requieren secretos ni Supabase."""
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook
from importador_reportes import parse_report


class ImportadorTalanaTests(unittest.TestCase):
    def workbook_file(self, headers, rows):
        tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        tmp.close()
        path = Path(tmp.name)
        wb = Workbook()
        ws = wb.active
        ws.append(headers)
        for row in rows:
            ws.append(row)
        wb.save(path)
        wb.close()
        self.addCleanup(lambda: path.unlink(missing_ok=True))
        return path

    def test_parsea_asistencia_y_normaliza_fechas_y_marcas(self):
        path = self.workbook_file(
            ["RUT colaborador", "Nombre completo", "Fecha asistencia", "Entrada", "Salida", "Turno", "Atraso"],
            [["12.345.678-5", "Ana Pérez", "12/10/2026", "08:00", None, "AM", "00:15"]],
        )
        rows, errors, meta = parse_report(path, "reporte_jornadas_asistencia")
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["rut"], "12.345.678-5")
        self.assertEqual(rows[0]["fecha"], "2026-10-12")
        self.assertTrue(rows[0]["marca_incompleta"])
        self.assertTrue(rows[0]["tiene_atraso"])
        self.assertEqual(meta["rows_found"], 1)

    def test_parsea_vacaciones_y_aplica_tipo_por_defecto(self):
        path = self.workbook_file(
            ["RUT", "Nombre", "Fecha solicitud", "Fecha inicio", "Fecha fin", "Estado", "Días"],
            [["11.111.111-1", "Juan Soto", "01/10/2026", "20/10/2026", "24/10/2026", "Aprobada", 5]],
        )
        rows, errors, _ = parse_report(path, "solicitudes_vacaciones_historicas")
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["tipo_vacaciones"], "vacaciones")
        self.assertEqual(rows[0]["dias"], 5)

    def test_rechaza_archivo_sin_encabezados_reconocibles(self):
        path = self.workbook_file(["Columna X", "Columna Y"], [["a", "b"]])
        with self.assertRaisesRegex(ValueError, "No pude identificar los encabezados"):
            parse_report(path, "ausentismos_historico")

    def test_rechaza_vacacion_sin_fechas_obligatorias(self):
        path = self.workbook_file(
            ["RUT", "Nombre", "Fecha solicitud", "Fecha inicio", "Fecha fin"],
            [["11.111.111-1", "Juan Soto", "01/10/2026", None, None]],
        )
        with self.assertRaisesRegex(ValueError, "No se encontraron filas importables"):
            parse_report(path, "solicitudes_vacaciones_historicas")


if __name__ == "__main__":
    unittest.main(verbosity=2)
