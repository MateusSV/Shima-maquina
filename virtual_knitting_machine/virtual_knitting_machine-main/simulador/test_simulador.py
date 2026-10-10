"""Testes do simulador: receitas na máquina real e a API HTTP."""

import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import warnings

from pathlib import Path

from gerar_editor_portatil import EXEMPLO_PADRAO, SAIDA_PADRAO, gerar_artefato, gerar_html
from ler_dat_shima import ler_dat
from padroes import Parametros_Invalidos, simular
from servidor import PASTA_DESENHOS, criar_servidor

DAT_DE_EXEMPLO = PASTA_DESENHOS / "00FE_BLS_ESTAMPA_ONÇA.dat"


def grade_do_tecido(resultado: dict) -> dict[tuple[int, int], str]:
    return {(p["row"], p["col"]): p["kind"] for p in resultado["pontos"]}


class Test_Padroes(unittest.TestCase):

    def test_meia_so_tem_pontos_de_frente(self):
        r = simular("meia", 10, 6)
        self.assertEqual(len(r["pontos"]), 60)
        self.assertEqual({p["kind"] for p in r["pontos"]}, {"k"})
        self.assertEqual(sum(r["quadros"][-1]["front"]), 10)
        self.assertEqual(sum(r["quadros"][-1]["back"]), 0)

    def test_ribana_alterna_colunas(self):
        grade = grade_do_tecido(simular("ribana", 10, 4))
        for (linha, coluna), tipo in grade.items():
            self.assertEqual(tipo, "p" if coluna % 2 else "k", (linha, coluna))

    def test_arroz_forma_xadrez(self):
        grade = grade_do_tecido(simular("arroz", 10, 5))
        self.assertEqual(len(grade), 50)
        for (linha, coluna), tipo in grade.items():
            self.assertEqual(tipo, "p" if (linha + coluna) % 2 else "k", (linha, coluna))

    def test_quadros_comecam_e_terminam(self):
        quadros = simular("ribana", 6, 3)["quadros"]
        self.assertEqual(quadros[0]["op"], "inicio")
        self.assertEqual(quadros[-1]["op"], "fim")
        ops = {q["op"] for q in quadros}
        self.assertTrue({"tuck", "xfer", "knit"} <= ops)

    def test_contagem_de_pontos_cresce_a_cada_knit(self):
        quadros = simular("meia", 4, 2)["quadros"]
        for anterior, atual in zip(quadros, quadros[1:]):
            esperado = anterior["stitches"] + (1 if atual["op"] == "knit" else 0)
            self.assertEqual(atual["stitches"], esperado)

    def test_limites_extremos_nao_quebram_a_maquina(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            for padrao in ("meia", "ribana", "arroz"):
                for largura, carreiras in ((2, 1), (3, 2), (60, 40)):
                    r = simular(padrao, largura, carreiras)
                    self.assertEqual(len(r["pontos"]), largura * carreiras, (padrao, largura, carreiras))

    def test_parametros_invalidos(self):
        for args in (("xadrez", 10, 4), ("meia", 1, 4), ("meia", 61, 4), ("meia", 10, 0), ("meia", 10, 41)):
            with self.assertRaises(Parametros_Invalidos):
                simular(*args)


class Test_Servidor(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.servidor = criar_servidor(0)
        cls.base = f"http://127.0.0.1:{cls.servidor.server_address[1]}"
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()

    def get(self, caminho):
        try:
            with urllib.request.urlopen(self.base + caminho) as resposta:
                return resposta.status, resposta.headers.get("Content-Type"), resposta.read()
        except urllib.error.HTTPError as erro:
            return erro.code, erro.headers.get("Content-Type"), erro.read()

    def test_pagina_inicial(self):
        status, tipo, corpo = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", tipo)
        self.assertIn(b"Simulador de Tric", corpo)

    def test_arquivos_estaticos(self):
        for caminho in ("/app.js", "/maquina.js", "/style.css"):
            status, _, _ = self.get(caminho)
            self.assertEqual(status, 200, caminho)

    def test_api_simular(self):
        status, tipo, corpo = self.get("/api/simular?padrao=ribana&largura=8&carreiras=3")
        self.assertEqual(status, 200)
        self.assertIn("application/json", tipo)
        dados = json.loads(corpo)
        self.assertEqual(dados["largura"], 8)
        self.assertEqual(len(dados["pontos"]), 24)

    def test_api_parametros_invalidos(self):
        for consulta in ("padrao=xadrez&largura=8&carreiras=3", "padrao=meia&largura=abc&carreiras=3", "padrao=meia&largura=99&carreiras=3"):
            status, _, corpo = self.get("/api/simular?" + consulta)
            self.assertEqual(status, 400, consulta)
            self.assertIn("erro", json.loads(corpo))

    def test_rota_inexistente(self):
        status, _, _ = self.get("/nao-existe")
        self.assertEqual(status, 404)


@unittest.skipUnless(DAT_DE_EXEMPLO.exists(), "pasta de desenhos de exemplo ausente")
class Test_Ler_Dat(unittest.TestCase):

    def test_le_o_desenho_de_exemplo(self):
        largura, altura, paleta, pixels = ler_dat(DAT_DE_EXEMPLO)
        self.assertEqual((largura, altura), (1115, 590))
        self.assertEqual(len(paleta), 256)
        self.assertEqual(len(pixels), largura * altura)

    def test_recusa_arquivo_que_nao_e_dat(self):
        with tempfile.TemporaryDirectory() as pasta:
            falso = Path(pasta) / "falso.dat"
            falso.write_bytes(b"isto nao e um dat")
            with self.assertRaises(ValueError):
                ler_dat(falso)


class Test_Api_Arquivos(unittest.TestCase):

    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.pasta)
        self.dat = b"SDS LZSS COMPRESS Ver 1.00" + bytes(40)
        (self.pasta / "DESENHO.dat").write_bytes(self.dat)
        (self.pasta / "00_C_P.000").write_bytes(b"START\rF=00_C_P.000\t\rEND\r")
        self.servidor = criar_servidor(0, pasta=self.pasta)
        self.base = f"http://127.0.0.1:{self.servidor.server_address[1]}"
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()
        self.addCleanup(self.servidor.server_close)
        self.addCleanup(self.servidor.shutdown)

    def pedir(self, caminho, corpo=None, cabecalhos=None):
        if cabecalhos is None:
            cabecalhos = {"X-Editor-Shima": "1"} if corpo is not None else {}
        pedido = urllib.request.Request(self.base + caminho, data=corpo, method="POST" if corpo is not None else "GET", headers=cabecalhos)
        try:
            with urllib.request.urlopen(pedido) as resposta:
                return resposta.status, resposta.read()
        except urllib.error.HTTPError as erro:
            return erro.code, erro.read()

    def test_lista_a_pasta(self):
        status, corpo = self.pedir("/api/arquivos")
        self.assertEqual(status, 200)
        nomes = [a["nome"] for a in json.loads(corpo)["arquivos"]]
        self.assertEqual(nomes, ["00_C_P.000", "DESENHO.dat"])

    def test_le_um_arquivo(self):
        status, corpo = self.pedir("/api/arquivos/DESENHO.dat")
        self.assertEqual(status, 200)
        self.assertEqual(corpo, self.dat)

    def test_nome_com_acento_e_espaco(self):
        (self.pasta / "ESTAMPA ONÇA.dat").write_bytes(self.dat)
        status, corpo = self.pedir("/api/arquivos/" + urllib.request.quote("ESTAMPA ONÇA.dat"))
        self.assertEqual(status, 200)
        self.assertEqual(corpo, self.dat)

    def test_nao_sai_da_pasta(self):
        for caminho in ("/api/arquivos/..%2Fsegredo.dat", "/api/arquivos/%2E%2E", "/api/arquivos/a%5Cb.dat", "/api/arquivos/nao-existe.dat"):
            status, _ = self.pedir(caminho)
            self.assertEqual(status, 404, caminho)
        status, _ = self.pedir("/api/arquivos/..%2Fsegredo.dat", corpo=self.dat)
        self.assertEqual(status, 400)
        self.assertFalse((self.pasta.parent / "segredo.dat").exists())

    def test_grava_e_guarda_o_original(self):
        novo = b"SDS LZSS COMPRESS Ver 1.00" + bytes(50)
        status, corpo = self.pedir("/api/arquivos/DESENHO.dat", corpo=novo)
        self.assertEqual(status, 200, corpo)
        self.assertEqual((self.pasta / "DESENHO.dat").read_bytes(), novo)
        self.assertEqual((self.pasta / "DESENHO.dat.bak").read_bytes(), self.dat)
        # A cópia de segurança é feita só na primeira gravação.
        self.pedir("/api/arquivos/DESENHO.dat", corpo=self.dat)
        self.assertEqual((self.pasta / "DESENHO.dat.bak").read_bytes(), self.dat)

    def test_cria_arquivo_novo(self):
        status, _ = self.pedir("/api/arquivos/NOVO.dat", corpo=self.dat)
        self.assertEqual(status, 200)
        self.assertEqual((self.pasta / "NOVO.dat").read_bytes(), self.dat)
        self.assertFalse((self.pasta / "NOVO.dat.bak").exists())

    def test_recusa_gravar_o_que_nao_e_dat(self):
        status, _ = self.pedir("/api/arquivos/00_C_P.000", corpo=self.dat)
        self.assertEqual(status, 400)
        status, _ = self.pedir("/api/arquivos/DESENHO.dat", corpo=b"qualquer coisa")
        self.assertEqual(status, 400)
        self.assertEqual((self.pasta / "DESENHO.dat").read_bytes(), self.dat)

    def test_recusa_gravacao_vinda_de_outro_site(self):
        novo = b"SDS LZSS COMPRESS Ver 1.00" + bytes(50)
        casos = (
            {},  # sem o cabeçalho do editor (um formulário ou fetch "no-cors" de outro site)
            {"X-Editor-Shima": "1", "Origin": "https://site-malicioso.example"},
            {"X-Editor-Shima": "1", "Host": "site-malicioso.example:8765"},  # DNS rebinding
        )
        for cabecalhos in casos:
            status, _ = self.pedir("/api/arquivos/DESENHO.dat", corpo=novo, cabecalhos=cabecalhos)
            self.assertEqual(status, 403, cabecalhos)
        self.assertEqual((self.pasta / "DESENHO.dat").read_bytes(), self.dat)

    def test_leitura_so_para_o_proprio_computador(self):
        status, _ = self.pedir("/api/arquivos", cabecalhos={"Host": "site-malicioso.example"})
        self.assertEqual(status, 403)
        status, _ = self.pedir("/api/arquivos", cabecalhos={"Origin": "http://localhost:8765"})
        self.assertEqual(status, 200)

    def test_editor_funciona_sem_a_biblioteca_do_simulador(self):
        import servidor

        original = servidor.simular
        servidor.simular = None
        self.addCleanup(setattr, servidor, "simular", original)
        status, corpo = self.pedir("/api/simular?padrao=meia&largura=4&carreiras=2")
        self.assertEqual(status, 503)
        self.assertIn("erro", json.loads(corpo))
        status, _ = self.pedir("/api/arquivos/DESENHO.dat")
        self.assertEqual(status, 200)

    def test_pagina_do_editor(self):
        status, corpo = self.pedir("/editor.html")
        self.assertEqual(status, 200)
        self.assertIn(b"Editor Shima", corpo)


class Test_Editor_Portatil(unittest.TestCase):

    def test_arquivo_unico_tem_tudo_embutido(self):
        html = gerar_html()
        self.assertNotIn('<script src="', html)
        self.assertNotIn('href="editor.css"', html)
        for trecho in ("function ler(buffer)", "function lerPrograma(buffer)", "function abrirLocais(arquivos)"):
            self.assertIn(trecho, html)

    @unittest.skipUnless(EXEMPLO_PADRAO.exists(), "desenho de exemplo ausente")
    def test_versao_publicada_comeca_pelo_titulo_e_traz_o_exemplo(self):
        html = gerar_artefato()
        self.assertTrue(html.startswith("<title>Editor Shima</title>"))
        for tag in ("<!doctype", "<html", "<head>", "<body>", "</body>", "</html>"):
            self.assertNotIn(tag, html)
        self.assertIn("window.SHIMA_EXEMPLO", html)
        self.assertNotIn("confirm(", html.replace("perguntar", ""))
        self.assertNotIn(" prompt(", html)

    @unittest.skipUnless(SAIDA_PADRAO.exists(), "Editor Shima.html ainda não foi gerado")
    def test_arquivo_unico_esta_atualizado(self):
        self.assertEqual(
            SAIDA_PADRAO.read_text(encoding="utf-8"),
            gerar_html(),
            "Editor Shima.html está desatualizado: rode python simulador/gerar_editor_portatil.py",
        )


if __name__ == "__main__":
    unittest.main()
