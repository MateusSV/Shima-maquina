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
