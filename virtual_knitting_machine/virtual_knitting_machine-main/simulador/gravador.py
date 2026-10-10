"""
Grava cada operação feita na máquina virtual como um quadro, para a página animar depois.
"""

from virtual_knitting_machine.Knitting_Machine import Knitting_Machine
from virtual_knitting_machine.machine_components.carriage_system.Carriage_Pass_Direction import Carriage_Pass_Direction
from virtual_knitting_machine.machine_components.yarn_management.Yarn_Carrier_Set import Yarn_Carrier_Set

ESQUERDA = -1
DIREITA = 1


def direcao_do_carro(direcao: int) -> Carriage_Pass_Direction:
    """Converte -1/1 na direção de passada da biblioteca."""
    return Carriage_Pass_Direction.Leftward if direcao < 0 else Carriage_Pass_Direction.Rightward


def seta(direcao: int) -> str:
    return "←" if direcao < 0 else "→"


def nome_agulha(frente: bool, posicao: int) -> str:
    return f"{'f' if frente else 'b'}{posicao}"


class Gravador:
    """
    Envolve uma Knitting_Machine: executa tuck, knit e xfer nela e registra o estado depois de cada operação.

    Cada quadro guarda a operação, a agulha, a direção do carrinho, a posição do guia-fio,
    quantas laçadas cada agulha segura e quantos pontos o tecido já tem.
    """

    def __init__(self, largura: int, guia_fio: int = 1) -> None:
        self.largura: int = largura
        self.maquina: Knitting_Machine = Knitting_Machine()
        self.guia_fio: int = guia_fio
        self.fio: Yarn_Carrier_Set = Yarn_Carrier_Set(guia_fio)
        self.quadros: list[dict] = []
        self.pontos: list[dict] = []
        self.etapa: str = "Início"
        self.carreira: int = -1
        # O carrinho e o guia-fio começam estacionados à direita das agulhas usadas.
        self._posicao_guia: float = largura + 0.5
        self._recente: dict | None = None
        self._registrar("inicio", True, largura + 0.5, ESQUERDA, "máquina pronta")

    def tem_lacada(self, frente: bool, posicao: int) -> bool:
        return self.maquina.get_specified_needle(frente, posicao).has_loops

    def nova_carreira(self) -> None:
        self.carreira += 1
        self.etapa = f"Carreira {self.carreira + 1}"

    def tuck(self, posicao: int, direcao: int) -> None:
        agulha = self.maquina.get_specified_needle(True, posicao)
        self.maquina.tuck(self.fio, agulha, direcao_do_carro(direcao))
        self._posicao_guia = posicao
        self._recente = {"bed": "f", "pos": posicao}
        self._registrar("tuck", True, posicao, direcao, f"tuck em {nome_agulha(True, posicao)} {seta(direcao)}")

    def knit(self, frente: bool, posicao: int, direcao: int) -> None:
        agulha = self.maquina.get_specified_needle(frente, posicao)
        self.maquina.knit(self.fio, agulha, direcao_do_carro(direcao))
        self._posicao_guia = posicao
        self._recente = {"bed": "f" if frente else "b", "pos": posicao}
        self.pontos.append({"row": self.carreira, "col": posicao, "kind": "k" if frente else "p"})
        self._registrar("knit", frente, posicao, direcao, f"knit em {nome_agulha(frente, posicao)} {seta(direcao)}")

    def xfer(self, frente: bool, posicao: int, direcao: int) -> None:
        agulha = self.maquina.get_specified_needle(frente, posicao)
        self.maquina.xfer(agulha)
        self._recente = {"bed": "b" if frente else "f", "pos": posicao}
        rotulo = f"xfer {nome_agulha(frente, posicao)} → {nome_agulha(not frente, posicao)}"
        self._registrar("xfer", frente, posicao, direcao, rotulo)

    def finalizar(self) -> dict:
        ultimo = self.quadros[-1]
        self.etapa = "Fim"
        self._registrar("fim", True, ultimo["pos"], ultimo["dir"], "tricô concluído")
        return {
            "largura": self.largura,
            "carreiras": self.carreira + 1,
            "quadros": self.quadros,
            "pontos": self.pontos,
        }

    def _lacadas_por_agulha(self, frente: bool) -> list[int]:
        contagem = [0] * self.largura
        agulhas = self.maquina.front_loops() if frente else self.maquina.back_loops()
        for agulha in agulhas:
            if 0 <= agulha.position < self.largura:
                contagem[agulha.position] = len(agulha.held_loops)
        return contagem

    def _registrar(self, operacao: str, frente: bool, posicao: float, direcao: int, rotulo: str) -> None:
        self.quadros.append(
            {
                "op": operacao,
                "bed": "f" if frente else "b",
                "pos": posicao,
                "dir": direcao,
                "label": rotulo,
                "stage": self.etapa,
                "front": self._lacadas_por_agulha(True),
                "back": self._lacadas_por_agulha(False),
                "stitches": len(self.pontos),
                "carrier": self._posicao_guia,
                "fresh": self._recente,
            }
        )
