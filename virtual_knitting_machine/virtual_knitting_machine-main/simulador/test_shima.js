// Testes dos formatos da Shima Seiki (shima_dat.js e shima_arquivos.js).
// Rodar a partir da pasta do projeto: node --test simulador/test_shima.js

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ShimaDat = require("./static/shima_dat.js");
const ShimaArquivos = require("./static/shima_arquivos.js");

const PASTA = path.resolve(__dirname, "..", "..", "07 122 SSGsv");
const temPasta = fs.existsSync(PASTA);
const ler = (nome) => fs.readFileSync(path.join(PASTA, nome));
const semPasta = { skip: !temPasta && "pasta de desenhos de exemplo ausente" };

test("compactar e descompactar devolvem os mesmos bytes", () => {
  let semente = 7;
  const aleatorio = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) >> 16;
  const casos = [
    new Uint8Array(0),
    new Uint8Array([1]),
    new Uint8Array(5000).fill(9),
    Uint8Array.from({ length: 20000 }, () => aleatorio() & 255),
    Uint8Array.from({ length: 20000 }, (_, i) => (i % 37 < 30 ? 0 : aleatorio() & 3)),
  ];
  for (const dados of casos) {
    const volta = ShimaDat.descompactar(ShimaDat.compactar(dados), dados.length);
    assert.deepEqual(volta, dados);
  }
});

test("desenho novo, editado e gravado volta igual", () => {
  const base = ShimaDat.novo(40, 30, null);
  for (let i = 0; i < base.pixels.length; i++) base.pixels[i] = (i * 7) % 5;
  base.pixels.fill(200, 100, 400);
  const volta = ShimaDat.ler(ShimaDat.gravar(base).buffer);
  assert.equal(volta.largura, 40);
  assert.equal(volta.altura, 30);
  assert.deepEqual(volta.pixels, base.pixels);
});

test("linhas mais largas que 255 pixels iguais são divididas", () => {
  const doc = ShimaDat.novo(1000, 2, null);
  doc.pixels.fill(3);
  const volta = ShimaDat.ler(ShimaDat.gravar(doc).buffer);
  assert.deepEqual(volta.pixels, doc.pixels);
});

test("recusa arquivo que não é .dat", () => {
  assert.throws(() => ShimaDat.ler(new TextEncoder().encode("qualquer coisa").buffer), /não é um \.dat/);
});

test("lê o desenho de exemplo e grava sem perder nada", semPasta, () => {
  const original = ler("00FE_BLS_ESTAMPA_ONÇA.dat");
  const doc = ShimaDat.ler(original);
  assert.equal(doc.largura, 1115);
  assert.equal(doc.altura, 590);
  const gravado = ShimaDat.gravar(doc);
  const tamanho = original.readUInt32LE(0x40);
  const a = ShimaDat.descompactar(original.subarray(0x44), tamanho);
  const b = ShimaDat.descompactar(gravado.subarray(0x44), new DataView(gravado.buffer).getUint32(0x40, true));
  assert.deepEqual(b, a);
  assert.deepEqual(gravado.subarray(0, 0x40), new Uint8Array(original.subarray(0, 0x40)));
});

test("identifica o tipo de cada arquivo da pasta", semPasta, () => {
  const tipos = {
    "00FE_BLS_ESTAMPA_ONÇA.dat": "dat",
    "00_C_P.000": "programa",
    "00_M_P.000": "programa",
    "00_C_P.QFD": "ajustes",
    "00_M_P.QFD": "ajustes",
  };
  for (const [nome, tipo] of Object.entries(tipos)) assert.equal(ShimaArquivos.abrir(nome, ler(nome)).tipo, tipo, nome);
});

test("abre o programa .000: cabeçalho, seções e linhas", semPasta, () => {
  const p = ShimaArquivos.abrir("00_C_P.000", ler("00_C_P.000"));
  assert.deepEqual(p.campos.find((c) => c.chave === "F"), { chave: "F", valor: "00_C_P.000" });
  assert.match(p.copyright, /SHIMA SEIKI/);
  assert.equal(p.secoes.length, 14);
  const compactadas = p.secoes.filter((s) => s.compactada);
  assert.deepEqual(compactadas.map((s) => s.dados.length), [155, 13883]);
  assert.equal(compactadas[1].linhas.length, 210);
  for (const linha of compactadas[1].linhas) assert.deepEqual(linha.map((s) => s[0]), [0x81, 0x82, 0x83]);
});

test("abre os ajustes .QFD: registros encadeados até o fim", semPasta, () => {
  const q = ShimaArquivos.abrir("00_C_P.QFD", ler("00_C_P.QFD"));
  assert.match(q.titulo, /AUTOMATIC SETTINGS/);
  assert.equal(q.registros.length, 22);
  assert.equal(q.resto, 0);
  assert.deepEqual(q.registros.slice(0, 3).map((r) => r.numero), [0, 1, 2]);
});

