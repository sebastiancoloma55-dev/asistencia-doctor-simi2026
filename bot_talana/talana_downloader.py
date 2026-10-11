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
        # Talana abre modales de generación de forma asíncrona; nunca intentes
        # pulsar el siguiente reporte mientras el modal esté bloqueando la página.
        try:
            if modal_progreso_visible(page):
                esperar_fin_modal_progreso(page, timeout_segundos=600)
                page.wait_for_timeout(500)
        except NameError:
            pass
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


def texto_visible(page, texto):
    for frame in list(page.frames):
        try:
            loc = frame.get_by_text(texto, exact=True)
            for i in range(min(loc.count(), 50)):
                if loc.nth(i).is_visible():
                    return True
        except Exception:
            pass
    return False


def registrar_descargas(context, page):
    eventos, registradas = [], set()
    def conectar(pagina):
        if id(pagina) in registradas:
            return
        registradas.add(id(pagina))
        pagina.on("download", lambda descarga, pag=pagina: eventos.append((pag, descarga)))
    conectar(page)
    context.on("page", conectar)
    return eventos


def modal_progreso_visible(page):
    """Detecta el modal de generación de reportes que puede bloquear los siguientes clics."""
    for frame in list(page.frames):
        try:
            progreso = frame.locator("#liquidacionesProgressModal")
            for i in range(min(progreso.count(), 5)):
                if progreso.nth(i).is_visible():
                    return True
        except Exception:
            pass
        for selector in ("[role='dialog']", ".modal.show", ".modal.in"):
            try:
                loc = frame.locator(selector)
                for i in range(min(loc.count(), 10)):
                    el = loc.nth(i)
                    if not el.is_visible():
                        continue
                    txt = (el.inner_text(timeout=500) or "").lower()
                    if el.locator(".percent").count() or any(
                        word in txt for word in ("generando", "procesando", "importando", "descargando", "cargando")
                    ):
                        return True
            except Exception:
                pass
    return False


def esperar_fin_modal_progreso(page, timeout_segundos=600):
    """No permite que el modal de generación interfiera con la siguiente tarea."""
    inicio = time.monotonic()
    oculto_desde = None
    while time.monotonic() - inicio < timeout_segundos:
        if modal_progreso_visible(page):
            oculto_desde = None
        else:
            if oculto_desde is None:
                oculto_desde = time.monotonic()
            elif time.monotonic() - oculto_desde >= 3:
                return
        page.wait_for_timeout(500)
    raise RuntimeError("El modal de generación de Talana no terminó dentro del tiempo permitido.")


def esperar_descarga_evento(page, eventos, cantidad_inicial, nombre_base, timeout_segundos=600):
    inicio = time.monotonic()
    progreso_visto = False
    oculto_desde = None
    captura = DOWNLOAD_DIR / f"{nombre_seguro(nombre_base)}_pendiente.png"
    while time.monotonic() - inicio < timeout_segundos:
        if len(eventos) > cantidad_inicial:
            _, descarga = eventos[cantidad_inicial]
            archivo = guardar_descarga(descarga, nombre_base)
            # Talana puede emitir el archivo mientras su modal sigue activo.
            # Esperar a que se cierre evita que bloquee la tarea siguiente.
            esperar_fin_modal_progreso(page, timeout_segundos=min(600, max(30, timeout_segundos - (time.monotonic() - inicio))))
            return archivo

        visible = modal_progreso_visible(page)
        if visible:
            progreso_visto = True
            oculto_desde = None
        elif progreso_visto:
            if oculto_desde is None:
                oculto_desde = time.monotonic()
            elif time.monotonic() - oculto_desde >= 3:
                # Dar margen a Playwright para recibir el evento de descarga tras cerrar el modal.
                limite_gracia = time.monotonic() + 10
                while time.monotonic() < limite_gracia:
                    if len(eventos) > cantidad_inicial:
                        _, descarga = eventos[cantidad_inicial]
                        return guardar_descarga(descarga, nombre_base)
                    page.wait_for_timeout(250)
                break
        # No abortar a los 45 s: algunos reportes de Talana tardan más en generar el archivo.
        page.wait_for_timeout(500)

    try:
        page.screenshot(path=str(captura), full_page=True)
    except Exception:
        pass
    if modal_progreso_visible(page):
        raise RuntimeError(
            f"Talana mantuvo activo el modal de generación de «{nombre_base}» y no entregó el archivo. "
            f"Captura: {captura}"
        )
    raise RuntimeError(f"Talana no entregó la descarga «{nombre_base}» tras esperar {int(time.monotonic() - inicio)} s. Captura: {captura}")

