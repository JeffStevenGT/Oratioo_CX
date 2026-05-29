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

# -- Auto-fix BOM en .env (Windows Notepad lo anade al guardar) --
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    _raw = _env_path.read_bytes()
    if _raw.startswith(b'\xef\xbb\xbf'):
        _env_path.write_bytes(_raw[3:])
        print("[Agente] BOM eliminado del .env automaticamente")
        load_dotenv(override=True)

# -- Config
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
    """Busca comandos 'pendiente' para esta máquina (o globales sin destino)."""
    comandos = _api(
        "GET",
        f"/comandos_bot?maquina_destino=eq.{MAQUINA_NOMBRE}&estado=eq.pendiente"
        f"&order=creado_el.asc&limit=5"
    ) or []
    # También buscar comandos sin máquina destino (globales, ej: abrir_navegador)
    globales = _api(
        "GET",
        f"/comandos_bot?maquina_destino=is.null&estado=eq.pendiente"
        f"&order=creado_el.asc&limit=5"
    ) or []
    if globales:
        comandos.extend(globales)
    return comandos


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
        proceso_coordinador = subprocess.Popen(
            [sys.executable, COORDINATOR],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        marcar_como(cmd["id"], "completado", f"PID: {proceso_coordinador.pid}")
        print(f"[Agente] Coordinator iniciado (PID: {proceso_coordinador.pid})")
    except Exception as e:
        print(f"[Agente] Error lanzando coordinator: {e}")
        marcar_como(cmd["id"], "error", str(e))


def _abrir_navegador_asesor(cmd):
    """Abre un navegador para que el asesor consulte Orange manualmente."""
    import random

    asesor_id = cmd.get("parametros", {}).get("asesor_id", "0")
    proxy_asignado = cmd.get("parametros", {}).get("proxy_asignado", "")

    nav_script = BOT_DIR / "navegador_asesor.py"
    args = [sys.executable, str(nav_script), "--asesor-id", str(asesor_id)]

    if proxy_asignado:
        # Proxy asignado desde la web (formato: http://ip:puerto:user:pass)
        partes = proxy_asignado.replace("http://", "").split(":")
        if len(partes) >= 2:
            proxy_server = f"http://{partes[0]}:{partes[1]}"
            proxy_user = partes[2] if len(partes) > 2 else ""
            proxy_pass = partes[3] if len(partes) > 3 else ""
            args += ["--proxy-server", proxy_server,
                     "--proxy-user", proxy_user,
                     "--proxy-pass", proxy_pass]
            print(f"[Agente] Proxy asignado (web): {proxy_server}")
    else:
        # Proxy aleatorio de proxies.txt
        proxies = []
        proxies_file = BOT_DIR / "proxies.txt"
        if proxies_file.exists():
            with open(proxies_file, "r", encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#"):
                        continue
                    partes = linea.split(":")
                    if len(partes) == 4:
                        proxies.append({
                            "server": f"http://{partes[0]}:{partes[1]}",
                            "user": partes[2],
                            "pass": partes[3],
                        })

        proxy = random.choice(proxies) if proxies else None
        if proxy:
            args += ["--proxy-server", proxy["server"],
                     "--proxy-user", proxy["user"],
                     "--proxy-pass", proxy["pass"]]
            print(f"[Agente] Proxy aleatorio: {proxy['server']}")
        else:
            print("[Agente] Sin proxy disponible")

    try:
        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        marcar_como(cmd["id"], "completado", f"Navegador PID: {proc.pid}")
        print(f"[Agente] Navegador abierto (PID: {proc.pid})")
    except Exception as e:
        print(f"[Agente] Error abriendo navegador: {e}")
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
def _resetear_dnis_colgados():
    """Resetea DNIs colgados al arrancar:
    - 'error' → pendiente
    - 'en_progreso' cuyo worker_id ya no reporta actividad → pendiente
    Nunca toca 'completado' ni 'no_cliente'.
    """
    try:
        # Obtener workers activos
        maquinas = _api("GET", "/maquinas?select=workers_info&limit=10")
        workers_activos = set()
        for m in (maquinas or []):
            info = m.get("workers_info", []) or []
            if isinstance(info, str):
                try: info = json.loads(info)
                except: info = []
            for w in info:
                if isinstance(w, dict) and (w.get("dni_actual") or w.get("estado") == "activo"):
                    workers_activos.add(w.get("id"))
    except:
        workers_activos = set()

    try:
        for estado_origen in ['error', 'en_progreso']:
            rows = _api("GET", f"/lineas?select=id,atributos_dinamicos&atributos_dinamicos->>estado=eq.{estado_origen}&limit=200")
            if rows:
                resets = 0
                for row in rows:
                    ad = row.get("atributos_dinamicos", {})
                    if isinstance(ad, str):
                        import json as _j
                        try: ad = _j.loads(ad)
                        except: ad = {}
                    # Si es en_progreso y su worker aún reporta, NO tocar
                    if estado_origen == 'en_progreso' and ad.get("worker_id") in workers_activos:
                        continue
                    ad["estado"] = "pendiente"
                    _api("PATCH", f"/lineas?id=eq.{row['id']}", {"atributos_dinamicos": ad})
                    resets += 1
                if resets > 0:
                    print(f"[Agente] ♻️  {resets} DNIs '{estado_origen}' reseteados a pendiente")
    except Exception:
        pass


def _watchdog_en_progreso():
    """Resetea DNIS colgados en 'en_progreso' pero SOLO si el worker
    que los tomó ya no está reportando actividad (crash).
    Usa una ventana de 30 minutos desde created_at para evitar falsos positivos."""
    try:
        ahora = time.time()
        rows = _api("GET", "/lineas?select=id,created_at,atributos_dinamicos&atributos_dinamicos->>estado=eq.en_progreso&limit=200")
        if not rows:
            return
        resets = 0
        # Obtener workers activos reportados
        maquinas = _api("GET", "/maquinas?select=workers_info&limit=10")
        workers_activos = set()
        for m in (maquinas or []):
            info = m.get("workers_info", []) or []
            if isinstance(info, str):
                try: info = json.loads(info)
                except: info = []
            for w in info:
                if isinstance(w, dict) and w.get("dni_actual"):
                    workers_activos.add(w.get("id"))

        for row in (rows or []):
            ad = row.get("atributos_dinamicos", {})
            if isinstance(ad, str):
                import json as _j
                try: ad = _j.loads(ad)
                except: ad = {}
            wid = ad.get("worker_id")
            # Si el worker está reportando actividad, NO resetear
            if wid is not None and wid in workers_activos:
                continue
            creado = row.get("created_at", "")
            if creado:
                try:
                    ts = time.mktime(time.strptime(creado[:19], "%Y-%m-%dT%H:%M:%S"))
                    if ahora - ts > 1800:  # más de 30 minutos
                        ad["estado"] = "pendiente"
                        ad["worker_id"] = None
                        _api("PATCH", f"/lineas?id=eq.{row['id']}", {"atributos_dinamicos": ad})
                        resets += 1
                except:
                    pass
        if resets > 0:
            print(f"[Agente] ♻️ {resets} DNIs colgados (sin worker activo >30min) reseteados")
    except Exception:
        pass


def _resetear_errores():
    """Resetea DNIs en estado 'error' a 'pendiente' para reintentarlos.
    Corre cada 10s en el loop principal."""
    try:
        rows = _api("GET", "/lineas?select=id,atributos_dinamicos&atributos_dinamicos->>estado=eq.error&limit=200")
        if not rows:
            return
        resets = 0
        for row in rows:
            ad = row.get("atributos_dinamicos", {})
            if isinstance(ad, str):
                import json as _j
                try: ad = _j.loads(ad)
                except: ad = {}
            ad["estado"] = "pendiente"
            ad["worker_id"] = None
            _api("PATCH", f"/lineas?id=eq.{row['id']}", {"atributos_dinamicos": ad})
            resets += 1
        if resets > 0:
            print(f"[Agente] ♻️ {resets} DNIs en 'error' reseteados a pendiente")
    except Exception:
        pass


def main():
    global proceso_coordinador

    # Forzar UTF-8 en Windows para evitar crashes por encoding
    import sys as _sys
    if hasattr(_sys.stdout, 'reconfigure'):
        try: _sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except: pass
    if hasattr(_sys.stderr, 'reconfigure'):
        try: _sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except: pass

    print(f"\n{'='*50}")
    print(f"[Agente] ORATIOO CX - AGENTE")
    print(f"{'='*50}")
    print(f"  Máquina: {MAQUINA_NOMBRE}")
    print(f"  Supabase: {'OK' if SUPABASE_URL and SERVICE_KEY else 'FALLA'}")
    print(f"  Coordinator: {COORDINATOR}")
    print(f"{'='*50}\n")

    # Resetea2s DNIs colgados al arrancar
    _resetear_dnis_colgados()

    if not SUPABASE_URL or not SERVICE_KEY:
        print("[Agente] ERROR: SUPABASE_URL o SERVICE_KEY no configurados en .env")
        sys.exit(1)

    while True:
        try:
            # Heartbeat
            reportar_heartbeat()

            # Watchdog: liberar DNIs colgados + errores
            _watchdog_en_progreso()
            _resetear_errores()

            # Buscar comandos
            comandos = buscar_comandos()
            for cmd in comandos:
                accion = cmd.get("comando", "")
                print(f"[Agente] Comando recibido: {accion}")
                if accion == "iniciar":
                    iniciar_coordinador(cmd)
                elif accion == "detener":
                    detener_coordinador(cmd)
                elif accion == "abrir_navegador":
                    # Abrir navegador manual para asesor - sin coordinator
                    print(f"[Agente] Abriendo navegador para asesor...")
                    _abrir_navegador_asesor(cmd)
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
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                text=True,
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
            # NO detener coordinator — dejar browsers abiertos para cerrar Pangea manualmente
            if proceso_coordinador and proceso_coordinador.poll() is None:
                print(f"[Agente] Coordinator (PID: {proceso_coordinador.pid}) queda corriendo.")
                print(f"[Agente] Cierra Pangea manualmente en las ventanas de Chromium.")
            # Marcar máquina como offline en Supabase
            try:
                _api("PATCH", f"/maquinas?nombre=eq.{MAQUINA_NOMBRE}", {"estado": "offline"})
                print(f"[Agente] Máquina '{MAQUINA_NOMBRE}' marcada como offline")
            except:
                pass
            break
        except Exception as e:
            print(f"[Agente] Error en loop: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