test("acha as linhas de opção de um desenho montado à mão", () => {
  // Área de desenho em x 10–19; à direita, a linha 1 em x 20–21 e as guias 2..20 a partir de x 22.
  const doc = ShimaDat.novo(70, 12, null);
  const p = (x, y, c) => (doc.pixels[y * 70 + x] = c);
  for (let y = 1; y <= 10; y++) {
    for (let k = 2; k <= 20; k++) p(22 + 2 * (k - 2), y, k);
    p(20, y, y % 2 ? 6 : 7);
  }
  p(30 + 1, 5, 12); // R6: ponto 12 na carreira y=5
  const blocos = ShimaDat.linhasDeOpcao(doc);
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].lado, "R");
  assert.deepEqual(blocos[0].colunas[6], [30, 31]);
  assert.deepEqual(ShimaDat.linhaDeOpcaoEm(blocos, 31, 5).numero, 6);
  const valores = ShimaDat.valoresDasLinhas(doc, blocos[0], 5);
  assert.deepEqual(valores.find((v) => v.linha === "R6").cores, [12]);
  assert.equal(ShimaDat.linhaDeOpcaoEm(blocos, 5, 5), null);
});

test("acha as linhas de opção do desenho de exemplo", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const blocos = ShimaDat.linhasDeOpcao(doc);
  assert.deepEqual(blocos.map((b) => b.lado), ["L", "R", "L", "R"]);
  const direita = blocos[1];
  const y = doc.altura - 250; // carreira 250
  const r = Object.fromEntries(ShimaDat.valoresDasLinhas(doc, direita, y).map((v) => [v.linha, v.cores]));
  assert.deepEqual(r.R3, [4]); // guia-fio 4
  assert.deepEqual(r.R6, [5]); // ponto 5
});

// ------------------------------------------------------------------ recursos para desenvolver o modelo

const Recursos = require("./static/recursos_malha.js");

const contar = (px) => {
  const c = {};
  for (const v of px) c[v] = (c[v] || 0) + 1;
  return c;
};

test("modelo: medidas em cm viram agulhas e carreiras pela densidade", () => {
  const densidade = { colunas: 30, carreiras: 40 };
  const careca = Recursos.calcularModelo("careca", {}, densidade);
  assert.deepEqual(careca.pecas.map((p) => [p.nome, p.qtd, p.agulhas, p.carreiras]), [
    ["Frente", 1, 144, 240],
    ["Costas", 1, 144, 240],
    ["Manga", 2, 102, 232],
  ]);
  assert.deepEqual(careca.pecas[0].forma, { tipo: "corpo", W: 144, H: 240, barra: 20, cava: 80, recuo: 12, arremCava: 4, gola: 54, golaP: 32, arremGola: 18, degraus: 3 });
  assert.deepEqual([careca.pecas[1].forma.golaP, careca.pecas[1].forma.arremGola], [10, 30]);
  assert.deepEqual(careca.pecas[2].forma, { tipo: "manga", punho: 60, W: 102, H: 232, barra: 20, copa: 60, arremCopa: 4, topo: 26 });
  // O painel do arquivo de exemplo: 67,7 cm × 44,8 cm dão 203 agulhas × 179 carreiras.
  const painel = Recursos.calcularModelo("painel", {}, densidade);
  assert.deepEqual([painel.pecas[0].agulhas, painel.pecas[0].carreiras], [203, 179]);
  // Valores digitados com vírgula também valem.
  assert.equal(Recursos.calcularModelo("careca", { larg: "50,0" }, densidade).pecas[0].agulhas, 150);
});

