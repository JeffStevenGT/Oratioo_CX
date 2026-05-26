"""
agente.py — Agente ligero para ejecución automática del bot
============================================================
Se ejecuta al encender la máquina (Tarea Programada / systemd).
Solo hace polling a Supabase cada 10s en busca de comandos.

FLUJO:
  1. Reporta heartbeat a Supabase (online/offline)
  2. Busca comandos pendientes en comandos_bot
  3. Ejecuta coordinator.py cuando recibe "iniciar"
  4. Mata workers cuando recibe "detener"

USO:
  python agente.py
"""

import os
import sys
import time
import json
import subprocess
import signal
from pathlib import Path
from dotenv import load_dotenv
from urllib.request import Request, urlopen
from urllib.error import HTTPError

load_dotenv()

# ── Config ────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
MAQUINA_NOMBRE = os.getenv("MAQUINA_NOMBRE", "desconocida")
BOT_DIR = Path(__file__).parent
COORDINATOR = str(BOT_DIR / "coordinator.py")

POLL_INTERVAL = 10  # segundos entre cada revisión
HEARTBEAT_INTERVAL = 15  # segundos entre heartbeats (la web espera < 20s)

# ── Estado ────────────────────────────────────────
proceso_coordinador = None
ultimo_heartbeat = 0


# ── API helper ────────────────────────────────────
def _api(method, path, body=None):
    if not SUPABASE_URL or not SERVICE_KEY:
        return []
    url = f"{SUPABASE_URL}/rest/v1{path}"
    data = json.dumps(body).encode() if body else None
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else []
    except HTTPError as e:
        err = e.read().decode()[:150] if e.fp else str(e)
        print(f"[Agente] HTTPError {e.code}: {err}")
        return []
    except Exception as e:
        print(f"[Agente] Error: {e}")
        return []


# ── Heartbeat ─────────────────────────────────────
def reportar_heartbeat():
    global ultimo_heartbeat, proceso_coordinador
    ahora = time.time()
    if ahora - ultimo_heartbeat < HEARTBEAT_INTERVAL:
        return
    ultimo_heartbeat = ahora

    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = {
        "nombre": MAQUINA_NOMBRE,
        "estado": "conectado",  # siempre "conectado" cuando el agente está vivo
        "ultimo_heartbeat": ts,
    }

    existentes = _api("GET", f"/maquinas?nombre=eq.{MAQUINA_NOMBRE}&select=id&limit=1")
    if existentes:
        _api("PATCH", f"/maquinas?id=eq.{existentes[0]['id']}", body)
    else:
        body["workers_config"] = 0
        _api("POST", "/maquinas", body)


# ── Comandos ──────────────────────────────────────
def buscar_comandos():
    """Busca comandos 'pendiente' para esta máquina."""
    return _api(
        "GET",
        f"/comandos_bot?maquina_destino=eq.{MAQUINA_NOMBRE}&estado=eq.pendiente"
        f"&order=creado_el.asc&limit=5",
    )


