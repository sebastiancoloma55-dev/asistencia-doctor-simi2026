"""Ejecutor de una sola corrida para GitHub Actions; no mantiene un proceso residente."""
import argparse
import logging
import os
from pathlib import Path

from integracion_supabase import TalanaBotCloud

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("talana-cloud")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Ejecuta una sola descarga y termina")
    args = parser.parse_args()
    if not args.once:
        parser.error("En GitHub Actions se requiere --once para no consumir minutos innecesarios.")

    user = os.getenv("TALANA_USER", "").strip()
    password = os.getenv("TALANA_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("Faltan los secretos TALANA_USER o TALANA_PASSWORD.")

    # El módulo de descarga se incorpora como archivo independiente; no se embeben credenciales.
    from talana_downloader import ejecutar_descargas, DOWNLOAD_DIR

    cloud = TalanaBotCloud()
    run_id = cloud.start_run("automatic")
    results = []
    errors = []
    uploaded = 0
    try:
        LOG.info("Comienza la descarga programada de reportes Talana.")
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
            run_id,
            status,
            downloaded=len(results),
            errors=errors,
            details={"uploaded": uploaded, "download_directory": str(DOWNLOAD_DIR)},
        )
        LOG.info("Finaliza: estado=%s descargados=%s cargados=%s errores=%s", status, len(results), uploaded, len(errors))
        if status == "failed":
            raise RuntimeError("; ".join(map(str, errors)) or "Talana no entregó reportes.")
    except Exception as exc:
        LOG.exception("La ejecución del bot falló.")
        try:
            cloud.finish_run(run_id, "failed", downloaded=len(results), errors=[str(exc), *errors])
        except Exception:
            LOG.exception("Tampoco se pudo guardar el estado de error en Supabase.")
        raise


if __name__ == "__main__":
    main()