test("forma: diminuições espalhadas pelas carreiras e peça simétrica", () => {
  assert.deepEqual(Recursos.distribuir(5, 1, 4).map((e) => e.n), [3, 2]); // trecho curto: tira mais no começo
  const eventos = Recursos.distribuir(8, 1, 36);
  assert.equal(eventos.reduce((t, e) => t + e.n, 0), 8);
  assert.ok(eventos.every((e) => e.intervalo >= 2) && eventos[eventos.length - 1].off <= 36);

  const { pecas } = Recursos.calcularModelo("careca", {}, { colunas: 30, carreiras: 40 });
  const frente = Recursos.planoForma(pecas[0].forma, {});
  const passo = (nome) => frente.passos.find((s) => s.nome === nome);
  assert.deepEqual([passo("Cava: diminuições").de, passo("Cava: diminuições").ate], [165, 197]);
  assert.equal(passo("Cava: diminuições").texto, "−1 agulha de cada lado a cada 4 carreiras, 6× · −1 agulha de cada lado a cada 6 carreiras, 2×.");
  assert.deepEqual([passo("Gola: arremate central").de, passo("Gola: diminuições").de, passo("Gola: diminuições").ate], [209, 211, 237]);
  assert.match(passo("Ombro: malha parcial").texto, /3 degraus de 11, 11, 11 agulhas/);
  assert.match(passo("Arremate final").texto, /33 agulhas em cada ombro/);

  const codigos = { malha: 1, fora: 0, arremate: 16, parcial: 16, marcaEsq: 71, marcaDir: 61 };
  const img = Recursos.pixelsDaForma(frente, codigos);
  assert.deepEqual([img.w, img.h], [144, 240]);
  assert.deepEqual(contar(img.px), { 0: 2862, 1: 31364, 16: 290, 61: 22, 71: 22 });
  // Com as duas marcas iguais, cada carreira é igual ao seu espelho.
  const igual = Recursos.pixelsDaForma(frente, { ...codigos, marcaDir: 71 });
  for (let y = 0; y < igual.h; y++) {
    const linha = Array.from(igual.px.subarray(y * igual.w, (y + 1) * igual.w));
    assert.deepEqual(linha, linha.slice().reverse(), `carreira ${igual.h - y} não é simétrica`);
  }
  // Barra: a carreira de baixo tem a largura toda em malha.
  assert.ok(img.px.subarray((img.h - 1) * img.w).every((v) => v === 1));

  const manga = Recursos.planoForma(pecas[2].forma, {});
  const aumentos = manga.passos.find((s) => s.nome === "Aumentos");
  assert.deepEqual([aumentos.de, aumentos.ate], [26, 172]);
  assert.equal(aumentos.texto, "+1 agulha de cada lado a cada 6 carreiras, 8× · +1 agulha de cada lado a cada 8 carreiras, 13×.");
  assert.match(manga.resumo, /punho com 60 agulhas, ganha 21 de cada lado até 102/);
});

test("biblioteca: repetição normal e em degraus a partir do canto de baixo à esquerda", () => {
  const motivo = { nome: "t", w: 2, h: 1, px: [1, 2] };
  const px = new Uint8Array(6 * 3);
  Recursos.repetirMotivo(px, 6, { x: 0, y: 0, w: 6, h: 3 }, motivo, 1);
  assert.deepEqual(Array.from(px.subarray(12, 18)), [1, 2, 1, 2, 1, 2]); // carreira de baixo
  assert.deepEqual(Array.from(px.subarray(6, 12)), [2, 1, 2, 1, 2, 1]); // anda 1 agulha
  assert.deepEqual(Array.from(px.subarray(0, 6)), [1, 2, 1, 2, 1, 2]);
  const alto = { nome: "a", w: 1, h: 2, px: [7, 8] }; // 7 em cima, 8 embaixo
  const col = new Uint8Array(3);
  Recursos.repetirMotivo(col, 1, { x: 0, y: 0, w: 1, h: 3 }, alto, 0);
  assert.deepEqual(Array.from(col), [8, 7, 8]);
  for (const c of Recursos.BIBLIOTECA) for (const m of c.motivos) assert.equal(m.px.length, m.w * m.h, m.nome);
});

test("jacquard: fios soltos no avesso conforme a estrutura", () => {
  const linha = Uint8Array.from([1, 2, 2, 2, 2, 2, 2, 1, 1, 1]);
  const r = { x: 0, y: 0, w: 10, h: 1 };
  const solta = Recursos.flutuacoes(linha, 10, r, "flutuacao");
  assert.deepEqual(solta.lista, [{ y: 0, cor: 1, x0: 1, x1: 6, comprimento: 6 }]);
  assert.ok(Recursos.flutuacoes(linha, 10, r, "birdseye").lista.every((f) => f.comprimento <= 1));
  assert.ok(Recursos.flutuacoes(linha, 10, r, "escada", 3).lista.every((f) => f.comprimento <= 2));
  assert.deepEqual(Recursos.flutuacoes(linha, 10, r, "tubular").lista, []);
});

test("intarsia: um guia-fio por trecho de cor, reaproveitado quando a área acaba", () => {
  // Carreira de baixo: 1 1 2 2 1 1 (duas áreas da cor 1); carreira de cima: tudo 2.
  const px = Uint8Array.from([2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1]);
  const it = Recursos.guiasIntarsia(px, 6, { x: 0, y: 0, w: 6, h: 2 });
  assert.deepEqual(it.guias.map((g) => g.cor).sort(), [1, 1, 2]);
  assert.equal(it.areas.length, 3);
  // Listras e losango
  const listras = Recursos.gerarListras(2, 4, [{ cor: 5, carreiras: 1 }, { cor: 6, carreiras: 1 }]);
  assert.deepEqual(Array.from(listras), [6, 6, 5, 5, 6, 6, 5, 5]); // de baixo para cima: 5, 6, 5, 6
  const losango = Recursos.gerarLosango(24, 30, 24, 30, [1, 2, null]);
  assert.equal(losango[15 * 24 + 12], 1); // meio do losango
  assert.equal(losango[0], 2); // canto
});

