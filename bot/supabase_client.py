"""
supabase_client.py — Comunicación directa con Supabase REST API
================================================================
El bot escribe directo a Supabase usando service_role key.
El estado del DNI se guarda dentro de atributos_dinamicos (JSONB),
no como columna separada.

Estados de un DNI (dentro de atributos_dinamicos):
  pendiente     → espera ser procesado
  en_progreso   → un worker lo está procesando ahora
  completado    → procesado exitosamente
  error         → falló después de reintentos
"""

import os
import json
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal,resolution=merge-duplicates",
}

BASE = f"{SUPABASE_URL}/rest/v1"


def _api(method: str, path: str, body: dict = None) -> list | dict:
    """Ejecuta una llamada REST a Supabase."""
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            if raw and raw.strip():
                return json.loads(raw)
            return []
    except HTTPError as e:
        err_body = e.read().decode()[:200] if e.fp else str(e)
        print(f"  [Supabase] {method} {path} → {e.code}: {err_body}")
        return []
    except Exception as e:
        print(f"  [Supabase] Error de conexión: {e}")
        return []


# ── GUARDAR RESULTADO ─────────────────────────────

def guardar_resultado(dni: str, datos: dict, estado: str = "completado"):
    """
    Guarda/actualiza los datos de un DNI en Supabase (UPSERT).
    - Si el DNI ya existe en la BD, lo actualiza (PATCH por id)
    - Si no existe, lo inserta (POST)

    ⚠️ Hace MERGE completo de atributos_dinamicos para NO perder
    pipeline, documento_id, datos_basicos, etc. de cargas anteriores.

    Posibles estados:
      - completado  -> procesado exitosamente
      - no_cliente  -> DNI no encontrado en Orange
      - error       -> fallo técnico
    """
    ahora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # ── UPSERT: buscar si el DNI ya existe ──
    existentes = _api("GET", f"/lineas?select=id,atributos_dinamicos&dni=eq.{dni}&limit=1&order=id.desc")

    # Merge de atributos_dinamicos previos
    ad_prev = {}
    if existentes and len(existentes) > 0:
        prev_ad = existentes[0].get("atributos_dinamicos", {}) or {}
        if isinstance(prev_ad, str):
            import json as _json
            try: prev_ad = _json.loads(prev_ad)
            except: prev_ad = {}
        for k, v in prev_ad.items():
            if k not in ["estado", "fecha_procesado", "fecha_hora", "worker_id", "maquina"]:
                ad_prev[k] = v

    ad_nuevo = datos.get("atributos_dinamicos", {})
    # Merge: datos nuevos sobre datos previos
    for k, v in ad_nuevo.items():
        ad_prev[k] = v
    ad_prev["estado"] = estado
    ad_prev["fecha_procesado"] = time.strftime("%Y-%m-%d")
    ad_prev["fecha_hora"] = ahora

    fila = {
        "dni": dni,
        "nombre": datos.get("nombre", "N/A"),
        "direccion": datos.get("direccion", "N/A"),
        "linea": datos.get("linea_principal", "N/A"),
        "seg_fijo": datos.get("seg_fijo", "N/A"),
        "seg_movil": datos.get("seg_movil", "N/A"),
        "paquete": datos.get("paquete", "N/A"),
        "atributos_dinamicos": ad_prev,
    }

    if existentes and len(existentes) > 0:
        id_existente = existentes[0]["id"]
        _api("PATCH", f"/lineas?id=eq.{id_existente}", fila)
    else:
        _api("POST", "/lineas", fila)

    icono = "✅" if estado == "completado" else "❌" if estado == "no_cliente" else "⚠"
    accion = "actualizado" if (existentes and len(existentes) > 0) else "insertado"
    print(f"  [Supabase] {icono} {dni} {accion} ({estado})")


def insertar_dnis(dnis: list[str], semana: str = ""):
    """
    Inserta una lista de DNIs con estado 'pendiente' en atributos_dinamicos.
    """
    if not dnis:
        return 0
    ahora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    rows = [
        {
            "dni": d.strip(),
            "linea": d.strip(),
            "atributos_dinamicos": {
                "estado": "pendiente",
                "semana": semana,
                "fecha_encolado": time.strftime("%Y-%m-%d"),
            },
        }
        for d in dnis
        if d.strip()
    ]
    result = _api("POST", "/lineas", rows)
    return len(rows)


# ── CONSULTAS ─────────────────────────────────────

def contar_estados(semana: str = "") -> dict:
    """Retorna conteo de DNIs por estado (desde atributos_dinamicos)."""
    rows = _api("GET", "/lineas?select=atributos_dinamicos")
    conteo = {"pendiente": 0, "en_progreso": 0, "completado": 0, "error": 0}
    for r in rows:
        ad = r.get("atributos_dinamicos", {})
        if isinstance(ad, str):
            try:
                ad = json.loads(ad)
            except Exception:
                ad = {}
        estado = ad.get("estado", "pendiente") if isinstance(ad, dict) else "pendiente"
        if estado in conteo:
            conteo[estado] += 1
    return conteo
