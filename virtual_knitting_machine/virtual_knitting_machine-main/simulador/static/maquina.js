"use strict";

// Desenho do palco: vista frontal de uma máquina retilínea no formato da linha SSR (Shima Seiki).
// Tudo é desenhado nas coordenadas do modelo (1000 × 880) e escalado para caber no canvas.
// De cima para baixo: barra de tensores, painel na haste esquerda, cabeçote (frente aberta com
// carrinho, guia-fio e fileiras de agulhas), faixa taupe, suporte cáqui e gabinete com uma janela
// em corte onde o pano desce pelos rolos puxadores. O corte lateral do "V" fica sob a barra.

const MODELO = { largura: 1000, altura: 880 };
const M = {
  barra: { x0: 40, x1: 960, y: 20, altura: 10 },
  tensores: { n: 17, x0: 70, x1: 930, yIlhos: 60, ativo: 2 },
  hastes: [62, 928], larguraHaste: 10, fimHaste: 292,
  painel: { x: 4, y: 168, largura: 114, altura: 96 },
  corte: { x: 626, y: 76, largura: 280, altura: 170 },
  trilhoTopo: { x0: 44, x1: 956, y: 292, altura: 20 },
  janela: { x0: 64, x1: 936, y0: 312, y1: 480 },
  trilhosGuia: [322, 330],
  blocoGuia: 314, bicoGuia: 424,
  agulhas: { x0: 236, x1: 764, tras: 372, ganchoTras: 418, ganchoFrente: 438, fimFrente: 478 },
  vao: 428,
  carro: { alca: 316, corpo: 354, placa: 382 },
  chapa: { x0: 56, x1: 944, y0: 480, y1: 502 },
  faixa: { x0: 16, x1: 984, y0: 502, y1: 562 },
  labio: { x0: 30, x1: 970, y0: 562, y1: 578 },
  pernas: [180, 787], larguraPerna: 33, topoPerna: 560, fimPerna: 858,
  barraFrontal: { x0: 174, x1: 826, y0: 582, y1: 596 },
  gabinete: { x0: 213, x1: 787, y0: 596, y1: 842 },
  corteGabinete: { x0: 228, x1: 772, y0: 612, y1: 826 },
  rolos: [616, 630], alturaRolo: 12,
  travessa: { y0: 842, y1: 856 },
};
const OPERACOES_COM_AGULHA = new Set(["tuck", "knit", "xfer"]);
// Cores fixas da máquina (não mudam com o tema).
const FIXAS = {
  branco: "#F4F4F2", etiqueta: "#E8742A", etiquetaAmarela: "#F2C230", emergencia: "#D0312D",
  textoLcd: "#E6EEF8", agulha: "#B9BFC5", agulhaBorda: "#6A7278",
  placaCames: "rgba(255, 255, 255, 0.10)", placaCamesBorda: "rgba(255, 255, 255, 0.45)",
};

function desenharPalco(canvas, cena, c) {
  const { ctx, s } = prepararCanvas(canvas);
  const g = geometria(cena ? cena.sim.largura : 16, s);

  desenharTopo(ctx, cena, c, g);
  desenharCabecote(ctx, c);
  desenharSuporte(ctx, c);
  let tecido = { carreirasFeitas: 0, pontosFeitos: 0 };
  if (cena) {
    tecido = desenharPano(ctx, cena, g, c);
    desenharAgulhasELacadas(ctx, cena, g, c);
  } else {
    for (let i = 0; i < 16; i++) {
      desenharAgulha(ctx, g.cx(i), true, 0, g);
      desenharAgulha(ctx, g.cx(i), false, 0, g);
    }
  }
  desenharRolos(ctx, c, cena ? progressoDoPano(cena) : 0);
  desenharChapaNumerada(ctx, cena ? cena.sim.largura : 16, g, c);
  if (cena) {
    desenharGuiaFio(ctx, cena, g, c);
    desenharCarrinho(ctx, cena, g, c);
  }
  desenharPainel(ctx, cena, c);
  desenharCorte(ctx, cena, c, g);
  return tecido;
}

// ---------- Geometria ----------

function prepararCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Escala única que faz o modelo caber, centralizado.
  const s = Math.min(w / MODELO.largura, h / MODELO.altura);
  const ox = (w - MODELO.largura * s) / 2, oy = (h - MODELO.altura * s) / 2;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  return { ctx, s };
}

function geometria(largura, s) {
  const util = M.agulhas.x1 - M.agulhas.x0;
  const passo = Math.min(44, util / largura);
  const x0 = M.agulhas.x0 + (util - largura * passo) / 2;
  return {
    s, passo,
    cx: (p) => x0 + (p + 0.5) * passo,
    diametro: Math.max(5, Math.min(18, passo * 0.6)),
    larguraAgulha: Math.max(3, Math.min(11, passo * 0.3)),
    // Tamanho de fonte no modelo que nunca fica menor que `minimoPx` na tela.
    fonte: (modelo, minimoPx) => Math.max(modelo, minimoPx / s),
  };
}

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function suavizar(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function misturar(hex, alvo, p) {
  const a = parseInt(hex.replace("#", ""), 16), b = parseInt(alvo.replace("#", ""), 16);
  const canal = (n, desloc) => Math.round(((n >> desloc) & 255) * (1 - p) + ((b >> desloc) & 255) * p);
  return `rgb(${canal(a, 16)}, ${canal(a, 8)}, ${canal(a, 0)})`;
}

function retangulo(ctx, x0, y0, x1, y1, raio, preenchimento, contorno) {
  ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, raio);
  if (preenchimento) { ctx.fillStyle = preenchimento; ctx.fill(); }
  if (contorno) { ctx.strokeStyle = contorno; ctx.lineWidth = 1; ctx.stroke(); }
}

// A operação que está sendo animada agora (ou nenhuma, se parado num quadro exato).
function acaoEmAndamento(cena) {
  return cena.movendo && cena.t > 0 ? cena.proximo : null;
}

// ---------- Topo: barra de tensores, hastes e painel ----------

function desenharTopo(ctx, cena, c, g) {
  // Hastes.
  for (const x of M.hastes) retangulo(ctx, x, M.barra.y, x + M.larguraHaste, M.fimHaste, 2, c.ssrTrilho, c.ssrTrilhoBorda);
  // Barra.
  retangulo(ctx, M.barra.x0, M.barra.y, M.barra.x1, M.barra.y + M.barra.altura, 3, c.ssrTrilho, c.ssrTrilhoBorda);

  // Tensores: bracinhos com mola e ilhós; o ativo é o do fio em uso.
  const { n, x0, x1, yIlhos, ativo } = M.tensores;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i * (x1 - x0)) / (n - 1);
    const emUso = cena && i === ativo;
    ctx.fillStyle = emUso ? c.fio : i % 2 ? "#8B6A4E" : "#E4DDCB";
    ctx.beginPath(); ctx.roundRect(x - 7, M.barra.y + M.barra.altura, 14, 8, 2); ctx.fill();
    ctx.strokeStyle = c.ssrTrilhoBorda; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, M.barra.y + M.barra.altura + 8);
    for (let k = 1; k <= 6; k++) ctx.lineTo(x + (k % 2 ? 4 : -4), M.barra.y + M.barra.altura + 8 + k * 3);
    ctx.lineTo(x, yIlhos - 4); ctx.stroke();
    ctx.strokeStyle = emUso ? c.fio : c.ssrPainel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, yIlhos, 4, 0, Math.PI * 2); ctx.stroke();
  }
  // O fio chega ao tensor em uso vindo dos cones (fora de cena, atrás da máquina).
  if (cena) {
    const tx = x0 + (ativo * (x1 - x0)) / (n - 1);
    ctx.strokeStyle = c.fio; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, M.barra.y + M.barra.altura); ctx.stroke();
  }
  // Batente de fio (peça azul) pendurado perto da haste esquerda.
  retangulo(ctx, 92, 34, 98, 70, 2, c.ssrLcd, null);
}

