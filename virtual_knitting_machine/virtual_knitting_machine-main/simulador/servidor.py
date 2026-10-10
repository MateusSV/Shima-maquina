"""
Servidor local do simulador de tricô. Usa só a biblioteca padrão do Python.

Uso (a partir da pasta do projeto):
    .\\.venv\\Scripts\\python simulador\\servidor.py [--porta 8000]   (ou a variável de ambiente PORT)

Rotas:
    /                      a página do simulador (arquivos de simulador/static)
    /editor.html           o editor de arquivos da Shima Seiki (.dat, .000, .QFD)
    /api/simular           ?padrao=meia|ribana|arroz&largura=2..60&carreiras=1..40 -> quadros da animação em JSON
    /api/arquivos          GET: lista a pasta de desenhos (--pasta, padrão "07 122 SSGsv")
    /api/arquivos/<nome>   GET: conteúdo do arquivo · POST: grava um .dat (o original vira <nome>.bak na 1ª vez)
"""

import argparse
import json
import os
import warnings
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from padroes import Parametros_Invalidos, simular

PASTA_ESTATICA = Path(__file__).with_name("static")
PASTA_DESENHOS = Path(__file__).resolve().parents[2] / "07 122 SSGsv"
PREFIXO_ARQUIVOS = "/api/arquivos"
TAMANHO_MAXIMO = 32 * 1024 * 1024
EXTENSOES_GRAVAVEIS = (".dat",)


class Manipulador(SimpleHTTPRequestHandler):
    """Entrega os arquivos da página e responde à API de simulação."""

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}

    pasta_desenhos: Path = PASTA_DESENHOS

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/api/simular":
            self._simular(parse_qs(url.query))
        elif url.path == PREFIXO_ARQUIVOS:
            self._listar_arquivos()
        elif url.path.startswith(PREFIXO_ARQUIVOS + "/"):
            self._ler_arquivo(url.path)
        else:
            super().do_GET()

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path.startswith(PREFIXO_ARQUIVOS + "/"):
            self._gravar_arquivo(url.path)
        else:
            self._json(HTTPStatus.NOT_FOUND, {"erro": "Rota inexistente."})

    def _arquivo_da_pasta(self, caminho: str) -> Path | None:
        """Só aceita um nome que exista na pasta de desenhos: nada de subpastas nem ".."."""
        nome = unquote(caminho[len(PREFIXO_ARQUIVOS) + 1 :])
        if not nome or "/" in nome or "\\" in nome or nome in (".", ".."):
            return None
        arquivo = self.pasta_desenhos / nome
        return arquivo if arquivo.parent == self.pasta_desenhos else None

    def _listar_arquivos(self) -> None:
        pasta = self.pasta_desenhos
        if not pasta.is_dir():
            self._json(HTTPStatus.OK, {"pasta": pasta.name, "arquivos": [], "erro": f"Pasta não encontrada: {pasta}"})
            return
        arquivos = [
            {"nome": a.name, "tamanho": a.stat().st_size}
            for a in sorted(pasta.iterdir(), key=lambda a: a.name.lower())
            if a.is_file() and not a.name.startswith(".")
        ]
        self._json(HTTPStatus.OK, {"pasta": pasta.name, "arquivos": arquivos})

    def _ler_arquivo(self, caminho: str) -> None:
        arquivo = self._arquivo_da_pasta(caminho)
        if arquivo is None or not arquivo.is_file():
            self._json(HTTPStatus.NOT_FOUND, {"erro": "Arquivo não encontrado na pasta de desenhos."})
            return
        corpo = arquivo.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _gravar_arquivo(self, caminho: str) -> None:
        arquivo = self._arquivo_da_pasta(caminho)
        if arquivo is None:
            self._json(HTTPStatus.BAD_REQUEST, {"erro": "Nome de arquivo inválido."})
            return
        if arquivo.suffix.lower() not in EXTENSOES_GRAVAVEIS:
            self._json(HTTPStatus.BAD_REQUEST, {"erro": "Só arquivos .dat podem ser gravados pelo editor."})
            return
        try:
            tamanho = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            tamanho = -1
        if not 0 < tamanho <= TAMANHO_MAXIMO:
            self._json(HTTPStatus.BAD_REQUEST, {"erro": "Tamanho do arquivo inválido."})
            return
        corpo = self.rfile.read(tamanho)
        if not corpo.startswith(b"SDS LZSS COMPRESS"):
            self._json(HTTPStatus.BAD_REQUEST, {"erro": "O conteúdo não é um .dat da Shima Seiki."})
            return
        if not self.pasta_desenhos.is_dir():
            self._json(HTTPStatus.NOT_FOUND, {"erro": "Pasta de desenhos não encontrada."})
            return
        copia = arquivo.with_name(arquivo.name + ".bak")
        if arquivo.exists() and not copia.exists():
            copia.write_bytes(arquivo.read_bytes())
        temporario = arquivo.with_name(arquivo.name + ".tmp")
        temporario.write_bytes(corpo)
        os.replace(temporario, arquivo)
        self._json(HTTPStatus.OK, {"nome": arquivo.name, "tamanho": len(corpo), "copia": copia.name if copia.exists() else None})

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


def criar_servidor(porta: int = 8000, host: str = "127.0.0.1", pasta: Path | None = None) -> ThreadingHTTPServer:
    manipulador = type("Manipulador_Da_Pasta", (Manipulador,), {"pasta_desenhos": (pasta or PASTA_DESENHOS).resolve()})
    return ThreadingHTTPServer((host, porta), partial(manipulador, directory=str(PASTA_ESTATICA)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulador de tricô em localhost.")
    parser.add_argument("--porta", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--pasta", type=Path, default=PASTA_DESENHOS, help="pasta com os arquivos .dat/.000/.QFD")
    args = parser.parse_args()
    servidor = criar_servidor(args.porta, pasta=args.pasta)
    print(f"Simulador de Tricô rodando em http://localhost:{args.porta}  (Ctrl+C para parar)")
    print(f"Editor de arquivos Shima em http://localhost:{args.porta}/editor.html  (pasta: {args.pasta.resolve()})")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
