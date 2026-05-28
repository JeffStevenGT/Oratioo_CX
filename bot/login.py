"""
login.py — Automatización de login en Pangea Orange
=====================================================
FLUJO EXACTO (basado en Bot_Orange de referencia):
  1. Aceptar cookies
  2. Login: input[name='temp-username'] + input[name='temp-password'] + #submit-button
  3. Manejar "máximo de sesiones" si aparece
  4. Seleccionar marca: a.orange-box
  5. Abrir nuevo acto comercial
"""

import random
import time
import re
from playwright.sync_api import Page


# ── Excepciones ────────────────────────────────────

class LoginError(Exception):
    pass

class SessionExpiredError(Exception):
    pass

class CriticalError(Exception):
    pass


# ── Helpers ────────────────────────────────────────

def _escribir_como_humano(page: Page, selector: str, texto: str):
    """Escribe caracter por caracter con delay aleatorio + Tab para Angular."""
    campo = page.locator(selector).locator("visible=true").first
    campo.click()
    campo.fill("")
    for letra in texto:
        page.keyboard.type(letra, delay=random.randint(50, 150))
    # CRÍTICO: Tab para que Angular registre el cambio
    page.keyboard.press("Tab")
    page.wait_for_timeout(random.randint(300, 800))


def _extraer_texto(page: Page, selector: str) -> str:
    """Extrae texto de un elemento vía evaluate para bypassear Angular."""
    try:
        elemento = page.locator(selector).first
        texto = elemento.evaluate("el => el.textContent")
        return texto.strip().replace("\n", " ") if texto else "N/A"
    except Exception:
        return "N/A"


# ── Login ──────────────────────────────────────────

def manejar_cookies_flexible(page: Page):
    """Acepta el banner de cookies."""
    try:
        boton = page.locator("button:has-text('Aceptar')").first
        boton.wait_for(state="visible", timeout=5000)
        boton.click()
        print("  [Login] Cookies aceptadas")
    except Exception:
        pass


def manejar_maximo_sesiones(page: Page):
    """Maneja el modal de 'máximo número de sesiones'."""
    try:
        if page.get_by_text(
            "ya ha alcanzado el número máximo permitido de sesiones"
        ).is_visible(timeout=5000):
            page.locator("button, input[type='submit']").first.click()
            page.wait_for_load_state("networkidle")
            print("  [Login] Sesión máxima cerrada")
    except Exception:
        pass


def realizar_login(page: Page, usuario: str = None, password: str = None):
    """Login en Orange con los selectores exactos del proyecto de referencia."""
    from dotenv import load_dotenv
    import os
    load_dotenv()

    usuario = usuario or os.getenv("ORANGE_USER", "")
    password = password or os.getenv("ORANGE_PASS", "")

    if not usuario or not password:
        raise LoginError("ORANGE_USER y ORANGE_PASS deben estar en .env")

    print(f"  [Login] Iniciando sesión...")

    try:
        # Esperar campo de usuario (temp-username es el input Angular)
        page.wait_for_selector("input[name='temp-username']", timeout=20000)
        _escribir_como_humano(page, "input[name='temp-username']", usuario)
        _escribir_como_humano(page, "input[name='temp-password']", password)

        # Click en botón de login
        page.click("#submit-button")

        # Manejar posible modal de máximo de sesiones
        manejar_maximo_sesiones(page)

        # Esperar que aparezca el selector de marcas
        page.wait_for_selector(".brands", timeout=30000)
        print("  [Login] [OK] Login exitoso")

    except Exception as e:
        raise LoginError(f"Fallo en login: {e}")


def seleccionar_marca_orange(page: Page):
    """Selecciona la marca Orange en el selector de marcas."""
    print("  [Login] Seleccionando marca Orange...")
    try:
        selector = "a.orange-box"
        page.wait_for_selector(selector, state="visible", timeout=20000)
        page.wait_for_timeout(2000)
        page.click(selector)
        page.wait_for_selector("#orange-container", timeout=30000)
        print("  [Login] [OK] Marca Orange seleccionada")
    except Exception as e:
        raise LoginError(f"Fallo al seleccionar marca: {e}")


