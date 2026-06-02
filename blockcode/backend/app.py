"""
BlockCode Flask backend
-----------------------
Recibe el JSON enviado por el frontend (con el código C++ ya construido a
partir de los bloques) y lo compila/sube con PlatformIO.

Endpoints:
    GET  /health       -> verifica configuración del servidor
    POST /compile      -> escribe src/main.cpp y ejecuta `pio run`
    POST /upload       -> escribe src/main.cpp y ejecuta `pio run -t upload`

Variable de entorno opcional:
    PIO_PROJECT   ruta al proyecto PlatformIO (por defecto ../pio_project)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import pathlib
import shutil
import subprocess

app = Flask(__name__)
CORS(app)  # Permite peticiones desde el frontend abierto como file:// o desde otro host

# Resolver ruta al proyecto PlatformIO
DEFAULT_PIO = (pathlib.Path(__file__).parent.parent / "pio_project").resolve()
PIO_PROJECT = pathlib.Path(os.environ.get("PIO_PROJECT", str(DEFAULT_PIO))).resolve()
SRC_DIR     = PIO_PROJECT / "src"
SRC_FILE    = SRC_DIR / "main.cpp"

# Buscar el ejecutable de PlatformIO una sola vez
PIO_BIN = shutil.which("pio") or shutil.which("platformio")


def _run_pio(extra_args, timeout):
    """Ejecuta PlatformIO y devuelve dict con resultado."""
    if PIO_BIN is None:
        return {
            "ok": False,
            "error": "No se encontró el ejecutable 'pio'. Instala PlatformIO CLI: pip install platformio"
        }, 500

    cmd = [PIO_BIN, "run", "-d", str(PIO_PROJECT), *extra_args]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "cmd": " ".join(cmd),
            # Recortar a 6 KB para no saturar la respuesta
            "stdout": result.stdout[-6000:],
            "stderr": result.stderr[-6000:],
        }, 200
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Tiempo agotado ({timeout}s)"}, 504
    except FileNotFoundError as e:
        return {"ok": False, "error": f"Ejecutable no encontrado: {e}"}, 500


def _write_code(code: str):
    """Guarda el código en src/main.cpp. Crea el directorio si no existe."""
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    SRC_FILE.write_text(code, encoding="utf-8")


# ---------- ENDPOINTS ----------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "pio_project": str(PIO_PROJECT),
        "project_exists": PIO_PROJECT.exists(),
        "platformio_ini_exists": (PIO_PROJECT / "platformio.ini").exists(),
        "pio_binary": PIO_BIN,
    })


@app.route("/compile", methods=["POST"])
def compile_code():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify({"ok": False, "error": "No se recibió código"}), 400

    _write_code(code)
    print(f"[compile] {len(code)} bytes escritos en {SRC_FILE}")
    # Opcional: imprimir estructura de bloques recibida
    if "blocks" in data:
        print(f"[compile] bloques recibidos: setup={len(data['blocks'].get('setup', []))}, "
              f"loop={len(data['blocks'].get('loop', []))}")

    result, status = _run_pio([], timeout=180)
    result["code_written_to"] = str(SRC_FILE)
    return jsonify(result), status


@app.route("/upload", methods=["POST"])
def upload_code():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify({"ok": False, "error": "No se recibió código"}), 400

    _write_code(code)
    print(f"[upload] {len(code)} bytes escritos en {SRC_FILE}")

    result, status = _run_pio(["-t", "upload"], timeout=240)
    result["code_written_to"] = str(SRC_FILE)
    return jsonify(result), status


if __name__ == "__main__":
    print("=" * 60)
    print(f"  BlockCode backend")
    print(f"  Proyecto PIO : {PIO_PROJECT}")
    print(f"  Existe       : {PIO_PROJECT.exists()}")
    print(f"  pio binary   : {PIO_BIN}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