function desenharPainel(ctx, cena, c) {
  const { x, y, largura, altura } = M.painel;
  retangulo(ctx, x, y, x + largura, y + altura, 6, c.ssrPainel, c.ssrTrilhoBorda);
  // Tela LCD com a operação atual.
  retangulo(ctx, x + 10, y + 8, x + largura - 10, y + 54, 3, c.ssrLcd, "#223F63");
  ctx.fillStyle = FIXAS.textoLcd;
  ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  if (cena) {
    const acao = acaoEmAndamento(cena) || cena.quadro;
    ctx.fillText(acao.stage, x + 16, y + 14, largura - 32);
    ctx.fillText(acao.label, x + 16, y + 32, largura - 32);
  } else {
    ctx.fillText("sem simulação", x + 16, y + 14, largura - 32);
  }
  // Teclado.
  ctx.fillStyle = "#5E6366";
  for (let linha = 0; linha < 2; linha++) {
    for (let k = 0; k < 6; k++) ctx.fillRect(x + 12 + k * 12, y + 62 + linha * 12, 9, 8);
  }
  // LEDs: verde tricotando, âmbar parado.
  const tocando = cena && cena.tocando;
  for (const [k, cor] of [[0, tocando ? c.ok : "#3C4A3F"], [1, tocando ? "#5A4A2A" : c.pausa]]) {
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(x + largura - 18, y + 66 + k * 12, 4, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- Cabeçote e suporte ----------

function desenharCabecote(ctx, c) {
  const j = M.janela;
  // Botões laterais à esquerda.
  for (const y of [322, 346]) retangulo(ctx, 22, y, 44, y + 14, 4, "#3A3D40", null);
  // Trilho superior prateado.
  const tt = M.trilhoTopo;
  retangulo(ctx, tt.x0, tt.y, tt.x1, tt.y + tt.altura, 4, c.ssrTrilho, c.ssrTrilhoBorda);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)"; ctx.fillRect(tt.x0 + 4, tt.y + 3, tt.x1 - tt.x0 - 8, 3);
  // Frente aberta (interior escuro).
  retangulo(ctx, j.x0, j.y0, j.x1, j.y1, 2, c.ssrInterior, null);
  const sombra = ctx.createLinearGradient(0, j.y0, 0, j.y0 + 24);
  sombra.addColorStop(0, "rgba(0, 0, 0, 0.45)"); sombra.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = sombra; ctx.fillRect(j.x0, j.y0, j.x1 - j.x0, 24);
  // Trilhos dos guia-fios.
  ctx.fillStyle = "#4A4E52";
  for (const y of M.trilhosGuia) ctx.fillRect(j.x0, y, j.x1 - j.x0, 3);
  // Faixa do vão entre as fileiras.
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(j.x0, M.agulhas.ganchoTras, j.x1 - j.x0, M.agulhas.ganchoFrente - M.agulhas.ganchoTras);
  // Etiqueta de aviso e nome do modelo.
  retangulo(ctx, 72, 336, 178, 356, 2, FIXAS.branco, null);
  ctx.fillStyle = FIXAS.etiqueta; ctx.fillRect(72, 336, 16, 20);
  ctx.fillStyle = "#9A9A96";
  for (const y of [341, 346, 351]) ctx.fillRect(94, y, 76, 2);

  // Chapa cinza-clara, faixa taupe e lábio inferior.
  const ch = M.chapa, fx = M.faixa, lb = M.labio;
  retangulo(ctx, ch.x0, ch.y0, ch.x1, ch.y1, 2, c.ssrChapa, c.ssrTrilhoBorda);
  retangulo(ctx, fx.x0, fx.y0, fx.x1, fx.y1, [6, 6, 22, 22], c.ssrTaupe, null);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)"; ctx.fillRect(fx.x0 + 10, fx.y0 + 4, fx.x1 - fx.x0 - 20, 3);
  retangulo(ctx, lb.x0, lb.y0, lb.x1, lb.y1, [0, 0, 10, 10], c.ssrTaupeEscuro, null);
  ctx.fillStyle = FIXAS.branco;
  ctx.font = "700 26px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText("SSR · virtual", fx.x1 - 44, (fx.y0 + fx.y1) / 2 + 2);
}

function desenharSuporte(ctx, c) {
  // Pernas e pés.
  for (const x of M.pernas) {
    retangulo(ctx, x, M.topoPerna, x + M.larguraPerna, M.fimPerna, 2, c.ssrCaqui, c.ssrCaquiEscuro);
    retangulo(ctx, x - 8, M.fimPerna, x + M.larguraPerna + 8, M.fimPerna + 16, 3, "#1B1B1C", null);
  }
  const gb = M.gabinete, cg = M.corteGabinete;
  // Gabinete com fenda escura no topo e janela em corte.
  retangulo(ctx, gb.x0, gb.y0, gb.x1, gb.y1, 2, c.ssrGabinete, c.ssrGabineteBorda);
  retangulo(ctx, gb.x0 + 10, gb.y0 + 2, gb.x1 - 10, gb.y0 + 14, 2, "#2B2C2E", null);
  retangulo(ctx, cg.x0, cg.y0, cg.x1, cg.y1, 4, "#35363A", c.ssrGabineteBorda);
  // Etiquetas laranja/amarelas.
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? FIXAS.etiquetaAmarela : FIXAS.etiqueta;
    ctx.fillRect(775, 650 + k * 14, 9, 10);
  }
  // Barra frontal e travessa inferior.
  const bf = M.barraFrontal;
  retangulo(ctx, bf.x0, bf.y0, bf.x1, bf.y1, 4, c.ssrCaqui, c.ssrCaquiEscuro);
  retangulo(ctx, M.pernas[0], M.travessa.y0, M.pernas[1] + M.larguraPerna, M.travessa.y1, 2, c.ssrCaqui, c.ssrCaquiEscuro);
  // Botões de emergência e caixa do motor.
  for (const [x, y, r] of [[196, 572, 8], [838, 616, 10]]) {
    ctx.fillStyle = "#2E2F31"; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FIXAS.emergencia; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  retangulo(ctx, 856, 596, 918, 650, 6, "#1F2022", null);
  ctx.strokeStyle = "#6A6E72"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(887, 623, 14, 0, Math.PI * 2); ctx.stroke();
}

// ---------- Agulhas e laçadas ----------

function desenharAgulhasELacadas(ctx, cena, g, c) {
  const { sim, quadro: q, t } = cena;
  const acao = acaoEmAndamento(cena);
  // A agulha da operação avança até o vão e volta (empurrada pelos cames do carrinho).
  const avanco = acao && OPERACOES_COM_AGULHA.has(acao.op) ? Math.sin(Math.PI * t) * 8 : 0;
  const voando = acao && acao.op === "xfer" ? acao : null;
  const r = g.diametro / 2;

  for (const leito of ["b", "f"]) {
    const tras = leito === "b";
    const deslocamento = (i) => (acao && acao.bed === leito && acao.pos === i ? avanco : 0);
    ctx.globalAlpha = tras ? 0.75 : 1; // a fileira de trás fica mais longe
    for (let i = 0; i < sim.largura; i++) desenharAgulha(ctx, g.cx(i), tras, deslocamento(i), g);
    ctx.globalAlpha = 1;

    const lacadas = tras ? q.back : q.front;
    for (let i = 0; i < sim.largura; i++) {
      if (!lacadas[i] || (voando && voando.bed === leito && voando.pos === i)) continue;
      const y = tras ? M.agulhas.ganchoTras + deslocamento(i) : M.agulhas.ganchoFrente - deslocamento(i);
      const recente = !voando && q.fresh && q.fresh.bed === leito && q.fresh.pos === i;
      desenharLacada(ctx, g.cx(i), y, r, lacadas[i], recente, c);
    }
  }
  if (voando) {
    const origem = voando.bed === "f" ? M.agulhas.ganchoFrente - avanco : M.agulhas.ganchoTras + avanco;
    const destino = voando.bed === "f" ? M.agulhas.ganchoTras : M.agulhas.ganchoFrente;
    desenharLacada(ctx, g.cx(voando.pos), origem + (destino - origem) * suavizar(t), r, 1, true, c);
  }
}

function desenharAgulha(ctx, x, tras, deslocamento, g) {
  const lw = g.larguraAgulha;
  const a = M.agulhas;
  const y0 = tras ? a.tras + deslocamento : a.ganchoFrente - deslocamento;
  const altura = tras ? a.ganchoTras - a.tras : a.fimFrente - a.ganchoFrente;
  ctx.fillStyle = FIXAS.agulha; ctx.strokeStyle = FIXAS.agulhaBorda; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - lw / 2, y0, lw, altura, tras ? [2, 2, lw / 2, lw / 2] : [lw / 2, lw / 2, 2, 2]);
  ctx.fill(); ctx.stroke();
  // Talão: o ressalto que os cames empurram.
  ctx.fillStyle = FIXAS.agulhaBorda;
  ctx.fillRect(x - lw / 2 - 2, tras ? y0 + 10 : y0 + altura - 14, lw + 4, 4);
}

