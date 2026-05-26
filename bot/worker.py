"""
worker.py — Worker individual para procesos multi-worker
=========================================================
Lanzado por coordinator.py. Cada worker:
  - Usa su propio proxy (asignado exclusivamente)
  - Toma DNIs de la cola en Supabase (estado = pendiente)
  - Los procesa uno por uno
  - Reporta heartbeat

USO (normalmente lanzado por coordinator.py):
  PROXY_SERVER=http://... PROXY_USER=u PROXY_PASS=p WORKER_ID=1 python worker.py
"""

import os
import sys
import time
import random
import json
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from login import (
    manejar_cookies_flexible,
    realizar_login,
    seleccionar_marca_orange,
    abrir_nuevo_acto_comercial,
    extraer_datos_cliente,
    verificar_sesion_valida,
    LoginError,
)
from browser_setup import crear_contexto_espana

load_dotenv()

# ── Config ────────────────────────────────────────

WORKER_ID = int(os.getenv("WORKER_ID", "0"))
MAQUINA = os.getenv("WORKER_MAQUINA", "local")
ORANGE_URL = "https://pangea.orange.es/"
MAX_DNIS = int(os.getenv("MAX_DNIS_POR_WORKER", "0"))
PAUSA_MS = random.randint(2000, 4000)

# Proxy desde env (asignado por coordinator)
PROXY_CONFIG = None
if os.getenv("PROXY_SERVER"):
    PROXY_CONFIG = {
        "server": os.getenv("PROXY_SERVER"),
        "username": os.getenv("PROXY_USER", ""),
        "password": os.getenv("PROXY_PASS", ""),
    }


def log(msg: str):
    t = time.strftime("%H:%M:%S")
    try:
        print(f"[W{WORKER_ID}|{t}] {msg}")
    except UnicodeEncodeError:
        # Fallback para Windows con cp1252
        print(f"[W{WORKER_ID}|{t}] {msg.encode('ascii', 'replace').decode()}")


# ── Supabase helpers ──────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def _api(method: str, path: str, body: dict = None) -> list | dict:
    import json as _json
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError

    if not SUPABASE_URL or not SERVICE_KEY:
        return []
    url = f"{SUPABASE_URL}/rest/v1{path}"
    data = _json.dumps(body).encode() if body else None
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            return _json.loads(raw) if raw else []
    except HTTPError as e:
        err = e.read().decode()[:150] if e.fp else str(e)
        log(f"Supabase {method} {path} → {e.code}: {err}")
        return []
    except Exception as e:
        log(f"Supabase error: {e}")
        return []


def actualizar_progreso_documento(dni: str):
    """Actualiza el contador procesados en documentos cuando se completa un DNI."""
    try:
        # Buscar el documento que contiene este DNI
        docs = _api("GET", "/documentos?select=id&order=created_at.desc&limit=5")
        for doc in docs:
            doc_id = doc["id"]
            # Obtener línea para ver si pertenece a este documento
            lineas = _api("GET", f"/lineas?select=atributos_dinamicos&dni=eq.{dni}&limit=1")
            if lineas:
                total = _api("GET", f"/lineas?select=id&atributos_dinamicos->>estado=neq.pendiente&limit=1000")
                procesados = len(total) if total else 0
                _api("PATCH", f"/documentos?id=eq.{doc_id}", {"procesados": procesados})
                break
    except Exception:
        pass


def reportar_actividad(dni_actual: str = ""):
    """Reporta el DNI que está procesando este worker en la tabla maquinas."""
    try:
        maquinas = _api("GET", f"/maquinas?nombre=eq.{MAQUINA}&select=workers_info,id&limit=1")
        if maquinas and len(maquinas) > 0:
            m = maquinas[0]
            info = m.get("workers_info", []) or []
            if isinstance(info, str):
                try: info = json.loads(info)
                except: info = []
            encontrado = False
            for i, w in enumerate(info):
                if isinstance(w, dict) and str(w.get("id")) == str(WORKER_ID):
                    info[i]["dni_actual"] = dni_actual
                    encontrado = True
                    break
            if not encontrado and dni_actual:
                info.append({"id": WORKER_ID, "dni_actual": dni_actual, "estado": "activo"})
            _api("PATCH", f"/maquinas?id=eq.{m['id']}", {"workers_info": info})
    except Exception:
        pass


def esta_pausado() -> bool:
    """Verifica si este worker ha sido pausado desde la web."""
    try:
        rows = _api("GET", f"/maquinas?nombre=eq.{MAQUINA}&select=workers_info&limit=1")
        if rows and len(rows) > 0:
            info = rows[0].get("workers_info", []) or []
            if isinstance(info, str):
                import json as _json
                try: info = _json.loads(info)
                except: info = []
            for w in info:
                if isinstance(w, dict) and str(w.get("id")) == str(WORKER_ID):
                    return w.get("estado") == "pausado"
    except Exception:
        pass
    return False


