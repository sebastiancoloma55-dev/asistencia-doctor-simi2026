"""Ejecutor de una sola corrida para GitHub Actions; no mantiene un proceso residente."""
import argparse
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
    args = parser.parse_args()

    cloud = TalanaBotCloud()
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
                else "reporte_jornadas_asistencia" if "jornadas" in normalized
                else "reporte_talana"
            )
            cloud.upload_file(run_id, report_type, file_path)
            uploaded += 1
            downloaded_files += 1
            completed_actions += 1
            LOG.info("Reporte guardado en Supabase Storage: %s", file_path.name)

        if completed_actions == 4 and uploaded == 3 and not errors:
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
                "expected_download_files": 3,
                "download_directory": str(DOWNLOAD_DIR),
            },
        )
        LOG.info("Finaliza: estado=%s archivos_descargados=%s cargados=%s acciones_ok=%s/4 errores=%s",
                 status, downloaded_files, uploaded, completed_actions, len(errors))
        if status == "failed":
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
