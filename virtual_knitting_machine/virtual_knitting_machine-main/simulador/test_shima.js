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
