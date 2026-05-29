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
        print(f"[W{WORKER_ID}|{t}] {msg}", flush=True)
    except UnicodeEncodeError:
        # Fallback para Windows con cp1252
        print(f"[W{WORKER_ID}|{t}] {msg.encode('ascii', 'replace').decode()}", flush=True)


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


def _extraer_ip_proxy():
    """Extrae la IP del proxy desde PROXY_SERVER."""
    server = os.getenv("PROXY_SERVER", "")
    if not server:
        return "local"
    # Formato: http://ip:puerto
    try:
        return server.split("//")[1].split(":")[0]
    except:
        return server


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
            proxy_ip = _extraer_ip_proxy()
            encontrado = False
            for i, w in enumerate(info):
                if isinstance(w, dict) and str(w.get("id")) == str(WORKER_ID):
                    info[i]["dni_actual"] = dni_actual
                    info[i]["proxy_ip"] = proxy_ip
                    encontrado = True
                    break
            if not encontrado and dni_actual:
                info.append({"id": WORKER_ID, "dni_actual": dni_actual, "estado": "activo", "proxy_ip": proxy_ip})
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
    """Toma el próximo DNI pendiente de la cola.
    
    IMPORTANTE: Hace merge con los atributos_dinamicos existentes
    para NO destruir pipeline, documento_id, etc.
    """
    rows = _api("GET", "/lineas?select=id,dni,atributos_dinamicos&atributos_dinamicos->>estado=eq.pendiente&limit=1&order=created_at.asc")
    if not rows:
        return None
    fila = rows[0]
    
    # Leer atributos_dinamicos existentes para mergear
    ad_existentes = fila.get("atributos_dinamicos", {})
    if isinstance(ad_existentes, str):
        import json as _json
        try: ad_existentes = _json.loads(ad_existentes)
        except: ad_existentes = {}
    
    # Merge: preservar pipeline, documento_id, datos_basicos, etc.
    ad_existentes["estado"] = "en_progreso"
    ad_existentes["worker_id"] = WORKER_ID
    ad_existentes["maquina"] = MAQUINA
    
    _api("PATCH", f"/lineas?id=eq.{fila['id']}&atributos_dinamicos->>estado=eq.pendiente",
         {"atributos_dinamicos": ad_existentes})
    
    # Verificar que realmente tomamos el DNI (concurrencia)
    verificacion = _api("GET", f"/lineas?select=atributos_dinamicos,id&id=eq.{fila['id']}&limit=1")
    if verificacion:
        ad_v = verificacion[0].get("atributos_dinamicos", {})
        if isinstance(ad_v, str):
            import json as _jv
            try: ad_v = _jv.loads(ad_v)
            except: ad_v = {}
        if ad_v.get("worker_id") != WORKER_ID:
            # Otro worker ganó la carrera
            return None
    return fila