def abrir_nuevo_acto_comercial(page: Page):
    """Abre un nuevo acto comercial: Tarifas -> Crear."""
    print("  [Login] Preparando entorno (nuevo acto comercial)...")
    try:
        page.locator("button:has-text('Nuevo acto comercial')").first.click()
        page.wait_for_timeout(1000)

        page.locator("li:has-text('Tarifas')").first.click()

        btn_crear = page.locator("button:has-text('Crear')").last
        btn_crear.wait_for(state="visible", timeout=20000)
        page.wait_for_timeout(1500)
        btn_crear.click()

        # Esperar que aparezca el botón de cambiar cliente
        page.wait_for_selector("button[title='Cambiar cliente']", timeout=30000)
        print("  [Login] [OK] Entorno listo")
    except Exception as e:
        raise LoginError(f"Fallo al armar entorno: {e}")


# ── Extracción de datos del cliente ────────────────

def _detectar_y_cerrar_toast(page) -> bool:
    """Detecta y cierra el toast 'No se han podido recuperar campañas' de Pangea.
    Retorna True si lo encontró y cerró."""
    try:
        toast = page.locator(".message-relevant.error")
        if toast.count() == 0:
            return False
        if not toast.first.is_visible(timeout=2000):
            return False
        print("  [Extracción] [WARN] Detectado toast 'No se han podido recuperar campañas'")
        cerrar = page.locator(".message-relevant.error .btn-close").first
        cerrar.click(force=True, timeout=3000)
        page.wait_for_timeout(1000)
        return True
    except Exception:
        return False


