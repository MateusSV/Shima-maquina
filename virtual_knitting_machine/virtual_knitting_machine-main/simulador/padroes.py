"""
Receitas de tricô executadas na máquina virtual: meia (jersey), ribana 1x1 e ponto arroz.

As sequências seguem as de tests/test_simple_patterns.py: montagem com tucks alternados,
transferências para a fileira de trás e passadas de knit alternando a direção.
"""

from gravador import DIREITA, ESQUERDA, Gravador

PADROES: dict[str, str] = {"meia": "Meia", "ribana": "Ribana 1x1", "arroz": "Ponto arroz"}
LARGURA_MIN, LARGURA_MAX = 2, 60
CARREIRAS_MIN, CARREIRAS_MAX = 1, 40


class Parametros_Invalidos(ValueError):
    """Padrão, largura ou número de carreiras fora do permitido."""


def simular(padrao: str, largura: int, carreiras: int) -> dict:
    """
    Tricota o padrão na máquina virtual e devolve todos os quadros da animação.

    Raises:
        Parametros_Invalidos: Se o padrão não existir ou a largura/carreiras estiverem fora dos limites.
    """
    if padrao not in PADROES:
        raise Parametros_Invalidos(f"Padrão desconhecido: {padrao!r}. Use um de: {', '.join(PADROES)}.")
    if not LARGURA_MIN <= largura <= LARGURA_MAX:
        raise Parametros_Invalidos(f"A largura deve ficar entre {LARGURA_MIN} e {LARGURA_MAX} agulhas.")
    if not CARREIRAS_MIN <= carreiras <= CARREIRAS_MAX:
        raise Parametros_Invalidos(f"O número de carreiras deve ficar entre {CARREIRAS_MIN} e {CARREIRAS_MAX}.")

    g = Gravador(largura)
    _montar(g)
    if padrao != "meia":
        # Ribana 1x1: as agulhas ímpares passam para a fileira de trás.
        _transferir(g, ESQUERDA, so_impares_da_frente=True)

    # O guia-fio termina a montagem à direita, e a transferência não o move:
    # começar para a direita deixaria um fio solto atravessando toda a largura.
    direcao = ESQUERDA
    for carreira in range(carreiras):
        g.nova_carreira()
        _passada_de_knit(g, direcao)
        if padrao == "arroz" and carreira < carreiras - 1:
            # Ponto arroz: toda laçada troca de fileira, então a próxima carreira inverte meia e tricô.
            _transferir(g, -direcao)
        direcao = -direcao
    return g.finalizar()


def _posicoes(largura: int, direcao: int) -> list[int]:
    posicoes = list(range(largura))
    return posicoes[::-1] if direcao < 0 else posicoes


def _montar(g: Gravador) -> None:
    g.maquina.in_hook(g.guia_fio)
    g.etapa = "Montagem"
    for i in range(g.largura - 1, -1, -2):
        g.tuck(i, ESQUERDA)
    for i in range(0 if g.largura % 2 == 0 else 1, g.largura, 2):
        g.tuck(i, DIREITA)
    g.maquina.release_hook()


def _transferir(g: Gravador, direcao: int, so_impares_da_frente: bool = False) -> None:
    g.etapa = "Transferência"
    for i in _posicoes(g.largura, direcao):
        if g.tem_lacada(True, i) and (not so_impares_da_frente or i % 2 == 1):
            g.xfer(True, i, direcao)
        elif g.tem_lacada(False, i) and not so_impares_da_frente:
            g.xfer(False, i, direcao)


def _passada_de_knit(g: Gravador, direcao: int) -> None:
    for i in _posicoes(g.largura, direcao):
        for frente in (True, False):
            if g.tem_lacada(frente, i):
                g.knit(frente, i, direcao)
