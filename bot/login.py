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
        page.keyboard.type(letra, delay=random.randint(20, 50))
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
    """Maneja el modal de 'máximo número de sesiones'.
    Si aparece, lanza LoginError para que el worker reintente mas tarde."""
    import time
    try:
        if page.get_by_text(
            "ya ha alcanzado el número máximo permitido de sesiones"
        ).is_visible(timeout=5000):
            print("  [Login] ERROR: Maximo de sesiones alcanzado. Esperando 30s para reintentar...")
            # Cerrar modal
            try:
                page.locator("button.close[title='Cerrar ventana modal']").first.click(force=True)
            except:
                page.locator("button, input[type='submit']").first.click()
            page.wait_for_timeout(2000)
            raise LoginError("Maximo de sesiones alcanzado")
    except LoginError:
        raise
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
        page.wait_for_timeout(800)
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
        page.wait_for_timeout(500)

        page.locator("li:has-text('Tarifas')").first.click()

        btn_crear = page.locator("button:has-text('Crear')").last
        btn_crear.wait_for(state="visible", timeout=20000)
        page.wait_for_timeout(800)
        btn_crear.click()

        # Esperar que aparezca el botón de cambiar cliente
        page.wait_for_selector("button[title='Cambiar cliente']", timeout=30000)
        print("  [Login] [OK] Entorno listo")
    except Exception as e:
        raise LoginError(f"Fallo al armar entorno: {e}")


# ── Extracción de datos del cliente ────────────────