def tomar_siguiente_dni() -> dict | None:
    """Toma el próximo DNI pendiente de la cola."""
    rows = _api("GET", "/lineas?select=id,dni&atributos_dinamicos->>estado=eq.pendiente&limit=1&order=created_at.asc")
    if not rows:
        return None
    fila = rows[0]
    _api("PATCH", f"/lineas?id=eq.{fila['id']}&atributos_dinamicos->>estado=eq.pendiente",
         {"atributos_dinamicos": {"estado": "en_progreso", "worker_id": WORKER_ID, "maquina": MAQUINA}})
    return fila


def guardar_resultado(dni: str, datos: dict, estado: str = "completado"):
    """Guarda/actualiza resultado en Supabase (UPSERT).
    Preserva pipeline (asignacion) de datos anteriores.
    Cada linea del cliente se guarda como un registro SEPARADO."""
    linea_num = datos.get("linea_principal", "")
    
    # Leer datos existentes para preservar pipeline
    pipeline_prev = None
    id_existente = None
    
    # Buscar por DNI + numero de linea (para no sobrescribir)
    if linea_num:
        existentes = _api("GET", f"/lineas?select=atributos_dinamicos,id&dni=eq.{dni}&linea=eq.{linea_num}&limit=1")
        if not existentes or len(existentes) == 0:
            # Fallback: buscar solo por DNI si no se encontro por linea
            existentes = _api("GET", f"/lineas?select=atributos_dinamicos,id&dni=eq.{dni}&limit=1&order=id.desc")
        if existentes and len(existentes) > 0:
            prev_ad = existentes[0].get("atributos_dinamicos", {}) or {}
            if isinstance(prev_ad, str):
                import json as _json
                try: prev_ad = _json.loads(prev_ad)
                except: prev_ad = {}
            pipeline_prev = prev_ad.get("pipeline")
            id_existente = existentes[0]["id"]

    ad = datos.get("atributos_dinamicos", {})
    ad["estado"] = estado
    ad["fecha_procesado"] = time.strftime("%Y-%m-%d")
    ad["worker_id"] = WORKER_ID
    ad["maquina"] = MAQUINA
    if pipeline_prev is not None:
        ad["pipeline"] = pipeline_prev

    fila = {
        "dni": dni,
        "nombre": datos.get("nombre", "N/A"),
        "linea": linea_num or datos.get("linea_principal", "N/A"),
        "paquete": datos.get("paquete", "N/A"),
        "atributos_dinamicos": ad,
    }

    if id_existente:
        _api("PATCH", f"/lineas?id=eq.{id_existente}", fila)
    else:
        _api("POST", "/lineas", fila)
    log(f"[SAVE] {dni} (linea: {linea_num}) -> {estado}")


# ── Procesar un DNI ──────────────────────────────

def procesar_dni(page, dni: str) -> bool:
    """Procesa un solo DNI. Retorna True si fue exitoso."""
    try:
        filas = extraer_datos_cliente(page, dni, buscar_por_dni=True)
        if not filas:
            log(f"[WARN]  {dni}: sin resultados")
            return False

        # Guardar cada fila (línea del cliente)
        for fila in filas:
            es_no_cliente = fila.get("Nombre") == "NO ES CLIENTE"
            estado = "no_cliente" if es_no_cliente else "completado"
            es_cima = fila.get("es_cima", False)

            dinamicos = {
                "cima": "SI" if es_cima else "NO",
                "tiene_renove_mixto": fila.get("tiene_renove_mixto", False),
                "renove_mixto_variante": fila.get("variante_renove", "N/A"),
                "renove_mixto_todas": fila.get("variante_renove", "N/A"),
                "etiquetas": fila.get("etiquetas", []),
                "es_principal": fila.get("es_principal", False),
                "activo_desde": fila.get("activo_desde", "N/A"),
                "datos_basicos": {
                    "nombre": fila.get("Nombre", "N/A"),
                    "direccion": fila.get("Direccion", "N/A"),
                    "dni": dni,
                },
                "linea": {
                    "numero": fila.get("Linea", "N/A"),
                    "paquete": fila.get("Paquete", "N/A"),
                    "es_cima": es_cima,
                    "es_principal": fila.get("es_principal", False),
                    "etiquetas": fila.get("etiquetas", []),
                    "activo_desde": fila.get("activo_desde", "N/A"),
                    "tiene_tv": fila.get("tiene_tv", False),
                },
                "pestanas": {
                    "Destacadas": fila.get("Destacadas", "N/A"),
                    "Renove": fila.get("Renove", "N/A"),
                    "Bonos y D.": fila.get("Bonos y D.", "N/A"),
                    "Cambio Tarifa": fila.get("Cambio Tarifa", "N/A"),
                    "SVA": fila.get("SVA", "N/A"),
                },
            }

            datos = {
                "nombre": fila.get("Nombre", "N/A"),
                "linea_principal": fila.get("Linea", "N/A"),
                "paquete": fila.get("Paquete", "N/A"),
                "atributos_dinamicos": dinamicos,
            }

            guardar_resultado(dni, datos, estado=estado)

        log(f"[OK]  {dni}: {len(filas)} líneas")
        return True

    except Exception as e:
        log(f"[ERR]  {dni}: {e}")
        # Guardar como error
        guardar_resultado(dni, {
            "nombre": "ERROR",
            "linea_principal": dni,
            "paquete": "N/A",
            "atributos_dinamicos": {"error": str(e)},
        }, estado="error")
        return False


