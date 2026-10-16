"""Cliente seguro para enviar reportes Talana a Supabase. Credenciales solo por variables de entorno."""
import base64, hashlib, json, mimetypes, os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import date, datetime
from zoneinfo import ZoneInfo


def filter_current_month_licenses(rows, today=None):
 """Keep only absences created from the first day of the current Chilean month."""
 today = today or datetime.now(ZoneInfo("America/Santiago")).date()
 month_start = date(today.year, today.month, 1)
 included, excluded_old, excluded_missing_date = [], 0, 0
 for row in rows:
  raw = row.get("fecha_creacion")
  parsed = None
  if isinstance(raw, datetime):
   parsed = raw.date()
  elif isinstance(raw, date):
   parsed = raw
  elif raw is not None and str(raw).strip():
   value = str(raw).strip()
   try:
    parsed = date.fromisoformat(value[:10])
   except ValueError:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y"):
     try:
      parsed = datetime.strptime(value[:10], fmt).date()
      break
     except ValueError:
      pass
  if parsed is None:
   excluded_missing_date += 1
  elif parsed < month_start:
   excluded_old += 1
  else:
   included.append(row)
 return included, {"month_start": month_start.isoformat(), "received": len(rows),
  "included": len(included), "excluded_before_month": excluded_old,
  "excluded_missing_creation_date": excluded_missing_date}