function desenharLacada(ctx, x, y, r, quantidade, recente, c) {
  if (quantidade > 1) {
    // Mais de uma laçada na mesma agulha: uma segunda bolinha logo atrás.
    ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.5, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = c.fio; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c.fio; ctx.fill();
  if (recente) {
    ctx.lineWidth = 2; ctx.strokeStyle = FIXAS.branco;
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
  }
}

function desenharChapaNumerada(ctx, largura, g, c) {
  const telaPasso = g.passo * g.s;
  const pulo = telaPasso >= 26 ? 1 : telaPasso >= 14 ? 5 : 10;
  const ym = (M.chapa.y0 + M.chapa.y1) / 2;
  ctx.fillStyle = "#3A3D40";
  ctx.font = `${g.fonte(12, 9)}px 'IBM Plex Mono', ui-monospace, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < largura; i++) {
    if (i % pulo === 0) ctx.fillText(String(i), g.cx(i), ym + 1);
    else ctx.fillRect(g.cx(i) - 0.5, M.chapa.y0 + 2, 1, 5);
  }
}

// ---------- Pano ----------

// Primeiro ponto de cada carreira (os pontos vêm em ordem de carreira).
function inicioDasCarreiras(sim) {
  if (!sim._inicioCarreiras) {
    const inicio = [];
    sim.pontos.forEach((p, k) => { if (inicio[p.row] === undefined) inicio[p.row] = k; });
    sim._inicioCarreiras = inicio;
  }
  return sim._inicioCarreiras;
}

// Quantas carreiras de pano já saíram, contando a fração da carreira em andamento
// (e o ponto que está sendo animado), para o pano descer de forma contínua.
function progressoDoPano(cena) {
  const { sim, quadro: q, t } = cena;
  if (q.stitches === 0) return 0;
  const atual = sim.pontos[q.stitches - 1].row;
  const acao = acaoEmAndamento(cena);
  const feitosNaCarreira = q.stitches - inicioDasCarreiras(sim)[atual] + (acao && acao.op === "knit" ? t : 0);
  return atual + feitosNaCarreira / sim.largura;
}

function desenharPano(ctx, cena, g, c) {
  const { sim, quadro: q } = cena;
  const feitos = q.stitches;
  if (feitos === 0) {
    const cg = M.corteGabinete;
    ctx.fillStyle = "#B9BCC0";
    ctx.font = `${g.fonte(16, 11)}px 'IBM Plex Sans', system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("O pano desce aqui a partir da primeira carreira.", (cg.x0 + cg.x1) / 2, (cg.y0 + cg.y1) / 2 + 10, cg.x1 - cg.x0 - 20);
    return { carreirasFeitas: 0, pontosFeitos: 0 };
  }

  const progresso = progressoDoPano(cena);
  const atual = sim.pontos[feitos - 1].row;
  // O pano percorre dois trechos visíveis: do vão até a base da frente aberta, e a janela do gabinete.
  // O trecho escondido atrás da faixa taupe não conta, para o pano não "sumir" por várias carreiras.
  const trechoCabecote = M.janela.y1 - M.vao;
  const trechoGabinete = M.corteGabinete.y1 - M.corteGabinete.y0;
  // Proporção de pano de verdade: a carreira é um pouco mais baixa que a largura do ponto.
  const alturaCarreira = limitar(g.passo * 0.78, 7, 30);
  const topo = (r) => (progresso - r - 1) * alturaCarreira; // distância do topo da carreira r até o vão

  const esquerda = g.cx(0) - g.passo / 2, largura = sim.largura * g.passo;
  const cores = {
    fundo: misturar(c.fio, "#000000", 0.38),
    perna: misturar(c.fio, "#FFFFFF", 0.12),
    contorno: misturar(c.fio, "#000000", 0.5),
    onda: misturar(c.fio, "#000000", 0.12),
    brilho: misturar(c.fio, "#FFFFFF", 0.4),
  };
  const recente = q.op === "knit" ? feitos - 1 : -1;

  for (const trecho of [
    { y: M.vao, altura: trechoCabecote, origem: M.vao },
    { y: M.corteGabinete.y0, altura: trechoGabinete, origem: M.corteGabinete.y0 - trechoCabecote },
  ]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(esquerda, trecho.y, largura, trecho.altura); ctx.clip();
    for (let k = feitos - 1; k >= 0; k--) {
      const p = sim.pontos[k];
      const d = topo(p.row);
      if (d > trechoCabecote + trechoGabinete) break; // dali para baixo o pano já saiu de cena
      desenharPonto(ctx, g.cx(p.col), trecho.origem + d, g.passo, alturaCarreira, p.kind, cores, k === recente);
    }
    ctx.restore();
  }
  return { carreirasFeitas: atual + 1, pontosFeitos: feitos };
}