def descargar_ausentismo_historico(page, eventos):
    report = "Detalle Ausentismos histórico"
    if not texto_visible(page, report):
        if "/es/remuneraciones/reportes" not in (page.url or "").lower():
            click_texto(page, "Reportes")
        if not texto_visible(page, report):
            click_texto(page, "AUSENTISMOS")
        page.wait_for_timeout(700)
    if not texto_visible(page, report):
        raise RuntimeError("No aparece «Detalle Ausentismos histórico» en la lista de reportes.")
    n = len(eventos)
    click_texto(page, report)
    return esperar_descarga_evento(page, eventos, n, "detalle_ausentismos_historico")

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


def descargar_solicitudes_vacaciones(page, fecha_desde, eventos):
    report = "Detalle solicitudes de vacaciones históricas"
    if not texto_visible(page, report):
        click_texto(page, "VACACIONES")
        page.wait_for_timeout(500)
    if not texto_visible(page, report):
        raise RuntimeError("No aparece «Detalle solicitudes de vacaciones históricas» dentro de VACACIONES.")
    # Usa el identificador estable de Talana cuando está presente; el texto
    # visible queda como alternativa para cambios menores de interfaz.
    enlace = page.locator('a[data-cy="gdp-employees-report-detail-historical-vacation-requests"]')
    try:
        if enlace.count() and enlace.first.is_visible():
            if modal_progreso_visible(page):
                esperar_fin_modal_progreso(page, timeout_segundos=600)
            enlace.first.click(timeout=15000)
        else:
            click_texto(page, report)
    except Exception:
        click_texto(page, report)
    page.wait_for_timeout(500)
    seleccionar_desde(page, fecha_desde)
    n = len(eventos)
    page.get_by_role("button", name=re.compile(r"excel", re.I)).first.click(timeout=15000)
    return esperar_descarga_evento(page, eventos, n, "detalle_solicitudes_vacaciones_historicas")

def esperar_modal_progreso(page, timeout_segundos=600):
    inicio, visto, oculto_desde = time.monotonic(), False, None
    while time.monotonic() - inicio < timeout_segundos:
        visible = False
        for frame in list(page.frames):
            for selector in ("#liquidacionesProgressModal", "[role='dialog']", ".modal.show", ".modal.in"):
                try:
                    loc = frame.locator(selector)
                    for i in range(min(loc.count(), 10)):
                        el = loc.nth(i)
                        if el.is_visible():
                            txt = (el.inner_text(timeout=500) or "").lower()
                            if any(w in txt for w in ("generando", "procesando", "importando", "%", "cargando")):
                                visible = True
                                break
                    if visible: break
                except Exception: pass
            if visible: break
        if visible:
            visto, oculto_desde = True, None
        elif visto:
            if oculto_desde is None: oculto_desde = time.monotonic()
            elif time.monotonic() - oculto_desde >= 3:
                return "Importación/procesamiento completado en Talana."
        elif time.monotonic() - inicio > 45:
            raise RuntimeError("No se detectó el modal de progreso tras iniciar Maestro empleado.")
        page.wait_for_timeout(500)
    raise RuntimeError("Talana mantuvo el proceso de Maestro empleado activo durante 10 minutos.")


