"""
Servidor local do simulador de tricô. Usa só a biblioteca padrão do Python.

Uso (a partir da pasta do projeto):
    .\\.venv\\Scripts\\python simulador\\servidor.py [--porta 8000]   (ou a variável de ambiente PORT)

Rotas:
    /                 a página do simulador (arquivos de simulador/static)
    /api/simular      ?padrao=meia|ribana|arroz&largura=2..60&carreiras=1..40 -> quadros da animação em JSON
"""

import argparse
import json
import os
import warnings
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from padroes import Parametros_Invalidos, simular

PASTA_ESTATICA = Path(__file__).with_name("static")


class Manipulador(SimpleHTTPRequestHandler):
    """Entrega os arquivos da página e responde à API de simulação."""

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/api/simular":
            self._simular(parse_qs(url.query))
        else:
            super().do_GET()

    def _simular(self, consulta: dict[str, list[str]]) -> None:
        try:
            padrao = consulta.get("padrao", ["ribana"])[0]
            largura = int(consulta.get("largura", ["16"])[0])
            carreiras = int(consulta.get("carreiras", ["12"])[0])
        except ValueError:
            self._json(HTTPStatus.BAD_REQUEST, {"erro": "Largura e carreiras devem ser números inteiros."})
            return
        try:
            with warnings.catch_warnings(record=True) as avisos:
                warnings.simplefilter("always")
                resultado = simular(padrao, largura, carreiras)
        except Parametros_Invalidos as erro:
            self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
            return
        except Exception as erro:  # A máquina recusou uma operação: devolve a mensagem da biblioteca.
            self._json(HTTPStatus.UNPROCESSABLE_ENTITY, {"erro": f"A máquina recusou uma operação: {erro}"})
            return
        resultado["avisos"] = sorted({str(a.message) for a in avisos})
        self._json(HTTPStatus.OK, resultado)

    def _json(self, status: HTTPStatus, dados: dict) -> None:
        corpo = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, format: str, *args) -> None:
        # Só registra erros, para não poluir o terminal a cada arquivo servido.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)


def criar_servidor(porta: int = 8000, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, porta), partial(Manipulador, directory=str(PASTA_ESTATICA)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulador de tricô em localhost.")
    parser.add_argument("--porta", type=int, default=int(os.environ.get("PORT", 8000)))
    args = parser.parse_args()
    servidor = criar_servidor(args.porta)
    print(f"Simulador de Tricô rodando em http://localhost:{args.porta}  (Ctrl+C para parar)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