test("texto em pixels e ficha técnica sem acentos", () => {
  const t = Recursos.textoEmPixels(["Aç"], { cor: 9, fundo: 0, margem: 1 });
  assert.deepEqual([t.w, t.h], [13, 9]);
  const linha = (y) => Array.from(t.px.subarray(y * t.w, (y + 1) * t.w), (v) => (v ? "#" : ".")).join("");
  assert.equal(linha(1), "..###...###..");
  assert.equal(linha(4), ".#####.#.....");
  const dobro = Recursos.textoEmPixels(["Aç"], { cor: 9, fundo: 0, margem: 1, escala: 2 });
  assert.deepEqual([dobro.w, dobro.h], [26, 18]);
  assert.equal(Recursos.textoEmPixels(["~"]).px.filter((v) => v === 1).length, Recursos.textoEmPixels(["?"]).px.filter((v) => v === 1).length);
  assert.equal(Recursos.textoEmPixels(["A😀"]).w, 13); // um emoji conta como uma letra
  const ficha = Recursos.linhasDaFicha({ codigo: "Onça", tempo: "4 min" }, [{ guia: 4, fio: "Algodão 2/30" }, { guia: 1, fio: "" }]);
  assert.deepEqual(ficha.slice(0, 3), ["FICHA TECNICA", "", "CODIGO=ONCA"]);
  assert.equal(ficha[ficha.length - 1], "GUIA FIOS 4:ALGODAO 2/30");
  assert.ok(Math.abs(Recursos.tempoTecimento({ carreiras: 179, agulhas: 203, pecas: 2, finura: 7, velocidade: 1 }) - 263.70) < 0.01);
  assert.equal(Recursos.tempoTecimento({ carreiras: 179, agulhas: 203, velocidade: "" }), null);
  assert.equal(Recursos.tipoDePonto(51), "frente");
  assert.equal(Recursos.tipoDePonto(99), null);
});

test("linhas de opção do exemplo: painéis, faixas, pintar valor e verificação", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const blocos = ShimaDat.linhasDeOpcao(doc);
  const paineis = Recursos.paineis(blocos);
  assert.deepEqual(paineis.map((p) => [p.numero, p.L.xMin, p.R.xMin, p.x0, p.x1, p.y0, p.y1]), [
    [1, 407, 658, 447, 657, 225, 403],
    [2, 702, 949, 742, 948, 225, 403],
  ]);
  const faixas = (k) => Recursos.faixasDaLinha(doc, paineis[0].R, k).map((f) => `${f.de}–${f.ate}:${f.valor}`);
  assert.deepEqual(faixas(3), ["189–190:1", "191–200:4", "203–364:4"]);
  assert.deepEqual(faixas(6), ["191–198:14", "199–200:17", "203–359:5", "360–364:12"]);
  assert.deepEqual(faixas(2), ["216–223:55"]);
  assert.deepEqual(faixas(1)[0], "187–200:6 e 7 alternando");

  const itens = Recursos.verificarDesenho(doc, blocos, { flutuacaoMaxima: 5 });
  assert.deepEqual(itens.map((i) => [i.nivel, i.titulo, i.carreiras]), [
    ["aviso", "Carreiras com malha e sem guia-fio (R3) (painel 1)", "187–188, 365"],
    ["aviso", "Carreiras com malha e sem número de ponto (R6) (painel 1)", "187–188, 365"],
    ["info", "Cancelar malha sem guia-fio: coerente (painel 1)", "201–202"],
    ["aviso", "Carreiras com malha e sem guia-fio (R3) (painel 2)", "187–188, 365"],
    ["aviso", "Carreiras com malha e sem número de ponto (R6) (painel 2)", "187–188, 365"],
    ["info", "Cancelar malha sem guia-fio: coerente (painel 2)", "201–202"],
    ["aviso", "Os painéis são diferentes", ""],
  ]);
  assert.match(itens[6].texto, /Painel 1: 203 agulhas de malha, 179 carreiras, R2 = 55\. Painel 2: 199 agulhas de malha, 179 carreiras, R2 = 30/);

  // Altura com o bloco da R2 (216–223) repetido 55 vezes.
  const dev = Recursos.desenvolvimento(doc, paineis[0], { "216-223": 55 }); // chave pelas carreiras, de baixo
  assert.deepEqual([dev.compactadas, dev.desenvolvidas], [179, 611]);
  const img = Recursos.desenharDesenvolvido(doc, dev.blocos);
  assert.deepEqual([img.w, img.h], [1115, 590 + 54 * 8]);
  const W = doc.largura;
  assert.deepEqual(img.px.subarray(367 * W, 375 * W), img.px.subarray((367 + 54 * 8) * W, (375 + 54 * 8) * W));
  assert.deepEqual(img.px.subarray(img.px.length - 215 * W), doc.pixels.subarray(375 * W));

  // Pintar 7 na R6 das carreiras 203 a 210 (linhas 387 a 380, de cima para baixo).
  assert.equal(Recursos.pintarValorNaLinha(doc, paineis[0].R, 6, 380, 387, 7), 8);
  assert.deepEqual(faixas(6), ["191–198:14", "199–200:17", "203–210:7", "211–359:5", "360–364:12"]);

  // Na R2 o 55 está no lugar do número da linha (x 660): trocar e apagar mexem nessa coluna.
  const yR2 = [doc.altura - 223, doc.altura - 216];
  Recursos.pintarValorNaLinha(doc, paineis[0].R, 2, yR2[0], yR2[1], 30);
  assert.deepEqual(faixas(2), ["216–223:30"]);
  Recursos.pintarValorNaLinha(doc, paineis[0].R, 2, yR2[0], yR2[1], 0);
  assert.deepEqual(faixas(2), []);
  assert.equal(doc.pixels[yR2[0] * doc.largura + 660], 2); // o número da linha voltou
  assert.deepEqual(ShimaDat.linhasDeOpcao(doc).map((b) => [b.lado, b.xMin]), blocos.map((b) => [b.lado, b.xMin]));
  // Na R1 a coluna-guia tem 6 e 7 alternando (marca da linha): o valor novo vai na coluna de fora.
  const y300 = doc.altura - 300;
  const marcaAntes = doc.pixels[y300 * doc.largura + 658];
  Recursos.pintarValorNaLinha(doc, paineis[0].R, 1, y300, y300, 5);
  assert.deepEqual([doc.pixels[y300 * doc.largura + 658], doc.pixels[y300 * doc.largura + 659]], [marcaAntes, 5]);
});

