#!/usr/bin/env python3
"""Decide si corresponde ejecutar el bot según hora local de Chile y feriados nacionales."""
import json
import os
import sys
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Santiago")
now = datetime.now(TZ)

def skip(reason):
    print(f"run_bot=false" if os.getenv("GITHUB_OUTPUT") else "")
    output = os.getenv("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write("run_bot=false\n")
            f.write("skip_reason=" + reason.replace("\n", " ") + "\n")
    print(f"BOT OMITIDO: {reason}")
    sys.exit(0)

if now.weekday() >= 5:
    skip("fin de semana en Chile")
if not (8 <= now.hour <= 17):
    skip(f"fuera del horario permitido de Chile (hora local: {now:%H:%M})")

url = f"https://date.nager.at/api/v3/PublicHolidays/{now.year}/CL"
try:
    req = Request(url, headers={"User-Agent": "Asistencia-Doctor-Simi-TalanaBot/1.0"})
    with urlopen(req, timeout=12) as response:
        holidays = json.loads(response.read().decode("utf-8"))
    today = now.date().isoformat()
    matches = [h for h in holidays if h.get("date") == today]
    if matches:
        names = ", ".join(h.get("localName") or h.get("name") or "feriado" for h in matches)
        skip(f"feriado en Chile: {names}")
except Exception as exc:
    # Fail closed: if the calendar cannot be verified, never run on a possibly holiday.
    skip(f"no se pudo verificar el calendario de feriados; se omite por seguridad ({exc})")

output = os.getenv("GITHUB_OUTPUT")
if output:
    with open(output, "a", encoding="utf-8") as f:
        f.write("run_bot=true\n")
        f.write("skip_reason=\n")
print(f"OK: ejecución permitida ({now:%Y-%m-%d %H:%M} hora de Chile).")
