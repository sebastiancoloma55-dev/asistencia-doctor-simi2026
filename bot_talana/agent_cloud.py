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
    args = parser.parse_args()

    cloud = TalanaBotCloud()
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
    try:
        LOG.info("Comienza descarga Talana (modo=%s, run=%s).", trigger, run_id)
        results, errors = ejecutar_descargas(user, password, headless=True)
        for title, path in results:
            file_path = Path(path)
            if not file_path.is_file():
                errors.append(f"No existe el archivo descargado: {file_path}")
                continue
            normalized = title.lower()
            report_type = (
                "ausentismos_historico" if "ausentismo" in normalized
                else "solicitudes_vacaciones_historicas" if "vacaciones" in normalized
                else "reporte_talana"
            )
            cloud.upload_file(run_id, report_type, file_path)
            uploaded += 1
            LOG.info("Reporte guardado en Supabase Storage: %s", file_path.name)

        if results and uploaded == len(results) and not errors:
            status = "success"
        elif uploaded or results:
            status = "partial"
        else:
            status = "failed"
        cloud.finish_run(
            run_id, status, downloaded=len(results), errors=errors,
            details={"uploaded": uploaded, "download_directory": str(DOWNLOAD_DIR)},
        )
        LOG.info("Finaliza: estado=%s descargados=%s cargados=%s errores=%s",
                 status, len(results), uploaded, len(errors))
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
