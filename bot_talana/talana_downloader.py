"""Descarga automatizada de reportes de Talana mediante Playwright.
Las credenciales se leen exclusivamente desde variables de entorno.
"""
import os
import re
import time
from datetime import date
from pathlib import Path
from playwright.sync_api import sync_playwright

DOWNLOAD_DIR = Path(os.getenv("TALANA_DOWNLOAD_DIR", "descargas_talana")).resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
TALANA_URL = "https://talana.com/app/#/auth/login"


def primer_dia_mes_actual():
    return date.today().replace(day=1).strftime("%d-%m-%Y")


def nombre_seguro(texto):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", texto.strip()).strip("._-") or "reporte"


def guardar_descarga(download, nombre_base):
    original = download.suggested_filename or f"{nombre_base}.xlsx"
    suffix = Path(original).suffix or ".xlsx"
    destino = DOWNLOAD_DIR / f"{nombre_seguro(nombre_base)}_{time.strftime('%Y%m%d_%H%M%S')}{suffix}"
    download.save_as(str(destino))
    if not destino.is_file() or destino.stat().st_size == 0:
        raise RuntimeError(f"La descarga de {nombre_base} quedó vacía.")
    return destino


def cerrar_popups(page):
    """Cierra encuestas/modales conocidos sin clicar elementos arbitrarios de la página."""
    selectors = [
        "#survicate-box button[aria-label*='close' i]",
        "#survicate-box [aria-label*='cerrar' i]",
        ".survicate-box-WidgetSurvey button[aria-label*='close' i]",
        "[role='dialog'] button[aria-label*='close' i]",
        "[role='dialog'] button[aria-label*='cerrar' i]",
        ".swal2-popup button",
        "button:has-text('Cerrar')",
    ]
    for selector in selectors:
        try:
            loc = page.locator(selector)
            for i in range(min(loc.count(), 5)):
                item = loc.nth(i)
                if item.is_visible():
                    try:
                        item.click(timeout=1200, force=True)
                        page.wait_for_timeout(250)
                    except Exception:
                        pass
        except Exception:
            pass


def click_texto(page, texto, timeout=15000):
    """Busca una etiqueta primero exacta y luego tolera mayúsculas y texto adicional."""
    deadline = time.monotonic() + timeout / 1000
    last_error = None
    escaped = re.escape(texto.strip())
    strategies = [
        ("exacto", lambda frame: frame.get_by_text(texto, exact=True)),
        ("exacto sin distinguir mayúsculas", lambda frame: frame.get_by_text(
            re.compile(r"^\s*" + escaped + r"\s*$", re.I)
        )),
        ("coincidencia parcial sin distinguir mayúsculas", lambda frame: frame.get_by_text(
            re.compile(escaped, re.I), exact=False
        )),
    ]
    while time.monotonic() < deadline:
        cerrar_popups(page)
        for strategy_name, build_locator in strategies:
            for frame in list(page.frames):
                try:
                    loc = build_locator(frame)
                    for i in range(min(loc.count(), 60)):
                        item = loc.nth(i)
                        try:
                            if item.is_visible() and item.is_enabled():
                                item.click(timeout=1200)
                                if strategy_name != "exacto":
                                    print(f"Etiqueta Talana localizada mediante estrategia: {strategy_name}.")
                                return
                        except Exception as exc:
                            last_error = exc
                except Exception as exc:
                    last_error = exc
        page.wait_for_timeout(300)
    raise RuntimeError(
        f"No se pudo seleccionar «{texto}» en Talana. "
        f"URL actual: {page.url}. Último detalle: {last_error or 'no hubo coincidencias visibles'}"
    )