test("forma: simétrica e com os ombros do texto em várias densidades", () => {
  const codigos = { malha: 1, fora: 0, arremate: 3, parcial: 4, marcaEsq: 5, marcaDir: 5 };
  for (let colunas = 10; colunas <= 60; colunas++) {
    for (const carreiras of [10, 40, 90]) {
      for (const peca of Recursos.calcularModelo("careca", {}, { colunas, carreiras }).pecas) {
        const plano = Recursos.planoForma(peca.forma, {});
        const onde = `${peca.nome} com ${colunas} colunas e ${carreiras} carreiras`;
        const img = Recursos.pixelsDaForma(plano, codigos);
        for (let y = 0; y < img.h; y++) {
          const linha = Array.from(img.px.subarray(y * img.w, (y + 1) * img.w));
          assert.deepEqual(linha, linha.slice().reverse(), `${onde}: carreira ${img.h - y} não é simétrica`);
        }
        for (const s of plano.passos) if (s.de !== undefined) assert.ok(s.de >= 1 && s.ate <= plano.H, `${onde}: ${s.nome} fora da peça`);
        const ultima = plano.linhas[plano.H - 1];
        const arrematadas = ultima.arrem.reduce((t, [a, b]) => t + b - a + 1, 0);
        const texto = plano.passos.find((s) => s.nome === "Arremate final").texto;
        const n = Number(/(\d+) agulhas/.exec(texto)[1]);
        assert.equal(arrematadas, peca.forma.tipo === "corpo" ? 2 * n : n, `${onde}: ${texto}`);
      }
    }
  }
});

