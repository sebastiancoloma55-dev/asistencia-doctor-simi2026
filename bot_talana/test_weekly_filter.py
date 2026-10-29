import unittest
from datetime import date

from integracion_supabase import filter_current_week_licenses


class CurrentChileWeekFilterTests(unittest.TestCase):
    def test_keeps_rows_created_since_monday_in_chile(self):
        rows = [
            {"rut": "1-9", "fecha_creacion": "2026-10-26", "fecha_inicio": "2026-10-27"},
            {"rut": "2-7", "fecha_creacion": "25/10/2026", "fecha_inicio": "2026-10-28"},
            {"rut": "3-5", "fecha_creacion": None, "fecha_inicio": "27/10/2026"},
            {"rut": "4-3", "fecha_creacion": "invalid", "fecha_inicio": "2026-10-25"},
            {"rut": "5-1", "fecha_creacion": None, "fecha_inicio": None},
        ]

        included, diagnostics = filter_current_week_licenses(rows, today=date(2026, 10, 29))

        self.assertEqual([row["rut"] for row in included], ["1-9", "3-5"])
        self.assertEqual(diagnostics["week_start"], "2026-10-26")
        self.assertEqual(diagnostics["received"], 5)
        self.assertEqual(diagnostics["included"], 2)
        self.assertEqual(diagnostics["excluded_before_week"], 2)
        self.assertEqual(diagnostics["excluded_missing_dates"], 1)

    def test_week_boundary_advances_on_monday(self):
        rows = [
            {"rut": "1-9", "fecha_creacion": "2026-10-26"},
            {"rut": "2-7", "fecha_creacion": "2026-11-02"},
        ]
        included, diagnostics = filter_current_week_licenses(rows, today=date(2026, 11, 4))
        self.assertEqual([row["rut"] for row in included], ["2-7"])
        self.assertEqual(diagnostics["week_start"], "2026-11-02")


if __name__ == "__main__":
    unittest.main()