def extraer_datos_cliente(page: Page, numero: str, buscar_por_dni: bool = True,
                           modal_ya_abierto: bool = False):
    """
    Busca un cliente por DNI (o teléfono) y extrae todos sus datos.

    Args:
        modal_ya_abierto: Si True, el modal de búsqueda ya está abierto
                          ("no es cliente" del DNI anterior). Solo escribe
                          el DNI y busca, sin reabrir el modal.

    Retorna lista de dicts (una fila por línea del cliente).
    """
    max_intentos = 2

    for intento in range(max_intentos):
        print(f"  [Extracción] Buscando: {numero} (Intento {intento+1})")
        try:
            # ── 1. BÚSQUEDA ──────────────────────────
            if modal_ya_abierto:
                # ⚡ Modal abierto del DNI anterior ("no es cliente")
                # Solo escribir nuevo DNI y buscar — ahorra ~3s
                selector_documento = "input[name='document']"
                try:
                    page.wait_for_selector(selector_documento, state="visible", timeout=5000)
                except Exception:
                    selector_documento = "input[ng-model='locatorCtrl.inputDocument']"
                    page.wait_for_selector(selector_documento, state="visible", timeout=5000)
            else:
                # ── Abrir modal de búsqueda ──
                btn_cambiar = page.locator("button[title='Cambiar cliente']")
                btn_cambiar.wait_for(state="visible", timeout=15000)
                btn_cambiar.click(force=True)

                # ═══ CAMPO CORRECTO: input[name='document'] (no usar msisdn!) ═══
                selector_documento = "input[name='document']"
                try:
                    page.wait_for_selector(selector_documento, state="visible", timeout=10000)
                except Exception:
                    selector_documento = "input[ng-model='locatorCtrl.inputDocument']"
                    page.wait_for_selector(selector_documento, state="visible", timeout=10000)

            # [WARN] NO usar _escribir_como_humano aquí — el keyboard.type() pierde el foco en Angular
            # Usar fill() directo que escribe al value del input sin depender del foco
            campo_doc = page.locator(selector_documento).first
            campo_doc.click()
            campo_doc.fill("")       # Limpiar
            campo_doc.fill(numero)    # Escribir DNI directo al input
            # Disparar eventos para que Angular registre el valor
            campo_doc.evaluate(
                "el => { el.dispatchEvent(new Event('input', { bubbles: true })); "
                "el.dispatchEvent(new Event('change', { bubbles: true })); }"
            )
            page.wait_for_timeout(random.randint(300, 800))

            btn_buscar = page.locator("button:has-text('Buscar cliente')").last
            btn_buscar.click(force=True)

            # ── BLINDAJE: esperar que el modal se cierre ──
            print("  [Extracción] Verificando procesamiento...")
            try:
                btn_buscar.wait_for(state="hidden", timeout=10000)
            except Exception:
                # Puede que el modal no se cierre si no es cliente
                pass

            # ═══ DETECTAR "NO ES CLIENTE" ═══
            no_cliente_selectores = [
                "span.txt:has-text('No se han encontrado datos')",
                "span.txt:has-text('No se han encontrado datos para este cliente')",
                ".msg-error:has-text('No se han encontrado')",
            ]
            es_no_cliente = False
            for sel in no_cliente_selectores:
                try:
                    if page.locator(sel).first.is_visible(timeout=2000):
                        es_no_cliente = True
                        break
                except Exception:
                    continue

            if es_no_cliente:
                print(f"  [Extracción] [FAIL] {numero} NO ES CLIENTE")
                # ⚡ NO cerrar modal — solo limpiar campo y escribir siguiente DNI
                # El mensaje de error no bloquea el input
                return [{
                    "DNI": numero,
                    "Nombre": "NO ES CLIENTE",
                    "Direccion": "N/A",
                    "Seg Fijo": "N/A",
                    "Seg Movil": "N/A",
                    "Paquete": "N/A",
                    "Linea": numero,
                    "es_cima": False,
                    "tiene_renove_mixto": False,
                    "variante_renove": "N/A",
                    "tiene_tv": False,
                    "es_principal": False,
                    "etiquetas": [],
                    "activo_desde": "N/A",
                    "_modal_abierto": True,  # Modal sigue abierto, escribir siguiente DNI
                }]

            # ═══ DETECTAR ERROR "No se han podido recuperar campañas" ═══
            if _detectar_y_cerrar_toast(page):
                print(f"  [Extracción] [FAIL] {numero}: error campañas — saltando al siguiente")
                return [{
                    "DNI": numero,
                    "Nombre": "ERROR CAMPANAS",
                    "Direccion": "N/A",
                    "Seg Fijo": "N/A",
                    "Seg Movil": "N/A",
                    "Paquete": "N/A",
                    "Linea": numero,
                    "es_cima": False,
                    "tiene_renove_mixto": False,
                    "variante_renove": "N/A",
                    "tiene_tv": False,
                    "es_principal": False,
                    "etiquetas": [],
                    "activo_desde": "N/A",
                }]

            print("  [Extracción] Cargando ficha de cliente...")
            page.wait_for_timeout(1500)
            page.wait_for_selector(".mod-barclient__container-data", timeout=20000)

            # ── DETECTAR CIMA GLOBAL (barra superior) ──
            cima_global = False
            try:
                cima_btn = page.locator(".mod-barclient__container-lines-cima-btn")
                if cima_btn.count() > 0:
                    texto_cima_btn = cima_btn.first.inner_text()
                    cima_global = "isCima" in texto_cima_btn or "CIMA" in texto_cima_btn.upper()
            except Exception:
                pass

            # ── 2. DATOS CABECERA ─────────────────────
            nombre = _extraer_texto(page, ".tooltip-text.name strong")
            dni = _extraer_texto(page, "span.font-xxs.p-r-10")
            direccion = _extraer_texto(page, ".tooltip-text.address")
            seg_fijo = _extraer_texto(page, "div.font-xxs:has-text('Seg. Fijo:') strong")
            seg_movil = _extraer_texto(page, "div.font-xxs:has-text('Seg. Móvil:') strong")
            paquete = _extraer_texto(page, ".client-tariff-title .font-lg")

            print(f"  [Extracción] Cliente: {nombre} | DNI: {dni} | Paquete: {paquete}")
            print(f"  [Extracción] Dirección: {direccion}")

            # ═══ CERRAR TOAST DE ERROR ("No se han podido recuperar campañas") Y SALTAR DNI ═══
            if _detectar_y_cerrar_toast(page):
                print(f"  [Extracción] [FAIL] {numero}: error campañas — saltando al siguiente")
                return [{
                    "DNI": numero,
                    "Nombre": "ERROR CAMPANAS",
                    "Direccion": direccion if direccion != "N/A" else "N/A",
                    "Seg Fijo": "N/A",
                    "Seg Movil": "N/A",
                    "Paquete": "N/A",
                    "Linea": numero,
                    "es_cima": False,
                    "tiene_renove_mixto": False,
                    "variante_renove": "N/A",
                    "tiene_tv": False,
                    "es_principal": False,
                    "etiquetas": [],
                    "activo_desde": "N/A",
                }]

            # ── 3. BUCLE DE LÍNEAS CON PAGINACIÓN ─────
            lineas_finales = []
            lineas_vistas = set()  # Anti-loop paginacion
            hay_mas_paginas = True
            pagina_actual = 1

            while hay_mas_paginas:
                print(f"  [Extracción] Página {pagina_actual} de líneas...")
                bloques = page.locator(".client-tariff-flex")

                for i in range(bloques.count()):
                    bloque = bloques.nth(i)
                    if not bloque.locator(".line-section .color-primary strong").is_visible():
                        continue

                    num_linea = bloque.locator(
                        ".line-section .color-primary strong"
                    ).inner_text().strip()
                    # 🔄 Anti-loop: si ya vimos esta línea, Orange está repitiendo páginas
                    if num_linea in lineas_vistas:
                        print(f"    🛑 Línea {num_linea} repetida — loop de paginación. Saliendo.")
                        hay_mas_paginas = False
                        break
                    lineas_vistas.add(num_linea)
                    print(f"    -> Línea: {num_linea}")

                    # ── Extraer etiquetas reales del heading (CIMA, TV, Principal, etc.) ──
                    try:
                        heading = bloque.locator(".client-tariff-heading")
                        labels = heading.locator("span.label")
                        etiquetas = [labels.nth(k).inner_text().strip() for k in range(labels.count())]
                        texto_completo = heading.first.inner_text()
                    except Exception:
                        etiquetas = []
                        texto_completo = ""
                    es_cima = "CIMA" in etiquetas or cima_global
                    tiene_tv = "TV" in etiquetas
                    es_principal = "Principal" in etiquetas
                    # Extraer fecha activo desde
                    match_fecha = re.search(r'Activo desde\s+(\d{2}/\d{2}/\d{4})', texto_completo)
                    activo_desde = match_fecha.group(1) if match_fecha else "N/A"

                    # ── Detectar Renove: click en PESTAÑA "Renove" (no en tarjeta!) ──
                    tiene_rm = False
                    variante_renove = "N/A"
                    renove_timeout = False
                    heading_text = ""
                    tiene_rm_heading = False
                    try:
                        heading_text = bloque.locator(".client-tariff-heading").first.inner_text()
                        tiene_rm_heading = "renove" in heading_text.lower()
                    except Exception:
                        pass

                    try:
                        # Buscar la BARRA DE PESTAÑAS de esta línea
                        tab_bar = bloque.locator(".client-tariff-section-navs")
                        if tab_bar.count() > 0:
                            # Encontrar el botón "Renove" en los tabs
                            renove_tab_btn = tab_bar.locator("button:has-text('Renove')")
                            if renove_tab_btn.count() > 0:
                                print(f"      [RENOVE] Click en pestaña de navegación 'Renove'...")
                                try:
                                    renove_tab_btn.first.click(timeout=5000)
                                    page.wait_for_timeout(500)
                                except Exception:
                                    try:
                                        renove_tab_btn.first.click(force=True, timeout=5000)
                                        page.wait_for_timeout(500)
                                    except Exception:
                                        pass

                                # Leer el contenido de la tarjeta Renove (card-tariff-minimal)
                                texto_card = ""
                                try:
                                    cards_container = bloque.locator(".client-tariff-section-cards")
                                    if cards_container.count() > 0:
                                        # Buscar la card con label "Renove"
                                        renove_card = cards_container.locator(".card-tariff-minimal")
                                        for c_idx in range(renove_card.count()):
                                            card = renove_card.nth(c_idx)
                                            # Leer info-text directamente (puede no tener label cuando tab está activo)
                                            txt_el = card.locator(".card-tariff-info-text")
                                            if txt_el.count() > 0:
                                                txt = txt_el.first.inner_text().strip()
                                                # Si contiene RENOVE/MIXTO/MULTI, es la card que buscamos
                                                if "renove" in txt.upper() or "MIXTO" in txt.upper() or "MULTIDISPOSITIVO" in txt.upper():
                                                    texto_card = txt
                                                    break
                                                # Si no encontramos con filtro, guardar la primera y seguir buscando
                                                if not texto_card:
                                                    texto_card = txt
                                            else:
                                                txt = card.inner_text().strip()
                                                if "renove" in txt.upper():
                                                    texto_card = txt
                                                    break
                                                if not texto_card:
                                                    texto_card = txt
                                except Exception:
                                    pass

                                texto_up = texto_card.upper() if texto_card else ""
                                tiene_rm = True

                                if "RENOVE MIXTO" in texto_up or "MIXTO" in texto_up:
                                    if "MÁXIMO DESCUENTO" in texto_up or "MAXIMO DESCUENTO" in texto_up:
                                        variante_renove = "Renove mixto al mejor precio con máximo descuento"
                                    elif "CON DESCUENTO" in texto_up:
                                        variante_renove = "Renove mixto al mejor precio con descuento"
                                    elif "MEJOR PRECIO" in texto_up:
                                        variante_renove = "Renove mixto al mejor precio"
                                    else:
                                        variante_renove = "Renove mixto"
                                elif "MULTIDISPOSITIVO" in texto_up:
                                    variante_renove = "Renove Multidispositivo"
                                elif texto_card:
                                    variante_renove = f"Renove ({texto_card})"
                                # Si no hay texto, NO poner "Renove" a secas (pisaría datos válidos de otras líneas)
                                # mejor dejar "N/A" — la línea no tiene Renove visible

                                print(f"      [RENOVE] Texto: {texto_card[:80] if texto_card else '(vacio)'} | -> {variante_renove}")
                            else:
                                print(f"      [RENOVE] No hay pestaña 'Renove' en la barra de tabs")
                        else:
                            print(f"      [RENOVE] No hay barra de pestañas en esta línea")
                    except Exception as e:
                        print(f"      [RENOVE] Error: {e}")

                    # ── FALLBACK heading ──
                    if not tiene_rm and tiene_rm_heading:
                        variante_renove = "Renove (detectado en heading)"
                        print(f"      [RENOVE] Detectado en heading: {heading_text[:80]}")
                        tiene_rm = True

                    if renove_timeout:
                        raise Exception(f"Renove no cargó para {numero}")

                    lineas_finales.append({
                        "DNI": dni,
                        "Nombre": nombre,
                        "Direccion": direccion,
                        "Seg Fijo": seg_fijo,
                        "Seg Movil": seg_movil,
                        "Paquete": paquete,
                        "Linea": num_linea,
                        "es_cima": es_cima,
                        "tiene_renove_mixto": tiene_rm,
                        "variante_renove": variante_renove,
                        "tiene_tv": tiene_tv,
                        "es_principal": es_principal,
                        "etiquetas": etiquetas,
                        "activo_desde": activo_desde,
                    })

                # Siguiente página de líneas
                btn_siguiente = page.locator("button.ocs-pagination-next")
                if (btn_siguiente.count() > 0
                        and not btn_siguiente.is_disabled()):
                    # Verificar si la PRIMERA línea de esta página ya se procesó (loop)
                    if pagina_actual > 1 and lineas_finales and num_linea in lineas_vistas:
                        print(f"  [Extracción] ⛔ Loop detectado en página {pagina_actual}. Saliendo de paginación.")
                        hay_mas_paginas = False
                    else:
                        print("  [Extracción] -> Siguiente página de líneas...")
                        btn_siguiente.click(force=True, timeout=30000)
                        page.wait_for_timeout(2000)
                        pagina_actual += 1
                else:
                    hay_mas_paginas = False

            return lineas_finales

        except Exception as e:
            print(f"  [Extracción] [WARN] Error recuperable: {e}")
            if intento < max_intentos - 1:
                print("  [Extracción] [RETRY] Recuperando sesión (1 F5)...")
                recuperado = False
                try:
                    page.reload(timeout=30000, wait_until="domcontentloaded")
                    page.wait_for_timeout(3000)
                    if page.locator("a.orange-box").is_visible(timeout=5000):
                        page.locator("a.orange-box").click()
                        page.wait_for_timeout(2000)
                    abrir_nuevo_acto_comercial(page)
                    print("  [Extracción] [OK] Sesión recuperada tras F5")
                    recuperado = True
                except Exception as ex:
                    print(f"  [Extracción] F5 falló: {ex}")
                if not recuperado:
                    print("  [Extracción] [FAIL] No se pudo recuperar con F5")
            else:
                return [{"Linea": numero, "Estado": "Error de carga"}]


def verificar_sesion_valida(page: Page) -> bool:
    """Verifica si la sesión actual sigue siendo válida."""
    try:
        page.locator("button[title='Cambiar cliente']").wait_for(
            state="visible", timeout=5000
        )
        return True
    except Exception:
        return False