function desenharPonto(ctx, x, y, largura, altura, tipo, cores, recente) {
  ctx.fillStyle = cores.fundo;
  ctx.fillRect(x - largura / 2, y, largura + 0.5, altura + 0.5);
  if (tipo === "k") {
    // Ponto meia: as duas "perninhas" da laçada formando um V.
    ctx.fillStyle = cores.perna; ctx.strokeStyle = cores.contorno; ctx.lineWidth = 0.8;
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + lado * largura * 0.18, y + altura * 0.5, largura * 0.15, altura * 0.6, lado * 0.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else {
    // Ponto tricô: a laçada vista por trás, uma ondinha horizontal.
    ctx.fillStyle = cores.onda; ctx.strokeStyle = cores.contorno; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(x, y + altura * 0.55, largura * 0.42, altura * 0.3, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cores.brilho; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + altura * 0.55, largura * 0.3, altura * 0.18, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  if (recente) {
    ctx.strokeStyle = FIXAS.branco; ctx.lineWidth = 1.5;
    ctx.strokeRect(x - largura / 2 + 1, y + 1, largura - 2, altura - 2);
  }
}

function desenharRolos(ctx, c, progresso) {
  const cg = M.corteGabinete;
  M.rolos.forEach((y, i) => {
    retangulo(ctx, cg.x0 + 2, y, cg.x1 - 2, y + M.alturaRolo, M.alturaRolo / 2, "#56595D", null);
    // Faixas diagonais que andam conforme o pano é puxado (os rolos giram em sentidos opostos).
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)"; ctx.lineWidth = 2;
    const desloc = ((progresso * 14) % 12) * (i === 0 ? 1 : -1);
    for (let x = cg.x0 - 24 + desloc; x < cg.x1 + 24; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, y + M.alturaRolo); ctx.lineTo(x + 8, y); ctx.stroke();
    }
    ctx.restore();
  });
}

// ---------- Guia-fio e carrinho ----------

function desenharGuiaFio(ctx, cena, g, c) {
  const { quadro: q, proximo: prox, t } = cena;
  const acao = acaoEmAndamento(cena);
  // O guia-fio só anda quando o carrinho o arrasta numa operação com fio (tuck e knit).
  const usaFio = acao && (acao.op === "knit" || acao.op === "tuck");
  const guia = usaFio ? q.carrier + (prox.carrier - q.carrier) * t : q.carrier;
  const gx = limitar(g.cx(guia), M.janela.x0 + 14, M.janela.x1 - 14);

  // Fio: tensor em uso → guia-fio.
  const { n, x0, x1, yIlhos, ativo } = M.tensores;
  const tx = x0 + (ativo * (x1 - x0)) / (n - 1);
  ctx.strokeStyle = c.fio; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tx, yIlhos + 4);
  ctx.quadraticCurveTo(tx, (yIlhos + M.blocoGuia) / 2, gx, M.blocoGuia);
  ctx.stroke();

  // Haste do bico, bloco nos trilhos e bico no vão.
  ctx.strokeStyle = "#8A9096"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(gx, M.blocoGuia + 16); ctx.lineTo(gx, M.bicoGuia); ctx.stroke();
  retangulo(ctx, gx - 10, M.blocoGuia, gx + 10, M.blocoGuia + 18, 3, "#15161A", "#6A6E72");
  ctx.fillStyle = c.fio; ctx.fillRect(gx - 10, M.blocoGuia, 20, 5);
  ctx.beginPath(); ctx.arc(gx, M.bicoGuia, 3.5, 0, Math.PI * 2); ctx.fill();

  // Fio do bico até a última laçada formada, quando ela está por perto.
  if (q.fresh && (q.op === "knit" || q.op === "tuck")) {
    const lx = g.cx(q.fresh.pos);
    if (Math.abs(lx - gx) < g.passo * 3) {
      const ly = q.fresh.bed === "f" ? M.agulhas.ganchoFrente : M.agulhas.ganchoTras;
      ctx.strokeStyle = c.fio; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(gx, M.bicoGuia); ctx.lineTo(lx, ly); ctx.stroke();
    }
  }
}