test("pacotes: trechos do exemplo, desperdício, ribana, arremate e sem barra", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const paineis = Recursos.paineis(ShimaDat.linhasDeOpcao(doc));
  const p = paineis[0];
  const W = doc.largura;
  for (const q of paineis) {
    assert.deepEqual(Recursos.trechosDoPainel(doc, q).map((t) => `${t.id} ${t.de}–${t.ate}`), [
      "inicio 187–190",
      "barra 191–200",
      "transferencia 201–202",
      "corpo 203–359",
      "final 360–365",
    ]);
  }
  assert.deepEqual(paineis.map((q) => Recursos.areaDeMalha(doc, q)), [{ x0: 451, x1: 653 }, { x0: 746, x1: 944 }]);

  // Tudo como no arquivo: o mesmo desenho desenvolvido só com as repetições da R2.
  const repeticoes = { "216-223": 55 };
  const igual = Recursos.desenvolverComPacotes(doc, p, { repeticoes, paineis });
  const dev = Recursos.desenharDesenvolvido(doc, Recursos.desenvolvimento(doc, p, repeticoes).blocos);
  assert.deepEqual([igual.w, igual.h, igual.painel.carreiras], [dev.w, dev.h, 611]);
  assert.deepEqual(igual.px, dev.px);

  // 20 carreiras de desperdício e 1 de separação antes, barra trocada por 12 de ribana 1×1, arremate no fim.
  const res = Recursos.desenvolverComPacotes(doc, p, { inicio: { tipo: "desperdicio", n: 20 }, barra: { tipo: "rib11", n: 12 }, final: { tipo: "arremate" }, paineis });
  assert.equal(res.h, 590 + 21 + 2 + 1);
  assert.deepEqual(res.partes.map((t) => `${t.nome} ${t.de}–${t.ate}${t.gerada ? " novo" : ""}`), [
    "Fio de desperdício 187–206 novo",
    "Separação 207–207 novo",
    "Início 208–211",
    "Barra em ribana 1×1 212–223 novo",
    "Transferência 224–225",
    "Corpo 226–382",
    "Final 383–388",
    "Arremate 389–389 novo",
  ]);
  assert.deepEqual(res.painel, { de: 187, ate: 389, carreiras: 203 });
  const linha = (c) => res.px.subarray((res.h - c) * W, (res.h - c + 1) * W);
  // Só as agulhas que tecem dos dois painéis mudam; o resto (linhas de opção) vem da carreira de referência.
  assert.deepEqual([449, 450, 451, 653, 654, 745, 746, 944, 945].map((x) => linha(187)[x]), [99, 13, 1, 1, 13, 13, 1, 1, 13]);
  assert.deepEqual([451, 452, 453, 454].map((x) => linha(212)[x]), [1, 2, 1, 2]);
  assert.deepEqual([451, 653, 746, 944].map((x) => linha(389)[x]), [16, 16, 16, 16]);
  // Sem barra: some a barra e a transferência que vem depois dela.
  assert.equal(Recursos.desenvolverComPacotes(doc, p, { barra: { tipo: "sem" }, paineis }).h, 590 - 12);
  // Só a contagem, sem montar a imagem.
  const conta = Recursos.desenvolverComPacotes(doc, p, { repeticoes, semPixels: true });
  assert.deepEqual([conta.h, conta.px], [dev.h, null]);
  assert.equal(Recursos.desenvolverComPacotes(doc, p, { repeticoes, limite: 1000 }).px, null);
});

test("processamento: o que o exemplo usa, o que falta e o resumo", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const uso = Recursos.usoDoProcessamento(doc, ShimaDat.linhasDeOpcao(doc));
  assert.deepEqual(uso.guias.map((u) => [u.valor, u.onde.map((o) => `${o.painel}: ${o.carreiras}`)]), [
    [1, ["1: 189–190", "2: 189–190"]],
    [4, ["1: 191–200, 203–364", "2: 191–200, 203–364"]],
  ]);
  assert.deepEqual(uso.pontos.map((u) => u.valor), [5, 12, 14, 17]);
  assert.deepEqual(uso.blocosR2.map((b) => [b.painel, b.chave, b.valor]), [[1, "216-223", "55"], [2, "216-223", "30"]]);
  assert.equal(uso.trechos.length, 5);
  assert.deepEqual(Recursos.faltasDoProcessamento({}, uso), { maquina: 2, guias: 4, economizador: 2, puxador: 5, ponto: 8, velocidade: 5, gerar: 0 });

  const porTrecho = (v) => Object.fromEntries(uso.trechos.map((t) => [t.id, v]));
  const dados = {
    maquina: "SSG122SV",
    finura: 7,
    guias: { 1: { guia: "1", fio: "acrílico 2/32", cor: "#E9E4D8", lado: "E" }, 4: { guia: "4", fio: "lã 2/28", cor: "#2B2A33", lado: "D" } },
    pontos: { 5: { f: 45, t: 45 }, 12: { f: 40, t: 40 }, 14: { f: 38, t: 38 }, 17: { f: 36, t: 36 } },
    puxador: porTrecho(40),
    velocidade: porTrecho(0.6),
  };
  const repeticoes = { 1: { "216-223": 55 }, 2: { "216-223": 30 } };
  assert.deepEqual(Object.values(Recursos.faltasDoProcessamento(dados, uso, repeticoes)), [0, 0, 0, 0, 0, 0, 0]);
  const texto = Recursos.linhasDoProcessamento("ONCA.dat", dados, uso, repeticoes).join("\n");
  assert.match(texto, /Máquina: SSG122SV · finura 7G/);
  assert.match(texto, /R3 4 → guia 4 · fio lã 2\/28 · cor #2B2A33 · entra pela direita \(painel 1: 191–200, 203–364; painel 2: 191–200, 203–364\)/);
  assert.match(texto, /Painel 2, carreiras 216–223 \(R2 = 30, R1 = 1\): repete 30 vez\(es\)/);
  assert.deepEqual(uso.blocosR2.map((b) => b.dentro), [[1], [1]]); // a R1 guarda 1 dentro do bloco (a guia tem 6/7)
  assert.match(texto, /R6 17 → frente 36 · atrás 36/);
  assert.match(texto, /Corpo \(carreiras 203–359\): puxador 40 · velocidade 0.6/);
});