def marcar_como(comando_id, estado, resultado=""):
    """Actualiza el estado de un comando."""
    body = {"estado": estado, "ejecutado_el": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if resultado:
        body["resultado"] = resultado
    _api("PATCH", f"/comandos_bot?id=eq.{comando_id}", body)


# ── Acciones ──────────────────────────────────────
def _actualizar_workers_config(workers: dict):
    """Actualiza workers_config en la tabla maquinas antes de lanzar coordinator."""
    mi_config = workers.get(MAQUINA_NOMBRE, 1)
    existentes = _api("GET", f"/maquinas?nombre=eq.{MAQUINA_NOMBRE}&select=id,workers_config&limit=1")
    if existentes:
        _api("PATCH", f"/maquinas?id=eq.{existentes[0]['id']}", {"workers_config": mi_config})


def _matar_coordinador():
    """Mata el proceso coordinator si está vivo."""
    global proceso_coordinador
    if not proceso_coordinador or proceso_coordinador.poll() is not None:
        proceso_coordinador = None
        return
    try:
        if sys.platform == "win32":
            os.kill(proceso_coordinador.pid, signal.CTRL_BREAK_EVENT)
        else:
            os.kill(proceso_coordinador.pid, signal.SIGTERM)
        proceso_coordinador.wait(timeout=5)
    except Exception:
        try:
            proceso_coordinador.kill()
        except Exception:
            pass
    proceso_coordinador = None


def iniciar_coordinador(cmd):
    """Lanza coordinator.py con los workers configurados.
    Si ya hay uno corriendo, lo mata y lo relanza con la config fresca."""
    global proceso_coordinador

    workers = cmd.get("parametros", {}).get("workers_config", {})

    # Si ya hay coordinator corriendo, lo matamos para relanzar
    if proceso_coordinador and proceso_coordinador.poll() is None:
        print("[Agente] Coordinator activo — reiniciando para nueva config...")
        _matar_coordinador()
        time.sleep(2)  # esperar a que termine

    # Actualizar workers_config en Supabase ANTES de lanzar
    _actualizar_workers_config(workers)

    workers_str = json.dumps(workers) if workers else "{}"
    env = os.environ.copy()
    env["WORKERS_CONFIG"] = workers_str

    print(f"[Agente] Iniciando coordinator para {MAQUINA_NOMBRE}...")
    try:
        # Usar DEVNULL para evitar que el buffer de pipe se llene y congele el proceso
        proceso_coordinador = subprocess.Popen(
            [sys.executable, COORDINATOR],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        marcar_como(cmd["id"], "completado", f"PID: {proceso_coordinador.pid}")
        print(f"[Agente] Coordinator iniciado (PID: {proceso_coordinador.pid})")
    except Exception as e:
        print(f"[Agente] Error lanzando coordinator: {e}")
        marcar_como(cmd["id"], "error", str(e))





def detener_coordinador(cmd):
    """Detiene el coordinator y sus workers."""
    global proceso_coordinador

    if not proceso_coordinador or proceso_coordinador.poll() is not None:
        print("[Agente] No hay coordinador corriendo.")
        marcar_como(cmd["id"], "completado", "No había coordinador")
        proceso_coordinador = None
        return

    print(f"[Agente] Deteniendo coordinator (PID: {proceso_coordinador.pid})...")
    try:
        if sys.platform == "win32":
            os.kill(proceso_coordinador.pid, signal.CTRL_BREAK_EVENT)
        else:
            os.kill(proceso_coordinador.pid, signal.SIGTERM)
        proceso_coordinador.wait(timeout=5)
        marcar_como(cmd["id"], "completado", "Detenido correctamente")
    except Exception as e:
        print(f"[Agente] Error deteniendo: {e}")
        proceso_coordinador.kill()
        marcar_como(cmd["id"], "error", str(e))
    finally:
        proceso_coordinador = None


# ── Loop principal ────────────────────────────────
def main():
    global proceso_coordinador

    print(f"\n{'='*50}")
    print(f"[Agente] ORATIOO CX - AGENTE")
    print(f"{'='*50}")
    print(f"  Máquina: {MAQUINA_NOMBRE}")
    print(f"  Supabase: {'OK' if SUPABASE_URL and SERVICE_KEY else 'FALLA'}")
    print(f"  Coordinator: {COORDINATOR}")
    print(f"{'='*50}\n")

    if not SUPABASE_URL or not SERVICE_KEY:
        print("[Agente] ERROR: SUPABASE_URL o SERVICE_KEY no configurados en .env")
        sys.exit(1)

    while True:
        try:
            # Heartbeat
            reportar_heartbeat()

            # Buscar comandos
            comandos = buscar_comandos()
            for cmd in comandos:
                accion = cmd.get("comando", "")
                print(f"[Agente] Comando recibido: {accion}")
                if accion == "iniciar":
                    iniciar_coordinador(cmd)
                elif accion == "detener":
                    detener_coordinador(cmd)
                else:
                    # Comandos que maneja el coordinator (pausar, reanudar, etc.)
                    print(f"[Agente] Comando '{accion}' delegado al coordinator")
                    # Si el coordinator no esta corriendo, lo lanzamos
                    if not proceso_coordinador or proceso_coordinador.poll() is not None:
                        print(f"[Agente] Coordinator no activo. Auto-lanzando...")
                        workers_str = "{}"
                        env = os.environ.copy()
                        env["WORKERS_CONFIG"] = workers_str
                        try:
                            proceso_coordinador = subprocess.Popen(
                                [sys.executable, COORDINATOR],
                                env=env,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL,
                            )
                            print(f"[Agente] Coordinator auto-lanzado (PID: {proceso_coordinador.pid})")
                        except Exception as e:
                            print(f"[Agente] Error auto-lanzando coordinator: {e}")
                    pass

            # Monitorear coordinator caído
            if proceso_coordinador and proceso_coordinador.poll() is not None:
                print("[Agente] Coordinator terminó.")
                # Capturar últimos logs del coordinator
                try:
                    out, err = proceso_coordinador.communicate(timeout=2)
                    if out:
                        for line in out.strip().split('\n')[-10:]:
                            print(f"  [CoordLog] {line}")
                except Exception:
                    pass
                proceso_coordinador = None

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\n[Agente] Deteniendo agente...")
            if proceso_coordinador:
                detener_coordinador({"id": 0, "comando": "detener"})
            break
        except Exception as e:
            print(f"[Agente] Error en loop: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