function desenharCarrinho(ctx, cena, g, c) {
  const { quadro: q, proximo: prox, t, movendo } = cena;
  const pos = movendo ? q.pos + (prox.pos - q.pos) * t : q.pos;
  const largura = limitar(g.passo * 4, 130, 200);
  const j = M.janela;
  // Estacionado fora das agulhas, o carrinho encosta na lateral em vez de sair da máquina.
  const xc = limitar(g.cx(pos), j.x0 + largura / 2 + 4, j.x1 - largura / 2 - 4);
  const x0 = xc - largura / 2;
  const direcao = movendo ? prox.dir : q.dir;
  const k = M.carro;

  // Placa dos cames: translúcida, para as agulhas continuarem visíveis por baixo.
  ctx.fillStyle = FIXAS.placaCames; ctx.strokeStyle = FIXAS.placaCamesBorda; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(x0 + 6, k.placa, largura - 12, j.y1 - 2 - k.placa, [0, 0, 8, 8]); ctx.fill(); ctx.stroke();
  // Trilho dos cames: o caminho dos talões, que empurra a agulha até o vão no meio do carrinho.
  ctx.setLineDash([4, 4]);
  for (const [y, sentido] of [[M.agulhas.tras + 12, 1], [M.agulhas.fimFrente - 12, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x0 + 10, y); ctx.lineTo(xc - 26, y);
    ctx.lineTo(xc - 8, y + 10 * sentido); ctx.lineTo(xc + 8, y + 10 * sentido);
    ctx.lineTo(xc + 26, y); ctx.lineTo(x0 + largura - 10, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Alça alta em "U" invertido, característica do carrinho da SSR.
  const la = largura * 0.5;
  ctx.fillStyle = c.ssrCarro; ctx.strokeStyle = c.ssrCarroEscuro; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xc - la / 2, k.corpo); ctx.lineTo(xc - la / 2, k.alca + 6);
  ctx.quadraticCurveTo(xc - la / 2, k.alca, xc - la / 2 + 6, k.alca);
  ctx.lineTo(xc + la / 2 - 6, k.alca);
  ctx.quadraticCurveTo(xc + la / 2, k.alca, xc + la / 2, k.alca + 6);
  ctx.lineTo(xc + la / 2, k.corpo);
  ctx.lineTo(xc + la / 2 - 12, k.corpo); ctx.lineTo(xc + la / 2 - 12, k.alca + 12);
  ctx.lineTo(xc - la / 2 + 12, k.alca + 12); ctx.lineTo(xc - la / 2 + 12, k.corpo);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Corpo prateado com a seta de direção.
  retangulo(ctx, x0, k.corpo, x0 + largura, k.placa, 5, c.ssrCarro, c.ssrCarroEscuro);
  ctx.fillStyle = c.ssrCarroEscuro;
  for (let n = 0; n < 4; n++) ctx.fillRect(x0 + 10 + n * 7, k.corpo + 8, 4, 12);
  const ym = (k.corpo + k.placa) / 2;
  ctx.strokeStyle = "#2B2E31"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(xc - 14 * direcao, ym); ctx.lineTo(xc + 14 * direcao, ym);
  ctx.moveTo(xc + 7 * direcao, ym - 6); ctx.lineTo(xc + 14 * direcao, ym); ctx.lineTo(xc + 7 * direcao, ym + 6);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// ---------- Corte lateral ----------

// O "V" visto de lado: as fileiras se inclinam para baixo a partir do vão (o ápice),
// o carrinho passa por cima e o pano cai pelo vão.
function desenharCorte(ctx, cena, c, g) {
  const { x, y, largura, altura } = M.corte;
  retangulo(ctx, x, y, x + largura, y + altura, 10, c.card, c.linha);

  const fonte = g.fonte(14, 9);
  ctx.fillStyle = c.suave;
  ctx.font = `${fonte}px 'IBM Plex Mono', ui-monospace, monospace`;
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  // Em telas pequenas a fonte cresce no modelo: encurta o título para não encostar em "agulha N".
  const cabe = ctx.measureText("corte lateral  agulha 00").width < largura - 24;
  ctx.fillText(cabe ? "corte lateral" : "corte", x + 12, y + 10);
  ctx.fillText("trás", x + 12, y + 18 + fonte);
  ctx.textAlign = "right";
  ctx.fillText("frente", x + largura - 12, y + 18 + fonte);

  const ax = x + largura / 2, ay = y + 96;
  const dx = 88, dy = 50, comprimento = Math.hypot(dx, dy);
  const lado = (leito) => (leito === "b" ? -1 : 1);

  ctx.strokeStyle = c.fio; ctx.globalAlpha = 0.35; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, y + altura - 6); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.ssrTrilhoBorda; ctx.lineWidth = 12; ctx.lineCap = "round";
  for (const leito of ["b", "f"]) {
    const s = lado(leito);
    ctx.beginPath(); ctx.moveTo(ax + s * 10, ay + 6); ctx.lineTo(ax + s * (10 + dx), ay + 6 + dy); ctx.stroke();
  }
  ctx.lineCap = "butt";
  retangulo(ctx, ax - dx - 10, y + 70, ax + dx + 10, y + 84, 4, c.ssrCarro, c.ssrCarroEscuro);
  if (!cena) return;

  const { quadro: q, t } = cena;
  const acao = acaoEmAndamento(cena);
  const referencia = acao || q;
  if (!OPERACOES_COM_AGULHA.has(referencia.op)) return;
  const pos = referencia.pos;
  const extensao = (leito) => (acao && acao.bed === leito ? Math.sin(Math.PI * t) : 0);
  // Ponta da agulha sobre a fileira: recolhida longe do vão, estendida até ele.
  const ponta = (leito, e) => {
    const k = (30 * (1 - e) + 6) / comprimento;
    return [ax + lado(leito) * (10 + dx * k), ay + 6 + dy * k - 9];
  };

  ctx.strokeStyle = c.tinta; ctx.lineWidth = 3;
  for (const leito of ["b", "f"]) {
    const [px, py] = ponta(leito, extensao(leito));
    const k = 30 / comprimento;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + lado(leito) * dx * k, py + dy * k); ctx.stroke();
  }

  const voando = acao && acao.op === "xfer" ? acao : null;
  ctx.fillStyle = c.fio;
  for (const leito of ["b", "f"]) {
    const tem = (leito === "f" ? q.front : q.back)[pos];
    if (!tem || (voando && voando.bed === leito)) continue;
    const [px, py] = ponta(leito, extensao(leito));
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
  }
  if (voando) {
    const destino = voando.bed === "f" ? "b" : "f";
    const [ox, oy] = ponta(voando.bed, extensao(voando.bed));
    const [dxp, dyp] = ponta(destino, 0);
    const e = suavizar(t);
    ctx.beginPath(); ctx.arc(ox + (dxp - ox) * e, oy + (dyp - oy) * e - Math.sin(Math.PI * t) * 10, 6, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = c.suave; ctx.textBaseline = "top"; ctx.textAlign = "right";
  ctx.fillText(`agulha ${pos}`, x + largura - 12, y + 10);
}