def descargar_maestro_empleado(page, eventos):
    """Genera y guarda el archivo descargable de Maestro Trabajadores."""
    click_texto(page, "Trabajadores")
    boton, limite = None, time.monotonic() + 60
    while time.monotonic() < limite and boton is None:
        for frame in list(page.frames):
            for selector in ("#btnOpenListDownload", '[data-cy="gdp-employees-open-dropdown-download-report"]'):
                try:
                    loc = frame.locator(selector)
                    for i in range(min(loc.count(), 5)):
                        el = loc.nth(i)
                        if el.is_visible() and el.is_enabled():
                            boton = el; break
                except Exception: pass
                if boton is not None: break
        if boton is None: page.wait_for_timeout(400)
    if boton is None: raise RuntimeError("No apareció el botón Descargar (#btnOpenListDownload) en Trabajadores.")
    boton.click(timeout=15000)
    objetivo, limite = None, time.monotonic() + 25
    while time.monotonic() < limite and objetivo is None:
        for frame in list(page.frames):
            for selector in ("#empleadosExport1", '[data-cy="gdp-employees-report-workerMaster"]#empleadosExport1'):
                try:
                    loc = frame.locator(selector)
                    for i in range(min(loc.count(), 5)):
                        el = loc.nth(i)
                        if el.is_visible() and el.is_enabled():
                            objetivo = el; break
                except Exception: pass
                if objetivo is not None: break
        if objetivo is None: page.wait_for_timeout(300)
    if objetivo is None: raise RuntimeError("No apareció «Maestro Trabajadores» (#empleadosExport1).")
    # Registrar el contador antes de iniciar la exportación para no confundir
    # la animación de progreso con una descarga completada.
    cantidad_inicial = len(eventos)
    objetivo.click(timeout=15000)
    return esperar_descarga_evento(
        page, eventos, cantidad_inicial, "maestro_empleado", timeout_segundos=600
    )


def cambiar_a_asistencia_y_turnos(page):
    candidatos = []
    for frame in list(page.frames):
        try:
            loc = frame.get_by_text("Remuneraciones", exact=True)
            for i in range(min(loc.count(), 60)):
                el = loc.nth(i)
                if not el.is_visible(): continue
                rect = el.evaluate("e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,vw:innerWidth};}")
                if rect and rect["y"] < 150 and rect["x"] > rect["vw"] * 0.55:
                    candidatos.append((rect["y"], -rect["x"], el))
        except Exception: pass
    if not candidatos: raise RuntimeError("No se encontró el selector superior del módulo Remuneraciones.")
    candidatos.sort(key=lambda x: (x[0], x[1]))
    candidatos[0][2].click(timeout=12000)
    page.wait_for_timeout(500)
    click_texto(page, "Asistencia y Turnos")
    # Talana puede redirigir primero a /attendance/loading?next=... y
    # no mostrar la etiqueta "Jornadas" aunque el calendario ya sea la vista activa.
    limite = time.monotonic() + 90
    while time.monotonic() < limite:
        url_actual = (page.url or "").lower()
        ruta_jornadas = "/attendance/workdays/calendar" in url_actual
        cargando = "/attendance/loading" in url_actual
        if ruta_jornadas and not cargando:
            page.wait_for_timeout(1500)
            return
        if texto_visible(page, "Jornadas") and not cargando:
            return
        page.wait_for_timeout(500)
    raise RuntimeError(
        "No se confirmó la vista Jornadas en Asistencia y Turnos. "
        f"URL actual: {page.url}"
    )


