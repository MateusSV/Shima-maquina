"""
Gera o "Editor Shima.html": o editor inteiro num único arquivo, para abrir com dois cliques no computador,
sem Python nem servidor. Junta editor.html, editor.css e os scripts de simulador/static.

Uso (a partir da pasta do projeto):
    python simulador/gerar_editor_portatil.py [--saida "Editor Shima.html"]

Rode de novo sempre que mudar algum arquivo do editor.
"""

import argparse
import re
from pathlib import Path

PASTA_ESTATICA = Path(__file__).with_name("static")
SAIDA_PADRAO = Path(__file__).resolve().parents[3] / "Editor Shima.html"


def gerar_html() -> str:
    html = (PASTA_ESTATICA / "editor.html").read_text(encoding="utf-8")

    css = (PASTA_ESTATICA / "editor.css").read_text(encoding="utf-8")
    link_css = '<link rel="stylesheet" href="editor.css">'
    if html.count(link_css) != 1:
        raise RuntimeError("editor.html mudou: não encontrei o link para editor.css")
    html = html.replace(link_css, f"<style>\n{css}</style>")

    def embutir(m: re.Match) -> str:
        codigo = (PASTA_ESTATICA / m.group(1)).read_text(encoding="utf-8")
        if "</script" in codigo.lower():
            raise RuntimeError(f"{m.group(1)} contém '</script' e quebraria o arquivo único")
        return f"<script>\n// ---- {m.group(1)} ----\n{codigo}</script>"

    html, quantos = re.subn(r'<script src="([\w.]+\.js)"></script>', embutir, html)
    if quantos != 3:
        raise RuntimeError(f"esperava 3 scripts em editor.html, encontrei {quantos}")

    # No arquivo único não existe o simulador ao lado.
    html = html.replace('  <a class="link-simulador" href="index.html">Simulador</a>\n', "")
    aviso = "<!-- Gerado por simulador/gerar_editor_portatil.py a partir de simulador/static/editor.*. Não edite à mão. -->\n"
    return html.replace("<!doctype html>\n", "<!doctype html>\n" + aviso, 1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera o editor Shima num único arquivo HTML.")
    parser.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    args = parser.parse_args()
    args.saida.write_text(gerar_html(), encoding="utf-8", newline="\n")
    print(f"Editor gerado em {args.saida}")


if __name__ == "__main__":
    main()