test("gerar: listras por carreira, onça repetível e logo em níveis de claridade", () => {
  assert.deepEqual(Recursos.listrasPorCarreira(7, [{ cor: 1, carreiras: 2 }, { cor: 2, carreiras: 1 }]), [0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(Array.from(Recursos.gerarListras(2, 3, [{ cor: 5, carreiras: 1 }, { cor: 6, carreiras: 2 }])), [6, 6, 6, 6, 5, 5]);

  const onca = Recursos.gerarOnca(72, 60, 7, [1, 2, 3]);
  assert.equal(onca.length, 72 * 60);
  assert.deepEqual([...new Set(onca)].sort(), [1, 2, 3]);
  assert.deepEqual(Recursos.gerarOnca(72, 60, 7, [1, 2, 3]), onca); // mesma semente, mesmas rosetas
  assert.notDeepEqual(Recursos.gerarOnca(72, 60, 8, [1, 2, 3]), onca);
  const fundo = contar(onca)[1] / onca.length;
  assert.ok(fundo > 0.4 && fundo < 0.9, `fundo com ${Math.round(fundo * 100)}% dos pontos`);

  // 4 × 2: branco, preto, cinza e um ponto transparente (conta como branco).
  const B = [255, 255, 255, 255], P = [0, 0, 0, 255], C = [128, 128, 128, 255], T = [0, 0, 0, 0];
  const rgba = Uint8ClampedArray.from([B, P, P, B, B, C, T, B].flat());
  const dois = Recursos.quantizarLuminancia(rgba, 4, 2, 2);
  assert.deepEqual(Array.from(dois.px), [0, 1, 1, 0, 0, 0, 0, 0]); // 0 = o mais usado (o fundo)
  assert.deepEqual(dois.medias, [[234, 234, 234], [0, 0, 0]]);
  const tres = Recursos.quantizarLuminancia(rgba, 4, 2, 3);
  assert.deepEqual(Array.from(tres.px), [0, 1, 1, 0, 0, 2, 0, 0]);
});

test("trechos: corpo com o ponto da R6 alternando carreira a carreira", () => {
  // Bloco R à mão (como no teste das linhas de opção), carreiras 2 a 39; a R6 fica na coluna 31.
  const doc = ShimaDat.novo(70, 40, null);
  const p = (x, y, c) => (doc.pixels[y * 70 + x] = c);
  for (let y = 1; y <= 38; y++) {
    for (let k = 2; k <= 20; k++) p(22 + 2 * (k - 2), y, k);
    p(20, y, y % 2 ? 6 : 7);
  }
  const r6 = (c, v) => p(31, doc.altura - c, v);
  for (let c = 6; c <= 9; c++) r6(c, 14); // barra: 4 carreiras com o mesmo ponto
  for (let c = 10; c <= 29; c++) r6(c, c % 2 ? 21 : 20); // corpo: 20 e 21 alternando
  for (let c = 30; c <= 33; c++) r6(c, 12);
  const painel = Recursos.paineis(ShimaDat.linhasDeOpcao(doc))[0];
  assert.deepEqual(Recursos.trechosDoPainel(doc, painel).map((t) => `${t.id} ${t.de}–${t.ate}`), ["inicio 2–5", "barra 6–9", "corpo 10–29", "final 30–39"]);
});

test("pacotes: bloco da R2 que passa do alto do painel não repete carreiras a mais", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const W = doc.largura;
  // O bloco L do painel 1 fica 8 carreiras mais baixo que o R: o painel termina na carreira 357.
  const L = ShimaDat.linhasDeOpcao(doc)[0];
  for (let y = L.carreiraInicio; y < L.carreiraInicio + 8; y++) doc.pixels.fill(0, y * W + L.xMin, y * W + L.xMax + 1);
  const painel = Recursos.paineis(ShimaDat.linhasDeOpcao(doc))[0];
  assert.equal(doc.altura - painel.y0, 357);
  // Bloco da R2 nas carreiras 350 a 362, repetido 2 vezes.
  Recursos.pintarValorNaLinha(doc, painel.R, 2, doc.altura - 362, doc.altura - 350, 9);
  const res = Recursos.desenvolverComPacotes(doc, painel, { repeticoes: { "350-362": 2 } });
  assert.equal(res.h, doc.altura + 13);
  const topo = doc.altura - 362; // carreiras 363 a 590, iguais às do arquivo
  assert.deepEqual(res.px.subarray(0, topo * W), doc.pixels.subarray(0, topo * W));
  assert.deepEqual(res.px.subarray((topo + 13) * W, (topo + 26) * W), doc.pixels.subarray(topo * W, (topo + 13) * W));
  assert.deepEqual(res.px.subarray(res.px.length - 349 * W), doc.pixels.subarray(doc.pixels.length - 349 * W));
});

test("pacotes: muitas repetições só contam as carreiras, sem montar a imagem", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const painel = Recursos.paineis(ShimaDat.linhasDeOpcao(doc))[0];
  const inicio = Date.now();
  const res = Recursos.desenvolverComPacotes(doc, painel, { repeticoes: { "216-223": 9999 }, limite: 8000 });
  assert.deepEqual([res.h, res.px, res.painel.carreiras], [590 + 9998 * 8, null, 179 + 9998 * 8]);
  assert.ok(Date.now() - inicio < 1000, "contar não pode depender do número de repetições");
});

