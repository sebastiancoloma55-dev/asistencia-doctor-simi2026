#!/usr/bin/env python3
"""Decide si el bot puede ejecutarse según horario de Chile y feriados nacionales."""
import json
import os
import sys
from datetime import date, datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Santiago")


def dentro_horario_laboral(moment: datetime) -> bool:
    """Lunes-viernes entre las 08:00 y las 17:59, hora local de Chile."""
    local = moment.astimezone(TZ)
    return local.weekday() < 5 and 8 <= local.hour <= 17


def feriado_hoy(holidays: list, today: date) -> str | None:
    """Devuelve el nombre de un feriado chileno de la fecha indicada."""
    for holiday in holidays:
        if holiday.get("date") == today.isoformat():
            return holiday.get("localName") or holiday.get("name") or "feriado"
    return None


def escribir_salida(permitir: bool, motivo: str = "") -> None:
    output = os.getenv("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as file:
            file.write(f"run_bot={'true' if permitir else 'false'}\\n")
            file.write("skip_reason=" + motivo.replace("\\n", " ") + "\\n")


def omitir(motivo: str) -> None:
    escribir_salida(False, motivo)
    print(f"BOT OMITIDO: {motivo}")
    sys.exit(0)


def consultar_feriados(anio: int) -> list:
    url = f"https://date.nager.at/api/v3/PublicHolidays/{anio}/CL"
    request = Request(url, headers={"User-Agent": "Asistencia-Doctor-Simi-TalanaBot/1.0"})
    with urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    now = datetime.now(TZ)
    if not dentro_horario_laboral(now):
        omitir(f"fuera del horario permitido o fin de semana en Chile ({now:%Y-%m-%d %H:%M})")
    try:
        holidays = consultar_feriados(now.year)
    except Exception as exc:
        # Fail closed: si no se puede validar el calendario, no ejecutar.
        omitir(f"no se pudo verificar el calendario de feriados; se omite por seguridad ({exc})")
    holiday = feriado_hoy(holidays, now.date())
    if holiday:
        omitir(f"feriado en Chile: {holiday}")
    escribir_salida(True)
    print(f"OK: ejecución permitida ({now:%Y-%m-%d %H:%M} hora de Chile).")


if __name__ == "__main__":
    main()