def iniciar_sesion_talana(page, rut, clave):
    page.goto(TALANA_URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(4000)
    page.locator("input[type='text'], input[type='email']").first.wait_for(state="visible", timeout=60000)
    page.locator("input[type='text'], input[type='email']").first.fill(rut)
    page.locator("button:has-text('Continuar')").first.click(timeout=30000)
    page.locator("input[type='password']").first.wait_for(state="visible", timeout=60000)
    page.locator("input[type='password']").first.fill(clave)
    try:
        page.locator("button.mat-flat-button, button[type='submit']").first.click(timeout=20000)
    except Exception:
        page.get_by_role("button", name=re.compile(r"iniciar sesión|iniciar sesion|ingresar|entrar", re.I)).first.click(timeout=15000)

    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        current = (page.url or "").lower()
        if "/es/remuneraciones" in current and "/auth/login" not in current:
            page.wait_for_timeout(1500)
            cerrar_popups(page)
            return
        for frame in list(page.frames):
            for text in ("Reportes", "Inicio", "Buen día"):
                try:
                    loc = frame.get_by_text(text, exact=(text != "Buen día"))
                    for i in range(min(loc.count(), 30)):
                        if loc.nth(i).is_visible():
                            page.wait_for_timeout(1500)
                            cerrar_popups(page)
                            return
                except Exception:
                    pass
        page.wait_for_timeout(500)
    page.screenshot(path=str(DOWNLOAD_DIR / "despues_login_talana.png"), full_page=True)
    raise RuntimeError("No se detectó el panel de Talana después del inicio de sesión. Revise credenciales, MFA o cambios en la pantalla de acceso.")


def descargar_ausentismo_historico(page):
    click_texto(page, "Reportes")
    click_texto(page, "AUSENTISMOS")
    page.wait_for_timeout(700)
    report = "Detalle Ausentismos histórico"
    with page.expect_download(timeout=45000) as info:
        click_texto(page, report)
    return guardar_descarga(info.value, "detalle_ausentismos_historico")


def seleccionar_desde(page, fecha):
    dialog = page.get_by_role("dialog")
    scope = dialog if dialog.count() else page.locator("body")
    scope.get_by_text("Desde", exact=True).first.wait_for(state="visible", timeout=10000)
    candidates = [scope.locator("input[type='date']"), scope.locator("input[placeholder*='dd-mm-aaaa' i]"), scope.locator("input[placeholder*='dd-mm' i]")]
    field = None
    for group in candidates:
        for i in range(min(group.count(), 10)):
            item = group.nth(i)
            if item.is_visible():
                field = item
                break
        if field:
            break
    if field is None:
        raise RuntimeError("No se encontró el campo Desde para el reporte de vacaciones.")
    if (field.get_attribute("type") or "").lower() == "date":
        from datetime import datetime
        field.fill(datetime.strptime(fecha, "%d-%m-%Y").strftime("%Y-%m-%d"))
    else:
        field.fill(fecha)


def descargar_solicitudes_vacaciones(page, fecha_desde):
    click_texto(page, "Detalle solicitudes de vacaciones históricas")
    page.wait_for_timeout(500)
    seleccionar_desde(page, fecha_desde)
    with page.expect_download(timeout=45000) as info:
        page.get_by_role("button", name=re.compile(r"excel", re.I)).click(timeout=15000)
    return guardar_descarga(info.value, "detalle_solicitudes_vacaciones_historicas")


def ejecutar_descargas(rut, clave, headless=True):
    resultados, errores = [], []
    if not rut or not clave:
        raise RuntimeError("Faltan TALANA_USER o TALANA_PASSWORD en las variables de entorno.")
    with sync_playwright() as p:
        # Usar Chromium administrado por Playwright, compatible con GitHub Actions Linux.
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(15000)
        try:
            print("Abriendo Talana e iniciando sesión...")
            iniciar_sesion_talana(page, rut, clave)
            try:
                path = descargar_ausentismo_historico(page)
                resultados.append(("Detalle Ausentismos histórico", str(path)))
                print(f"Descarga completada: {path.name}")
            except Exception as exc:
                errores.append(("Detalle Ausentismos histórico", str(exc)))
                print(f"ERROR reporte ausentismos: {exc}")
            try:
                path = descargar_solicitudes_vacaciones(page, primer_dia_mes_actual())
                resultados.append(("Detalle solicitudes de vacaciones históricas", str(path)))
                print(f"Descarga completada: {path.name}")
            except Exception as exc:
                errores.append(("Detalle solicitudes de vacaciones históricas", str(exc)))
                print(f"ERROR reporte vacaciones: {exc}")
            return resultados, errores
        finally:
            context.close()
            browser.close()