test("trechos: resumo dos códigos e das linhas de opção de cada trecho do exemplo", semPasta, () => {
  const doc = ShimaDat.ler(ler("00FE_BLS_ESTAMPA_ONÇA.dat"));
  const painel = Recursos.paineis(ShimaDat.linhasDeOpcao(doc))[0];
  const resumo = Object.fromEntries(Recursos.trechosDoPainel(doc, painel).map((t) => [t.id, Recursos.resumoDoTrecho(doc, painel, t)]));
  assert.deepEqual(resumo.barra.alterna, [51, 52]); // tubular: frente e atrás alternando
  assert.deepEqual([resumo.barra.guias, resumo.barra.pontos], [[4], [14, 17]]);
  assert.deepEqual([resumo.transferencia.guias, resumo.transferencia.cancela], [[], true]);
  assert.deepEqual([resumo.corpo.codigos[0].cor, resumo.corpo.pontos, resumo.corpo.economizador], [1, [5], [55]]);
  assert.deepEqual(resumo.inicio.guias, [1]);
  assert.deepEqual(Recursos.valoresNasCarreiras(doc, painel.R, 6, 191, 200), [14, 17]);
});

test("forma: trechos difíceis com diminuições fortes seguidas", () => {
  const pecas = Recursos.calcularModelo("careca", {}, { colunas: 30, carreiras: 40 }).pecas;
  const frente = Recursos.planoForma(pecas[0].forma, {});
  const gola = frente.passos.find((s) => s.nome === "Gola: diminuições");
  assert.deepEqual(gola.eventos.slice(0, 5).map((e) => [e.carreira, e.n, e.intervalo]), [[211, 2, 2], [213, 2, 2], [215, 2, 2], [217, 2, 2], [219, 1, 2]]);
  assert.deepEqual(Recursos.trechosDificeis(frente), [{ passo: "Gola: diminuições", de: 211, ate: 217, vezes: 4, n: 2, intervalo: 2 }]);
  // Uma diminuição por vez, bem espalhada, não é difícil.
  const painel = Recursos.planoForma({ tipo: "painel", W: 40, H: 60, barra: 4 }, {});
  assert.deepEqual(Recursos.trechosDificeis(painel), []);
});

test("forma: números que não cabem viram aviso e não há passo sem carreiras", () => {
  const pecas = Recursos.calcularModelo("careca", {}, { colunas: 30, carreiras: 40 }).pecas;
  const passos = (forma) => Recursos.planoForma(forma, {}).passos;
  // Com os números do Modelo, nenhum aviso.
  for (const p of pecas) assert.ok(!passos(p.forma).some((s) => s.aviso), p.nome);
  const curto = passos({ ...pecas[0].forma, H: 86, barra: 125 });
  assert.match(curto[0].texto, /barra 125 → 84/);
  for (const s of [...curto, ...passos({ ...pecas[0].forma, H: 9, degraus: 6 }), ...passos({ ...pecas[2].forma, barra: 0 })]) {
    if (s.de !== undefined) assert.ok(s.de >= 1 && s.ate >= s.de, `${s.nome} ${s.de}–${s.ate}`);
  }
  // Manga baixa: os aumentos param antes da copa (a peça não volta a crescer).
  const baixa = Recursos.planoForma({ ...pecas[2].forma, H: 8, barra: 4 }, {});
  assert.ok(baixa.passos.some((s) => s.nome === "Confira a copa"));
  const larguras = baixa.linhas.map((l) => l.segs.concat(l.arrem).reduce((t, [a, b]) => t + b - a + 1, 0));
  const copa0 = baixa.passos.find((s) => s.nome === "Copa: arremate").de;
  assert.ok(larguras.slice(copa0).every((w, i, lista) => i === 0 || w <= lista[i - 1]), `larguras ${larguras}`);
});

test("painel sem área de desenho (L e R encostados) não quebra os trechos", () => {
  const painel = { numero: 1, L: null, R: null, x0: 10, x1: 9, y0: 0, y1: 4 };
  const doc = ShimaDat.novo(20, 5, null);
  assert.equal(Recursos.areaDeMalha(doc, painel), null);
  const r = Recursos.resumoDoTrecho(doc, painel, { id: "corpo", nome: "Corpo", de: 1, ate: 5 });
  assert.deepEqual([r.codigos, r.alterna, r.guias], [[], null, []]);
});