def guardar_resultado(dni: str, datos: dict, estado: str = "completado", linea_id: int = None):
    """Guarda/actualiza resultado en Supabase (UPSERT).
    Si linea_id se pasa, actualiza esa fila específica (evita bug de DNI duplicados).
    Si no, busca por DNI (comportamiento legacy)."""
    if linea_id:
        existentes = _api("GET", f"/lineas?select=atributos_dinamicos,id&id=eq.{linea_id}&limit=1")
    else:
        # Legacy: buscar por DNI (puede actualizar fila equivocada si hay duplicados)
        existentes = _api("GET", f"/lineas?select=atributos_dinamicos,id&dni=eq.{dni}&limit=1&order=id.desc")
    ad_prev = {}
    if existentes:
        prev_ad = existentes[0].get("atributos_dinamicos", {}) or {}
        if isinstance(prev_ad, str):
            import json as _json
            try: prev_ad = _json.loads(prev_ad)
            except: prev_ad = {}
        # Merge profundo: preservar pipeline, documento_id, datos_basicos, etc.
        for k, v in prev_ad.items():
            if k not in ["estado", "fecha_procesado", "worker_id", "maquina"]:
                ad_prev[k] = v

    ad = datos.get("atributos_dinamicos", {})
    # Merge: datos nuevos sobre datos previos
    # ⚠️ Preservar renove_mixto_variante si ya existe uno mejor (no pisar con N/A)
    for k, v in ad.items():
        if k == "renove_mixto_variante" and k in ad_prev:
            # Solo actualizar si el nuevo valor NO es N/A (no pisar datos válidos)
            if v not in (None, "N/A", ""):
                ad_prev[k] = v
        elif k == "tiene_renove_mixto" and k in ad_prev:
            # True se preserva (si alguna línea tiene Renove, el cliente lo tiene)
            if v:
                ad_prev[k] = True
        else:
            ad_prev[k] = v
    ad_prev["estado"] = estado
    ad_prev["fecha_procesado"] = time.strftime("%Y-%m-%d")
    ad_prev["fecha_hora"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ad_prev["worker_id"] = WORKER_ID
    ad_prev["maquina"] = MAQUINA

    fila = {
        "dni": dni,
        "nombre": datos.get("nombre", "N/A"),
        "linea": datos.get("linea_principal", "N/A"),
        "paquete": datos.get("paquete", "N/A"),
        "atributos_dinamicos": ad_prev,
    }

    if existentes:
        _api("PATCH", f"/lineas?id=eq.{existentes[0]['id']}", fila)
    else:
        _api("POST", "/lineas", fila)
    log(f"[SAVE] {dni} -> {estado}")


# ── Procesar un DNI ──────────────────────────────

def procesar_dni(page, dni: str, linea_id: int = None, modal_ya_abierto: bool = False) -> tuple:
    """Procesa un solo DNI.
    linea_id: id de la fila en lineas (para evitar UPSERT por DNI duplicado).
    Retorna (exito: bool, modal_sigue_abierto: bool).
    """
    try:
        filas = extraer_datos_cliente(page, dni, buscar_por_dni=True,
                                       modal_ya_abierto=modal_ya_abierto)
        if not filas:
            log(f"[WARN]  {dni}: sin resultados")
            return False, False

        # Verificar si el modal sigue abierto ("no es cliente")
        modal_abierto = filas[0].get("_modal_abierto", False) if filas else False

        # Si todas las filas tienen N/A (no cargó la info), marcar como error
        todas_na = all(
            f.get("Nombre", "N/A") in ("N/A", "") or f.get("Nombre", "") == f.get("Linea", "")
            for f in filas
        )
        if todas_na and len(filas) > 0:
            log(f"[WARN] {dni}: solo datos N/A, marcando como error para reintentar")
            guardar_resultado(dni, {
                "nombre": "N/A",
                "linea_principal": dni,
                "paquete": "N/A",
                "atributos_dinamicos": {"error": "Sin datos", "reintentos": 0},
            }, estado="error", linea_id=linea_id)
            return False, False

        # Guardar cada fila (línea del cliente)
        for fila in filas:
            es_no_cliente = fila.get("Nombre") == "NO ES CLIENTE"
            es_error_campanas = fila.get("Nombre") == "ERROR CAMPANAS"
            if es_error_campanas:
                estado = "error"
            else:
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
        return True, False

    except Exception as e:
        log(f"[ERR]  {dni}: {e}")
        # ── Reintentar automáticamente (hasta 3 veces) ──
        import json as _json
        reintentos = 0
        try:
            existentes = _api("GET", f"/lineas?select=atributos_dinamicos,id&dni=eq.{dni}&limit=1&order=id.desc")
            if existentes:
                prev = existentes[0].get("atributos_dinamicos", {}) or {}
                if isinstance(prev, str):
                    try: prev = _json.loads(prev)
                    except: prev = {}
                reintentos = int(prev.get("reintentos", 0))
        except Exception:
            pass
        reintentos += 1
        if reintentos < 3:
            log(f"[RETRY] {dni} reintento {reintentos}/3")
            guardar_resultado(dni, {
                "nombre": "ERROR",
                "linea_principal": dni,
                "paquete": "N/A",
                "atributos_dinamicos": {"error": str(e), "reintentos": reintentos},
            }, estado="pendiente", linea_id=linea_id)  # "pendiente" para que vuelva a la cola
        else:
            log(f"[FAIL] {dni} error definitivo tras {reintentos} reintentos")
            guardar_resultado(dni, {
                "nombre": "ERROR",
                "linea_principal": dni,
                "paquete": "N/A",
                "atributos_dinamicos": {"error": str(e), "reintentos": reintentos},
            }, estado="error", linea_id=linea_id)
        return False, False


# ── Main ──────────────────────────────────────────

def main():
    log(f"[INI]  Worker iniciado (PID: {os.getpid()})")
    if PROXY_CONFIG:
        log(f"[SIN]  Proxy: {PROXY_CONFIG['server']}")
    else:
        log("[SIN]  Sin proxy")

    procesados = 0
    errores = 0
    modal_abierto = False  # Para "no es cliente" — mantener modal abierto
    detener = False  # Bandera para salir del loop

    try:
        # Inicializar Playwright sin context manager para NO cerrar browser al salir
        pw = sync_playwright().start()
        browser, context = crear_contexto_espana(pw, proxy_config=PROXY_CONFIG)
        page = context.new_page()
    except Exception as e:
        log(f"[CRIT] No se pudo iniciar Playwright: {e}")
        return

    try:
        # Login (con retry automático)
        for intento in range(5):
            try:
                page.goto(ORANGE_URL, timeout=90000)
                manejar_cookies_flexible(page)
                realizar_login(page)
                seleccionar_marca_orange(page)
                abrir_nuevo_acto_comercial(page)
                log(f"[LOCK] Login exitoso")
                break
            except Exception as e:
                log(f"[RETRY] Login falló (intento {intento+1}/5): {e}")
                if intento == 4:
                    log("[CRIT] No se pudo iniciar sesión tras 5 intentos. Esperando...")
                    # No crashear — esperar y reintentar
                    time.sleep(30)
                    continue
                # Recuperar: recargar página
                try:
                    page.goto(ORANGE_URL, timeout=30000)
                except:
                    pass
                time.sleep(5)

        # Loop de procesamiento — NUNCA sale del while, solo espera si no hay DNIs
        while not detener:
            dni = "???"
            try:  # 🔄 Inner try: cualquier error aquí reloguea en vez de cerrar
                # Verificar si el worker fue pausado desde la web
                if esta_pausado():
                    log("[PAUSE] Worker pausado via web. Esperando 10s...")
                    time.sleep(10)
                    continue

                # Tomar siguiente DNI
                fila = tomar_siguiente_dni()
                if not fila:
                    # ⚡ NO romper el while — solo esperar a que lleguen más DNIs
                    # El browser sigue abierto, la sesión de Pangea se mantiene
                    reportar_actividad("")
                    time.sleep(5)
                    continue

                dni = fila["dni"]
                reportar_actividad(dni)

                # Pausa aleatoria
                page.wait_for_timeout(random.randint(1000, 2000))

                # Procesar
                exito, modal_sigue = procesar_dni(page, dni, linea_id=fila["id"], modal_ya_abierto=modal_abierto)
                if exito:
                    procesados += 1
                    modal_abierto = modal_sigue
                else:
                    errores += 1
                    modal_abierto = False
                    # Intentar abrir modal de búsqueda
                    try:
                        log(f"[NEXT] Abriendo modal para siguiente DNI...")
                        try:
                            toast = page.locator(".message-relevant.error .btn-close")
                            if toast.count() > 0:
                                toast.first.click(force=True, timeout=2000)
                                page.wait_for_timeout(500)
                        except:
                            pass
                        btn = page.locator("button[title='Cambiar cliente']")
                        btn.wait_for(state="visible", timeout=8000)
                        btn.click(force=True)
                        page.wait_for_timeout(1000)
                        log("[NEXT] Modal abierto, listo para siguiente DNI")
                        modal_abierto = False
                    except Exception:
                        try:
                            log(f"[RECOVERY] No se pudo abrir modal. Recreando página...")
                            page.close()
                            page = context.new_page()
                            page.goto(ORANGE_URL, timeout=30000)
                            manejar_cookies_flexible(page)
                            realizar_login(page)
                            seleccionar_marca_orange(page)
                            abrir_nuevo_acto_comercial(page)
                            log("[RECOVERY] Página recreada correctamente")
                            modal_abierto = False
                        except Exception as recovery_err:
                            log(f"[RECOVERY] Error al recrear página: {recovery_err}")

                    # Verificar sesión cada 3 DNIs
                    if (procesados + errores) % 3 == 0:
                        if not verificar_sesion_valida(page):
                            log("[RETRY] Sesión expirada, relogueando...")
                            page.goto(ORANGE_URL, timeout=30000)
                            realizar_login(page)
                            seleccionar_marca_orange(page)
                            abrir_nuevo_acto_comercial(page)

                    # Verificar límite
                    if MAX_DNIS > 0 and (procesados + errores) >= MAX_DNIS:
                        log(f"🏁 Límite alcanzado ({MAX_DNIS} DNIs). Esperando...")
                        time.sleep(60)
                        procesados = 0
                        errores = 0

            except Exception as e:  # 🔄 CUALQUIER error: reloguear, no cerrar
                log(f"[ERR] Error grave en DNI {dni}: {e}")
                log("[RECOVERY] Relogueando automáticamente...")
                try:
                    page.close()
                except:
                    pass
                try:
                    page = context.new_page()
                    page.goto(ORANGE_URL, timeout=30000)
                    manejar_cookies_flexible(page)
                    realizar_login(page)
                    seleccionar_marca_orange(page)
                    abrir_nuevo_acto_comercial(page)
                    modal_abierto = False
                    log("[RECOVERY] Relogueo exitoso, continuando...")
                except Exception as login_err:
                    log(f"[CRIT] No se pudo reloguear: {login_err}. Esperando 30s...")
                    time.sleep(30)
                continue

    except KeyboardInterrupt:
        log("⏹  Detenido por señal")
        detener = True
    finally:
        log("[CLEANUP] Worker finalizado. Browser queda ABIERTO (cierra Pangea manualmente).")

    log(f"Resumen -> Procesados: [OK] {procesados} | [ERR] {errores}")


if __name__ == "__main__":
    main()
