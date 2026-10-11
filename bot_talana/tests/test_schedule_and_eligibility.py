import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from holiday_schedule_guard import dentro_horario_laboral, feriado_hoy
from agent_cloud import eligibility

CL = ZoneInfo("America/Santiago")


class SchedulePolicyTests(unittest.TestCase):
    def test_allows_weekday_opening_time(self):
        self.assertTrue(dentro_horario_laboral(datetime(2026, 10, 12, 8, 0, tzinfo=CL)))

    def test_allows_last_hour_of_work_window(self):
        self.assertTrue(dentro_horario_laboral(datetime(2026, 10, 12, 17, 59, tzinfo=CL)))

    def test_rejects_before_opening_and_after_closing(self):
        self.assertFalse(dentro_horario_laboral(datetime(2026, 10, 12, 7, 59, tzinfo=CL)))
        self.assertFalse(dentro_horario_laboral(datetime(2026, 10, 12, 18, 0, tzinfo=CL)))

    def test_rejects_weekends(self):
        self.assertFalse(dentro_horario_laboral(datetime(2026, 10, 10, 10, 0, tzinfo=CL)))
        self.assertFalse(dentro_horario_laboral(datetime(2026, 10, 11, 10, 0, tzinfo=CL)))

    def test_detects_chilean_holiday_by_date(self):
        holidays = [{"date": "2026-10-12", "localName": "Encuentro de Dos Mundos"}]
        self.assertEqual(feriado_hoy(holidays, datetime(2026, 10, 12, tzinfo=CL).date()), "Encuentro de Dos Mundos")
        self.assertIsNone(feriado_hoy(holidays, datetime(2026, 10, 13, tzinfo=CL).date()))


class FakeCloud:
    def __init__(self, state):
        self.state = state

    def poll(self):
        return self.state


class BotEligibilityTests(unittest.TestCase):
    def test_paused_bot_does_not_run_without_manual_request(self):
        self.assertEqual(eligibility(FakeCloud({"config": {"enabled": False, "run_mode": "both"}})), (None, None, "el bot está pausado en el panel de administración"))

    def test_automatic_run_requires_enabled_and_automatic_mode(self):
        result = eligibility(FakeCloud({"config": {"enabled": True, "run_mode": "automatic"}}))
        self.assertEqual(result, ("automatic", None, "bot habilitado para ejecución automática"))

    def test_queued_manual_request_can_run_while_automatic_mode_is_paused(self):
        result = eligibility(FakeCloud({"config": {"enabled": False, "run_mode": "both"}, "pending_manual_run": {"id": "run-1"}}))
        self.assertEqual(result, ("manual", "run-1", "hay una ejecución manual en cola"))

    def test_manual_mode_does_not_run_automatically(self):
        result = eligibility(FakeCloud({"config": {"enabled": True, "run_mode": "manual"}}))
        self.assertIsNone(result[0])


if __name__ == "__main__":
    unittest.main()
