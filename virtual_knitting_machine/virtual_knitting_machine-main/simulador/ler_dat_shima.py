"""
Abre um arquivo .dat de design da Shima Seiki (KnitPaint / SDS-ONE APEX) e o converte para PNG.

Formato (descoberto por análise do arquivo, sem documentação oficial):
    - Cabeçalho de 0x40 bytes: "SDS LZSS COMPRESS Ver 1.00".
    - 4 bytes little-endian com o tamanho descompactado, seguidos dos dados em LZSS
      (janela de 4096 bytes, comprimento máximo 18, janela iniciada com zeros).
    - Dentro dos dados descompactados:
        0x004  x final e y final (uint16) -> largura = x + 1, altura = y + 1
        0x200  paleta de 256 cores em três planos: 256 bytes de R, 256 de G e 256 de B
        0x600  pixels em pares (número da cor, repetições), da última linha para a primeira

Uso:
    python simulador/ler_dat_shima.py ARQUIVO.dat [saida.png]
"""

import struct
import sys
import zlib
from collections import Counter
from pathlib import Path

ASSINATURA = b"SDS LZSS COMPRESS"


def descompactar_lzss(dados: bytes) -> bytes:
    """Descompacta LZSS no estilo Okumura (N=4096, F=18, limiar 2)."""
    n, f = 4096, 18
    janela = bytearray(n)
    r = n - f
    saida = bytearray()
    i = 0
    flags = 0
    while i < len(dados):
        flags >>= 1
        if not flags & 0x100:
            flags = dados[i] | 0xFF00
            i += 1
            if i >= len(dados):
                break
        if flags & 1:
            c = dados[i]
            i += 1
            saida.append(c)
            janela[r] = c
            r = (r + 1) & (n - 1)
        else:
            if i + 1 >= len(dados):
                break
            a, b = dados[i], dados[i + 1]
            i += 2
            posicao = a | ((b & 0xF0) << 4)
            for k in range((b & 0x0F) + 3):
                c = janela[(posicao + k) & (n - 1)]
                saida.append(c)
                janela[r] = c
                r = (r + 1) & (n - 1)
    return bytes(saida)


def ler_dat(caminho: Path) -> tuple[int, int, list[tuple[int, int, int]], bytes]:
    """Devolve largura, altura, paleta e os índices de cor de cada pixel (linha de cima primeiro)."""
    bruto = caminho.read_bytes()
    if not bruto.startswith(ASSINATURA):
        raise ValueError(f"{caminho} não é um .dat compactado da Shima Seiki (assinatura SDS LZSS ausente).")
    tamanho = int.from_bytes(bruto[0x40:0x44], "little")
    dados = descompactar_lzss(bruto[0x44:])[:tamanho]
    if len(dados) < tamanho:
        raise ValueError(f"Arquivo truncado: {len(dados)} de {tamanho} bytes descompactados.")

    x_final, y_final = struct.unpack_from("<HH", dados, 4)
    largura, altura = x_final + 1, y_final + 1
    paleta = [(dados[0x200 + c], dados[0x300 + c], dados[0x400 + c]) for c in range(256)]

    pixels = bytearray()
    for i in range(0x600, len(dados) - 1, 2):
        pixels += bytes([dados[i]]) * dados[i + 1]
    if len(pixels) < largura * altura:
        raise ValueError(f"Faltam pixels: esperado {largura * altura}, lido {len(pixels)}.")

    # O arquivo guarda a linha de baixo primeiro (como a máquina tricota).
    linhas = [pixels[y * largura : (y + 1) * largura] for y in range(altura)]
    return largura, altura, paleta, b"".join(reversed(linhas))


def salvar_png(caminho: Path, largura: int, altura: int, paleta: list[tuple[int, int, int]], pixels: bytes) -> None:
    """Grava um PNG indexado (8 bits + paleta) sem depender de bibliotecas externas."""

    def bloco(tipo: bytes, conteudo: bytes) -> bytes:
        return struct.pack(">I", len(conteudo)) + tipo + conteudo + struct.pack(">I", zlib.crc32(tipo + conteudo))

    linhas = b"".join(b"\x00" + pixels[y * largura : (y + 1) * largura] for y in range(altura))
    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 3, 0, 0, 0))
        + bloco(b"PLTE", bytes(v for cor in paleta for v in cor))
        + bloco(b"IDAT", zlib.compress(linhas, 9))
        + bloco(b"IEND", b"")
    )


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    entrada = Path(sys.argv[1])
    saida = Path(sys.argv[2]) if len(sys.argv) > 2 else entrada.with_suffix(".png")
    largura, altura, paleta, pixels = ler_dat(entrada)
    salvar_png(saida, largura, altura, paleta, pixels)

    print(f"{entrada.name}: {largura} x {altura} pixels -> {saida}")
    print("Cores usadas (número da cor na paleta: pixels, RGB):")
    for cor, quantidade in sorted(Counter(pixels).items()):
        print(f"  {cor:3d}: {quantidade:7d}  {paleta[cor]}")


if __name__ == "__main__":
    main()