def descargar_reporte_jornadas(page, eventos):
    # En distintas versiones de Talana el control puede ser botón, enlace,
    # acción con aria-label o texto dentro de un componente de React.
    url_actual = (page.url or "").lower()
    if "/attendance/workdays/calendar" not in url_actual:
        click_texto(page, "Jornadas")
    else:
        limite_carga = time.monotonic() + 60
        while time.monotonic() < limite_carga and "/attendance/loading" in (page.url or "").lower():
            page.wait_for_timeout(500)
        page.wait_for_timeout(1200)

    patron = re.compile(r"(descargar|exportar).*(reporte|excel|jornada)?|(reporte|excel|jornada).*(descargar|exportar)", re.I)
    selectores = (
        'button:has-text("Descargar reporte")',
        'a:has-text("Descargar reporte")',
        '[role="button"]:has-text("Descargar reporte")',
        '[data-cy*="download" i]',
        '[data-testid*="download" i]',
        '[aria-label*="descargar" i]',
        '[title*="descargar" i]',
        'button:has-text("Exportar")',
        'a:has-text("Exportar")',
        'button:has-text("Descargar")',
        'a:has-text("Descargar")',
    )
    boton, limite = None, time.monotonic() + 60
    while time.monotonic() < limite and boton is None:
        for frame in list(page.frames):
            try:
                for getter in (
                    lambda: frame.get_by_role("button", name=patron),
                    lambda: frame.get_by_role("link", name=patron),
                    lambda: frame.get_by_text(patron),
                ):
                    loc = getter()
                    for i in range(min(loc.count(), 30)):
                        el = loc.nth(i)
                        if el.is_visible() and el.is_enabled():
                            boton = el
                            break
                    if boton is not None:
                        break
                if boton is None:
                    for selector in selectores:
                        loc = frame.locator(selector)
                        for i in range(min(loc.count(), 20)):
                            el = loc.nth(i)
                            if el.is_visible() and el.is_enabled():
                                boton = el
                                break
                        if boton is not None:
                            break
            except Exception:
                # Los frames pueden desmontarse mientras Talana navega.
                continue
            if boton is not None:
                break
        if boton is None:
            page.wait_for_timeout(500)

    if boton is None:
        controles = []
        for frame in list(page.frames):
            try:
                loc = frame.locator("button, a, [role='button']")
                for i in range(min(loc.count(), 80)):
                    el = loc.nth(i)
                    if el.is_visible():
                        label = (el.inner_text(timeout=300) or "").strip().replace("\n", " ")
                        aria = el.get_attribute("aria-label") or ""
                        title = el.get_attribute("title") or ""
                        candidate = " ".join(x for x in (label, aria, title) if x)
                        if candidate:
                            controles.append(candidate[:100])
            except Exception:
                continue
        resumen = " | ".join(controles[:35])
        raise RuntimeError(
            "No se encontró el control de descarga en Jornadas. "
            f"URL actual: {page.url}. Controles visibles: {resumen or 'ninguno detectado'}"
        )
    n = len(eventos)
    boton.click(timeout=20000)
    return esperar_descarga_evento(page, eventos, n, "reporte_jornadas_asistencia")

def ejecutar_descargas(rut, clave, headless=True):
    resultados, errores = [], []
    if not rut or not clave:
        raise RuntimeError("Faltan TALANA_USER o TALANA_PASSWORD en las variables de entorno.")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(15000)
        eventos = registrar_descargas(context, page)
        try:
            print("Iniciando sesión en Talana...")
            iniciar_sesion_talana(page, rut, clave)
            tareas = [
                ("Detalle Ausentismos histórico", lambda: descargar_ausentismo_historico(page, eventos), True),
                ("Detalle solicitudes de vacaciones históricas", lambda: descargar_solicitudes_vacaciones(page, primer_dia_mes_actual(), eventos), True),
                ("Maestro empleado", lambda: descargar_maestro_empleado(page, eventos), True),
                ("Reporte de Jornadas — Asistencia y Turnos", lambda: (cambiar_a_asistencia_y_turnos(page), descargar_reporte_jornadas(page, eventos))[1], True),
            ]
            for titulo, accion, es_archivo in tareas:
                try:
                    # Si la tarea anterior dejó un modal de generación abierto, esperar
                    # antes de intentar clicar el siguiente reporte.
                    if modal_progreso_visible(page):
                        print(f"Esperando que Talana cierre el modal anterior antes de: {titulo}")
                        esperar_fin_modal_progreso(page, timeout_segundos=600)
                    print(f"INICIO: {titulo}")
                    valor = accion()
                    if es_archivo:
                        resultados.append((titulo, str(valor)))
                        print(f"OK: {titulo}: {Path(valor).name}")
                    else:
                        resultados.append((titulo, "__TALANA_ACTION_OK__:" + str(valor)))
                        print(f"OK: {titulo}: {valor}")
                except Exception as exc:
                    errores.append(f"{titulo}: {exc}")
                    print(f"ERROR {titulo}: {exc}")
                    try: page.screenshot(path=str(DOWNLOAD_DIR / (nombre_seguro(titulo) + "_error.png")), full_page=True)
                    except Exception: pass
            return resultados, errores
        finally:
            context.close()
            browser.close()