# ── Main ──────────────────────────────────────────

def main():
    log(f"[INI]  Worker iniciado (PID: {os.getpid()})")
    if PROXY_CONFIG:
        log(f"[SIN]  Proxy: {PROXY_CONFIG['server']}")
    else:
        log("[SIN]  Sin proxy")

    procesados = 0
    errores = 0

    with sync_playwright() as p:
        browser, context = crear_contexto_espana(p, proxy_config=PROXY_CONFIG)
        page = context.new_page()

        try:
            # Login (con reintentos si hay maximo de sesiones)
            for intento_login in range(5):
                try:
                    page.goto(ORANGE_URL, timeout=90000)
                    manejar_cookies_flexible(page)
                    realizar_login(page)
                    seleccionar_marca_orange(page)
                    abrir_nuevo_acto_comercial(page)
                    log("[LOCK] Login exitoso")
                    break
                except LoginError as e:
                    if "Maximo de sesiones" in str(e):
                        espera = random.randint(15, 30)
                        log(f"[LOCK] Sesiones llenas, esperando {espera}s (intento {intento_login+1}/5)...")
                        time.sleep(espera)
                        # Recrear pagina (por si acaso)
                        try: page.close()
                        except: pass
                        page = context.new_page()
                    else:
                        raise

            # Loop de procesamiento
            while True:
                # Verificar si el worker fue pausado desde la web
                if esta_pausado():
                    log("[PAUSE] Worker pausado via web. Esperando 10s...")
                    time.sleep(10)
                    continue

                # Tomar siguiente DNI
                fila = tomar_siguiente_dni()
                if not fila:
                    log("[PAUSE] No hay mas DNIs pendientes. Esperando 15s...")
                    # Mantener sesion viva: navegar a pagina interna y volver
                    try:
                        page.evaluate("1+1")
                    except Exception:
                        log("[RECON] Pagina cerrada durante espera. Reconectando...")
                        try:
                            browser.close()
                        except Exception:
                            pass
                        browser, context = crear_contexto_espana(p, proxy_config=PROXY_CONFIG)
                        page = context.new_page()
                        page.goto(ORANGE_URL, timeout=90000)
                        manejar_cookies_flexible(page)
                        realizar_login(page)
                        seleccionar_marca_orange(page)
                        abrir_nuevo_acto_comercial(page)
                        log("[RECON] Reconexion exitosa")
                    time.sleep(15)
                    continue

                dni = fila["dni"]
                reportar_actividad(dni)

                # Pausa aleatoria
                page.wait_for_timeout(random.randint(800, 1500))

                # Verificar que la pagina sigue viva antes de procesar
                try:
                    page.evaluate("1+1")
                except Exception:
                    log("[RECON] Pagina cerrada, reconectando antes de procesar...")
                    try:
                        browser.close()
                    except Exception:
                        pass
                    browser, context = crear_contexto_espana(p, proxy_config=PROXY_CONFIG)
                    page = context.new_page()
                    page.goto(ORANGE_URL, timeout=90000)
                    manejar_cookies_flexible(page)
                    realizar_login(page)
                    seleccionar_marca_orange(page)
                    abrir_nuevo_acto_comercial(page)
                    log("[RECON] Reconexion exitosa")

                # Procesar
                exito = procesar_dni(page, dni)
                if exito:
                    procesados += 1
                else:
                    errores += 1

                # Verificar sesión cada 10 DNIs
                if (procesados + errores) % 10 == 0:
                    if not verificar_sesion_valida(page):
                        log("[RETRY] Sesión expirada, relogueando...")
                        page.goto(ORANGE_URL, timeout=60000)
                        realizar_login(page)
                        seleccionar_marca_orange(page)
                        abrir_nuevo_acto_comercial(page)

                # Verificar límite
                if MAX_DNIS > 0 and (procesados + errores) >= MAX_DNIS:
                    log(f"🏁 Límite alcanzado ({MAX_DNIS} DNIs)")
                    break

        except KeyboardInterrupt:
            log("⏹  Detenido por señal")
        except Exception as e:
            log(f"[ERR]  Error crítico: {e}")
        finally:
            browser.close()

    log(f"Resumen -> Procesados: [OK] {procesados} | [ERR] {errores}")


if __name__ == "__main__":
    main()
