"""Ejecutor de una sola corrida para GitHub Actions; no mantiene un proceso residente."""
import argparse
import json
import logging
import os
from pathlib import Path

from integracion_supabase import TalanaBotCloud

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("talana-cloud")


def eligibility(cloud):
    """Devuelve (modo, run_id, motivo) sin iniciar una descarga."""
    state = cloud.poll()
    config = state.get("config") or {}
    mode = config.get("run_mode")
    pending = state.get("pending_manual_run")

    if pending and mode in ("both", "manual"):
        return "manual", pending.get("id"), "hay una ejecución manual en cola"
    if config.get("enabled") and mode in ("both", "automatic"):
        return "automatic", None, "bot habilitado para ejecución automática"
    if not config.get("enabled"):
        return None, None, "el bot está pausado en el panel de administración"
    return None, None, f"el modo configurado ({mode}) no permite esta ejecución"


def write_output(should_run, reason):
    output = os.getenv("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as file:
            file.write(f"run_bot={'true' if should_run else 'false'}\n")
            file.write("skip_reason=" + reason.replace("\n", " ") + "\n")


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--once", action="store_true", help="Ejecuta una sola descarga y termina")
    group.add_argument("--check", action="store_true", help="Comprueba si el panel permite ejecutar, sin descargar")
    group.add_argument("--maintenance", action="store_true", help="Genera tareas recurrentes aprobadas, sin iniciar sesión en Talana")
    group.add_argument("--validate-only", action="store_true", help="Descarga y valida los cuatro XLSX sin subirlos ni modificar Supabase")
    group.add_argument("--preview-import", action="store_true", help="Descarga los cuatro XLSX y calcula altas/actualizaciones/duplicados sin escribir datos")
    args = parser.parse_args()

    cloud = TalanaBotCloud()
    if args.preview_import:
        user = os.getenv("TALANA_USER", "").strip()
        password = os.getenv("TALANA_PASSWORD", "")
        if not user or not password:
            raise RuntimeError("Faltan los secretos TALANA_USER o TALANA_PASSWORD.")
        from talana_downloader import ejecutar_descargas
        from importador_reportes import parse_report
        results, errors = ejecutar_descargas(user, password, headless=True)
        previewed = 0
        planned = {"planned_inserted": 0, "planned_updated": 0, "skipped": 0, "failed": 0}
        expected_sheet_terms = {
            "solicitudes_vacaciones_historicas": ("vacacion", "solicitud"),
            "ausentismos_historico": ("ausentismo", "licencia"),
            "maestro_empleado": ("empleado", "trabajador"),
            "reporte_jornadas_asistencia": ("jornada", "asistencia", "turno"),
        }
        for title, path in results:
            if str(path).startswith("__TALANA_ACTION_OK__:"):
                errors.append(f"{title}: se completó una acción sin archivo; no se puede previsualizar su importación.")
                continue
            file_path = Path(path)
            if not file_path.is_file():
                errors.append(f"No existe el archivo descargado para {title}: {file_path}")
                continue
            normalized = title.lower()
            report_type = (
                "ausentismos_historico" if "ausentismo" in normalized
                else "solicitudes_vacaciones_historicas" if "vacaciones" in normalized
                else "maestro_empleado" if "maestro" in normalized
                else "reporte_jornadas_asistencia" if "jornadas" in normalized
                else "reporte_talana"
            )
            if report_type not in expected_sheet_terms:
                errors.append(f"{title}: tipo de reporte no reconocido.")
                continue
            rows, parse_errors, metadata = parse_report(file_path, report_type)
            sheet_name = str(metadata.get("sheet", "")).lower()
            if not any(term in sheet_name for term in expected_sheet_terms[report_type]):
                errors.append(f"{title}: hoja inesperada «{metadata.get('sheet', '')}».")
                continue
            if not rows or parse_errors:
                errors.append(f"{title}: filas={len(rows)}, errores de lectura={len(parse_errors)}")
            try:
                result = cloud.import_report("preview-no-write", report_type, file_path, dry_run=True)
                previewed += 1
                for key in planned:
                    planned[key] += int(result.get(key, 0) or 0)
                LOG.info(
                    "PREVISUALIZACIÓN SIN ESCRITURA: %s | tipo=%s | recibidas=%s | altas_estimadas=%s | actualizaciones_estimadas=%s | duplicadas=%s | rechazadas=%s",
                    title, report_type, result.get("rows_found", len(rows)),
                    result.get("planned_inserted", 0), result.get("planned_updated", 0),
                    result.get("skipped", 0), result.get("failed", 0),
                )
                if report_type == "reporte_jornadas_asistencia":
                    LOG.info("DIAGNÓSTICO DE FECHAS ASISTENCIA: %s", json.dumps((result.get("diagnostics") or {}).get("attendance", {}), ensure_ascii=False, sort_keys=True))
                if int(result.get("failed", 0) or 0):
                    errors.append(f"{title}: {result.get('failed')} fila(s) rechazadas durante la previsualización.")
            except Exception as exc:
                errors.append(f"{title}: no se pudo previsualizar: {exc}")
                LOG.exception("Falló la previsualización de %s", title)
        LOG.info("PREVISUALIZACIÓN FINALIZADA: reportes=%s/4 altas_estimadas=%s actualizaciones_estimadas=%s duplicadas=%s rechazadas=%s errores=%s. No se escribieron datos de negocio.",
                 previewed, planned["planned_inserted"], planned["planned_updated"], planned["skipped"], planned["failed"], len(errors))
        if previewed != 4 or errors or planned["failed"]:
            raise SystemExit(1)
        return
    if args.validate_only:
        user = os.getenv("TALANA_USER", "").strip()
        password = os.getenv("TALANA_PASSWORD", "")
        if not user or not password:
            raise RuntimeError("Faltan los secretos TALANA_USER o TALANA_PASSWORD.")
        from talana_downloader import ejecutar_descargas
        from importador_reportes import parse_report
        results, errors = ejecutar_descargas(user, password, headless=True)
        validated = 0
        for title, path in results:
            if str(path).startswith("__TALANA_ACTION_OK__:"):
                LOG.info("Acción completada sin archivo: %s", title)
                continue
            file_path = Path(path)
            if not file_path.is_file():
                errors.append(f"No existe el archivo descargado para {title}: {file_path}")
                continue
            normalized = title.lower()
            report_type = (
                "ausentismos_historico" if "ausentismo" in normalized
                else "solicitudes_vacaciones_historicas" if "vacaciones" in normalized
                else "maestro_empleado" if "maestro" in normalized
                else "reporte_jornadas_asistencia" if "jornadas" in normalized
                else "reporte_talana"
            )
            rows, parse_errors, metadata = parse_report(file_path, report_type)
            LOG.info("VALIDACIÓN SIN ESCRITURA: %s | tipo=%s | filas=%s | errores_parseo=%s | columnas=%s",
                     title, report_type, len(rows), len(parse_errors), metadata)
            expected_sheet_terms = {
                "solicitudes_vacaciones_historicas": ("vacacion", "solicitud"),
                "ausentismos_historico": ("ausentismo", "licencia"),
                "maestro_empleado": ("empleado", "trabajador"),
                "reporte_jornadas_asistencia": ("jornada", "asistencia", "turno"),
            }.get(report_type, ())
            sheet_name = str(metadata.get("sheet", "")).lower()
            wrong_sheet = bool(expected_sheet_terms) and not any(term in sheet_name for term in expected_sheet_terms)
            if wrong_sheet:
                errors.append(f"{title}: hoja inesperada «{metadata.get('sheet', '')}» para el tipo {report_type}; archivo no se considera válido.")
                LOG.error("VALIDACIÓN RECHAZADA: %s tiene hoja inesperada: %s", title, metadata.get("sheet", ""))
            if not rows or parse_errors:
                errors.append(f"{title}: filas válidas={len(rows)}, errores de parseo={len(parse_errors)}")
            elif not wrong_sheet:
                validated += 1
        LOG.info("Resultado validación segura: reportes válidos=%s/4, errores=%s. No se subieron archivos ni se modificó la base de datos.",
                 validated, len(errors))
        if validated != 4 or errors:
            raise SystemExit(1)
        return
    if args.maintenance:
        result = cloud.call("bot_generate_recurring_tasks")
        LOG.info("Mantenimiento de tareas recurrentes: %s tarea(s) nueva(s).", result.get("created", 0))
        return
    if args.check:
        mode, _, reason = eligibility(cloud)
        write_output(mode is not None, reason)
        LOG.info("Preflight: %s", reason)
        return

    user = os.getenv("TALANA_USER", "").strip()
    password = os.getenv("TALANA_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("Faltan los secretos TALANA_USER o TALANA_PASSWORD.")

    mode, queued_id, reason = eligibility(cloud)
    if mode is None:
        LOG.info("No se ejecuta descarga: %s", reason)
        return

    if mode == "manual":
        claim = cloud.claim_manual(queued_id)
        if not claim.get("claimed"):
            LOG.info("La solicitud manual ya fue tomada por otro proceso; no se ejecuta.")
            return
        run_id = queued_id
        trigger = "manual"
    else:
        run_id = cloud.start_run("automatic")
        trigger = "automatic"

    from talana_downloader import ejecutar_descargas, DOWNLOAD_DIR

    results = []
    errors = []
    uploaded = 0
    completed_actions = 0
    downloaded_files = 0
    imported_reports = 0
    imported_rows = 0
    try:
        LOG.info("Comienza flujo de cuatro tareas Talana (modo=%s, run=%s).", trigger, run_id)
        results, errors = ejecutar_descargas(user, password, headless=True)
        for title, path in results:
            if str(path).startswith("__TALANA_ACTION_OK__:"):
                completed_actions += 1
                LOG.info("Acción Talana completada (sin archivo descargable): %s — %s",
                         title, str(path).split(":", 1)[1])
                continue
            file_path = Path(path)
            if not file_path.is_file():
                errors.append(f"No existe el archivo descargado para {title}: {file_path}")
                continue
            normalized = title.lower()
            report_type = (
                "ausentismos_historico" if "ausentismo" in normalized
                else "solicitudes_vacaciones_historicas" if "vacaciones" in normalized
                else "maestro_empleado" if "maestro" in normalized
                else "reporte_jornadas_asistencia" if "jornadas" in normalized
                else "reporte_talana"
            )
            cloud.upload_file(run_id, report_type, file_path)
            uploaded += 1
            downloaded_files += 1
            completed_actions += 1
            LOG.info("Reporte guardado en Supabase Storage: %s", file_path.name)
            try:
                imported = cloud.import_report(run_id, report_type, file_path)
                imported_rows += int(imported.get("inserted", 0)) + int(imported.get("updated", 0))
                LOG.info(
                    "Importación %s: destino=%s filas=%s insertadas=%s actualizadas=%s duplicadas=%s fallidas=%s",
                    title, report_type, imported.get("rows_found", 0),
                    imported.get("inserted", 0), imported.get("updated", 0),
                    imported.get("skipped", 0), imported.get("failed", 0),
                )
                if int(imported.get("failed", 0)) > 0:
                    diagnostics = imported.get("diagnostics") or {}
                    if diagnostics:
                        errors.append(f"Diagnóstico {title}: {diagnostics}")
                        LOG.error("Diagnóstico de importación %s: %s", title, diagnostics)
                    error_sample = "; ".join(map(str, imported.get("errors", [])[:8]))
                    LOG.error(
                        "Importación %s: %s fila(s) con errores. Muestra: %s",
                        title, imported.get("failed"), error_sample or "el importador no devolvió detalle de fila",
                    )
                    errors.append(
                        f"Importación {title}: {imported.get('failed')} fila(s) con errores. "
                        + error_sample
                    )
                else:
                    imported_reports += 1
                if not imported.get("tracking_registered", True):
                    errors.append(f"Importación {title}: no se pudo registrar la actualización del módulo.")
            except Exception as import_exc:
                errors.append(f"Importación {title}: {import_exc}")
                LOG.exception("No se pudo importar el reporte %s a la plataforma.", title)

        if completed_actions == 4 and uploaded == 4 and imported_reports == 4 and not errors:
            status = "success"
        elif completed_actions or uploaded or results:
            status = "partial"
        else:
            status = "failed"
        cloud.finish_run(
            run_id, status, downloaded=downloaded_files, errors=errors,
            details={
                "uploaded": uploaded,
                "completed_actions": completed_actions,
                "expected_actions": 4,
                "expected_download_files": 4,
                "imported_reports": imported_reports,
                "expected_imported_reports": 4,
                "imported_rows": imported_rows,
                "download_directory": str(DOWNLOAD_DIR),
            },
        )
        LOG.info("Finaliza: estado=%s archivos_descargados=%s archivos_nube=%s reportes_importados=%s filas_importadas=%s acciones_ok=%s/4 errores=%s",
                 status, downloaded_files, uploaded, imported_reports, imported_rows, completed_actions, len(errors))
        # Una ejecución parcial también debe fallar en GitHub Actions: el estado verde
        # no puede ocultar reportes ausentes o archivos que no llegaron a Supabase.
        if status != "success":
            raise SystemExit(1)
    except SystemExit:
        raise
    except Exception as exc:
        LOG.exception("La ejecución del bot falló.")
        try:
            cloud.finish_run(run_id, "failed", downloaded=len(results), errors=[str(exc), *errors])
        except Exception:
            LOG.exception("No se pudo actualizar el estado de error en Supabase.")
        raise


if __name__ == "__main__":
    main()