class TalanaBotCloud:
 def __init__(self):
  self.url=os.getenv("TALANA_BOT_URL","").rstrip("/"); self.secret=os.getenv("TALANA_BOT_SECRET","")
  if not self.url or not self.secret: raise RuntimeError("Configura TALANA_BOT_URL y TALANA_BOT_SECRET en .env")
 def call(self,action,**data):
  req=Request(self.url,data=json.dumps({"action":action,**data}).encode(),method="POST",headers={"Content-Type":"application/json","x-bot-secret":self.secret})
  try:
   with urlopen(req,timeout=90) as r: out=json.loads(r.read().decode())
  except HTTPError as e: raise RuntimeError(f"Supabase HTTP {e.code}: {e.read().decode('utf-8','replace')[:800]}") from e
  except URLError as e: raise RuntimeError(f"Error conectando con Supabase: {e}") from e
  if out.get("error"): raise RuntimeError(out["error"])
  return out
 def poll(self): return self.call("bot_config")
 def generate_recurring_tasks(self): return self.call("bot_generate_recurring_tasks")
 def claim_manual(self,run_id): return self.call("bot_claim_manual",run_id=run_id)
 def start_run(self,trigger_type="automatic"): return self.call("bot_start",trigger_type=trigger_type)["run"]["id"]
 def upload_file(self,run_id,report_type,path):
  p=Path(path); raw=p.read_bytes()
  return self.call("bot_upload",run_id=run_id,report_type=report_type,file_name=p.name,mime_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream",size_bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),base64=base64.b64encode(raw).decode())

 def import_report(self,run_id,report_type,path,dry_run=False):
  """Previsualiza o importa el XLSX por lotes a la tabla de destino del módulo."""
  from importador_reportes import parse_report
  p=Path(path)
  rows,parse_errors,metadata=parse_report(p,report_type)
  monthly_filter={"applied":False}
  if report_type=="ausentismos_historico":
   rows,monthly_filter=filter_current_month_licenses(rows)
   monthly_filter["applied"]=True
   if not rows:
    import logging
    logging.getLogger("talana-cloud").warning("Filtro mensual de licencias: no hay filas con fecha_creacion desde %s; se omite la importación.",monthly_filter["month_start"])
  totals={"report_type":report_type,"file_name":p.name,"rows_found":len(rows),"inserted":0,"updated":0,"planned_inserted":0,"planned_updated":0,"skipped":0,"failed":0,"errors":[],"metadata":metadata,"tracking_registered":True,"diagnostics":{"monthly_license_filter":monthly_filter,"missing_key_fields":{},"incoming_rows_merged":int(metadata.get("rows_deduplicated",0) or 0),"ambiguous_legacy_rows_merged":0,"blocked_ambiguous_legacy_rows":0,"planned_duplicate_rows_removed":0,"existing_duplicate_rows_detected":0,"duplicate_rows_removed":0,"attendance":{"incoming_by_date":{},"planned_new_by_date":{}}}}
  # Count XLSX rows consolidated before batching as skipped source duplicates.
  totals["skipped"] += int(metadata.get("rows_deduplicated",0) or 0)
  attendance_employee_ids=set()
  if report_type=="reporte_jornadas_asistencia":
   import re
   for row in rows:
    rut=row.get("rut")
    if rut is not None and str(rut).strip(): attendance_employee_ids.add(re.sub(r"[^0-9Kk]","",str(rut)).upper())
  for offset in range(0,len(rows),100):
   batch=rows[offset:offset+100]
   result=self.call("bot_import",run_id=run_id,report_type=report_type,file_name=p.name,rows=batch,parse_errors=parse_errors if offset==0 else [],final_batch=(offset+len(batch)>=len(rows)),dry_run=dry_run)
   keys=("planned_inserted","planned_updated","skipped","failed") if dry_run else ("inserted","updated","skipped","failed")
   for key in keys:
    totals[key]+=int(result.get(key,0) or 0)
   totals["tracking_registered"]=totals["tracking_registered"] and bool(result.get("tracking_registered",True))
   diag=result.get("diagnostics") or {}
   for field,count in (diag.get("missing_key_fields") or {}).items():
    totals["diagnostics"]["missing_key_fields"][field]=totals["diagnostics"]["missing_key_fields"].get(field,0)+int(count or 0)
   for field in ("incoming_rows_merged","ambiguous_legacy_rows_merged","blocked_ambiguous_legacy_rows","blocked_existing_duplicate_conflicts","planned_duplicate_rows_removed","existing_duplicate_rows_detected","duplicate_rows_removed"):
    totals["diagnostics"][field]=totals["diagnostics"].get(field,0)+int(diag.get(field,0) or 0)
   attendance=diag.get("attendance") or {}
   for bucket in ("incoming_by_date","planned_new_by_date"):
    target=totals["diagnostics"]["attendance"][bucket]
    for day,count in (attendance.get(bucket) or {}).items(): target[day]=target.get(day,0)+int(count or 0)
   totals["errors"].extend(result.get("errors") or [])
   if offset==0 or (offset//100+1)%10==0 or offset+len(batch)>=len(rows):
    import logging
    prefix="Previsualización" if dry_run else "Importación"
    logging.getLogger("talana-cloud").info("%s %s: procesadas %s/%s; altas_estimadas=%s actualizaciones_estimadas=%s insertadas=%s actualizadas=%s duplicadas=%s fallidas=%s",prefix,report_type,min(offset+len(batch),len(rows)),len(rows),totals["planned_inserted"],totals["planned_updated"],totals["inserted"],totals["updated"],totals["skipped"],totals["failed"])
  if report_type=="reporte_jornadas_asistencia":
   attendance=totals["diagnostics"]["attendance"]
   dates=sorted(attendance["incoming_by_date"])
   attendance["date_min"]=dates[0] if dates else None
   attendance["date_max"]=dates[-1] if dates else None
   attendance["unique_dates"]=len(dates)
   attendance["unique_employee_ids"]=len(attendance_employee_ids)
   attendance["planned_new_total"]=sum(attendance["planned_new_by_date"].values())
  return totals
 def finish_run(self,run_id,status,downloaded=0,errors=None,details=None):
  return self.call("bot_finish",run_id=run_id,status=status,reports_downloaded=downloaded,error_summary="; ".join(map(str,errors or []))[:4000] or None,details=details or {})
