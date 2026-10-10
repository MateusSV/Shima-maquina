"""Testes do simulador: receitas na máquina real e a API HTTP."""

import json
import threading
import unittest
import urllib.error
import urllib.request
import warnings

from padroes import Parametros_Invalidos, simular
from servidor import criar_servidor


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


if __name__ == "__main__":
    unittest.main()