def extraer_datos_cliente(page: Page, numero: str, buscar_por_dni: bool = True):
    """
    Busca un cliente por DNI (o teléfono) y extrae todos sus datos.
    FLUJO EXACTO del proyecto de referencia, pero busca por DNI.

    Retorna lista de dicts (una fila por línea del cliente).
    Cada dict contiene: DNI, Nombre, Direccion, Seg Fijo, Seg Movil,
    Paquete, Linea, Destacadas, Renove, Bonos y D., Cambio Tarifa, SVA
    """
    max_intentos = 2

    for intento in range(max_intentos):
        print(f"  [Extracción] Buscando: {numero} (Intento {intento+1})")
        try:
            # ── 1. BÚSQUEDA ──────────────────────────
            btn_cambiar = page.locator("button[title='Cambiar cliente']")
            btn_cambiar.wait_for(state="visible", timeout=15000)
            btn_cambiar.click(force=True)

            # ═══ CAMPO CORRECTO: input[name='document'] (no usar msisdn!) ═══
            # El campo de DNI tiene name='document' y placeholder='Número de documento'
            # NO usar selectores con 'msisdn' — esos son para teléfono
            selector_documento = "input[name='document']"
            try:
                page.wait_for_selector(selector_documento, state="visible", timeout=10000)
            except Exception:
                # Fallback: ng-model de Angular (más específico)
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
            for sel in no_cliente_selectores:
                try:
                    if page.locator(sel).first.is_visible(timeout=2000):
                        print(f"  [Extracción] [FAIL] {numero} NO ES CLIENTE")
                        # Cerrar modal
                        try:
                            page.locator("button.close[title='Cerrar ventana modal']").first.click(force=True)
                        except Exception:
                            pass
                        page.wait_for_timeout(1500)
                        # Resetear entorno para el siguiente DNI
                        try:
                            abrir_nuevo_acto_comercial(page)
                        except Exception:
                            pass
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
                            "Destacadas": "N/A",
                            "Renove": "N/A",
                            "Bonos y D.": "N/A",
                            "Cambio Tarifa": "N/A",
                            "SVA": "N/A",
                        }]
                except Exception:
                    continue

            print("  [Extracción] Cargando ficha de cliente...")
            page.wait_for_timeout(2000)
            page.wait_for_selector(".mod-barclient__container-data", timeout=50000)

            # ── DETECTAR CIMA GLOBAL (barra superior) ──
            cima_global = False
            try:
                cima_btn = page.locator(".mod-barclient__container-lines-cima-btn")
                if cima_btn.count() > 0:
                    texto_cima = cima_btn.first.inner_text()
                    cima_global = "isCima" in texto_cima or "CIMA" in texto_cima.upper()
                    if cima_global:
                        print("  [Extracción] [CIMA] Cliente CIMA detectado (barra superior)")
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

            # ── 3. BUCLE DE LÍNEAS CON PAGINACIÓN ─────
            lineas_finales = []
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
                    print(f"    -> Línea: {num_linea}")

                    campanas = {}
                    pestanas_objetivo = [
                        "Destacadas", "Renove",
                        "Bonos y Descuen.", "Cambio Tarifa", "SVA"
                    ]

                    for nombre_tab in pestanas_objetivo:
                        btn_tab = bloque.locator(
                            f"button.Title.text:has-text('{nombre_tab}')"
                        )

                        if btn_tab.count() > 0:
                            btn_tab.click(force=True)
                            page.wait_for_timeout(800)

                            tarjetas = bloque.locator(".card-tariff-info-text")
                            alertas = bloque.locator(".message-relevant .title")

                            if tarjetas.count() > 0:
                                contenido = " | ".join([
                                    tarjetas.nth(j).inner_text().strip()
                                    for j in range(tarjetas.count())
                                ])
                            elif alertas.count() > 0:
                                contenido = alertas.first.inner_text().strip()
                            else:
                                contenido = "Sin datos en esta sección"

                            campanas[nombre_tab] = contenido
                        else:
                            campanas[nombre_tab] = "Pestaña oculta"

                    # ── Extraer etiquetas reales del heading (CIMA, TV, Principal, etc.) ──
                    try:
                        heading = bloque.locator(".client-tariff-heading")
                        labels = heading.locator("span.label")
                        etiquetas_raw = [labels.nth(k).inner_text().strip() for k in range(labels.count())]
                        texto_completo = heading.first.inner_text()
                    except Exception:
                        etiquetas_raw = []
                        texto_completo = ""
                    # Buscar CIMA en etiquetas Y en todo el heading (fallback)
                    es_cima = "CIMA" in etiquetas_raw or "CIMA" in texto_completo
                    tiene_tv = "TV" in etiquetas_raw or "TV" in texto_completo
                    es_principal = "Principal" in etiquetas_raw
                    # Extraer fecha activo desde
                    match_fecha = re.search(r'Activo desde\s+(\d{2}/\d{2}/\d{4})', texto_completo)
                    activo_desde = match_fecha.group(1) if match_fecha else "N/A"

                    # ── Detectar Renove: extraer TODO el texto del area de campañas ──
                    tiene_rm = False
                    variante_renove = "N/A"
                    texto_capturado = ""
                    try:
                        # Extraer todo el texto (incluso hidden) del bloque de campanas
                        seccion = bloque.locator(".client-tariff-container-55")
                        if seccion.count() > 0:
                            texto_capturado = seccion.first.text_content() or ""
                        else:
                            texto_capturado = bloque.text_content() or ""
                        print(f"  [Renove] Texto capturado de la linea {num_linea}: [{texto_capturado[:300]}]")
                        
                        # Buscar "Renove" en todo el texto
                        tiene_renove_general = "Renove" in texto_capturado
                        tiene_rm = bool(re.search(r'Renove\s+mixto', texto_capturado, re.IGNORECASE))
                        print(f"  [Renove] tiene_renove_general={tiene_renove_general}, tiene_rm={tiene_rm}")
                        
                        if tiene_rm:
                            if re.search(r'm[aá]ximo\s+descuento', texto_capturado, re.IGNORECASE):
                                variante_renove = "Renove mixto al mejor precio con máximo descuento"
                            elif re.search(r'con\s+descuento', texto_capturado, re.IGNORECASE):
                                variante_renove = "Renove mixto al mejor precio con descuento"
                            elif re.search(r'mejor\s+precio', texto_capturado, re.IGNORECASE):
                                variante_renove = "Renove mixto al mejor precio"
                            else:
                                variante_renove = "Renove mixto"
                        elif tiene_renove_general:
                            texto_up = texto_capturado.upper()
                            if "MULTIDISPOSITIVO" in texto_up:
                                variante_renove = "Renove Multidispositivo"
                            elif "ILIMITADO" in texto_up:
                                variante_renove = "Renove Ilimitado"
                            else:
                                m = re.search(r'Renove[^\n]*', texto_capturado, re.IGNORECASE)
                                variante_renove = m.group(0).strip() if m else "Renove (encontrado)"
                        print(f"  [Renove] variante_asignada=\"{variante_renove}\"")
                    except Exception as e:
                        print(f"  [Renove] Error: {e}")

                    
                    # Clasificar variante
                    if tiene_rm:
                        if re.search(r'm[aá]ximo\s+descuento', texto_para_buscar, re.IGNORECASE):
                            variante_renove = "Renove mixto al mejor precio con máximo descuento"
                        elif re.search(r'con\s+descuento', texto_para_buscar, re.IGNORECASE):
                            variante_renove = "Renove mixto al mejor precio con descuento"
                        elif re.search(r'mejor\s+precio', texto_para_buscar, re.IGNORECASE):
                            variante_renove = "Renove mixto al mejor precio"
                        else:
                            variante_renove = "Renove mixto"
                    elif tiene_renove_general:
                        # Renove no mixto (Multidispositivo, etc.)
                        texto_completo_renove = " ".join(renove_cards_textos)
                        if "MULTIDISPOSITIVO" in texto_completo_renove.upper():
                            variante_renove = "Renove Multidispositivo"
                        elif "ILIMITADO" in texto_completo_renove.upper() or "Ilimitado" in texto_completo_renove:
                            variante_renove = "Renove Ilimitado"
                        else:
                            variante_renove = "Renove (otro)"
                        
                    # Usar cima_global como fallback SI es True
                    es_cima = es_cima or cima_global

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
                        "etiquetas": etiquetas_raw,
                        "activo_desde": activo_desde,
                        "Destacadas": campanas.get("Destacadas", "N/A"),
                        "Renove": campanas.get("Renove", "N/A"),
                        "Bonos y D.": campanas.get("Bonos y Descuen.", "N/A"),
                        "Cambio Tarifa": campanas.get("Cambio Tarifa", "N/A"),
                        "SVA": campanas.get("SVA", "N/A"),
                    })

                # Siguiente página de líneas
                btn_siguiente = page.locator("button.ocs-pagination-next")
                if (btn_siguiente.count() > 0
                        and not btn_siguiente.is_disabled()):
                    print("  [Extracción] -> Siguiente página de líneas...")
                    btn_siguiente.click(force=True)
                    page.wait_for_timeout(2000)
                    pagina_actual += 1
                else:
                    hay_mas_paginas = False

            return lineas_finales

        except Exception as e:
            print(f"  [Extracción] [WARN] Error recuperable: {e}")
            if intento < max_intentos - 1:
                print("  [Extracción] [RETRY] Recuperando sesión (3 intentos con F5)...")
                recuperado = False
                for intento_f5 in range(3):
                    try:
                        page.reload(timeout=60000, wait_until="domcontentloaded")
                        page.wait_for_timeout(5000)
                        if page.locator("a.orange-box").is_visible(timeout=5000):
                            page.locator("a.orange-box").click()
                            page.wait_for_timeout(3000)
                        abrir_nuevo_acto_comercial(page)
                        print(f"  [Extracción] [OK] Sesión recuperada (F5 #{intento_f5 + 1})")
                        recuperado = True
                        break
                    except Exception as ex:
                        print(f"  [Extracción] F5 #{intento_f5 + 1} falló: {ex}")
                if not recuperado:
                    print("  [Extracción] [FAIL] No se pudo recuperar tras 3 F5")
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
