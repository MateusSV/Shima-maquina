"use strict";

// Recursos para desenvolver o modelo dentro do editor, como no KnitPaint:
//   barra e painel  carimbo de ponto (K), símbolos dos pontos, biblioteca de pontos e repetição,
//                   uma linha de opção por vez (todas as linhas, faixas de valores, nome, pintar valor)
//   diálogos        modelo (com o esquema da peça), forma, gerar padrão, jacquard e intarsia, verificar
//                   (com as agulhas), pacotes e altura, processamento, simular malha e ficha técnica
// A lógica fica em recursos_malha.js (RecursosMalha); aqui ficam a tela e os diálogos. Usa o estado e as
// funções de editor.js, que carrega antes deste arquivo.

const RM = window.RecursosMalha;

// ------------------------------------------------------------------ utilidades

function lerArmazenado(chave, padrao) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave) || "null");
    return valor === null ? padrao : valor;
  } catch (erro) {
    return padrao;
  }
}

function gravarArmazenado(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (erro) {
    // Sem armazenamento (janela anônima, por exemplo): vale só até fechar a página.
  }
}

// Número inteiro de um campo dentro dos limites; vazio ou inválido devolve o padrão.
function inteiro(valor, padrao, min, max) {
  const n = Math.round(parseFloat(String(valor ?? "").replace(",", ".")));
  return Number.isFinite(n) ? limitar(n, min, max) : padrao;
}

function decimal(valor, padrao) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
}

// Canvas nítido em telas de alta densidade; só realoca quando o tamanho muda.
function ajustarTela(cv, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

// Um pixel do canvas por ponto, ampliado pelo CSS sem borrar. cor(v) devolve [r, g, b].
function pintarPixels(cv, img, cor, z) {
  cv.width = img.w;
  cv.height = img.h;
  const g = cv.getContext("2d");
  const dados = g.createImageData(img.w, img.h);
  const px32 = new Uint32Array(dados.data.buffer);
  const cache = new Map();
  for (let i = 0; i < img.px.length; i++) {
    const v = img.px[i];
    let c = cache.get(v);
    if (c === undefined) {
      const [r, gg, b] = cor(v);
      c = ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0;
      cache.set(v, c);
    }
    px32[i] = c;
  }
  g.putImageData(dados, 0, 0);
  cv.style.width = `${Math.max(1, Math.round(img.w * z))}px`;
  cv.style.height = `${Math.max(1, Math.round(img.h * z))}px`;
}

// Largura disponível dentro da caixa da prévia (só dá para medir com o diálogo aberto).
function larguraUtil(cv, padrao) {
  const caixa = cv.parentElement;
  const w = caixa ? caixa.clientWidth - 20 : 0;
  return w > 80 ? w : padrao;
}

// Zoom para caber na caixa: inteiro a partir de 4, em quartos abaixo disso (o CSS amplia sem borrar).
function zoomQueCabeEm(w, h, largura, altura, maximo) {
  const z = Math.min(largura / w, altura / h, maximo);
  if (z >= 4) return Math.floor(z);
  return z >= 1 ? Math.floor(z * 4) / 4 : z;
}

const corDaPaleta = (d) => (v) => d.paleta[v];
const luminancia = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

function misturar(hex, alvo, f) {
  return `rgb(${rgbDeHex(hex).map((c) => Math.round(c + (alvo - c) * f)).join(",")})`;
}

function hslParaRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

// Cor de cada guia-fio nos mapas (a mesma em todos os diálogos).
const rgbDoGuia = (id) => hslParaRgb((id * 47) % 360, 0.55, 0.58);
const corDoGuia = (id) => hexCor(rgbDoGuia(id));

function sorteador(semente) {
  let s = semente >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function formatarTempo(segundos) {
  const t = Math.round(segundos);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h) return `${h} h ${m} min`;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function abrirJanela(id) {
  if (!$(id).open) abrirDialogo(id);
}

// Centraliza a área r na janela do desenho.
function mostrarNoDesenho(a, r) {
  const j = $("janela"), folha = $("folha"), z = a.zoom;
  j.scrollLeft = folha.offsetLeft + (r.x + r.w / 2) * z - j.clientWidth / 2;
  j.scrollTop = folha.offsetTop + (r.y + r.h / 2) * z - j.clientHeight / 2;
}

function selecionarNoDesenho(a, r) {
  fixarFlutuante(a);
  a.selecao = r;
  posicionarCaixas();
  mostrarNoDesenho(a, r);
  atualizarBotoes();
  atualizarStatus();
}

// Abre uma aba com um desenho novo, com a paleta e as configurações do desenho de referência.
function criarDesenhoNovo(nome, img, ref = referenciaParaNovo()) {
  const doc = ShimaDat.novo(img.w, img.h, ref ? ref.doc : null);
  doc.pixels.set(img.px);
  let final = nome;
  for (let n = 2; estado.abas.some((x) => x.nome === final); n++) final = nome.replace(/(\.dat)?$/i, `_${n}.dat`);
  const aba = {
    id: ++contadorAbas, nome: final, origem: "novo", tipo: "dat", aberto: { tipo: "dat", doc }, modificado: true, tamanho: 0,
    doc, hist: [], refazer: [], selecao: null, flutuante: null, zoom: null, rolagem: null,
  };
  estado.abas.push(aba);
  mostrarAba(aba);
  return aba;
}

// Os diálogos guardam a aba em que foram abertos; só agem se ela ainda for a aba atual.
const mesmaAba = (estadoDialogo) => !!estadoDialogo && estadoDialogo.a === abaDat();

// Cola pontos no desenho aberto, no canto da seleção ou no canto visível.
function colarNoDesenho(a, img, texto) {
  const pos = a.selecao ? { x: a.selecao.x, y: a.selecao.y } : cantoVisivel(a);
  novaColagem(a, img, pos.x, pos.y);
  avisar(texto || "Entrou como colagem: arraste para posicionar e aperte Enter para fixar.");
}

// Área analisada pelos diálogos: a seleção ou, sem ela, a área de desenho do primeiro painel.
function areaDeAnalise(a, verbo) {
  const d = a.doc;
  const descrever = (r) => `agulhas ${r.x + 1}–${r.x + r.w}, carreiras ${d.altura - (r.y + r.h - 1)}–${d.altura - r.y}`;
  if (a.selecao) return { r: { ...a.selecao }, texto: `Seleção de ${a.selecao.w} × ${a.selecao.h} (${descrever(a.selecao)}).` };
  const p = RM.paineis(blocosDeOpcao(a)).find((q) => q.x0 !== null && q.x1 >= q.x0);
  const r = p ? { x: p.x0, y: p.y0, w: p.x1 - p.x0 + 1, h: p.y1 - p.y0 + 1 } : { x: 0, y: 0, w: d.largura, h: d.altura };
  return { r, texto: `Sem seleção: ${verbo} ${p ? `a área de desenho do painel ${p.numero}` : "o desenho inteiro"} (${descrever(r)}). Para ver só uma parte, selecione-a antes de abrir.` };
}

// Painel cuja área de desenho contém o meio da área r (para ler as linhas de opção dela).
function painelDaArea(a, r) {
  const meio = r.x + r.w / 2;
  return RM.paineis(blocosDeOpcao(a)).find((p) => p.R && p.x0 !== null && meio >= p.x0 && meio <= p.x1 + 1) || null;
}

// ------------------------------------------------------------------ símbolos dos pontos

const ZOOM_SIMBOLOS = 8;
let pedidoSimbolos = 0;

function agendarSimbolos() {
  if (pedidoSimbolos || (!estado.simbolos && $("simbolos").hidden)) return;
  pedidoSimbolos = requestAnimationFrame(() => {
    pedidoSimbolos = 0;
    desenharSimbolos();
  });
}

// Traça o símbolo de um tipo de ponto num quadrado de lado z, com canto em (px, py).
function tracarSimbolo(c, tipo, px, py, z) {
  const X = (f) => px + f * z, Y = (f) => py + f * z;
  const vee = (topo, base) => {
    c.moveTo(X(0.26), Y(topo));
    c.lineTo(X(0.5), Y(base));
    c.lineTo(X(0.74), Y(topo));
  };
  const barra = (y) => {
    c.moveTo(X(0.24), Y(y));
    c.lineTo(X(0.76), Y(y));
  };
  const seta = (sinal) => {
    const [a, b] = sinal < 0 ? [0.76, 0.24] : [0.24, 0.76];
    c.moveTo(X(a), Y(0.2));
    c.lineTo(X(b), Y(0.2));
    c.moveTo(X(b - sinal * 0.14), Y(0.1));
    c.lineTo(X(b), Y(0.2));
    c.lineTo(X(b - sinal * 0.14), Y(0.3));
  };
  if (tipo === "frente") vee(0.26, 0.74);
  else if (tipo === "tras") barra(0.5);
  else if (tipo === "ambos") {
    vee(0.4, 0.82);
    barra(0.22);
  } else if (tipo === "tuck-frente") {
    c.moveTo(X(0.26), Y(0.26));
    c.quadraticCurveTo(X(0.5), Y(1), X(0.74), Y(0.26));
  } else if (tipo === "tuck-tras") {
    c.moveTo(X(0.26), Y(0.74));
    c.quadraticCurveTo(X(0.5), Y(0), X(0.74), Y(0.74));
  } else if (tipo === "flutua") {
    c.moveTo(X(0.12), Y(0.78));
    c.lineTo(X(0.88), Y(0.78));
  } else if (tipo === "mover-esq" || tipo === "mover-dir") {
    vee(0.42, 0.84);
    seta(tipo === "mover-esq" ? -1 : 1);
  } else if (tipo === "guia") {
    c.moveTo(X(0.3), Y(0.3));
    c.lineTo(X(0.7), Y(0.3));
    c.lineTo(X(0.5), Y(0.66));
    c.closePath();
  }
}

// Desenha os símbolos só na parte visível do desenho: um canvas do tamanho da janela, posicionado em cima.
function desenharSimbolos() {
  const cv = $("simbolos");
  const a = abaDat();
  if (!estado.simbolos || !a || a.zoom < ZOOM_SIMBOLOS) {
    cv.hidden = true;
    return;
  }
  const d = a.doc, z = a.zoom;
  const j = $("janela"), folha = $("folha");
  const x0 = Math.max(0, Math.floor((j.scrollLeft - folha.offsetLeft) / z));
  const y0 = Math.max(0, Math.floor((j.scrollTop - folha.offsetTop) / z));
  const x1 = Math.min(d.largura, Math.ceil((j.scrollLeft - folha.offsetLeft + j.clientWidth) / z));
  const y1 = Math.min(d.altura, Math.ceil((j.scrollTop - folha.offsetTop + j.clientHeight) / z));
  if (x1 <= x0 || y1 <= y0) {
    cv.hidden = true;
    return;
  }
  const g = ajustarTela(cv, (x1 - x0) * z, (y1 - y0) * z);
  cv.style.left = `${x0 * z}px`;
  cv.style.top = `${y0 * z}px`;
  cv.hidden = false;
  const blocos = blocosDeOpcao(a);
  const f = a.flutuante;
  const escuro = new Path2D(), claro = new Path2D();
  const cinza = [205, 205, 205];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let v = d.pixels[y * d.largura + x];
      if (f && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h) {
        const fv = f.px[(y - f.y) * f.w + (x - f.x)];
        if (f.transparente === null || fv !== f.transparente) v = fv;
      }
      const tipo = RM.tipoDePonto(v);
      if (!tipo || ShimaDat.linhaDeOpcaoEm(blocos, x, y)) continue;
      const rgb = estado.destacar && v !== estado.primaria ? cinza : d.paleta[v];
      tracarSimbolo(luminancia(rgb) > 140 ? escuro : claro, tipo, (x - x0) * z, (y - y0) * z, z);
    }
  }
  g.lineWidth = Math.max(1, z / 9);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0, 0, 0, 0.8)";
  g.stroke(escuro);
  g.strokeStyle = "rgba(255, 255, 255, 0.9)";
  g.stroke(claro);
}

const LEGENDA_SIMBOLOS = [
  ["frente", "1 51", "malha na frente"],
  ["tras", "2 52", "malha atrás"],
  ["ambos", "3", "frente e atrás"],
  ["tuck-frente", "11", "tuck na frente"],
  ["tuck-tras", "12", "tuck atrás"],
  ["flutua", "16", "sem seleção"],
  ["mover-esq", "61", "frente, mover ←"],
  ["mover-dir", "71", "frente, mover →"],
  ["guia", "13", "largura do guia"],
];

function desenharLegendaSimbolos() {
  const el = $("legenda-simbolos");
  el.innerHTML = LEGENDA_SIMBOLOS.map(([, codigos, nome]) => `<li><canvas aria-hidden="true"></canvas><span><span class="mono">${codigos}</span> ${nome}</span></li>`).join("");
  el.querySelectorAll("canvas").forEach((cv, i) => {
    const g = ajustarTela(cv, 20, 20);
    g.fillStyle = "#E8E1D3";
    g.fillRect(0, 0, 20, 20);
    const caminho = new Path2D();
    tracarSimbolo(caminho, LEGENDA_SIMBOLOS[i][0], 0, 0, 20);
    g.strokeStyle = "#1F1C17";
    g.lineWidth = 1.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke(caminho);
  });
}

// ------------------------------------------------------------------ biblioteca de pontos e carimbo

const CHAVE_MOTIVOS = "editor-shima-motivos";
const motivoValido = (m) =>
  !!m && typeof m.nome === "string" && Number.isInteger(m.w) && Number.isInteger(m.h) && m.w > 0 && m.h > 0 && m.w <= 64 && m.h <= 64 &&
  Array.isArray(m.px) && m.px.length === m.w * m.h && m.px.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
const meusMotivos = (() => {
  const lista = lerArmazenado(CHAVE_MOTIVOS, []);
  return Array.isArray(lista) ? lista.filter(motivoValido) : [];
})();
let categoriaBiblioteca = 0;

function categoriasDaBiblioteca() {
  return [...RM.BIBLIOTECA, { categoria: "Meus motivos", motivos: meusMotivos, meus: true }];
}

let chaveBiblioteca = "";

function desenharBiblioteca() {
  const a = abaDat();
  if (!a) return;
  const cats = categoriasDaBiblioteca();
  categoriaBiblioteca = limitar(categoriaBiblioteca, 0, cats.length - 1);
  const cat = cats[categoriaBiblioteca];
  // Redesenha só quando a categoria, os motivos, o escolhido ou as cores deles mudam.
  const codigos = [...new Set(cat.motivos.flatMap((m) => Array.from(m.px)))];
  const chave = JSON.stringify([categoriaBiblioteca, cats.map((c) => c.motivos.length), cat.motivos.map((m) => m.nome), cat.motivos.indexOf(estado.motivo), estado.motivo && estado.motivo.nome, codigos.map((c) => a.doc.paleta[c])]);
  if (chave === chaveBiblioteca) return;
  chaveBiblioteca = chave;
  $("categorias-biblioteca").innerHTML = cats
    .map((c, i) => `<button type="button" class="chip" data-categoria="${i}" aria-pressed="${i === categoriaBiblioteca}">${esc(c.categoria)}</button>`)
    .join("");
  const el = $("motivos-biblioteca");
  if (!cat.motivos.length) {
    el.innerHTML = `<p class="suave pequeno">Nenhum ainda. Copie uma área do desenho (Ctrl+C), clique em “Usar a cópia” e depois em “Guardar motivo”.</p>`;
  } else {
    el.innerHTML = cat.motivos
      .map(
        (m, i) => `<div class="item-motivo"><button type="button" class="motivo" data-motivo="${i}" aria-pressed="${estado.motivo === m}" title="${esc(m.nome)}: ${m.w} × ${m.h} pontos">
          <canvas aria-hidden="true"></canvas><span class="nome-motivo">${esc(m.nome)}</span><span class="tamanho-motivo mono">${m.w} × ${m.h}</span></button>${
          cat.meus ? `<button type="button" class="apagar-motivo" data-apagar-motivo="${i}" aria-label="Apagar ${esc(m.nome)}" title="Apagar">×</button>` : ""
        }</div>`,
      )
      .join("");
    el.querySelectorAll("canvas").forEach((cv, i) => desenharMotivo(cv, cat.motivos[i], a.doc.paleta));
  }
  const m = estado.motivo;
  $("motivo-atual").innerHTML = m
    ? `Carimbo: <strong>${esc(m.nome)}</strong> <span class="mono suave">${m.w} × ${m.h}</span>`
    : `<span class="suave">Escolha um motivo para o carimbo.</span>`;
}

// Prévia do motivo repetido (pelo menos 8 × 8 pontos), a partir do canto de baixo à esquerda.
function desenharMotivo(cv, m, paleta) {
  const tw = m.w * Math.max(1, Math.ceil(8 / m.w)), th = m.h * Math.max(1, Math.ceil(8 / m.h));
  const z = limitar(Math.floor(64 / Math.max(tw, th)), 2, 10);
  const g = ajustarTela(cv, tw * z, th * z);
  const escuro = new Path2D(), claro = new Path2D();
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const v = m.px[(y % m.h) * m.w + (x % m.w)];
      const rgb = paleta[v];
      g.fillStyle = `rgb(${rgb.join(",")})`;
      g.fillRect(x * z, y * z, z, z);
      const tipo = RM.tipoDePonto(v);
      if (tipo && z >= 6) tracarSimbolo(luminancia(rgb) > 140 ? escuro : claro, tipo, x * z, y * z, z);
    }
  }
  g.lineWidth = 1;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0, 0, 0, 0.75)";
  g.stroke(escuro);
  g.strokeStyle = "rgba(255, 255, 255, 0.85)";
  g.stroke(claro);
}

function escolherMotivo(m) {
  estado.motivo = m;
  escolherFerramenta("carimbo");
  desenharBiblioteca();
  atualizarBotoes();
}

function usarCopiaComoMotivo() {
  if (!estado.area) return avisar("Copie uma área primeiro (Ctrl+C).");
  const b = estado.area;
  escolherMotivo({ nome: "Cópia", w: b.w, h: b.h, px: b.px.slice() });
  avisar(`A cópia de ${b.w} × ${b.h} é o motivo do carimbo.`);
}

async function guardarMotivo() {
  const m = estado.motivo;
  if (!m) return;
  if (meusMotivos.includes(m)) return avisar(`${m.nome} já está em Meus motivos.`);
  if (m.w > 64 || m.h > 64) return avisar("Para guardar, o motivo pode ter até 64 × 64 pontos.", true);
  const nome = await pedirNome("Guardar motivo", m.nome === "Cópia" ? `Motivo ${meusMotivos.length + 1}` : m.nome, "Nome do motivo");
  if (!nome) return;
  const novo = { nome, w: m.w, h: m.h, px: Array.from(m.px) };
  meusMotivos.push(novo);
  gravarArmazenado(CHAVE_MOTIVOS, meusMotivos);
  estado.motivo = novo;
  categoriaBiblioteca = categoriasDaBiblioteca().length - 1;
  desenharBiblioteca();
  atualizarBotoes();
  avisar(`${nome} guardado em Meus motivos, neste navegador.`);
}

// Põe o motivo com o canto de baixo à esquerda no ponto p (a máquina conta de baixo para cima).
function carimbarMotivo(d, p, m) {
  const transparente = estado.colarTransparente ? estado.fundo : null;
  const topo = p.y - m.h + 1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const v = m.px[y * m.w + x];
      if (v !== transparente) pintar(d, p.x + x, topo + y, v);
    }
  }
}

function repetirMotivoNaSelecao(a) {
  fixarFlutuante(a);
  if (!exigirSelecao(a)) return;
  const m = estado.motivo;
  if (!m) return avisar("Escolha um motivo na Biblioteca de pontos.");
  const degraus = $("tipo-repeticao").value === "degraus";
  const deslocamento = degraus ? inteiro($("deslocamento-repeticao").value, 1, -99, 99) : 0;
  salvarHistorico(a);
  RM.repetirMotivo(a.doc.pixels, a.doc.largura, a.selecao, m, deslocamento);
  renderizar();
  atualizarPainel();
  const passo = Math.abs(deslocamento) === 1 ? "agulha" : "agulhas";
  avisar(`${m.nome} repetido na seleção${degraus ? `, andando ${deslocamento} ${passo} a cada fileira` : ""}.`);
}

// ------------------------------------------------------------------ uma linha de opção

function linhaAtual(a) {
  const lista = RM.paineis(blocosDeOpcao(a));
  if (!lista.length) return null;
  if (!a.linhaOpcao) a.linhaOpcao = { painel: 0, linha: "R3" };
  const sel = a.linhaOpcao;
  sel.painel = limitar(sel.painel, 0, lista.length - 1);
  const p = lista[sel.painel];
  const ids = [];
  if (p.L) for (let k = 1; k <= p.L.ultima; k++) ids.push(`L${k}`);
  if (p.R) for (let k = 1; k <= p.R.ultima; k++) ids.push(`R${k}`);
  if (!ids.includes(sel.linha)) sel.linha = ids.includes("R3") ? "R3" : ids[0];
  return { lista, p, ids, id: sel.linha, k: Number(sel.linha.slice(1)), bloco: sel.linha[0] === "L" ? p.L : p.R };
}

// Troca o conteúdo só se mudou, para não fechar uma lista aberta nem perder o foco.
function trocarHtml(el, html) {
  if (el.htmlAtual === html) return;
  el.innerHTML = html;
  el.htmlAtual = html;
}

// Linhas de opção do painel que têm algum valor ("L3", "R6"...).
function linhasUsadas(a, p) {
  const usadas = new Set();
  for (const [lado, b] of [["L", p.L], ["R", p.R]]) {
    if (!b) continue;
    for (let k = 1; k <= b.ultima; k++) if (b.colunas[k] && RM.faixasDaLinha(a.doc, b, k).length) usadas.add(`${lado}${k}`);
  }
  return usadas;
}

const AJUDA_LINHAS = {
  R2: "Os blocos desta linha se repetem na máquina: diga quantas vezes em Pacotes e altura ou no Processar.",
  R3: "No Processar, cada número desta linha vira um guia-fio, com o fio, a cor e o lado por onde ele entra.",
  R5: "Pacotes e altura usa esta linha para achar as carreiras de transferência.",
  R6: "No Processar, cada número desta linha recebe o valor de ponto da frente e de trás. Pacotes e altura usa esta linha para achar a barra e o corpo.",
};

// Grade com as 20 linhas de cada lado: a escolhida destacada, as usadas com um ponto.
function htmlTodasAsLinhas(p, usadas, escolhida) {
  return ["L", "R"]
    .map((lado) => {
      const b = lado === "L" ? p.L : p.R;
      const botoes = [];
      for (let k = 1; k <= 20; k++) {
        const id = `${lado}${k}`;
        const existe = !!b && k <= b.ultima;
        const nome = nomeDaLinha(id);
        const situacao = !existe ? "não existe neste painel" : usadas.has(id) ? "com valores" : "vazia";
        const titulo = `${id}${nome ? ` · ${nome}` : ""} · ${situacao}`;
        botoes.push(
          `<button type="button" class="linha-op${usadas.has(id) ? " usada" : ""}" data-linha-op="${id}" aria-pressed="${id === escolhida}" title="${esc(titulo)}" aria-label="${esc(titulo)}"${existe ? "" : " disabled"}>${k}</button>`,
        );
      }
      return `<div class="grupo-linhas"><span class="lado" aria-hidden="true">${lado}</span>${botoes.slice(0, 10).join("")}<span class="lado"></span>${botoes.slice(10).join("")}</div>`;
    })
    .join("");
}

function atualizarLinhaEscolhida(a = abaDat()) {
  if (!a) return;
  const atual = linhaAtual(a);
  $("uma-linha").hidden = !atual;
  if (!atual) return;
  const { lista, ids, id, k, bloco } = atual;
  const H = a.doc.altura;
  trocarHtml(
    $("opcao-painel"),
    lista
      .map((q, i) => `<option value="${i}"${i === a.linhaOpcao.painel ? " selected" : ""}>Painel ${q.numero}${q.x0 !== null ? ` · agulhas ${q.x0 + 1}–${q.x1 + 1}` : ""}</option>`)
      .join(""),
  );
  trocarHtml(
    $("opcao-linha"),
    ids
      .map((x) => {
        const nome = nomeDaLinha(x);
        return `<option value="${x}"${x === id ? " selected" : ""}>${x}${nome ? ` · ${esc(nome)}` : ""}</option>`;
      })
      .join(""),
  );
  const usadas = linhasUsadas(a, atual.p);
  trocarHtml($("opcao-todas"), htmlTodasAsLinhas(atual.p, usadas, id));
  const nomeAtual = nomeDaLinha(id);
  $("opcao-ajuda").textContent = `${id}${nomeAtual ? ` (${nomeAtual})` : ""}: ${usadas.has(id) ? "tem valores neste painel" : "vazia neste painel"}. ${
    AJUDA_LINHAS[id] || "Clique num valor da lista para selecionar as carreiras dele no desenho."
  }`;
  $("rotulo-opcao-nome").textContent = `Nome da linha ${id}`;
  const campoNome = $("opcao-nome");
  if (document.activeElement !== campoNome) campoNome.value = nomesLinhas[id] || "";
  campoNome.placeholder = NOMES_LINHAS[id] ? `${NOMES_LINHAS[id]}? (sugestão)` : "ex.: velocidade do carro";
  const faixas = RM.faixasDaLinha(a.doc, bloco, k);
  a.faixasOpcao = faixas;
  const e = a.faixaEscolhida;
  trocarHtml(
    $("opcao-faixas"),
    faixas.length
      ? faixas
          .map((f, i) => {
            const escolhida = e && e.painel === a.linhaOpcao.painel && e.id === id && e.yBase === f.yBase && e.yTopo === f.yTopo;
            return `<li><button type="button" class="faixa${escolhida ? " escolhida" : ""}" data-faixa="${i}"><span>${f.de === f.ate ? `carreira ${f.de}` : `carreiras ${f.de}–${f.ate}`}</span><span class="valor-faixa">${esc(f.valor)}</span></button></li>`;
          })
          .join("")
      : `<li class="vazio-faixas">Sem valores nesta linha.</li>`,
  );
  const form = $("form-pintar-linha");
  form.de.min = form.ate.min = H - bloco.carreiraFim;
  form.de.max = form.ate.max = H - bloco.carreiraInicio;
}

// Conta-gotas numa linha de opção: mostra a linha no painel.
function escolherLinhaDeOpcao(a, linha) {
  const lista = RM.paineis(blocosDeOpcao(a));
  const i = lista.findIndex((p) => p.L === linha.bloco || p.R === linha.bloco);
  if (i < 0) return;
  a.linhaOpcao = { painel: i, linha: `${linha.lado}${linha.numero}` };
  atualizarLinhaEscolhida(a);
  $("uma-linha").scrollIntoView({ block: "nearest" });
}

$("opcao-painel").addEventListener("change", (e) => {
  const a = abaDat();
  if (!a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { linha: "R3" }), painel: Number(e.target.value) };
  atualizarLinhaEscolhida(a);
});

$("opcao-linha").addEventListener("change", (e) => {
  const a = abaDat();
  if (!a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { painel: 0 }), linha: e.target.value };
  atualizarLinhaEscolhida(a);
});

$("opcao-todas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-linha-op]");
  const a = abaDat();
  if (!b || b.disabled || !a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { painel: 0 }), linha: b.dataset.linhaOp };
  atualizarLinhaEscolhida(a);
});

$("escurecer-desenho").addEventListener("change", (e) => {
  estado.escurecer = e.target.checked;
  renderizar();
});

$("opcao-nome").addEventListener("change", (e) => {
  const a = abaDat();
  const atual = a && linhaAtual(a);
  if (!atual) return;
  renomearLinha(atual.id, e.target.value.trim());
  atualizarLinhaEscolhida(a);
  desenharOpcoes();
});

$("opcao-faixas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-faixa]");
  const a = abaDat();
  const atual = a && linhaAtual(a);
  if (!b || !atual || !a.faixasOpcao) return;
  const f = a.faixasOpcao[Number(b.dataset.faixa)];
  if (!f) return;
  const form = $("form-pintar-linha");
  form.valor.value = parseInt(f.valor, 10) || 0;
  form.de.value = f.de;
  form.ate.value = f.ate;
  a.faixaEscolhida = { painel: a.linhaOpcao.painel, id: atual.id, yBase: f.yBase, yTopo: f.yTopo };
  // As duas colunas da linha: o valor pode estar em qualquer uma delas.
  selecionarNoDesenho(a, { x: Math.min(...atual.bloco.colunas[atual.k]), y: f.yTopo, w: 2, h: f.yBase - f.yTopo + 1 });
  atualizarLinhaEscolhida(a);
});

$("form-pintar-linha").addEventListener("submit", (e) => {
  e.preventDefault();
  const a = abaDat();
  const atual = a && linhaAtual(a);
  if (!atual) return;
  const form = e.target;
  const H = a.doc.altura;
  let de = inteiro(form.de.value, 0, 1, 8000), ate = inteiro(form.ate.value, 0, 1, 8000);
  if (de > ate) [de, ate] = [ate, de];
  const yTopo = Math.max(atual.bloco.carreiraInicio, H - ate), yBase = Math.min(atual.bloco.carreiraFim, H - de);
  if (!de || yTopo > yBase) {
    return avisar(`A linha ${atual.id} vai da carreira ${H - atual.bloco.carreiraFim} até a ${H - atual.bloco.carreiraInicio}.`, true);
  }
  const valor = numeroCor(form.valor.value);
  fixarFlutuante(a);
  salvarHistorico(a);
  const n = RM.pintarValorNaLinha(a.doc, atual.bloco, atual.k, yTopo, yBase, valor);
  a.faixaEscolhida = null;
  renderizar();
  atualizarPainel();
  desenharOpcoes();
  const onde = n === 1 ? `na carreira ${H - yBase}` : `em ${n} carreiras (${H - yBase}–${H - yTopo})`;
  avisar(`${atual.id}: ${valor ? `valor ${valor}` : "valor apagado"} ${onde}.`);
});

// ------------------------------------------------------------------ painel: atualização

// Chamado pelo editor sempre que o painel do desenho é atualizado.
function atualizarRecursos(a) {
  desenharBiblioteca();
  atualizarLinhaEscolhida(a);
}

$("categorias-biblioteca").addEventListener("click", (e) => {
  const b = e.target.closest("[data-categoria]");
  if (!b) return;
  categoriaBiblioteca = Number(b.dataset.categoria);
  desenharBiblioteca();
});

$("motivos-biblioteca").addEventListener("click", async (e) => {
  const apagar = e.target.closest("[data-apagar-motivo]");
  if (apagar) {
    const m = meusMotivos[Number(apagar.dataset.apagarMotivo)];
    if (!m || !(await perguntar(`Apagar o motivo ${m.nome} de Meus motivos?`, "Apagar"))) return;
    meusMotivos.splice(meusMotivos.indexOf(m), 1);
    gravarArmazenado(CHAVE_MOTIVOS, meusMotivos);
    if (estado.motivo === m) estado.motivo = { ...m, px: m.px.slice() }; // o carimbo continua com ele
    desenharBiblioteca();
    atualizarBotoes();
    return;
  }
  const b = e.target.closest("[data-motivo]");
  if (!b) return;
  const m = categoriasDaBiblioteca()[categoriaBiblioteca].motivos[Number(b.dataset.motivo)];
  if (m) escolherMotivo(m);
});

$("tipo-repeticao").addEventListener("change", (e) => ($("deslocamento-repeticao").disabled = e.target.value !== "degraus"));
$("deslocamento-repeticao").disabled = $("tipo-repeticao").value !== "degraus";

$("mostrar-simbolos").addEventListener("change", (e) => {
  estado.simbolos = e.target.checked;
  const a = abaDat();
  if (estado.simbolos && a && a.zoom < ZOOM_SIMBOLOS) avisar("Os símbolos aparecem com zoom de 800% ou mais.");
  desenharSimbolos();
});
$("janela").addEventListener("scroll", agendarSimbolos, { passive: true });
window.addEventListener("resize", agendarSimbolos);

// ------------------------------------------------------------------ modelo

const CHAVE_MODELO = "editor-shima-modelo";
const modelo = Object.assign({ estilo: "careca", colunas: 30, carreiras: 40, maquina: "SSG122SV", finura: 7, valores: {} }, lerArmazenado(CHAVE_MODELO, {}));
let ultimoModelo = null;
let esquemaPeca = 0;

function calcularModeloAtual() {
  ultimoModelo = RM.calcularModelo(modelo.estilo, modelo.valores[modelo.estilo] || {}, { colunas: modelo.colunas, carreiras: modelo.carreiras });
  return ultimoModelo;
}

const textoPontos = (m) => `= ${m.pontos} ${m.eixo === "h" ? "agulhas" : "carreiras"}`;

function abrirModelo() {
  const form = $("dlg-modelo").querySelector("form");
  form.estilo.innerHTML = RM.ESTILOS.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join("");
  form.estilo.value = modelo.estilo;
  form.colunas.value = modelo.colunas;
  form.carreiras.value = modelo.carreiras;
  const maquinas = RM.MAQUINAS.includes(modelo.maquina) || !modelo.maquina ? RM.MAQUINAS : [modelo.maquina, ...RM.MAQUINAS];
  form.maquina.innerHTML = maquinas.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
  form.maquina.value = modelo.maquina;
  form.finura.innerHTML = RM.FINURAS.map((f) => `<option value="${f}">${f}G · ${f} agulhas por polegada</option>`).join("");
  form.finura.value = String(modelo.finura);
  abrirJanela("dlg-modelo");
  desenharMedidas();
}

function desenharMedidas() {
  const r = calcularModeloAtual();
  const valores = modelo.valores[modelo.estilo] || {};
  $("modelo-medidas").innerHTML = r.medidas
    .map(
      (m) => `<label class="medida"><span>${esc(m.nome)}</span>
        <input type="number" min="0" max="500" step="0.1" data-medida="${m.id}" value="${esc(valores[m.id] ?? m.cm)}">
        <span class="pontos" data-pontos="${m.id}">${textoPontos(m)}</span></label>`,
    )
    .join("");
  desenharPecas(r);
}

function desenharPecas(r = calcularModeloAtual()) {
  for (const m of r.medidas) {
    const el = $("modelo-medidas").querySelector(`[data-pontos="${m.id}"]`);
    if (el) el.textContent = textoPontos(m);
  }
  $("modelo-pecas").innerHTML = `<div class="tabela-rolavel"><table class="tabela tabela-pecas">
    <thead><tr><th>Peça</th><th>Agulhas × carreiras</th><th>Como fica</th><th><span class="escondido">Forma</span></th></tr></thead>
    <tbody>${r.pecas
      .map(
        (p, i) => `<tr><td><strong>${esc(p.nome)}</strong>${p.qtd > 1 ? ` <span class="suave">× ${p.qtd}</span>` : ""}</td>
        <td class="mono">${p.agulhas} × ${p.carreiras}</td><td>${esc(p.detalhe)}</td>
        <td><button type="button" class="botao pequeno" data-forma="${i}">Forma…</button></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  const escolha = $("dlg-modelo").querySelector("form").esquema;
  esquemaPeca = limitar(esquemaPeca, 0, r.pecas.length - 1);
  trocarHtml(escolha, r.pecas.map((p, i) => `<option value="${i}">${esc(p.nome)}</option>`).join(""));
  escolha.value = String(esquemaPeca);
  desenharEsquema(r);
}

// ------------------------------------------------------------------ esquema da peça

const cm1 = (v) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

// Trechos ocupados de cada carreira do plano (malha tecida e arremates, sem a malha parcial), já juntos.
function ocupacaoDaForma(plano) {
  const ocup = plano.linhas.map((row) => {
    const lista = [...row.segs, ...row.arrem].map(([p, q]) => [Math.min(p, q), Math.max(p, q)]).sort((p, q) => p[0] - q[0]);
    const juntos = [];
    for (const [p, q] of lista) {
      const ult = juntos[juntos.length - 1];
      if (ult && p <= ult[1] + 1) ult[1] = Math.max(ult[1], q);
      else juntos.push([p, q]);
    }
    return juntos;
  });
  // Na última carreira o arremate inclui os pontos guardados da malha parcial, que ficaram mais embaixo.
  const H = ocup.length;
  if (H > 1 && plano.linhas.some((l) => l.parcial.length)) ocup[H - 1] = ocup[H - 2];
  return ocup;
}

// Contorno da peça em degraus (ponto a ponto): sobe pela borda de fora, contorna a gola quando a carreira
// tem dois trechos e desce pela outra borda. X(agulha) e Y(carreira) dão as coordenadas do desenho.
function contornoDaForma(ocup, X, Y) {
  let topo = ocup.length - 1;
  while (topo > 0 && !ocup[topo].length) topo--;
  if (!ocup[topo] || !ocup[topo].length) return "";
  const pts = [];
  const add = (x, y) => {
    const u = pts[pts.length - 1];
    if (u && u[0] === x && u[1] === y) return;
    pts.push([x, y]);
  };
  const esq = (c) => ocup[c][0][0];
  const dir = (c) => ocup[c][ocup[c].length - 1][1] + 1;
  for (let c = 0; c <= topo; c++) {
    if (!ocup[c].length) continue;
    add(esq(c), c);
    add(esq(c), c + 1);
  }
  let abre = topo + 1;
  while (abre > 0 && ocup[abre - 1].length > 1) abre--;
  if (abre <= topo) {
    // A gola: desce pela borda de dentro do lado esquerdo e sobe pela do lado direito.
    const fimEsq = (c) => (ocup[c].length > 1 ? ocup[c][0][1] + 1 : esq(c));
    const iniDir = (c) => (ocup[c].length > 1 ? ocup[c][1][0] : fimEsq(c));
    for (let c = topo; c >= abre; c--) {
      add(fimEsq(c), c + 1);
      add(fimEsq(c), c);
    }
    for (let c = abre; c <= topo; c++) {
      add(iniDir(c), c);
      add(iniDir(c), c + 1);
    }
  }
  for (let c = topo; c >= 0; c--) {
    if (!ocup[c].length) continue;
    add(dir(c), c + 1);
    add(dir(c), c);
  }
  // Tira os pontos do meio de trechos retos.
  const limpos = pts.filter((p, i) => {
    const a = pts[i - 1], b = pts[i + 1];
    return !a || !b || !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });
  return `M${limpos.map(([x, y]) => `${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join("L")}Z`;
}

// Esquema da peça em cm, com a proporção certa dos pontos (largura pelas colunas, altura pelas carreiras).
function esquemaSvg(peca, plano, densidade) {
  const cmX = 10 / Math.max(0.1, decimal(densidade.colunas, 30)), cmY = 10 / Math.max(0.1, decimal(densidade.carreiras, 40));
  const { W, H } = plano;
  const k = Math.min(300 / (W * cmX), 320 / (H * cmY));
  const mx = 74, mt = 34, mb = 48, mr = 40;
  const sx = cmX * k, sy = cmY * k;
  const X = (x) => mx + x * sx, Y = (c) => mt + (H - c) * sy;
  const vbW = Math.round(mx + W * sx + mr), vbH = Math.round(mt + H * sy + mb);
  const ocup = ocupacaoDaForma(plano);
  const f = peca.forma;
  const partes = [`<path class="contorno" d="${contornoDaForma(ocup, X, Y)}"/>`];
  const linha = (x1, y1, x2, y2, classe = "cota") => partes.push(`<line class="${classe}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  const texto = (x, y, t, extra = "") => partes.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${extra}>${esc(t)}</text>`);
  // Largura da primeira carreira, embaixo.
  const base = ocup[0] && ocup[0].length ? [ocup[0][0][0], ocup[0][ocup[0].length - 1][1] + 1] : [0, W];
  const yb = Y(0) + 16;
  linha(X(base[0]), yb, X(base[1]), yb);
  linha(X(base[0]), yb - 5, X(base[0]), yb + 5);
  linha(X(base[1]), yb - 5, X(base[1]), yb + 5);
  texto((X(base[0]) + X(base[1])) / 2, yb + 20, `${cm1((base[1] - base[0]) * cmX)} cm · ${base[1] - base[0]} ag.`, ' text-anchor="middle" class="destaque"');
  // Altura total, à esquerda.
  const xa = mx - 18;
  linha(xa, Y(0), xa, Y(H));
  linha(xa - 5, Y(0), xa + 5, Y(0));
  linha(xa - 5, Y(H), xa + 5, Y(H));
  texto(xa - 8, (Y(0) + Y(H)) / 2, `${cm1(H * cmY)} cm · ${H} car.`, ` text-anchor="middle" class="destaque" transform="rotate(-90 ${(xa - 8).toFixed(1)} ${((Y(0) + Y(H)) / 2).toFixed(1)})"`);
  // Barra tracejada.
  const barra = Math.round(f.barra || 0);
  if (barra > 0 && barra < H) {
    linha(X(base[0]), Y(barra), X(base[1]), Y(barra), "linha-barra");
    texto((X(base[0]) + X(base[1])) / 2, Y(barra) - 6, `barra ${cm1(barra * cmY)} cm`, ' text-anchor="middle"');
  }
  // Cota à direita do trecho de cima (cava ou copa) e a largura de onde ele começa.
  const lado = (de, nome) => {
    if (!(de > 0 && de < H)) return;
    const xr = X(W) + 14;
    linha(xr, Y(de), xr, Y(H));
    linha(xr - 5, Y(de), xr + 5, Y(de));
    linha(xr - 5, Y(H), xr + 5, Y(H));
    const meio = (Y(de) + Y(H)) / 2;
    texto(xr + 16, meio, `${nome} ${cm1((H - de) * cmY)} cm`, ` text-anchor="middle" transform="rotate(-90 ${(xr + 16).toFixed(1)} ${meio.toFixed(1)})"`);
  };
  if (f.tipo === "corpo") {
    lado(H - Math.round(f.cava), "cava");
    const gola = Math.round(f.gola);
    texto(X(W / 2), mt - 12, `gola ${cm1(gola * cmX)} cm · ${gola} ag.`, ' text-anchor="middle"');
  } else if (f.tipo === "manga") {
    const copa0 = H - Math.round(f.copa);
    lado(copa0, "copa");
    const r = ocup[Math.max(0, copa0 - 1)];
    if (r && r.length) texto(X(W / 2), Y(copa0) + 16, `${cm1((r[r.length - 1][1] + 1 - r[0][0]) * cmX)} cm`, ' text-anchor="middle"');
  }
  const nome = `${peca.nome}: ${cm1(W * cmX)} × ${cm1(H * cmY)} cm`;
  return `<svg viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="${esc(`Esquema da peça ${nome}`)}">${partes.join("")}</svg>`;
}

function desenharEsquema(r = ultimoModelo || calcularModeloAtual()) {
  const peca = r.pecas[limitar(esquemaPeca, 0, r.pecas.length - 1)];
  const el = $("modelo-esquema");
  const legenda = $("modelo-esquema-legenda");
  if (!(peca.forma.W > 0 && peca.forma.H > 0) || peca.forma.W > 8000 || peca.forma.H > 8000) {
    el.innerHTML = "";
    legenda.textContent = `${peca.nome} ficaria com ${peca.forma.W} agulhas × ${peca.forma.H} carreiras: confira as medidas e a densidade.`;
    return;
  }
  const plano = RM.planoForma(peca.forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca });
  el.innerHTML = esquemaSvg(peca, plano, modelo);
  const qtd = peca.qtd > 1 ? ` (${peca.qtd} peças)` : "";
  legenda.textContent = `${peca.nome}${qtd}: ${plano.W} agulhas × ${plano.H} carreiras, desenhada ponto a ponto pela forma e pela densidade da amostra.`;
}

{
  const form = $("dlg-modelo").querySelector("form");
  form.estilo.addEventListener("change", () => {
    modelo.estilo = form.estilo.value;
    gravarArmazenado(CHAVE_MODELO, modelo);
    desenharMedidas();
  });
  for (const nome of ["colunas", "carreiras"]) {
    form[nome].addEventListener("input", () => {
      const v = decimal(form[nome].value, 0);
      if (v <= 0) return;
      modelo[nome] = v;
      gravarArmazenado(CHAVE_MODELO, modelo);
      desenharPecas();
    });
  }
  form.maquina.addEventListener("change", () => {
    modelo.maquina = form.maquina.value;
    gravarArmazenado(CHAVE_MODELO, modelo);
  });
  form.finura.addEventListener("change", () => {
    modelo.finura = Number(form.finura.value);
    gravarArmazenado(CHAVE_MODELO, modelo);
  });
  form.esquema.addEventListener("change", () => {
    esquemaPeca = Number(form.esquema.value);
    desenharEsquema();
  });
  $("modelo-medidas").addEventListener("input", (e) => {
    const id = e.target.dataset.medida;
    if (!id) return;
    if (!modelo.valores[modelo.estilo]) modelo.valores[modelo.estilo] = {};
    modelo.valores[modelo.estilo][id] = e.target.value;
    gravarArmazenado(CHAVE_MODELO, modelo);
    desenharPecas();
  });
  $("modelo-pecas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-forma]");
    if (!b) return;
    $("dlg-modelo").close();
    abrirForma(Number(b.dataset.forma));
  });
}

// ------------------------------------------------------------------ forma

const CHAVE_FORMA = "editor-shima-forma";
const CODIGOS_FORMA = { malha: 1, fora: 0, arremate: 16, parcial: 16, marcaEsq: 71, marcaDir: 61 };
const formaOpcoes = Object.assign({ porVez: 1, marca: 3 }, lerArmazenado(CHAVE_FORMA, {}));
formaOpcoes.codigos = { ...CODIGOS_FORMA, ...(formaOpcoes.codigos || {}) };
let formaPeca = 0;
let formaDestaque = null; // passo da forma destacado na prévia
// Cores só da prévia (no desenho entram os códigos acima): 0 fora, 1 malha, 2 barra, 3 arremate,
// 4 malha parcial, 5 diminuição, 6 aumento.
const CORES_FORMA = [
  ["#CDBB9A", "malha"],
  ["#8C7B55", "barra"],
  ["#E8615F", "arremate"],
  ["#6CB2F0", "malha parcial"],
  ["#F0A73A", "diminuição"],
  ["#7FC98C", "aumento"],
];

function abrirForma(indice = formaPeca) {
  const r = ultimoModelo || calcularModeloAtual();
  if (limitar(indice, 0, r.pecas.length - 1) !== formaPeca) formaDestaque = null;
  formaPeca = limitar(indice, 0, r.pecas.length - 1);
  const form = $("dlg-forma").querySelector("form");
  form.peca.innerHTML = r.pecas.map((p, i) => `<option value="${i}">${esc(p.nome)} · ${p.agulhas} × ${p.carreiras}</option>`).join("");
  form.peca.value = String(formaPeca);
  form.porVez.value = String(formaOpcoes.porVez);
  form.marca.value = formaOpcoes.marca;
  for (const k of Object.keys(CODIGOS_FORMA)) form[k].value = formaOpcoes.codigos[k];
  $("dlg-forma-titulo").textContent = `Forma da peça · ${r.estilo.nome}`;
  $("forma-legenda").innerHTML = CORES_FORMA.map(([cor, nome]) => `<li><span class="amostra" style="background:${cor}"></span>${nome}</li>`).join("");
  abrirJanela("dlg-forma");
  desenharFormaDialogo();
}

function planoAtual() {
  const r = ultimoModelo || calcularModeloAtual();
  const peca = r.pecas[limitar(formaPeca, 0, r.pecas.length - 1)];
  if (peca.forma.W > 8000 || peca.forma.H > 8000) return { peca, plano: null };
  return { peca, plano: RM.planoForma(peca.forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca }) };
}

function desenharFormaDialogo() {
  const { peca, plano } = planoAtual();
  $("forma-novo").disabled = $("forma-colar").disabled = !plano;
  $("forma-previa").hidden = !plano;
  if (!plano) {
    $("forma-resumo").textContent = `${peca.nome} ficaria com ${peca.forma.W} agulhas × ${peca.forma.H} carreiras; o limite do editor é 8.000. Confira as medidas e a densidade no Modelo.`;
    $("forma-passos").innerHTML = "";
    return;
  }
  const img = RM.pixelsDaForma(plano, { malha: 1, fora: 0, barra: 2, arremate: 3, parcial: 4, marcaEsq: 5, marcaDir: 5, aumento: 6 });
  const cores = [[43, 40, 36], ...CORES_FORMA.map(([cor]) => rgbDeHex(cor))];
  // Com um passo escolhido, as outras carreiras ficam apagadas (cores 7 a 13, misturadas com o fundo).
  if (formaDestaque !== null && !(plano.passos[formaDestaque] && plano.passos[formaDestaque].de !== undefined)) formaDestaque = null;
  const passo = formaDestaque !== null ? plano.passos[formaDestaque] : null;
  if (passo) {
    for (let y = 0; y < img.h; y++) {
      const c = img.h - y;
      if (c >= passo.de && c <= passo.ate) continue;
      for (let x = 0; x < img.w; x++) img.px[y * img.w + x] += cores.length;
    }
  }
  const apagadas = cores.map((rgb) => rgb.map((v, i) => Math.round(v * 0.3 + cores[0][i] * 0.7)));
  const todas = [...cores, ...apagadas];
  const cv = $("forma-previa");
  const z = zoomQueCabeEm(img.w, img.h, larguraUtil(cv, 440), 460, 6);
  pintarPixels(cv, img, (v) => todas[v], z);
  cv.setAttribute("aria-label", `Forma: ${plano.resumo}${passo ? ` Destaque: ${passo.nome}.` : ""}`);
  $("forma-resumo").textContent = plano.resumo;
  $("forma-passos").innerHTML = plano.passos
    .map((s, i) => {
      const onde = s.de !== undefined ? ` <span class="onde">${s.de === s.ate ? `carreira ${s.de}` : `carreiras ${s.de}–${s.ate}`}</span>` : "";
      const corpo = `<strong>${esc(s.nome)}</strong>${onde}<br>${esc(s.texto)}`;
      if (s.aviso || s.de === undefined) return `<li${s.aviso ? ' class="passo-aviso"' : ""}>${corpo}</li>`;
      return `<li><button type="button" class="passo-forma" data-passo-forma="${i}" aria-pressed="${i === formaDestaque}">${corpo}</button></li>`;
    })
    .join("");
  if (passo) {
    // Rola a prévia até as carreiras do passo.
    const quadro = cv.parentElement;
    const meio = (img.h - (passo.de + passo.ate) / 2) * z;
    quadro.scrollTop = Math.max(0, meio + 10 - quadro.clientHeight / 2);
  }
}

// Pontos da forma com os códigos escolhidos (barra e aumento usam o código da malha).
function imagemDaForma() {
  const { peca, plano } = planoAtual();
  return { peca, img: plano ? RM.pixelsDaForma(plano, { ...formaOpcoes.codigos }) : null };
}

{
  const form = $("dlg-forma").querySelector("form");
  $("forma-passos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-passo-forma]");
    if (!b) return;
    const i = Number(b.dataset.passoForma);
    formaDestaque = formaDestaque === i ? null : i;
    desenharFormaDialogo();
    const novo = $("forma-passos").querySelector(`[data-passo-forma="${i}"]`);
    if (novo) novo.focus();
  });
  form.addEventListener("input", (e) => {
    const alvo = e.target;
    if (alvo.name === "peca") {
      formaPeca = Number(alvo.value);
      formaDestaque = null;
    } else if (alvo.name === "porVez") formaOpcoes.porVez = Number(alvo.value);
    else if (alvo.name === "marca") formaOpcoes.marca = inteiro(alvo.value, 3, 1, 8);
    else if (alvo.name in CODIGOS_FORMA) formaOpcoes.codigos[alvo.name] = inteiro(alvo.value, CODIGOS_FORMA[alvo.name], 0, 255);
    else return;
    gravarArmazenado(CHAVE_FORMA, formaOpcoes);
    desenharFormaDialogo();
  });
  $("forma-novo").addEventListener("click", () => {
    const { peca, img } = imagemDaForma();
    if (!img) return;
    $("dlg-forma").close();
    criarDesenhoNovo(`${RM.semAcento(peca.nome).replace(/\s+/g, "_")}.dat`, img);
    avisar(`${peca.nome}: ${img.w} agulhas × ${img.h} carreiras num desenho novo. Faltam as linhas de opção.`);
  });
  $("forma-colar").addEventListener("click", () => {
    const a = abaDat();
    const { img } = imagemDaForma();
    if (!a || !img) return;
    $("dlg-forma").close();
    colarNoDesenho(a, img, "Forma como colagem: arraste para posicionar e aperte Enter para fixar.");
  });
}

// ------------------------------------------------------------------ gerar padrão

let sementeOnca = 7;
let cacheOnca = { chave: "", px: null };
let logoImagem = null; // imagem escolhida para o logo: { id, imagem, w, h, nome }; sem ela, o logo sai do texto
let cacheTextoLogo = { texto: null, fonte: null };
let cacheLogo = { chave: "", q: null };
let contadorLogo = 0;

function abrirGerar() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const form = $("dlg-gerar").querySelector("form");
  if (a.selecao) {
    form.largura.value = a.selecao.w;
    form.altura.value = a.selecao.h;
  } else if (!form.largura.value) {
    form.largura.value = 48;
    form.altura.value = 40;
  }
  if (!form.dataset.pronto) {
    form.corA.value = estado.primaria;
    form.corB.value = estado.secundaria;
    form.corTexto.value = estado.primaria;
    form.corFundo.value = estado.secundaria;
    form.dataset.pronto = "1";
  }
  abrirJanela("dlg-gerar");
  desenharGerar();
}

// Listras como cor:carreiras ou cor:carreiras:guia, separadas por vírgula (guia 0 = sem guia).
function lerListras(texto) {
  return String(texto || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [cor, n, guia] = s.split(/\s*[:x×]\s*/);
      return { cor: numeroCor(cor), carreiras: inteiro(n, 1, 1, 8000), guia: inteiro(guia, 0, 0, 255) };
    });
}

// Módulo de rosetas repetido a partir do canto de baixo à esquerda; o sorteio só muda com "Sortear".
function imagemOnca(form, w, h) {
  const ow = inteiro(form.ow.value, 72, 18, 240), oh = inteiro(form.oh.value, 60, 15, 240);
  const cores = [numeroCor(form.oncaA.value), numeroCor(form.oncaB.value), numeroCor(form.oncaC.value)];
  const chave = [ow, oh, sementeOnca, ...cores].join(",");
  if (cacheOnca.chave !== chave) cacheOnca = { chave, px: RM.gerarOnca(ow, oh, sementeOnca, cores) };
  const modulo = cacheOnca.px;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const my = oh - 1 - ((h - 1 - y) % oh);
    for (let x = 0; x < w; x++) px[y * w + x] = modulo[my * ow + (x % ow)];
  }
  return { w, h, px };
}

// Texto do logo desenhado em letras grossas, recortado bem rente (vira a imagem de origem).
function textoDoLogo(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  if (cacheTextoLogo.texto === t) return cacheTextoLogo.fonte;
  const cv = document.createElement("canvas");
  const g = cv.getContext("2d");
  const letra = '700 120px "IBM Plex Sans", Arial, sans-serif';
  g.font = letra;
  const m = g.measureText(t);
  const esquerda = Math.ceil(m.actualBoundingBoxLeft || 0), direita = Math.ceil(m.actualBoundingBoxRight || m.width);
  const sobe = Math.ceil(m.actualBoundingBoxAscent || 90), desce = Math.ceil(m.actualBoundingBoxDescent || 0);
  cv.width = Math.max(1, esquerda + direita + 16);
  cv.height = Math.max(1, sobe + desce + 16);
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, cv.width, cv.height);
  g.font = letra; // mudar o tamanho do canvas volta a fonte ao padrão
  g.fillStyle = "#000000";
  g.textBaseline = "alphabetic";
  g.fillText(t, 8 + esquerda, 8 + sobe);
  const fonte = { id: `texto:${t}`, imagem: cv, w: cv.width, h: cv.height, nome: `texto “${t}”` };
  cacheTextoLogo = { texto: t, fonte };
  return fonte;
}

// Logo em pontos: a imagem (ou o texto) reduzida à largura pedida e separada em 2 a 4 fios pela claridade.
function imagemDoLogo(form) {
  const k = limitar(Number(form.logoK.value) || 2, 2, 4);
  const w = inteiro(form.logoW.value, 60, 8, 2000);
  const fonte = logoImagem || textoDoLogo(form.logoTexto.value);
  if (!fonte) return null;
  // Um ponto tem 10/colunas cm de largura e 10/carreiras cm de altura: sem isso o logo sai achatado na malha.
  const h = limitar(Math.round((w * fonte.h * decimal(modelo.carreiras, 40)) / (fonte.w * decimal(modelo.colunas, 30))), 1, 8000);
  if (w * h > 4000000) return null;
  const chave = [fonte.id, w, h, k].join(",");
  if (cacheLogo.chave !== chave) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d");
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(fonte.imagem, 0, 0, w, h);
    cacheLogo = { chave, q: RM.quantizarLuminancia(g.getImageData(0, 0, w, h).data, w, h, k) };
  }
  const cores = [0, 1, 2, 3].map((i) => numeroCor(form[`logoC${i}`].value));
  const q = cacheLogo.q;
  const px = new Uint8Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = cores[q.px[i]];
  return { w, h, px, fonte };
}

function carregarImagem(arquivo) {
  if (window.createImageBitmap) return createImageBitmap(arquivo);
  return new Promise((pronto, falhou) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      pronto(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falhou(new Error("imagem inválida"));
    };
    img.src = url;
  });
}

function imagemGerada(form) {
  const tipo = form.tipo.value;
  if (tipo === "texto") {
    const linhas = form.texto.value.split("\n");
    const k = Number(form.escala.value);
    const colunas = Math.max(1, ...linhas.map((l) => l.length));
    if ((colunas * 6 + 1) * (linhas.length * 9) * k * k > 4000000) return null;
    return RM.textoEmPixels(linhas, {
      cor: numeroCor(form.corTexto.value),
      fundo: numeroCor(form.corFundo.value),
      escala: Number(form.escala.value),
      margem: 1,
    });
  }
  if (tipo === "logo") return imagemDoLogo(form);
  const w = inteiro(form.largura.value, 48, 1, 8000), h = inteiro(form.altura.value, 40, 1, 8000);
  if (w * h > 4000000) return null;
  if (tipo === "listras") {
    const listras = lerListras(form.listras.value);
    return listras.length ? { w, h, px: RM.gerarListras(w, h, listras) } : null;
  }
  if (tipo === "onca") return imagemOnca(form, w, h);
  const corC = String(form.corC.value).trim() === "" ? null : numeroCor(form.corC.value);
  const cores = [numeroCor(form.corA.value), numeroCor(form.corB.value), corC];
  return { w, h, px: RM.gerarLosango(w, h, inteiro(form.dw.value, 24, 2, 400), inteiro(form.dh.value, 30, 2, 400), cores) };
}

// O que acontece com a R3 ao aplicar as listras (ou o que falta para poder escrever nela).
function textoListrasR3(a, form) {
  if (!form.listrasR3.checked) return "";
  const listras = lerListras(form.listras.value);
  if (listras.length && !listras.some((l) => l.guia)) return "Escreva o guia de cada listra como cor:carreiras:guia, por exemplo 1:6:3.";
  if (!a.selecao) return "Selecione no desenho a área das listras antes de abrir: com a R3, elas entram direto na seleção.";
  const p = painelDaArea(a, a.selecao);
  if (!p || !p.R.colunas[3]) return "A seleção não está num painel com a linha R3.";
  return `As listras entram direto na seleção (${a.selecao.w} × ${a.selecao.h}) e a R3 do painel ${p.numero} recebe o guia de cada listra.`;
}

function desenharGerar() {
  const a = abaDat();
  if (!a) return;
  const form = $("dlg-gerar").querySelector("form");
  const tipo = form.tipo.value;
  form.querySelectorAll("[data-para]").forEach((el) => (el.hidden = !el.dataset.para.split(" ").includes(tipo)));
  const k = limitar(Number(form.logoK.value) || 2, 2, 4);
  form.querySelectorAll("[data-fio]").forEach((el) => (el.hidden = Number(el.dataset.fio) >= k));
  const comR3 = tipo === "listras" && form.listrasR3.checked;
  $("gerar-colar").textContent = comR3 ? "Aplicar na seleção" : "Colar no desenho";
  $("gerar-listras-r3").textContent = tipo === "listras" ? textoListrasR3(a, form) : "";
  const img = imagemGerada(form);
  if (tipo === "logo") {
    const fonte = img ? img.fonte : logoImagem || textoDoLogo(form.logoTexto.value);
    $("gerar-logo-origem").textContent = fonte ? `Origem: ${fonte.nome}${logoImagem ? ` (${fonte.w} × ${fonte.h} pixels)` : ""}` : "Escreva o texto ou escolha uma imagem.";
  }
  const cv = $("gerar-previa");
  $("gerar-colar").disabled = !img;
  cv.hidden = !img;
  if (!img) {
    $("gerar-info").textContent =
      tipo === "listras" ? "Escreva as listras como cor:carreiras, separadas por vírgula." : tipo === "logo" ? "Escreva o texto do logo ou escolha uma imagem." : "Tamanho grande demais.";
    return;
  }
  pintarPixels(cv, img, corDaPaleta(a.doc), zoomQueCabeEm(img.w, img.h, larguraUtil(cv, 440), 400, 8));
  const cores = RM.coresDaArea(img.px, img.w, { x: 0, y: 0, w: img.w, h: img.h }).map((c) => c.cor);
  $("gerar-info").textContent = `${img.w} agulhas × ${img.h} carreiras · cores ${cores.join(", ")}. ${
    comR3 ? "Entra direto na seleção." : "Entra como colagem no canto da seleção (ou no canto visível)."
  }`;
}

// Listras direto na seleção, com o guia de cada listra escrito na R3 do painel, carreira a carreira.
function aplicarListrasComR3(a, form) {
  fixarFlutuante(a);
  const sel = a.selecao;
  const listras = lerListras(form.listras.value);
  if (!listras.length) return;
  if (!listras.some((l) => l.guia)) return avisar("Escreva o guia de cada listra como cor:carreiras:guia (por exemplo 1:6:3).", true);
  if (!sel) return avisar("Selecione no desenho a área das listras: com a R3, elas entram direto na seleção.", true);
  const p = painelDaArea(a, sel);
  if (!p || !p.R.colunas[3]) return avisar("A seleção precisa estar num painel com a linha R3.", true);
  const d = a.doc;
  const px = RM.gerarListras(sel.w, sel.h, listras);
  const porCarreira = RM.listrasPorCarreira(sel.h, listras);
  salvarHistorico(a);
  for (let y = 0; y < sel.h; y++) d.pixels.set(px.subarray(y * sel.w, (y + 1) * sel.w), (sel.y + y) * d.largura + sel.x);
  // Cada sequência de carreiras com o mesmo guia recebe o número dele; listras sem guia deixam a R3 como está.
  const guiaEm = (c) => (porCarreira[c] >= 0 ? listras[porCarreira[c]].guia : 0);
  let escritas = 0;
  for (let c = 0; c < sel.h; ) {
    const guia = guiaEm(c);
    let fim = c;
    while (fim + 1 < sel.h && guiaEm(fim + 1) === guia) fim++;
    if (guia) escritas += RM.pintarValorNaLinha(d, p.R, 3, sel.y + sel.h - 1 - fim, sel.y + sel.h - 1 - c, guia);
    c = fim + 1;
  }
  $("dlg-gerar").close();
  renderizar();
  atualizarPainel();
  desenharOpcoes();
  avisar(`Listras aplicadas na seleção${escritas ? `; a R3 do painel ${p.numero} recebeu o guia em ${escritas} carreira${escritas === 1 ? "" : "s"}` : ""}.`);
}

{
  const form = $("dlg-gerar").querySelector("form");
  form.addEventListener("input", (e) => {
    if (e.target.name === "logoTexto" && logoImagem) {
      // Escrever no texto volta a usar o texto no lugar da imagem.
      logoImagem = null;
      form.logoImagem.value = "";
    }
    desenharGerar();
  });
  form.logoImagem.addEventListener("change", async () => {
    const arquivo = form.logoImagem.files && form.logoImagem.files[0];
    if (!arquivo) {
      logoImagem = null;
    } else {
      try {
        const imagem = await carregarImagem(arquivo);
        logoImagem = { id: `imagem:${++contadorLogo}`, imagem, w: imagem.width, h: imagem.height, nome: `imagem ${arquivo.name}` };
      } catch (erro) {
        logoImagem = null;
        form.logoImagem.value = "";
        avisar(`Não foi possível abrir ${arquivo.name} como imagem.`, true);
      }
    }
    if ($("dlg-gerar").open) desenharGerar();
  });
  $("gerar-sortear").addEventListener("click", () => {
    sementeOnca = (Math.random() * 4294967296) >>> 0 || 1;
    desenharGerar();
  });
  $("gerar-colar").addEventListener("click", () => {
    const a = abaDat();
    if (!a) return;
    if (form.tipo.value === "listras" && form.listrasR3.checked) return aplicarListrasComR3(a, form);
    const img = imagemGerada(form);
    if (!img) return;
    $("dlg-gerar").close();
    colarNoDesenho(a, { w: img.w, h: img.h, px: img.px });
  });
}

// ------------------------------------------------------------------ jacquard e intarsia

let jacquard = null;
const LIMITE_JACQUARD = 300000; // pontos analisados de uma vez

function abrirJacquard() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const { r, texto } = areaDeAnalise(a, "analisando");
  if (r.w * r.h > LIMITE_JACQUARD) {
    return avisar(`A área tem ${(r.w * r.h).toLocaleString("pt-BR")} pontos. Selecione o motivo (até ${LIMITE_JACQUARD.toLocaleString("pt-BR")} pontos) e abra de novo.`, true);
  }
  const d = a.doc;
  jacquard = { a, r, cores: RM.coresDaArea(d.pixels, d.largura, r), intarsia: RM.guiasIntarsia(d.pixels, d.largura, r) };
  $("jacquard-area").textContent = texto;
  abrirJanela("dlg-jacquard");
  analisarJacquard();
}

const amostraCor = (d, cor) => `<span class="amostra" style="background:${hexCor(d.paleta[cor])}"></span><span class="mono">${cor}</span>`;

const EXPLICA_AVESSO = {
  flutuacao: () => "Cada cor passa solta por trás onde não aparece na frente.",
  birdseye: () => "O avesso prende as cores em pontos alternados (salpicado): fios curtos e tecido mais firme.",
  escada: (n) => `Cada cor prende no avesso a cada ${n} agulhas.`,
  tubular: () => "No tubular o avesso tece todas as cores: não sobra fio solto, mas o tecido fica duplo e mais pesado.",
};

function analisarJacquard() {
  if (!jacquard) return;
  const { a, r, cores, intarsia } = jacquard;
  const d = a.doc, H = d.altura;
  const form = $("dlg-jacquard").querySelector("form");
  const estrutura = form.estrutura.value;
  const escada = inteiro(form.escada.value, 4, 2, 12);
  const maximo = inteiro(form.maximo.value, 5, 1, 99);
  form.escada.disabled = estrutura !== "escada";
  const fl = RM.flutuacoes(d.pixels, d.largura, r, estrutura, escada);
  const longas = fl.lista.filter((f) => f.comprimento > maximo);
  const maior = fl.lista.reduce((m, f) => (!m || f.comprimento > m.comprimento ? f : m), null);
  Object.assign(jacquard, { longas, maior, fl, maximo, estrutura });
  const mostrar = cores.slice(0, 24);
  let html = `<div class="cores-area">${mostrar.map((c) => `<span>${amostraCor(d, c.cor)} <span class="suave">× ${c.n.toLocaleString("pt-BR")}</span></span>`).join("")}${
    cores.length > mostrar.length ? `<span class="suave">+${cores.length - mostrar.length}</span>` : ""
  }</div>`;
  html += `<p>${cores.length} ${cores.length === 1 ? "cor" : "cores"} na área. ${EXPLICA_AVESSO[estrutura](escada)}</p>`;
  if (cores.length > 1 && estrutura !== "tubular") {
    html += longas.length
      ? `<p class="alerta">${longas.length.toLocaleString("pt-BR")} fios soltos com mais de ${maximo} agulhas.</p>`
      : `<p class="ok-texto">Nenhum fio solto com mais de ${maximo} agulhas.</p>`;
    if (maior) {
      html += `<p>O maior tem ${maior.comprimento} agulhas: cor ${maior.cor}, carreira ${H - maior.y}, agulhas ${maior.x0 + 1}–${maior.x1 + 1}.</p>
        <div class="controles"><button type="button" class="botao pequeno" data-jacquard="maior">Selecionar o maior no desenho</button></div>`;
    }
  }
  $("jacquard-resultado").innerHTML = `<div class="resultado">${html}</div>`;

  const disponiveis = inteiro(form.guias.value, 8, 1, 64);
  const porCor = new Map();
  intarsia.guias.forEach((g) => porCor.set(g.cor, (porCor.get(g.cor) || 0) + 1));
  const n = intarsia.guias.length;
  $("intarsia-resultado").innerHTML = `<div class="resultado">
    <p class="${n > disponiveis ? "alerta" : "ok-texto"}">Precisa de ${n} guia-fio${n === 1 ? "" : "s"}${n > disponiveis ? `, mais que os ${disponiveis} da máquina` : ""}.</p>
    <div class="cores-area">${[...porCor].slice(0, 24).map(([cor, k]) => `<span>${amostraCor(d, cor)} <span class="suave">${k} guia${k === 1 ? "" : "s"}</span></span>`).join("")}</div>
    <p class="suave pequeno">Cada trecho seguido de uma cor numa carreira precisa do seu guia; um guia volta a servir quando a área dele acaba. ${intarsia.areas.length === 1 ? "É 1 área de cor" : `São ${intarsia.areas.length.toLocaleString("pt-BR")} áreas de cor`}.</p></div>`;
  // Tabela dos guias: carreiras contadas de baixo, a partir da primeira carreira da área.
  const base = H - (r.y + r.h - 1);
  const mostrados = intarsia.guias.slice(0, 200);
  $("intarsia-tabela").innerHTML = n
    ? `<table class="tabela"><thead><tr><th>Guia</th><th>Cor</th><th>Carreiras</th><th>Áreas</th></tr></thead><tbody>${mostrados
        .map(
          (g) => `<tr><td class="mono"><span class="ponto-guia" style="background:${corDoGuia(g.id)}"></span>${g.id}</td><td><span class="celula-cor">${amostraCor(d, g.cor)}</span></td>
          <td class="mono">${base + g.ini}–${base + g.fim}</td><td class="mono">${g.areas}</td></tr>`,
        )
        .join("")}</tbody></table>${n > mostrados.length ? `<p class="suave pequeno">e mais ${n - mostrados.length} guias.</p>` : ""}`
    : "";
  desenharMapaJacquard();
}

// O avesso visto por trás (espelhado): o desenho escurecido e cada fio solto como um traço da cor dele.
function desenharAvessoJacquard(g, z) {
  const { a, r, fl, maximo } = jacquard;
  const d = a.doc;
  const img = recortarArea(d, r);
  const espelho = new Uint8Array(img.px.length);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) espelho[y * r.w + x] = img.px[y * r.w + (r.w - 1 - x)];
  const base = document.createElement("canvas");
  pintarPixels(base, { w: r.w, h: r.h, px: espelho }, corDaPaleta(d), 1);
  g.drawImage(base, 0, 0, r.w * z, r.h * z);
  g.fillStyle = "rgba(0, 0, 0, 0.6)";
  g.fillRect(0, 0, r.w * z, r.h * z);
  const espessura = Math.max(1, Math.round(z * 0.5));
  const lista = fl.lista.slice(0, 40000);
  const x0 = (f) => (r.w - 1 - (f.x1 - r.x)) * z;
  const y0 = (f) => (f.y - r.y) * z + Math.floor((z - espessura) / 2);
  // Os longos ganham uma borda amarela por baixo do traço.
  g.fillStyle = "rgba(255, 225, 77, 0.95)";
  for (const f of lista) if (f.comprimento > maximo) g.fillRect(x0(f) - 1, y0(f) - 1, f.comprimento * z + 2, espessura + 2);
  const porCor = new Map();
  for (const f of lista) {
    if (!porCor.has(f.cor)) porCor.set(f.cor, []);
    porCor.get(f.cor).push(f);
  }
  for (const [cor, fios] of porCor) {
    g.fillStyle = hexCor(d.paleta[cor]);
    for (const f of fios) g.fillRect(x0(f), y0(f), f.comprimento * z, espessura);
  }
}

const LEGENDA_JACQUARD = {
  flutuacoes: (j) => `O desenho escurecido, com os fios soltos de mais de ${j.maximo} agulhas em amarelo.`,
  avesso: (j) =>
    j.estrutura === "tubular"
      ? "O avesso visto por trás (espelhado). No tubular o avesso tece todas as cores: não há fio solto."
      : `O avesso visto por trás (espelhado): cada traço é um fio solto, na cor dele; os de mais de ${j.maximo} agulhas têm borda amarela.`,
  guias: () => "Cada cor é um guia-fio da intarsia; com zoom, o número do guia aparece no meio da área dele.",
};

function desenharMapaJacquard() {
  const { a, r, longas, intarsia } = jacquard;
  const d = a.doc;
  const vista = $("dlg-jacquard").querySelector("form").vista.value;
  const guias = vista === "guias";
  const cv = $("jacquard-mapa");
  const z = limitar(Math.floor(Math.min(larguraUtil(cv, 480) / r.w, 460 / r.h)), 1, 12);
  $("jacquard-legenda").textContent = (LEGENDA_JACQUARD[vista] || LEGENDA_JACQUARD.flutuacoes)(jacquard);
  const g = ajustarTela(cv, r.w * z, r.h * z);
  g.imageSmoothingEnabled = false;
  if (vista === "avesso") {
    desenharAvessoJacquard(g, z);
    cv.setAttribute("aria-label", `Avesso da área, espelhado, com ${jacquard.fl.lista.length} fios soltos`);
    return;
  }
  const base = document.createElement("canvas");
  if (guias) pintarPixels(base, { w: r.w, h: r.h, px: intarsia.guiaDe }, (v) => (v > 0 ? rgbDoGuia(v) : [0, 0, 0]), 1);
  else pintarPixels(base, recortarArea(d, r), corDaPaleta(d), 1);
  g.drawImage(base, 0, 0, r.w * z, r.h * z);
  if (!guias) {
    // Escurece o desenho e marca cada fio solto longo como um traço amarelo na carreira dele.
    g.fillStyle = "rgba(0, 0, 0, 0.5)";
    g.fillRect(0, 0, r.w * z, r.h * z);
    g.fillStyle = "rgba(255, 225, 77, 0.95)";
    const espessura = Math.max(1, Math.round(z * 0.45));
    for (const f of longas.slice(0, 20000)) {
      g.fillRect((f.x0 - r.x) * z, (f.y - r.y) * z + Math.floor((z - espessura) / 2), (f.x1 - f.x0 + 1) * z, espessura);
    }
    cv.setAttribute("aria-label", `Área analisada com ${longas.length} fios soltos longos marcados em amarelo`);
    return;
  }
  cv.setAttribute("aria-label", `Guia-fios da intarsia: ${intarsia.guias.length} guias`);
  if (z < 3) return;
  const ad = intarsia.areaDe;
  g.strokeStyle = "rgba(0, 0, 0, 0.55)";
  g.lineWidth = 1;
  g.beginPath();
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = y * r.w + x;
      if (x < r.w - 1 && ad[i] !== ad[i + 1]) {
        g.moveTo((x + 1) * z + 0.5, y * z);
        g.lineTo((x + 1) * z + 0.5, (y + 1) * z);
      }
      if (y < r.h - 1 && ad[i] !== ad[i + r.w]) {
        g.moveTo(x * z, (y + 1) * z + 0.5);
        g.lineTo((x + 1) * z, (y + 1) * z + 0.5);
      }
    }
  }
  g.stroke();
  if (z < 4) return;
  g.fillStyle = "#111111";
  g.font = `600 ${Math.max(9, Math.round(z * 1.3))}px "IBM Plex Mono", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  intarsia.areas.filter((ar) => ar.n >= 40).forEach((ar) => g.fillText(String(ar.guia), (ar.sx / ar.n + 0.5) * z, (ar.sy / ar.n + 0.5) * z));
}

$("dlg-jacquard").querySelector("form").addEventListener("input", () => jacquard && analisarJacquard());
$("jacquard-resultado").addEventListener("click", (e) => {
  if (!e.target.closest('[data-jacquard="maior"]') || !mesmaAba(jacquard) || !jacquard.maior) return;
  const { a, maior } = jacquard;
  $("dlg-jacquard").close();
  selecionarNoDesenho(a, { x: maior.x0, y: maior.y, w: maior.comprimento, h: 1 });
});

// ------------------------------------------------------------------ verificar e ver as agulhas

const NIVEIS = { erro: "ERRO", aviso: "AVISO", info: "OK / INFORMAÇÃO" };
const JANELA_AGULHAS = 24;
let verif = null;

function abrirVerificar() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const lista = RM.paineis(blocosDeOpcao(a)).filter((p) => p.x0 !== null && p.x1 >= p.x0);
  const parado = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  verif = { a, lista, itens: [], filtro: "todos", painel: 0, carreira: 1, agulha: 1, tocando: !parado, vel: 1, pos: 0.6, ultimo: 0, raf: 0, sujo: true };
  const form = $("dlg-verificar").querySelector("form");
  form.painel.innerHTML = lista.length
    ? lista.map((p, i) => `<option value="${i}">Painel ${p.numero} · agulhas ${p.x0 + 1}–${p.x1 + 1}</option>`).join("")
    : `<option value="0">Desenho inteiro</option>`;
  form.velocidade.value = "1";
  form.agulha.value = 1;
  form.querySelector('[data-agulhas="tocar"]').textContent = verif.tocando ? "Pausar" : "Tocar";
  rodarVerificacao();
  escolherPainelVerif(0);
  abrirJanela("dlg-verificar");
  animarAgulhas();
}

function rodarVerificacao() {
  const form = $("dlg-verificar").querySelector("form");
  verif.itens = RM.verificarDesenho(verif.a.doc, blocosDeOpcao(verif.a), { flutuacaoMaxima: inteiro(form.maximo.value, 5, 1, 500) });
  desenharItensVerif();
}

function desenharItensVerif() {
  const { itens } = verif;
  const conta = { todos: itens.length, erro: 0, aviso: 0, info: 0 };
  itens.forEach((i) => conta[i.nivel]++);
  if (verif.filtro !== "todos" && !conta[verif.filtro]) verif.filtro = "todos";
  const filtros = [["todos", "Todos"], ["erro", "Erros"], ["aviso", "Avisos"], ["info", "OK e informações"]];
  $("verificar-filtros").innerHTML = filtros
    .map(([id, nome]) => `<button type="button" class="chip" data-filtro="${id}" aria-pressed="${verif.filtro === id}">${nome} (${conta[id]})</button>`)
    .join("");
  $("verificar-itens").innerHTML = itens
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => verif.filtro === "todos" || item.nivel === verif.filtro)
    .map(({ item, i }) => {
      const comCarreiras = !!item.carreiras;
      return `<li class="item-verificacao nivel-${item.nivel}">
        <span class="nivel">${NIVEIS[item.nivel]}</span><strong>${esc(item.titulo)}</strong><p>${esc(item.texto)}</p>
        ${comCarreiras ? `<p class="onde">carreiras ${esc(item.carreiras)}</p>` : ""}
        ${comCarreiras ? `<div class="controles"><button type="button" class="botao pequeno" data-ver-desenho="${i}">Ver no desenho</button><button type="button" class="botao pequeno" data-ver-agulhas="${i}">Ver nas agulhas</button></div>` : ""}
      </li>`;
    })
    .join("");
}

// Primeiro trecho de "187–188, 365": { de: 187, ate: 188 }.
function primeiraFaixa(carreiras) {
  const m = /^(\d+)(?:–(\d+))?/.exec(carreiras || "");
  return m ? { de: Number(m[1]), ate: Number(m[2] || m[1]) } : null;
}

function areaVerif() {
  const d = verif.a.doc;
  const p = verif.lista[verif.painel];
  return p ? { x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, R: p.R } : { x0: 0, x1: d.largura - 1, y0: 0, y1: d.altura - 1, R: null };
}

function escolherPainelVerif(i, carreira) {
  verif.painel = limitar(i, 0, Math.max(0, verif.lista.length - 1));
  const ar = areaVerif(), d = verif.a.doc;
  if (carreira === undefined) {
    // Começa na primeira carreira com malha, de baixo para cima.
    carreira = d.altura - ar.y1;
    for (let y = ar.y1; y >= ar.y0; y--) {
      let tece = false;
      for (let x = ar.x0; x <= ar.x1 && !tece; x++) tece = RM.TECE.has(d.pixels[y * d.largura + x]);
      if (tece) {
        carreira = d.altura - y;
        break;
      }
    }
  }
  const form = $("dlg-verificar").querySelector("form");
  form.painel.value = String(verif.painel);
  form.carreira.min = d.altura - ar.y1;
  form.carreira.max = d.altura - ar.y0;
  form.agulha.max = Math.max(1, ar.x1 - ar.x0 + 1);
  irParaCarreira(carreira);
}

function irParaCarreira(c) {
  const ar = areaVerif(), H = verif.a.doc.altura;
  verif.carreira = limitar(c, H - ar.y1, H - ar.y0);
  verif.pos = verif.tocando ? 0 : 0.6;
  verif.sujo = true;
  atualizarInfoVerif();
}

function valoresR(ar, k, y) {
  return ar.R ? RM.valoresDaLinha(verif.a.doc, ar.R, k, y) : [];
}

// O sentido do carro segue o 6/7 da R1 quando houver (suposição) e, sem ele, alterna a cada carreira.
function sentidoDaCarreira(ar, y, c) {
  const r1 = valoresR(ar, 1, y);
  if (r1.includes(6)) return true;
  if (r1.includes(7)) return false;
  return c % 2 === 1;
}

function atualizarInfoVerif() {
  const d = verif.a.doc, ar = areaVerif();
  const c = verif.carreira, y = d.altura - c;
  const conta = new Map();
  for (let x = ar.x0; x <= ar.x1; x++) {
    const v = d.pixels[y * d.largura + x];
    conta.set(v, (conta.get(v) || 0) + 1);
  }
  const resumo = [...conta].sort((p, q) => q[1] - p[1]).map(([v, n]) => `${v}×${n}`).join(" ");
  const r1 = valoresR(ar, 1, y).filter((v) => v === 6 || v === 7);
  const direita = sentidoDaCarreira(ar, y, c);
  const form = $("dlg-verificar").querySelector("form");
  if (document.activeElement !== form.carreira) form.carreira.value = c;
  $("verificar-info").innerHTML = [
    ["Carreira", String(c)],
    ["Sentido", `${direita ? "→ para a direita" : "← para a esquerda"}${r1.length ? ` (R1 = ${r1.join("/")})` : ""}`],
    ["Guia-fio (R3)", valoresR(ar, 3, y).join(", ") || "—"],
    ["Ponto (R6)", valoresR(ar, 6, y).join(", ") || "—"],
    ["Cancelar malha (R5)", valoresR(ar, 5, y).length ? "sim" : "—"],
    ["Códigos na carreira", resumo],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd class="mono">${esc(v)}</dd>`)
    .join("");
  $("verificar-agulhas").setAttribute("aria-label", `Carreira ${c}: agulhas das duas fronturas e o carro indo ${direita ? "para a direita" : "para a esquerda"}`);
}

function acaoDoPonto(v) {
  switch (RM.tipoDePonto(v)) {
    case "frente":
      return { frente: 1, tras: 0 };
    case "tras":
      return { frente: 0, tras: 1 };
    case "ambos":
      return { frente: 1, tras: 1 };
    case "tuck-frente":
      return { frente: 0.5, tras: 0 };
    case "tuck-tras":
      return { frente: 0, tras: 0.5 };
    case "mover-esq":
      return { frente: 1, tras: 0, mover: -1 };
    case "mover-dir":
      return { frente: 1, tras: 0, mover: 1 };
    default:
      return { frente: 0, tras: 0 };
  }
}

function animarAgulhas() {
  cancelAnimationFrame(verif.raf);
  verif.ultimo = 0;
  const passo = (t) => {
    if (!verif || !$("dlg-verificar").open) return;
    const dt = verif.ultimo ? Math.min(0.05, (t - verif.ultimo) / 1000) : 0;
    verif.ultimo = t;
    if (verif.tocando) {
      verif.pos += (dt * verif.vel) / 3.2;
      if (verif.pos >= 1.15) {
        const ar = areaVerif(), H = verif.a.doc.altura;
        verif.carreira = verif.carreira >= H - ar.y0 ? H - ar.y1 : verif.carreira + 1;
        verif.pos = 0;
        atualizarInfoVerif();
      }
      verif.sujo = true;
    }
    if (verif.sujo) desenharAgulhas();
    verif.raf = requestAnimationFrame(passo);
  };
  verif.raf = requestAnimationFrame(passo);
}

// As duas fronturas numa janela de 24 agulhas, com o carro passando e o fio do guia da R3.
function desenharAgulhas() {
  verif.sujo = false;
  const d = verif.a.doc, ar = areaVerif();
  const w = 660, h = 356;
  const cv = $("verificar-agulhas");
  const g = ajustarTela(cv, w, h);
  cv.style.width = "100%"; // encolhe junto com a coluna, mantendo a proporção
  cv.style.height = "auto";
  g.fillStyle = "#0D0F13";
  g.fillRect(0, 0, w, h);
  const c = verif.carreira, y = d.altura - c;
  const largura = ar.x1 - ar.x0 + 1;
  const jan = Math.min(JANELA_AGULHAS, largura);
  const ini = limitar(verif.agulha, 1, Math.max(1, largura - jan + 1));
  const codigoEm = (yy, i) => (yy >= ar.y0 && yy <= ar.y1 ? d.pixels[yy * d.largura + ar.x0 + ini - 1 + i] : 0);
  const guia = valoresR(ar, 3, y)[0];
  const corFio = guia ? corDoGuia(guia) : null;
  const paraDireita = sentidoDaCarreira(ar, y, c);
  const passoX = 24, x0 = (w - (jan - 1) * passoX) / 2;
  const xAg = (i) => x0 + i * passoX;
  const p = limitar(verif.pos, 0, 1.15);
  const carroX = paraDireita ? xAg(-1.5) + p * passoX * (jan + 2) : xAg(jan + 0.5) - p * passoX * (jan + 2);
  const destaque = "#F0A73A";
  g.fillStyle = "#1C2027";
  g.fillRect(20, 18, w - 40, 84);
  g.fillRect(20, 238, w - 40, 84);
  g.fillStyle = "#9AA1AE";
  g.font = '11px "IBM Plex Sans", sans-serif';
  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillText("frontura de trás", 24, 2);
  g.fillText("frontura da frente", 24, 340);
  const passou = (i) => (paraDireita ? carroX > xAg(i) : carroX < xAg(i));
  const caminho = [];
  for (let i = 0; i < jan; i++) {
    const v = codigoEm(y, i);
    const acao = acaoDoPonto(v);
    const x = xAg(i);
    const perto = Math.max(0, 1 - Math.abs(carroX - x) / 40);
    const sobeF = acao.frente * perto, sobeT = acao.tras * perto;
    const yF = 232 - sobeF * 52, yT = 108 + sobeT * 52;
    g.strokeStyle = "#7C8494";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 314);
    g.lineTo(x, yF);
    g.moveTo(x, 26);
    g.lineTo(x, yT);
    g.stroke();
    g.fillStyle = sobeF > 0.05 ? "#FFFFFF" : "#AEB4C0";
    g.beginPath();
    g.arc(x, yF, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = sobeT > 0.05 ? "#FFFFFF" : "#AEB4C0";
    g.beginPath();
    g.arc(x, yT, 3, 0, Math.PI * 2);
    g.fill();
    const antes = acaoDoPonto(codigoEm(y + 1, i));
    const feito = passou(i);
    const lacoF = feito ? acao.frente : antes.frente;
    const lacoT = feito ? acao.tras : antes.tras;
    g.strokeStyle = feito ? corFio || "#5E6574" : "#3A404C";
    g.lineWidth = 2.5;
    if (lacoF > 0) {
      g.beginPath();
      g.ellipse(x, 214, 6, lacoF < 1 ? 4 : 7, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (lacoT > 0) {
      g.beginPath();
      g.ellipse(x, 126, 6, lacoT < 1 ? 4 : 7, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (feito && acao.mover) {
      // Transferência: o ponto vai para a agulha ao lado.
      const xb = x + acao.mover * passoX * 0.8;
      g.strokeStyle = destaque;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 196);
      g.lineTo(xb, 196);
      g.moveTo(xb - acao.mover * 5, 191);
      g.lineTo(xb, 196);
      g.lineTo(xb - acao.mover * 5, 201);
      g.stroke();
    }
    if (feito && corFio && (acao.frente || acao.tras)) caminho.push({ x, y: acao.frente && !acao.tras ? 214 : acao.tras && !acao.frente ? 126 : 170 });
    const [r, gg, b] = d.paleta[v];
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(x - 9, 314, 18, 4);
    g.fillStyle = "#C9CED8";
    g.font = '10px "IBM Plex Mono", monospace';
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.fillText(String(v), x, 236);
  }
  g.fillStyle = "#7C8494";
  g.font = '10px "IBM Plex Mono", monospace';
  g.textBaseline = "top";
  g.textAlign = "center";
  g.fillText(`agulha ${ini}`, xAg(0), 325);
  if (jan > 1) g.fillText(String(ini + jan - 1), xAg(jan - 1), 325);
  if (corFio && p > 0 && p < 1.1) {
    g.strokeStyle = corFio;
    g.lineWidth = 1.6;
    g.beginPath();
    const pts = paraDireita ? caminho : caminho.slice().reverse();
    if (pts.length) {
      g.moveTo(pts[0].x, pts[0].y);
      pts.forEach((q) => g.lineTo(q.x, q.y));
    } else g.moveTo(carroX, 170);
    g.lineTo(carroX, 170);
    g.stroke();
  }
  g.fillStyle = "rgba(240, 167, 58, 0.10)";
  g.strokeStyle = destaque;
  g.lineWidth = 1.5;
  g.fillRect(carroX - 34, 12, 68, 316);
  g.strokeRect(carroX - 34, 12, 68, 316);
  g.fillStyle = corFio || "#5E6574";
  g.beginPath();
  g.moveTo(carroX - 8, 160);
  g.lineTo(carroX + 8, 160);
  g.lineTo(carroX, 172);
  g.closePath();
  g.fill();
  g.fillStyle = "#FFFFFF";
  g.font = '600 11px "IBM Plex Sans", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "bottom";
  g.fillText(guia ? `guia ${guia}` : "sem fio", carroX, 158);
  g.fillText(paraDireita ? "carro →" : "← carro", carroX, 30);
}

{
  const form = $("dlg-verificar").querySelector("form");
  form.maximo.addEventListener("input", () => verif && rodarVerificacao());
  form.painel.addEventListener("change", () => verif && escolherPainelVerif(Number(form.painel.value)));
  form.carreira.addEventListener("change", () => verif && irParaCarreira(inteiro(form.carreira.value, verif.carreira, 1, 8000)));
  form.agulha.addEventListener("input", () => {
    if (!verif) return;
    verif.agulha = inteiro(form.agulha.value, 1, 1, 8000);
    verif.sujo = true;
  });
  form.velocidade.addEventListener("change", () => verif && (verif.vel = decimal(form.velocidade.value, 1)));
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-agulhas]");
    if (!b || !verif) return;
    if (b.dataset.agulhas === "tocar") {
      verif.tocando = !verif.tocando;
      b.textContent = verif.tocando ? "Pausar" : "Tocar";
    } else irParaCarreira(verif.carreira + (b.dataset.agulhas === "proxima" ? 1 : -1));
    verif.sujo = true;
  });
  $("verificar-filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b || !verif) return;
    verif.filtro = b.dataset.filtro;
    desenharItensVerif();
  });
  $("verificar-itens").addEventListener("click", (e) => {
    const noDesenho = e.target.closest("[data-ver-desenho]");
    const nasAgulhas = e.target.closest("[data-ver-agulhas]");
    if (!verif || (!noDesenho && !nasAgulhas)) return;
    const item = verif.itens[Number((noDesenho || nasAgulhas).dataset[noDesenho ? "verDesenho" : "verAgulhas"])];
    const faixa = primeiraFaixa(item && item.carreiras);
    if (!faixa) return;
    const a = verif.a, d = a.doc;
    if (noDesenho) {
      if (!mesmaAba(verif)) return;
      const x0 = item.x0 ?? 0, x1 = item.x1 ?? d.largura - 1;
      $("dlg-verificar").close();
      selecionarNoDesenho(a, { x: x0, y: d.altura - faixa.ate, w: x1 - x0 + 1, h: faixa.ate - faixa.de + 1 });
      return;
    }
    const i = verif.lista.findIndex((p) => p.numero === item.painel);
    verif.tocando = false;
    form.querySelector('[data-agulhas="tocar"]').textContent = "Tocar";
    escolherPainelVerif(i < 0 ? verif.painel : i, faixa.de);
  });
  $("dlg-verificar").addEventListener("close", () => {
    if (verif) cancelAnimationFrame(verif.raf);
    verif = null; // não segura a aba (e o histórico dela) depois de fechar
  });
}

// ------------------------------------------------------------------ pacotes e altura com repetições (R2)

const CHAVE_REPETICOES = "editor-shima-repeticoes:";
const CHAVE_PACOTES = "editor-shima-pacotes:";
const PACOTES_PADRAO = { inicio: "arquivo", inicioN: 20, barra: "arquivo", barraN: 10, final: "arquivo", finalN: 12 };
const CODIGOS_PACOTE = { desperdicio: 1, separacao: 3, arremate: 16, frente: 1, tras: 2, tubularA: 51, tubularB: 52 };
const CAMPOS_CODIGO_PACOTE = { cDesperdicio: "desperdicio", cSeparacao: "separacao", cArremate: "arremate", cFrente: "frente", cTras: "tras", cTubularA: "tubularA", cTubularB: "tubularB" };
const LIMITE_CARREIRAS = 8000;
let desenv = null;

function repeticoesDe(a) {
  if (!a.repeticoes) a.repeticoes = lerArmazenado(CHAVE_REPETICOES + a.nome, {});
  return a.repeticoes;
}

function pacotesDe(a) {
  if (!a.pacotes) {
    const salvo = lerArmazenado(CHAVE_PACOTES + a.nome, {});
    a.pacotes = { ...PACOTES_PADRAO, ...salvo, codigos: { ...CODIGOS_PACOTE, ...(salvo.codigos || {}) } };
  }
  return a.pacotes;
}

// Cor de cada trecho do painel e de cada parte do desenho desenvolvido, pelo nome.
function corDaParte(nome) {
  const n = RM.semAcento(nome);
  if (n.startsWith("FIO DE DESPERDICIO")) return "#7C8494";
  if (n.startsWith("SEPARACAO")) return "#D8B04A";
  if (n.startsWith("ARREMATE")) return "#E8615F";
  if (n.startsWith("BARRA")) return "#8C7B55";
  if (n.startsWith("TRANSFERENCIA")) return "#6CB2F0";
  if (n.startsWith("CORPO")) return "#CDBB9A";
  if (n.startsWith("FINAL")) return "#B8646E";
  return "#9AA1AE";
}

// Desenho desenvolvido do painel p com os pacotes e as repetições guardados para a aba. Os pacotes entram em
// todos os painéis (as carreiras são inteiras).
function desenvolvidoDe(a, p, todos, semPixels = false) {
  const pk = pacotesDe(a);
  return RM.desenvolverComPacotes(a.doc, p, {
    repeticoes: repeticoesDe(a)[p.numero] || {},
    inicio: { tipo: pk.inicio, n: pk.inicioN },
    barra: { tipo: pk.barra, n: pk.barraN },
    final: { tipo: pk.final, n: pk.finalN },
    codigos: pk.codigos,
    paineis: todos,
    semPixels,
    limite: LIMITE_CARREIRAS,
  });
}

function abrirDesenvolver() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const todos = RM.paineis(blocosDeOpcao(a));
  const lista = todos.filter((p) => p.R);
  if (!lista.length) return avisar("Este desenho não tem as linhas de opção R1–R20: não dá para achar os trechos nem os blocos de repetição (R2).", true);
  desenv = { a, lista, todos, painel: 0, dev: null, res: null };
  const form = $("dlg-desenvolver").querySelector("form");
  form.painel.innerHTML = lista
    .map((p, i) => `<option value="${i}">Painel ${p.numero}${p.x0 !== null ? ` · agulhas ${p.x0 + 1}–${p.x1 + 1}` : ""}</option>`)
    .join("");
  const pk = pacotesDe(a);
  for (const k of Object.keys(PACOTES_PADRAO)) form[k].value = pk[k];
  for (const [campo, id] of Object.entries(CAMPOS_CODIGO_PACOTE)) form[campo].value = pk.codigos[id];
  abrirJanela("dlg-desenvolver");
  desenharDesenvolver();
}

// Campos de quantidade só valem para os pacotes que acrescentam carreiras.
function estadoCamposPacotes(form, temBarra) {
  form.inicioN.disabled = form.inicio.value !== "desperdicio";
  form.barra.disabled = !temBarra;
  form.barraN.disabled = !temBarra || !["tubular", "rib11", "rib22"].includes(form.barra.value);
  form.finalN.disabled = form.final.value !== "desperdicio";
  form.barra.title = temBarra ? "" : "Este painel não tem um trecho de barra (ponto na R6 antes do corpo).";
}

function desenharDesenvolver() {
  const { a, lista } = desenv;
  const p = lista[desenv.painel];
  const form = $("dlg-desenvolver").querySelector("form");
  const trechos = RM.trechosDoPainel(a.doc, p);
  $("desenvolver-trechos").innerHTML = trechos
    .map((t) => `<li><span class="amostra" style="background:${corDaParte(t.nome)}"></span>${esc(t.nome)} <span class="mono">${t.de === t.ate ? t.de : `${t.de}–${t.ate}`}</span></li>`)
    .join("");
  desenv.temBarra = trechos.some((t) => t.id === "barra");
  estadoCamposPacotes(form, desenv.temBarra);
  const dev = RM.desenvolvimento(a.doc, p, repeticoesDe(a)[p.numero] || {});
  desenv.dev = dev;
  $("desenvolver-tabela").innerHTML = dev.blocos.length
    ? `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>Carreiras</th><th>Altura do bloco</th><th>Valor na R2</th><th>Vezes</th><th>Total</th></tr></thead><tbody>${dev.blocos
        .map(
          (b) => `<tr><td class="mono">${b.de}–${b.ate}</td><td class="mono">${b.carreiras}</td><td class="mono">${esc(b.valor)}</td>
          <td><input type="number" min="1" max="9999" data-chave="${b.chave}" value="${b.vezes}" aria-label="Vezes que as carreiras ${b.de} a ${b.ate} se repetem"></td>
          <td class="mono" data-total="${b.chave}"></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<p class="suave">Sem blocos marcados na R2 deste painel: o corpo fica com a altura do desenho.</p>`;
  atualizarTotalDesenvolver();
}

function atualizarTotalDesenvolver() {
  const { a, lista, dev, todos } = desenv;
  const p = lista[desenv.painel];
  for (const b of dev.blocos) {
    const el = $("desenvolver-tabela").querySelector(`[data-total="${b.chave}"]`);
    if (el) el.textContent = b.carreiras * b.vezes;
  }
  const res = desenvolvidoDe(a, p, todos);
  desenv.res = res;
  const n = (v) => v.toLocaleString("pt-BR");
  $("desenvolver-total").innerHTML = `<strong>${n(res.painel.carreiras)}</strong> carreiras no painel ${p.numero} desenvolvido; no desenho são ${n(p.y1 - p.y0 + 1)}. O desenho novo fica com ${n(res.h)} carreiras${
    res.px ? "." : `, mais que o limite de ${n(LIMITE_CARREIRAS)} do editor.`
  }`;
  $("desenvolver-partes").innerHTML = res.partes
    .map(
      (t) => `<li><span class="amostra" style="background:${corDaParte(t.nome)}"></span>${esc(t.nome)}${t.gerada ? " (novo)" : ""} <span class="mono">${t.de === t.ate ? t.de : `${t.de}–${t.ate}`}</span></li>`,
    )
    .join("");
  $("desenvolver-criar").disabled = !res.px;
  desenharPreviaDesenvolvida(p, res);
}

// Prévia do painel desenvolvido, com uma faixa à esquerda na cor de cada parte (os valores 256 em diante).
function desenharPreviaDesenvolvida(p, res) {
  const cv = $("desenvolver-previa");
  cv.hidden = !res.px;
  if (!res.px) return;
  const d = desenv.a.doc;
  const m = RM.areaDeMalha(d, p) || { x0: 0, x1: d.largura - 1 };
  const x0 = m.x0, x1 = m.x1;
  const h = res.painel.carreiras;
  const faixa = Math.max(4, Math.ceil(8 / zoomQueCabeEm(x1 - x0 + 9, h, larguraUtil(cv, 360), 460, 4)));
  const w = faixa + 1 + (x1 - x0 + 1);
  const px = new Uint16Array(w * h).fill(256);
  const cores = [];
  res.partes.forEach((t) => {
    const v = 257 + cores.length;
    cores.push(rgbDeHex(corDaParte(t.nome)));
    for (let c = Math.max(t.de, res.painel.de); c <= Math.min(t.ate, res.painel.ate); c++) {
      const y = res.painel.ate - c;
      px.fill(v, y * w, y * w + faixa);
    }
  });
  for (let c = res.painel.de; c <= res.painel.ate; c++) {
    const y = res.painel.ate - c, origem = (res.h - c) * res.w;
    px.set(res.px.subarray(origem + x0, origem + x1 + 1), y * w + faixa + 1);
  }
  const fundo = [43, 40, 36];
  const cor = (v) => (v < 256 ? d.paleta[v] : v === 256 ? fundo : cores[v - 257]);
  pintarPixels(cv, { w, h, px }, cor, zoomQueCabeEm(w, h, larguraUtil(cv, 360), 460, 4));
  cv.setAttribute("aria-label", `Painel ${p.numero} desenvolvido: ${h} carreiras, com as partes marcadas à esquerda`);
}

{
  const form = $("dlg-desenvolver").querySelector("form");
  form.addEventListener("input", (e) => {
    if (!desenv) return;
    const alvo = e.target;
    const { a, lista } = desenv;
    const p = lista[desenv.painel];
    if (alvo.name === "painel") {
      desenv.painel = Number(alvo.value);
      desenharDesenvolver();
      return;
    }
    if (alvo.dataset.chave) {
      const todas = repeticoesDe(a);
      todas[p.numero] = { ...(todas[p.numero] || {}), [alvo.dataset.chave]: inteiro(alvo.value, 1, 1, 9999) };
      gravarArmazenado(CHAVE_REPETICOES + a.nome, todas);
      desenv.dev = RM.desenvolvimento(a.doc, p, todas[p.numero]);
      atualizarTotalDesenvolver();
      return;
    }
    const pk = pacotesDe(a);
    if (["inicio", "barra", "final"].includes(alvo.name)) pk[alvo.name] = alvo.value;
    else if (["inicioN", "barraN", "finalN"].includes(alvo.name)) pk[alvo.name] = inteiro(alvo.value, PACOTES_PADRAO[alvo.name], 1, 2000);
    else if (alvo.name in CAMPOS_CODIGO_PACOTE) {
      const id = CAMPOS_CODIGO_PACOTE[alvo.name];
      pk.codigos[id] = inteiro(alvo.value, CODIGOS_PACOTE[id], 0, 255);
    } else return;
    gravarArmazenado(CHAVE_PACOTES + a.nome, pk);
    estadoCamposPacotes(form, desenv.temBarra);
    atualizarTotalDesenvolver();
  });
  $("desenvolver-criar").addEventListener("click", () => {
    if (!mesmaAba(desenv)) return;
    const { a, res } = desenv;
    if (!res || !res.px) return avisar(`O desenho ficaria com mais de ${LIMITE_CARREIRAS.toLocaleString("pt-BR")} carreiras, o limite do editor.`, true);
    if (!res.partes.some((t) => t.gerada) && res.h === a.doc.altura) {
      return avisar("Nada muda: escolha um pacote ou diga quantas vezes algum bloco da R2 se repete (mais de 1).");
    }
    $("dlg-desenvolver").close();
    criarDesenhoNovo(trocarExtensao(a.nome, "_DESENVOLVIDO.dat"), res, a);
    const novos = res.partes.filter((t) => t.gerada).map((t) => t.nome.toLowerCase());
    avisar(`Desenho desenvolvido com ${res.h} carreiras${novos.length ? `, com ${[...new Set(novos)].join(", ")}` : ""}. As carreiras inteiras se repetem, com todos os painéis.`);
  });
}

// ------------------------------------------------------------------ simular a malha

const TIPOS_FIO = {
  la: { pelo: 0.9, brilho: 0.18, grossura: 1.08 },
  algodao: { pelo: 0.15, brilho: 0.2, grossura: 1 },
  acrilico: { pelo: 0.35, brilho: 0.32, grossura: 1.02 },
  viscose: { pelo: 0, brilho: 0.55, grossura: 0.95 },
};
const CORES_FIO = ["#E9E4D8", "#2B2A33", "#C8955A", "#5C8FB8", "#B8646E", "#7FA36B", "#D8B04A", "#8E6BB8"];
const TAMANHOS_PONTO = [6, 8, 12, 16, 24];
const LIMITE_SIMULACAO = { w: 160, h: 140 };
const TROCA_AVESSO = { frente: "tras", tras: "frente", "tuck-frente": "tuck-tras", "tuck-tras": "tuck-frente", "mover-esq": "tras", "mover-dir": "tras" };
const CHAVE_VARIANTES = "editor-shima-variantes";
// "Original" volta às cores do começo: as do processamento (por guia) ou as da paleta (pelo desenho).
const VARIANTES_PRONTAS = [
  { nome: "Original", cores: null },
  { nome: "Onça", cores: ["#E3B76B", "#2B1D14", "#9C6B3A", "#F4E6C8", "#5A3B28", "#C8955A"] },
  { nome: "Neve", cores: ["#F2F0EA", "#1F2A44", "#9FB3C8", "#C9D6DF", "#5C6F86", "#E9E4D8"] },
  { nome: "Terra", cores: ["#C8955A", "#5A3B28", "#E9DCC3", "#8E6E4E", "#B8646E", "#7FA36B"] },
  { nome: "Contraste", cores: ["#111111", "#F5F5F5", "#D33F2F", "#F2C94C", "#2F6FD3", "#3F9D5A"] },
];
const varianteValida = (v) =>
  !!v && typeof v.nome === "string" && Array.isArray(v.cores) && v.cores.length > 0 && v.cores.length <= 16 && v.cores.every((c) => /^#[0-9a-f]{6}$/i.test(c));
const minhasVariantes = (() => {
  const lista = lerArmazenado(CHAVE_VARIANTES, []);
  return Array.isArray(lista) ? lista.filter(varianteValida) : [];
})();
const MAX_FIOS_DESENHO = 8; // cores do desenho que dá para trocar na simulação
let simul = null;
let pedidoSimular = 0;

const corPadraoDoGuia = (v) => CORES_FIO[Math.abs(Math.round(v) - 1) % CORES_FIO.length];
const corValida = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

// Sem seleção, a peça repete o corpo do painel (só as agulhas que tecem); com seleção, a própria seleção.
function motivoDaPeca(a, r) {
  if (a.selecao) return { ...r, texto: "da seleção" };
  const p = painelDaArea(a, r);
  const corpo = p && RM.trechosDoPainel(a.doc, p).find((t) => t.id === "corpo");
  if (!corpo) return { ...r, texto: "da área analisada" };
  const m = RM.areaDeMalha(a.doc, p) || { x0: r.x, x1: r.x + r.w - 1 };
  const H = a.doc.altura;
  return { x: m.x0, y: H - corpo.ate, w: m.x1 - m.x0 + 1, h: corpo.ate - corpo.de + 1, texto: `do corpo do painel ${p.numero}` };
}

function abrirSimular() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const d = a.doc;
  const { r, texto } = areaDeAnalise(a, "simulando");
  const w = Math.min(r.w, LIMITE_SIMULACAO.w), h = Math.min(r.h, LIMITE_SIMULACAO.h);
  const area = { x: r.x, y: r.y + r.h - h, w, h };
  // Guia-fio de cada carreira pela R3 (na área toda, para a peça); sem valor, continua o da carreira de baixo.
  const p = painelDaArea(a, r);
  const guiaDaLinha = new Map();
  let ultimo = null;
  if (p) {
    for (let y = r.y + r.h - 1; y >= r.y; y--) {
      const v = RM.valoresDaLinha(d, p.R, 3, y)[0];
      if (v) ultimo = v;
      guiaDaLinha.set(y, ultimo);
    }
  }
  const guias = [...new Set([...guiaDaLinha.values()].filter((v) => v !== null))].sort((x, y) => x - y);
  // As cores dos fios começam pelas do processamento; as mudanças aqui valem só para a simulação.
  const pd = processamentoDe(a);
  const coresGuia = {};
  guias.forEach((g) => (coresGuia[g] = pd.guias[g] && corValida(pd.guias[g].cor) ? pd.guias[g].cor : corPadraoDoGuia(g)));
  const motivo = motivoDaPeca(a, r);
  simul = { a, area, guiaDaLinha, guias, zoom: 1, coresGuia, original: { ...coresGuia }, trocas: {}, coresArea: RM.coresDaArea(d.pixels, d.largura, area), motivo };
  const parte = w < r.w || h < r.h ? ` Mostrando ${w} × ${h} pontos a partir do canto de baixo à esquerda.` : "";
  $("simular-area").textContent = texto + parte;
  // Desenho de cores (a maioria dos números não é código de ponto): tudo em malha, na cor do desenho.
  let conhecidos = 0;
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) if (RM.tipoDePonto(d.pixels[y * d.largura + x])) conhecidos++;
  }
  const deCores = conhecidos < 0.5 * area.w * area.h;
  const form = $("dlg-simular").querySelector("form");
  form.pontos.value = deCores ? "frente" : "codigo";
  form.cores.querySelector('[value="guia"]').disabled = !guias.length;
  form.cores.value = deCores || !guias.length ? "desenho" : "guia";
  const pecas = (ultimoModelo || calcularModeloAtual()).pecas;
  const pecaAntes = Number(form.peca.value) || 0;
  form.peca.innerHTML = pecas.map((q, i) => `<option value="${i}">${esc(q.nome)} · ${q.agulhas} × ${q.carreiras}</option>`).join("");
  form.peca.value = String(limitar(pecaAntes, 0, pecas.length - 1));
  desenharFiosSimular();
  desenharVariantes();
  abrirJanela("dlg-simular");
  desenharSimulacao();
  desenharPecaSimular();
}

const porGuiaNaSimulacao = () => $("dlg-simular").querySelector("form").cores.value === "guia" && simul.guias.length > 0;

// Fios que dá para trocar de cor: os guias (pela R3) ou as cores mais usadas da área (pelo desenho).
function fiosDaSimulacao() {
  const d = simul.a.doc;
  if (porGuiaNaSimulacao()) return simul.guias.map((g) => ({ chave: `g${g}`, nome: `Fio do guia ${g}`, cor: simul.coresGuia[g] }));
  return simul.coresArea.slice(0, MAX_FIOS_DESENHO).map((c) => ({ chave: `c${c.cor}`, nome: `Cor ${c.cor}`, cor: simul.trocas[c.cor] || hexCor(d.paleta[c.cor]) }));
}

function desenharFiosSimular() {
  const fios = fiosDaSimulacao();
  const resto = porGuiaNaSimulacao() ? 0 : simul.coresArea.length - fios.length;
  $("simular-fios").innerHTML =
    fios.map((f) => `<label class="fio"><input type="color" data-fio-sim="${f.chave}" value="${f.cor}"><span>${esc(f.nome)}</span></label>`).join("") +
    (resto > 0 ? `<p class="suave pequeno">As outras ${resto} cores ficam como na paleta.</p>` : "");
}

function coresOriginais() {
  const d = simul.a.doc;
  if (porGuiaNaSimulacao()) return simul.guias.map((g) => simul.original[g]);
  return simul.coresArea.slice(0, MAX_FIOS_DESENHO).map((c) => hexCor(d.paleta[c.cor]));
}

function desenharVariantes() {
  const n = Math.max(1, Math.min(6, fiosDaSimulacao().length));
  $("simular-variantes").innerHTML = [...VARIANTES_PRONTAS, ...minhasVariantes]
    .map((v, i) => {
      const cores = (v.cores || coresOriginais()).slice(0, n);
      const minha = i >= VARIANTES_PRONTAS.length;
      return `<div class="item-variante"><button type="button" class="variante" data-variante="${i}" title="Usar as cores ${esc(v.nome)}"><span>${esc(v.nome)}</span><span class="amostras" aria-hidden="true">${cores
        .map((c) => `<span style="background:${c}"></span>`)
        .join("")}</span></button>${minha ? `<button type="button" class="apagar-motivo" data-apagar-variante="${i - VARIANTES_PRONTAS.length}" aria-label="Apagar ${esc(v.nome)}" title="Apagar">×</button>` : ""}</div>`;
    })
    .join("");
}

// As cores da variante vão para os fios na ordem (e voltam ao começo se houver mais fios que cores).
function aplicarVariante(v) {
  const porGuia = porGuiaNaSimulacao();
  if (!v.cores) {
    if (porGuia) simul.coresGuia = { ...simul.original };
    else simul.trocas = {};
  } else if (porGuia) simul.guias.forEach((g, i) => (simul.coresGuia[g] = v.cores[i % v.cores.length]));
  else simul.coresArea.slice(0, MAX_FIOS_DESENHO).forEach((c, i) => (simul.trocas[c.cor] = v.cores[i % v.cores.length]));
  desenharFiosSimular();
  agendarSimulacao();
}

function agendarSimulacao() {
  if (pedidoSimular) return;
  pedidoSimular = requestAnimationFrame(() => {
    pedidoSimular = 0;
    desenharSimulacao();
    desenharPecaSimular();
  });
}

// A peça do Modelo inteira, ponto a ponto, com o motivo repetido a partir do canto de baixo à esquerda e a
// proporção dos pontos da amostra (um ponto é mais largo do que alto quando há mais carreiras que colunas).
function desenharPecaSimular() {
  if (!simul) return;
  const form = $("dlg-simular").querySelector("form");
  const r = ultimoModelo || calcularModeloAtual();
  const peca = r.pecas[limitar(Number(form.peca.value) || 0, 0, r.pecas.length - 1)];
  const cv = $("simular-peca");
  const info = $("simular-peca-info");
  if (!(peca.forma.W > 0 && peca.forma.H > 0) || peca.forma.W > 2000 || peca.forma.H > 4000) {
    cv.hidden = true;
    info.textContent = `${peca.nome} ficaria com ${peca.forma.W} × ${peca.forma.H} pontos: confira as medidas no Modelo.`;
    return;
  }
  const plano = RM.planoForma(peca.forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca });
  const forma = RM.pixelsDaForma(plano, { malha: 1, fora: 0, arremate: 1, parcial: 1, marcaEsq: 1, marcaDir: 1 });
  const { W, H } = plano;
  const m = simul.motivo, d = simul.a.doc;
  const porGuia = porGuiaNaSimulacao();
  const base = document.createElement("canvas");
  base.width = W;
  base.height = H;
  const bg = base.getContext("2d");
  const dados = bg.createImageData(W, H);
  const px32 = new Uint32Array(dados.data.buffer);
  const abgr = (hex) => {
    const [rr, gg, bb] = rgbDeHex(hex);
    return ((255 << 24) | (bb << 16) | (gg << 8) | rr) >>> 0;
  };
  const doCodigo = new Map();
  const corDoCodigo = (v) => {
    let c = doCodigo.get(v);
    if (c === undefined) doCodigo.set(v, (c = abgr(simul.trocas[v] || hexCor(d.paleta[v]))));
    return c;
  };
  const doGuia = new Map();
  const corDoGuiaSim = (guia) => {
    let c = doGuia.get(guia);
    if (c === undefined) doGuia.set(guia, (c = abgr(guia ? simul.coresGuia[guia] : "#9AA1AE")));
    return c;
  };
  const fundo = abgr("#16181C");
  for (let y = 0; y < H; y++) {
    const my = m.y + m.h - 1 - ((H - 1 - y) % m.h);
    const corLinha = porGuia ? corDoGuiaSim(simul.guiaDaLinha.get(my) || null) : 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!forma.px[i]) px32[i] = fundo;
      else px32[i] = porGuia ? corLinha : corDoCodigo(d.pixels[my * d.largura + m.x + (x % m.w)]);
    }
  }
  bg.putImageData(dados, 0, 0);
  const col = Math.max(0.1, decimal(modelo.colunas, 30)), car = Math.max(0.1, decimal(modelo.carreiras, 40));
  const razao = col / car; // altura de uma carreira ÷ largura de uma agulha
  const z = Math.min(larguraUtil(cv, 240) / W, 300 / (H * razao));
  const g = ajustarTela(cv, W * z, H * z * razao);
  g.imageSmoothingEnabled = false;
  g.drawImage(base, 0, 0, W * z, H * z * razao);
  cv.hidden = false;
  cv.setAttribute("aria-label", `${peca.nome} inteira com o desenho repetido`);
  info.textContent = `${peca.nome}: ${W} agulhas × ${H} carreiras ≈ ${cm1((W * 10) / col)} × ${cm1((H * 10) / car)} cm, com os ${m.w} × ${m.h} pontos ${m.texto} repetidos.`;
}

function desenharPonto(g, tipo, cor, x0, y0, cw, ch, fio) {
  const lw = cw * 0.38 * fio.grossura;
  if (tipo === "frente" || tipo === "ambos" || tipo === "mover-esq" || tipo === "mover-dir" || tipo === "tuck-frente") {
    const inclina = tipo === "mover-esq" ? -0.16 : tipo === "mover-dir" ? 0.16 : 0;
    const base = tipo === "tuck-frente" ? 0.8 : 1.02;
    const pernas = () => {
      g.beginPath();
      for (const lado of [0.22, 0.78]) {
        g.moveTo(x0 + lado * cw, y0 - 0.1 * ch);
        g.quadraticCurveTo(x0 + lado * cw, y0 + 0.62 * ch, x0 + (0.5 + inclina) * cw, y0 + base * ch);
      }
      g.stroke();
    };
    g.strokeStyle = misturar(cor, 0, 0.45);
    g.lineWidth = lw + 1.4;
    pernas();
    g.strokeStyle = cor;
    g.lineWidth = lw;
    pernas();
    g.strokeStyle = misturar(cor, 255, fio.brilho + 0.1);
    g.lineWidth = Math.max(1, lw * 0.3);
    g.beginPath();
    g.moveTo(x0 + 0.17 * cw, y0 + 0.05 * ch);
    g.quadraticCurveTo(x0 + 0.17 * cw, y0 + 0.55 * ch, x0 + (0.42 + inclina) * cw, y0 + 0.86 * ch);
    g.stroke();
    if (tipo === "tuck-frente") {
      g.strokeStyle = cor;
      g.lineWidth = Math.max(1, lw * 0.6);
      g.beginPath();
      g.moveTo(x0 + 0.08 * cw, y0 + 0.32 * ch);
      g.quadraticCurveTo(x0 + 0.5 * cw, y0 - 0.12 * ch, x0 + 0.92 * cw, y0 + 0.32 * ch);
      g.stroke();
    }
  } else if (tipo === "tras" || tipo === "tuck-tras") {
    const k = tipo === "tuck-tras" ? 0.7 : 1;
    g.fillStyle = misturar(cor, 0, 0.45);
    g.beginPath();
    g.ellipse(x0 + 0.5 * cw, y0 + 0.55 * ch, 0.5 * cw * k, 0.36 * ch * k, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = cor;
    g.beginPath();
    g.ellipse(x0 + 0.5 * cw, y0 + 0.5 * ch, 0.46 * cw * k, 0.3 * ch * k, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = misturar(cor, 255, fio.brilho + 0.1);
    g.beginPath();
    g.ellipse(x0 + 0.42 * cw, y0 + 0.38 * ch, 0.2 * cw * k, 0.08 * ch * k, 0, 0, Math.PI * 2);
    g.fill();
  } else if (tipo === "flutua") {
    g.strokeStyle = cor;
    g.lineWidth = Math.max(1.5, lw * 0.6);
    g.beginPath();
    g.moveTo(x0, y0 + 0.75 * ch);
    g.lineTo(x0 + cw, y0 + 0.75 * ch);
    g.stroke();
  }
}

function desenharSimulacao() {
  if (!simul) return;
  const { a, area } = simul;
  const d = a.doc;
  const form = $("dlg-simular").querySelector("form");
  const avesso = form.lado.value === "avesso";
  const fio = TIPOS_FIO[form.fio.value] || TIPOS_FIO.la;
  const porGuia = form.cores.value === "guia" && simul.guias.length > 0;
  const todosEmMalha = form.pontos.value === "frente";
  const cw = TAMANHOS_PONTO[simul.zoom], ch = Math.round(cw * 0.85);
  const W = area.w * cw, H = area.h * ch;
  const g = ajustarTela($("simular-malha"), W, H);
  g.fillStyle = "#16181C";
  g.fillRect(0, 0, W, H);
  g.lineCap = "round";
  const sorte = sorteador(11);
  for (let yy = 0; yy < area.h; yy++) {
    const y = area.y + yy;
    const guia = porGuia ? simul.guiaDaLinha.get(y) : null;
    const corDaLinha = guia ? simul.coresGuia[guia] : "#9AA1AE";
    for (let xx = 0; xx < area.w; xx++) {
      // O avesso é visto por trás: espelhado, com frente e atrás trocados.
      const v = d.pixels[y * d.largura + area.x + (avesso ? area.w - 1 - xx : xx)];
      let tipo = todosEmMalha ? "frente" : RM.tipoDePonto(v);
      if (!tipo || tipo === "guia") continue;
      if (avesso) tipo = TROCA_AVESSO[tipo] || tipo;
      const cor = porGuia ? corDaLinha : simul.trocas[v] || hexCor(d.paleta[v]);
      const x0 = xx * cw, y0 = yy * ch;
      desenharPonto(g, tipo, cor, x0, y0, cw, ch, fio);
      if (fio.pelo > 0) {
        g.strokeStyle = misturar(cor, 255, 0.25);
        g.globalAlpha = 0.18 * fio.pelo;
        g.lineWidth = 0.7;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const px = x0 + sorte() * cw, py = y0 + sorte() * ch;
          g.moveTo(px, py);
          g.lineTo(px + (sorte() - 0.5) * cw * 0.6, py + (sorte() - 0.5) * ch * 0.6);
        }
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
  $("simular-malha").setAttribute("aria-label", `Simulação da malha, ${avesso ? "avesso" : "frente"}, ${area.w} × ${area.h} pontos`);
}

{
  const form = $("dlg-simular").querySelector("form");
  form.addEventListener("input", (e) => {
    if (!simul) return;
    const alvo = e.target;
    const chave = alvo.dataset.fioSim;
    if (chave && chave[0] === "g") simul.coresGuia[chave.slice(1)] = alvo.value;
    else if (chave) simul.trocas[chave.slice(1)] = alvo.value;
    if (alvo.name === "cores") {
      desenharFiosSimular();
      desenharVariantes();
    }
    if (alvo.name === "peca") desenharPecaSimular();
    else agendarSimulacao();
  });
  $("simular-variantes").addEventListener("click", async (e) => {
    if (!simul) return;
    const apagar = e.target.closest("[data-apagar-variante]");
    if (apagar) {
      const v = minhasVariantes[Number(apagar.dataset.apagarVariante)];
      if (!v || !(await perguntar(`Apagar a variante ${v.nome}?`, "Apagar"))) return;
      minhasVariantes.splice(minhasVariantes.indexOf(v), 1);
      gravarArmazenado(CHAVE_VARIANTES, minhasVariantes);
      if (simul) desenharVariantes();
      return;
    }
    const b = e.target.closest("[data-variante]");
    const v = b && [...VARIANTES_PRONTAS, ...minhasVariantes][Number(b.dataset.variante)];
    if (v) aplicarVariante(v);
  });
  $("simular-guardar").addEventListener("click", async () => {
    if (!simul) return;
    const cores = fiosDaSimulacao().map((f) => f.cor);
    if (!cores.length) return;
    const nome = await pedirNome("Guardar variante de cor", `Variante ${minhasVariantes.length + 1}`, "Nome da variante");
    if (!nome) return;
    minhasVariantes.push({ nome, cores });
    gravarArmazenado(CHAVE_VARIANTES, minhasVariantes);
    if (simul) desenharVariantes();
    avisar(`${nome} guardada nas variantes de cor, neste navegador.`);
  });
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zoom-malha]");
    if (!b || !simul) return;
    simul.zoom = limitar(simul.zoom + Number(b.dataset.zoomMalha), 0, TAMANHOS_PONTO.length - 1);
    desenharSimulacao();
  });
  $("simular-png").addEventListener("click", () => {
    if (!simul) return;
    const nome = trocarExtensao(simul.a.nome, "_SIMULACAO.png");
    $("simular-malha").toBlob((blob) => blob && baixar(blob, nome), "image/png");
  });
}

// ------------------------------------------------------------------ processamento

const CHAVE_PROCESSAMENTO = "editor-shima-processamento:";
const EXPLICA_PASSOS = {
  maquina: "A máquina e a finura do programa. A finura também entra no tempo de tecimento e na ficha.",
  guias: "Cada número da R3 vira um guia-fio da máquina, com o fio, a cor e o lado por onde ele entra.",
  economizador: "Quantas vezes cada bloco marcado na R2 se repete. O desenho guarda cada bloco uma vez só.",
  puxador: "A força do puxador em cada trecho da peça. Costuma ser maior no início e na barra.",
  ponto: "Cada número da R6 recebe o valor de ponto (o tamanho da laçada) da frontura da frente e da de trás.",
  velocidade: "A velocidade do carro em cada trecho, em m/s. Costuma ser menor no início e nas transferências.",
  gerar: "Confere os passos, desenvolve a peça e estima o tempo. O programa (.000) e os ajustes (.QFD) continuam sendo gerados no KnitPaint, com estes valores.",
};
let proc = null;

// Valores do processamento da aba: { maquina, finura, guias: { r3: { guia, fio, cor, lado } },
// pontos: { r6: { f, t } }, puxador: { trecho: v }, velocidade: { trecho: v } }. Os fios que a ficha técnica
// guardava antes passam para cá (ficha e processamento usam os mesmos).
function processamentoDe(a) {
  if (a.processamento) return a.processamento;
  const salvo = lerArmazenado(CHAVE_PROCESSAMENTO + a.nome, {});
  const dados = {
    maquina: salvo.maquina ?? modelo.maquina ?? "",
    finura: salvo.finura ?? modelo.finura ?? "",
    guias: { ...(salvo.guias || {}) },
    pontos: { ...(salvo.pontos || {}) },
    puxador: { ...(salvo.puxador || {}) },
    velocidade: { ...(salvo.velocidade || {}) },
  };
  const fiosDaFicha = lerArmazenado(CHAVE_FICHA + a.nome, {}).fios || {};
  for (const [g, fio] of Object.entries(fiosDaFicha)) {
    if (fio && !(dados.guias[g] && dados.guias[g].fio)) dados.guias[g] = { ...(dados.guias[g] || {}), fio };
  }
  a.processamento = dados;
  return dados;
}

function gravarProcessamento(a) {
  gravarArmazenado(CHAVE_PROCESSAMENTO + a.nome, processamentoDe(a));
}

const somaFaltas = (faltas) => Object.values(faltas).reduce((t, n) => t + n, 0);

// Altura do primeiro painel desenvolvido (pacotes e repetições) e o tempo de uma peça com a velocidade do corpo.
function alturaDesenvolvida(a) {
  const todos = RM.paineis(blocosDeOpcao(a));
  const p = todos.find((q) => q.R && q.x0 !== null);
  if (!p) return null;
  const res = desenvolvidoDe(a, p, todos, true);
  const m = RM.areaDeMalha(a.doc, p);
  return { p, carreiras: res.painel.carreiras, compactadas: p.y1 - p.y0 + 1, agulhas: m ? m.x1 - m.x0 + 1 : p.x1 - p.x0 + 1 };
}

function tempoDoProcessamento(a, alt) {
  if (!alt) return null;
  const d = processamentoDe(a);
  return RM.tempoTecimento({ carreiras: alt.carreiras, agulhas: alt.agulhas, pecas: 1, finura: d.finura, velocidade: d.velocidade.corpo });
}

// Resumo em texto (para baixar ou ir no .zip da ficha).
function resumoDoProcessamento(a) {
  const blocos = blocosDeOpcao(a);
  const linhas = RM.linhasDoProcessamento(a.nome, processamentoDe(a), RM.usoDoProcessamento(a.doc, blocos), repeticoesDe(a));
  const alt = alturaDesenvolvida(a);
  if (alt) {
    linhas.push("", `ALTURA: painel ${alt.p.numero} desenvolvido com ${alt.carreiras} carreiras (${alt.compactadas} no desenho), ${alt.agulhas} agulhas tecendo`);
    const s = tempoDoProcessamento(a, alt);
    linhas.push(s === null ? "Tempo estimado: falta a finura ou a velocidade do corpo" : `Tempo estimado por peça: ${formatarTempo(s)} (só a passagem do carro)`);
  }
  return linhas;
}

function abrirProcessar(passo = 0) {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const uso = RM.usoDoProcessamento(a.doc, blocosDeOpcao(a));
  const dados = processamentoDe(a);
  // Cada guia da R3 começa com o mesmo número e uma cor própria; o fio fica para preencher.
  for (const u of uso.guias) dados.guias[u.valor] = { guia: String(u.valor), fio: "", cor: corPadraoDoGuia(u.valor), lado: "E", ...(dados.guias[u.valor] || {}) };
  if (proc) clearTimeout(proc.timer);
  proc = { a, uso, dados, passo: limitar(passo, 0, RM.PASSOS_PROCESSAMENTO.length - 1), log: null, rodando: false, timer: 0 };
  abrirJanela("dlg-processar");
  desenharProcessar();
}

const faltasProc = () => RM.faltasDoProcessamento(proc.dados, proc.uso, repeticoesDe(proc.a));

// Quantos valores cada passo pede (para dizer "nada a preencher").
function itensDoPasso(id) {
  const { uso } = proc;
  return { maquina: 2, guias: uso.guias.length * 2, economizador: uso.blocosR2.length, puxador: uso.trechos.length, ponto: uso.pontos.length * 2, velocidade: uso.trechos.length, gerar: 1 }[id];
}

function desenharPassosProc() {
  const faltas = faltasProc();
  const total = somaFaltas(faltas);
  $("processar-passos").innerHTML = RM.PASSOS_PROCESSAMENTO.map((s, i) => {
    let classe, info;
    if (s.id === "gerar") {
      classe = proc.rodando ? "rodando" : proc.log && !total ? "ok" : total ? "falta" : "";
      info = proc.rodando ? "processando…" : proc.log ? (total ? `processado; faltam ${total}` : "resumo pronto") : total ? `faltam ${total} valores` : "pronto para processar";
    } else if (!itensDoPasso(s.id)) {
      classe = "ok";
      info = "nada a preencher";
    } else {
      classe = faltas[s.id] ? "falta" : "ok";
      info = faltas[s.id] ? `falta${faltas[s.id] > 1 ? "m" : ""} ${faltas[s.id]}` : "completo";
    }
    return `<li><button type="button" class="passo-proc ${classe}" data-ir-passo="${i}"${i === proc.passo ? ' aria-current="step"' : ""}>
      <span class="marca-passo" aria-hidden="true">${classe === "ok" ? "✓" : i + 1}</span><span class="nome-passo">${esc(s.nome)}</span><span class="info-passo">${esc(info)}</span></button></li>`;
  }).join("");
}

// Onde o valor aparece, uma linha por painel (já escapado para o HTML).
const ondeUsado = (u) => `<span class="suave pequeno onde-usado">${u.onde.map((o) => esc(`painel ${o.painel}: ${o.carreiras}`)).join("<br>")}</span>`;

function conteudoMaquina() {
  const { a, dados } = proc;
  const lista = RM.paineis(blocosDeOpcao(a));
  const usadas = new Set();
  lista.forEach((p) => linhasUsadas(a, p).forEach((id) => usadas.add(id)));
  const ordem = (x) => (x[0] === "L" ? 0 : 100) + Number(x.slice(1));
  const trechos = proc.uso.trechos.map((t) => `${t.nome} ${t.de === t.ate ? t.de : `${t.de}–${t.ate}`}`).join(" · ");
  const comMalha = lista.filter((p) => p.x0 !== null).map((p) => `${p.numero} (agulhas ${p.x0 + 1}–${p.x1 + 1})`);
  const info = [
    ["Desenho", `${a.doc.largura} × ${a.doc.altura} pontos`],
    ["Painéis", comMalha.length ? comMalha.join(", ") : String(lista.length)],
    ["Linhas usadas", [...usadas].sort((x, y) => ordem(x) - ordem(y)).join(", ") || "nenhuma"],
    ["Trechos", trechos || "—"],
  ];
  return `<div class="linha-campos">
      <label class="campo">Máquina <input type="text" data-proc="maquina" list="proc-maquinas" maxlength="40" value="${esc(dados.maquina ?? "")}" autocomplete="off"></label>
      <label class="campo">Finura <select data-proc="finura"><option value="">—</option>${RM.FINURAS.map(
        (f) => `<option value="${f}"${String(dados.finura) === String(f) ? " selected" : ""}>${f}G</option>`,
      ).join("")}</select></label>
    </div>
    <datalist id="proc-maquinas">${RM.MAQUINAS.map((m) => `<option value="${esc(m)}"></option>`).join("")}</datalist>
    <dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

function conteudoGuias() {
  const { uso, dados } = proc;
  if (!uso.guias.length) return `<p class="suave">A R3 não tem valores: não há guia-fio para configurar.</p>`;
  return `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>R3</th><th>Guia-fio</th><th>Fio</th><th>Cor</th><th>Entra pela</th></tr></thead><tbody>${uso.guias
    .map((u) => {
      const g = dados.guias[u.valor] || {};
      const cor = corValida(g.cor) ? g.cor : corPadraoDoGuia(u.valor);
      return `<tr><td class="mono"><span class="ponto-guia" style="background:${cor}"></span>${u.valor}<br>${ondeUsado(u)}</td>
        <td><input type="number" min="1" max="32" data-g="${u.valor}" data-campo="guia" value="${esc(g.guia ?? "")}" aria-label="Guia-fio da R3 ${u.valor}"></td>
        <td><input type="text" maxlength="40" data-g="${u.valor}" data-campo="fio" value="${esc(g.fio ?? "")}" placeholder="ex.: algodão 2/30" autocomplete="off" aria-label="Fio da R3 ${u.valor}"></td>
        <td><input type="color" data-g="${u.valor}" data-campo="cor" value="${cor}" aria-label="Cor do fio da R3 ${u.valor}"></td>
        <td><select data-g="${u.valor}" data-campo="lado" aria-label="Lado por onde entra o guia da R3 ${u.valor}"><option value="E"${g.lado !== "D" ? " selected" : ""}>esquerda</option><option value="D"${
          g.lado === "D" ? " selected" : ""
        }>direita</option></select></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function conteudoEconomizador() {
  const { a, uso } = proc;
  if (!uso.blocosR2.length) return `<p class="suave">A R2 não marca blocos de repetição.</p>`;
  const reps = repeticoesDe(a);
  return `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>Painel</th><th>Carreiras</th><th>R2</th><th>Repete (vezes)</th></tr></thead><tbody>${uso.blocosR2
    .map(
      (b) => `<tr><td class="mono">${b.painel}</td><td class="mono">${b.de}–${b.ate}</td><td class="mono">${esc(b.valor)}</td>
      <td><input type="number" min="1" max="9999" data-rep-painel="${b.painel}" data-rep-chave="${b.chave}" value="${esc((reps[b.painel] || {})[b.chave] ?? "")}" placeholder="vezes" aria-label="Vezes que as carreiras ${b.de} a ${b.ate} do painel ${b.painel} se repetem"></td></tr>`,
    )
    .join("")}</tbody></table></div>
    <p class="pequeno" id="processar-altura">${textoAlturaProc()}</p>
    <div class="controles"><button type="button" class="botao pequeno" data-abrir="desenvolver">Ver em Pacotes e altura…</button></div>`;
}

function textoAlturaProc() {
  const alt = alturaDesenvolvida(proc.a);
  return alt ? `Painel ${alt.p.numero} desenvolvido: <strong>${alt.carreiras.toLocaleString("pt-BR")}</strong> carreiras (${alt.compactadas} no desenho), com os pacotes escolhidos.` : "";
}

function conteudoPorTrecho(id) {
  const { uso, dados } = proc;
  if (!uso.trechos.length) return `<p class="suave">Sem painel com as linhas de opção R.</p>`;
  const ehPuxador = id === "puxador";
  const atributo = ehPuxador ? "data-pux" : "data-vel";
  const limites = ehPuxador ? 'min="0" max="200" step="1" placeholder="ex.: 40"' : 'min="0.05" max="2" step="0.05" placeholder="ex.: 0,6"';
  return `<table class="tabela"><thead><tr><th>Trecho</th><th>Carreiras</th><th>${ehPuxador ? "Puxador" : "Velocidade (m/s)"}</th></tr></thead><tbody>${uso.trechos
    .map(
      (t) => `<tr><td><span class="ponto-guia" style="background:${corDaParte(t.nome)}"></span>${esc(t.nome)}</td><td class="mono">${t.de === t.ate ? t.de : `${t.de}–${t.ate}`}</td>
      <td><input type="number" ${limites} ${atributo}="${t.id}" value="${esc(dados[id][t.id] ?? "")}" aria-label="${ehPuxador ? "Puxador" : "Velocidade"} no trecho ${esc(t.nome)}"></td></tr>`,
    )
    .join("")}</tbody></table>
    <div class="controles"><button type="button" class="botao pequeno" data-copiar="${id}">Usar o primeiro valor nos trechos vazios</button></div>`;
}

function conteudoPonto() {
  const { uso, dados } = proc;
  if (!uso.pontos.length) return `<p class="suave">A R6 não tem valores: não há ponto para configurar.</p>`;
  return `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>R6</th><th>Frente</th><th>Atrás</th></tr></thead><tbody>${uso.pontos
    .map((u) => {
      const p = dados.pontos[u.valor] || {};
      return `<tr><td class="mono">${u.valor}<br>${ondeUsado(u)}</td>
        <td><input type="number" min="0" max="999" data-pt="${u.valor}" data-lado="f" value="${esc(p.f ?? "")}" placeholder="ex.: 45" aria-label="Ponto da frente da R6 ${u.valor}"></td>
        <td><input type="number" min="0" max="999" data-pt="${u.valor}" data-lado="t" value="${esc(p.t ?? "")}" placeholder="ex.: 45" aria-label="Ponto de trás da R6 ${u.valor}"></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function conteudoGerar() {
  const faltas = faltasProc();
  const pendentes = RM.PASSOS_PROCESSAMENTO.map((s, i) => ({ s, i })).filter(({ s }) => faltas[s.id]);
  const situacao = pendentes.length
    ? `<p class="alerta">Faltam valores em ${pendentes.length} passo${pendentes.length === 1 ? "" : "s"}:</p><div class="controles">${pendentes
        .map(({ s, i }) => `<button type="button" class="botao pequeno" data-ir-passo="${i}">${esc(s.nome)} (${faltas[s.id]})</button>`)
        .join("")}</div>`
    : `<p class="ok-texto">Todos os passos estão preenchidos.</p>`;
  const log = proc.log
    ? `<ul class="log-processamento" aria-live="polite">${proc.log.map((l) => `<li class="${l.nivel === "ok" ? "ok-texto" : l.nivel === "alerta" ? "alerta" : ""}">${esc(l.texto)}</li>`).join("")}</ul>`
    : `<p class="suave pequeno">Aperte Processar para conferir tudo e montar o resumo.</p>`;
  return situacao + log;
}

const CONTEUDO_PASSO = {
  maquina: conteudoMaquina,
  guias: conteudoGuias,
  economizador: conteudoEconomizador,
  puxador: () => conteudoPorTrecho("puxador"),
  ponto: conteudoPonto,
  velocidade: () => conteudoPorTrecho("velocidade"),
  gerar: conteudoGerar,
};

function desenharProcessar() {
  const s = RM.PASSOS_PROCESSAMENTO[proc.passo];
  desenharPassosProc();
  $("processar-titulo").textContent = `${proc.passo + 1}. ${s.nome}`;
  $("processar-explica").textContent = EXPLICA_PASSOS[s.id];
  $("processar-conteudo").innerHTML = CONTEUDO_PASSO[s.id]();
  const form = $("dlg-processar").querySelector("form");
  form.querySelector('[data-passo="-1"]').disabled = proc.passo === 0;
  form.querySelector('[data-passo="1"]').disabled = proc.passo === RM.PASSOS_PROCESSAMENTO.length - 1;
  $("processar-rodar").disabled = proc.rodando;
}

// Confere passo a passo, como a máquina leria, e mostra as linhas uma a uma (de uma vez com menos movimento).
function rodarProcessamento() {
  if (!proc || proc.rodando) return;
  const { a, uso, dados } = proc;
  const faltas = faltasProc();
  const linhas = [];
  const linha = (nivel, texto) => linhas.push({ nivel, texto });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const nPaineis = RM.paineis(blocosDeOpcao(a)).length;
  linha("", `Lendo ${a.nome}: ${a.doc.largura} × ${a.doc.altura} pontos, ${plural(nPaineis, "painel", "painéis")}.`);
  if (!uso.trechos.length) linha("alerta", "Sem as linhas de opção R1–R20 ao lado de um painel: não há guia-fio, ponto nem trechos para processar.");
  linha(faltas.maquina ? "alerta" : "ok", `Máquina: ${dados.maquina || "sem máquina"} · ${dados.finura ? `finura ${dados.finura}G` : "sem finura"}.`);
  linha(faltas.guias ? "alerta" : "ok", `Guia-fios: ${plural(uso.guias.length, "valor", "valores")} na R3${faltas.guias ? `, faltam ${faltas.guias} campos (guia ou fio)` : ", todos com guia e fio"}.`);
  linha(faltas.economizador ? "alerta" : "ok", `Economizador: ${plural(uso.blocosR2.length, "bloco", "blocos")} na R2${faltas.economizador ? `, ${faltas.economizador} sem repetições` : ""}.`);
  linha(faltas.puxador ? "alerta" : "ok", `Puxador: ${plural(uso.trechos.length, "trecho", "trechos")}${faltas.puxador ? `, ${faltas.puxador} sem valor` : ", todos com valor"}.`);
  linha(faltas.ponto ? "alerta" : "ok", `Ponto: ${plural(uso.pontos.length, "valor", "valores")} na R6${faltas.ponto ? `, faltam ${faltas.ponto} campos (frente ou atrás)` : ", todos com frente e atrás"}.`);
  linha(faltas.velocidade ? "alerta" : "ok", `Velocidade: ${plural(uso.trechos.length, "trecho", "trechos")}${faltas.velocidade ? `, ${faltas.velocidade} sem valor` : ", todos com valor"}.`);
  const alt = alturaDesenvolvida(a);
  if (alt) linha("", `Painel ${alt.p.numero} desenvolvido: ${alt.carreiras.toLocaleString("pt-BR")} carreiras (${alt.compactadas} no desenho) e ${alt.agulhas} agulhas tecendo.`);
  const s = tempoDoProcessamento(a, alt);
  if (s !== null) linha("", `Tempo estimado: ${formatarTempo(s)} por peça, só a passagem do carro.`);
  else if (alt) linha("alerta", "Tempo: falta a finura ou a velocidade do corpo para estimar.");
  const total = somaFaltas(faltas);
  if (total) linha("alerta", `Faltam ${total} valores: complete os passos marcados antes de levar à máquina.`);
  else linha("ok", "Pronto: baixe o resumo e use estes valores no KnitPaint para gerar o .000 e o .QFD.");
  proc.passo = RM.PASSOS_PROCESSAMENTO.length - 1;
  const parado = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (parado) {
    proc.log = linhas;
    desenharProcessar();
    return;
  }
  proc.log = [];
  proc.rodando = true;
  const proxima = () => {
    if (!proc) return;
    proc.log.push(linhas[proc.log.length]);
    proc.rodando = proc.log.length < linhas.length;
    desenharProcessar();
    if (proc.rodando) proc.timer = setTimeout(proxima, 170);
  };
  proxima();
}

{
  const form = $("dlg-processar").querySelector("form");
  $("processar-conteudo").addEventListener("input", (e) => {
    if (!proc || proc.rodando) return;
    const t = e.target, d = proc.dados;
    if (t.dataset.proc) d[t.dataset.proc] = t.value;
    else if (t.dataset.g) {
      d.guias[t.dataset.g] = { ...(d.guias[t.dataset.g] || {}), [t.dataset.campo]: t.value };
      if (t.dataset.campo === "cor") t.closest("tr").querySelector(".ponto-guia").style.background = t.value;
    } else if (t.dataset.pt) d.pontos[t.dataset.pt] = { ...(d.pontos[t.dataset.pt] || {}), [t.dataset.lado]: t.value };
    else if (t.dataset.pux) d.puxador[t.dataset.pux] = t.value;
    else if (t.dataset.vel) d.velocidade[t.dataset.vel] = t.value;
    else if (t.dataset.repChave) {
      const todas = repeticoesDe(proc.a);
      const painel = t.dataset.repPainel;
      todas[painel] = { ...(todas[painel] || {}) };
      if (String(t.value).trim() === "") delete todas[painel][t.dataset.repChave];
      else todas[painel][t.dataset.repChave] = inteiro(t.value, 1, 1, 9999);
      gravarArmazenado(CHAVE_REPETICOES + proc.a.nome, todas);
      const el = $("processar-altura");
      if (el) el.innerHTML = textoAlturaProc();
    } else return;
    if (!t.dataset.repChave) gravarProcessamento(proc.a);
    proc.log = null; // o que foi processado antes já não vale
    desenharPassosProc();
  });
  $("processar-conteudo").addEventListener("click", (e) => {
    if (!proc || proc.rodando) return;
    const abrir = e.target.closest("[data-abrir]");
    if (abrir) {
      if (!mesmaAba(proc)) return;
      $("dlg-processar").close();
      RECURSOS[abrir.dataset.abrir]();
      return;
    }
    const ir = e.target.closest("[data-ir-passo]");
    if (ir) {
      proc.passo = Number(ir.dataset.irPasso);
      desenharProcessar();
      return;
    }
    const copiar = e.target.closest("[data-copiar]");
    if (copiar) {
      const id = copiar.dataset.copiar, valores = proc.dados[id];
      const primeiro = proc.uso.trechos.map((t) => valores[t.id]).find((v) => String(v ?? "").trim() !== "");
      if (primeiro === undefined) return avisar("Escreva o valor de pelo menos um trecho.");
      proc.uso.trechos.forEach((t) => {
        if (String(valores[t.id] ?? "").trim() === "") valores[t.id] = primeiro;
      });
      gravarProcessamento(proc.a);
      proc.log = null;
      desenharProcessar();
    }
  });
  $("processar-passos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir-passo]");
    if (!b || !proc || proc.rodando) return;
    proc.passo = Number(b.dataset.irPasso);
    desenharProcessar();
  });
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-passo]");
    if (!b || !proc || proc.rodando) return;
    proc.passo = limitar(proc.passo + Number(b.dataset.passo), 0, RM.PASSOS_PROCESSAMENTO.length - 1);
    desenharProcessar();
  });
  $("processar-rodar").addEventListener("click", rodarProcessamento);
  $("processar-txt").addEventListener("click", () => {
    if (!proc) return;
    const linhas = resumoDoProcessamento(proc.a);
    baixar(new Blob([linhas.join("\r\n") + "\r\n"], { type: "text/plain" }), trocarExtensao(proc.a.nome, "_PROCESSAMENTO.txt"));
  });
  $("dlg-processar").addEventListener("close", () => {
    if (proc) clearTimeout(proc.timer);
    proc = null; // não segura a aba depois de fechar
  });
}

// ------------------------------------------------------------------ ficha técnica

const CHAVE_FICHA = "editor-shima-ficha:";
const ROTULOS_FICHA = { codigo: "Código", descricao: "Descrição", maquina: "Máquina", tempo: "Tempo de tecimento", fio: "Fio", bruto: "Peso bruto", liquido: "Peso líquido", data: "Data" };
const TIPOS_ARQUIVO = { dat: "desenho", programa: "programa", ajustes: "ajustes", imagem: "imagem" };
let ficha = null;

// Guia-fios usados na R3 de todos os painéis.
function guiasDoDesenho(a) {
  const d = a.doc;
  const vistos = new Set();
  for (const b of blocosDeOpcao(a)) {
    if (b.lado !== "R" || !b.colunas[3]) continue;
    for (let y = b.carreiraInicio; y <= b.carreiraFim; y++) RM.valoresDaLinha(d, b, 3, y).forEach((v) => vistos.add(v));
  }
  return [...vistos].sort((x, y) => x - y);
}

// Nome sem extensão, sem acento e em maiúsculas, para achar os arquivos que andam juntos (.dat, .000, .QFD).
const baseDoNome = (nome) => RM.semAcento(trocarExtensao(nome, ""));

function abrirFicha() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const contagem = contarCores(a.doc);
  const base = trocarExtensao(a.nome, "");
  const pd = processamentoDe(a);
  const alt = alturaDesenvolvida(a);
  const padrao = {
    campos: {
      codigo: base,
      descricao: base.replace(/_/g, " "),
      maquina: pd.maquina ? `${pd.maquina}${pd.finura ? ` ${pd.finura}G` : ""}` : "",
      tempo: "",
      fio: "",
      bruto: "",
      liquido: "",
      data: new Date().toLocaleDateString("pt-BR"),
    },
    corTexto: contagem[232] ? 232 : estado.primaria,
    corFundo: estado.fundo,
    escala: 1,
    tempo: {
      carreiras: alt ? alt.carreiras : a.doc.altura,
      agulhas: alt ? alt.agulhas : a.doc.largura,
      pecas: 1,
      finura: Number(pd.finura) || 7,
      velocidade: pd.velocidade.corpo ?? "",
      sobra: "",
    },
  };
  const salvo = lerArmazenado(CHAVE_FICHA + a.nome, {});
  // Os fios de cada guia ficam no processamento (processamentoDe já trouxe os que estavam aqui).
  if (salvo.fios && Object.keys(salvo.fios).length) gravarProcessamento(a);
  delete salvo.fios;
  ficha = {
    a,
    guias: guiasDoDesenho(a),
    erros: null,
    dados: { ...padrao, ...salvo, campos: { ...padrao.campos, ...(salvo.campos || {}) }, tempo: { ...padrao.tempo, ...(salvo.tempo || {}) } },
  };
  const v = ficha.dados;
  $("ficha-campos").innerHTML = RM.CAMPOS_FICHA.map(
    ([id]) => `<label class="campo">${ROTULOS_FICHA[id]} <input type="text" maxlength="60" data-campo="${id}" value="${esc(v.campos[id] || "")}" autocomplete="off"></label>`,
  ).join("");
  $("ficha-guias").innerHTML = ficha.guias.length
    ? ficha.guias
        .map((g) => {
          const fisico = guiaDaMaquina(pd, g);
          return `<label class="campo">Guia ${esc(fisico)}${String(fisico) !== String(g) ? ` (R3 ${g})` : ""} <input type="text" maxlength="40" data-fio="${g}" value="${esc(
            (pd.guias[g] || {}).fio || "",
          )}" placeholder="ex.: algodão 2/30" autocomplete="off"></label>`;
        })
        .join("")
    : `<p class="suave pequeno">Nenhum guia-fio na R3 deste desenho.</p>`;
  const form = $("dlg-ficha").querySelector("form");
  for (const k of Object.keys(v.tempo)) if (form[`t-${k}`]) form[`t-${k}`].value = v.tempo[k];
  form.corTexto.value = v.corTexto;
  form.corFundo.value = v.corFundo;
  form.escala.value = String(v.escala);
  desenharArquivosFicha();
  abrirJanela("dlg-ficha");
  desenharFicha();
  desenharChecklist();
}

// Número do guia-fio na máquina para o valor g da R3 (o do processamento ou, sem ele, o próprio g).
const guiaDaMaquina = (pd, g) => (pd.guias[g] && String(pd.guias[g].guia ?? "").trim()) || g;

function imagemDaFicha() {
  const v = ficha.dados;
  const pd = processamentoDe(ficha.a);
  const linhas = RM.linhasDaFicha(v.campos, ficha.guias.map((g) => ({ guia: guiaDaMaquina(pd, g), fio: (pd.guias[g] || {}).fio || "" })));
  return { linhas, img: RM.textoEmPixels(linhas, { cor: v.corTexto, fundo: v.corFundo, escala: v.escala, margem: 1 }) };
}

function tempoDaFicha() {
  const t = ficha.dados.tempo;
  return RM.tempoTecimento({ carreiras: t.carreiras, agulhas: t.agulhas, pecas: t.pecas, finura: t.finura, velocidade: t.velocidade, sobra: t.sobra });
}

function desenharFicha() {
  const { a, dados } = ficha;
  const { img } = imagemDaFicha();
  const cv = $("ficha-previa");
  pintarPixels(cv, img, corDaPaleta(a.doc), zoomQueCabeEm(img.w, img.h, larguraUtil(cv, 440), 360, 4));
  const sel = a.selecao;
  $("ficha-tamanho").textContent = `A ficha ocupa ${img.w} agulhas × ${img.h} carreiras.${
    sel ? ` A seleção tem ${sel.w} × ${sel.h}: a ficha entra no canto de cima dela.` : " Selecione onde ela vai antes de abrir, ou posicione depois de escrever."
  }`;
  const s = tempoDaFicha();
  const pecas = Math.max(1, inteiro(dados.tempo.pecas, 1, 1, 100));
  $("ficha-tempo").textContent =
    s === null
      ? "Preencha carreiras, agulhas e a velocidade do carro para estimar."
      : `${formatarTempo(s)} para ${pecas === 1 ? "1 peça" : `${pecas} peças`}: só a passagem do carro, sem transferências, trocas de guia e paradas.`;
  $("ficha-usar-tempo").disabled = s === null;
}

function gravarFicha() {
  const { a, dados } = ficha;
  gravarArmazenado(CHAVE_FICHA + a.nome, dados);
}

// Arquivos abertos que podem ir no .zip; já vêm marcados o desenho e os que têm o mesmo nome (.000, .QFD...).
function desenharArquivosFicha() {
  const { a } = ficha;
  const base = baseDoNome(a.nome);
  $("ficha-arquivos").innerHTML = estado.abas
    .map((x) => {
      const marcado = x === a || baseDoNome(x.nome) === base;
      return `<li><label><input type="checkbox" data-arquivo="${x.id}"${marcado ? " checked" : ""}><span class="nome-arquivo">${esc(x.nome)}${
        x.modificado ? ' <span class="suave">(alterado)</span>' : ""
      }</span><span class="suave mono">${esc(TIPOS_ARQUIVO[x.tipo] || x.tipo)}</span></label></li>`;
    })
    .join("");
}

// Junta os arquivos escolhidos (o desenho como está agora) e, se pedido, a ficha e o resumo do processamento.
async function baixarZipDaFicha() {
  if (!ficha) return;
  const { a } = ficha;
  const form = $("dlg-ficha").querySelector("form");
  const escolhidas = [...$("ficha-arquivos").querySelectorAll("[data-arquivo]:checked")]
    .map((el) => estado.abas.find((x) => x.id === Number(el.dataset.arquivo)))
    .filter(Boolean);
  if (!escolhidas.length && !form.zipResumo.checked) return avisar("Marque pelo menos um arquivo para o .zip.");
  const arquivos = [];
  const usados = new Set();
  const nomeLivre = (nome) => {
    let n = nome;
    for (let k = 2; usados.has(n.toUpperCase()); k++) n = nome.replace(/(\.[^.]*)?$/, (ext) => `_${k}${ext}`);
    usados.add(n.toUpperCase());
    return n;
  };
  try {
    for (const x of escolhidas) {
      let bytes = null;
      if (x.tipo === "dat") bytes = bytesDoDesenho(x);
      else if (x.aberto && x.aberto.bytes) bytes = x.aberto.bytes;
      else if (x.aberto && x.aberto.url) bytes = new Uint8Array(await (await fetch(x.aberto.url)).arrayBuffer());
      if (bytes) arquivos.push({ nome: nomeLivre(x.nome), bytes });
    }
  } catch (erro) {
    return avisar(`Não foi possível juntar os arquivos: ${erro.message}`, true);
  }
  if (form.zipResumo.checked) {
    const texto = (linhas) => new TextEncoder().encode(linhas.join("\r\n") + "\r\n");
    arquivos.push({ nome: nomeLivre(trocarExtensao(a.nome, "_FICHA.txt")), bytes: texto(imagemDaFicha().linhas) });
    arquivos.push({ nome: nomeLivre(trocarExtensao(a.nome, "_PROCESSAMENTO.txt")), bytes: texto(resumoDoProcessamento(a)) });
  }
  const nome = trocarExtensao(a.nome, "_MAQUINA.zip");
  const entregue = await baixar(new Blob([zipComArquivos(arquivos)], { type: "application/zip" }), nome);
  if (entregue) avisar(`${entregue} com ${arquivos.length} arquivo${arquivos.length === 1 ? "" : "s"}: extraia e copie para o pendrive da máquina.`);
}

// O que conferir antes de levar à máquina, com o que falta e onde resolver.
function itensAntesDeTecer() {
  const { a } = ficha;
  const blocos = blocosDeOpcao(a);
  if (ficha.erros === null) ficha.erros = RM.verificarDesenho(a.doc, blocos, {}).filter((i) => i.nivel === "erro").length;
  const uso = RM.usoDoProcessamento(a.doc, blocos);
  const pd = processamentoDe(a);
  const total = somaFaltas(RM.faltasDoProcessamento(pd, uso, repeticoesDe(a)));
  const preenchido = (v) => String(v ?? "").trim() !== "";
  const semFio = uso.guias.filter((u) => !preenchido((pd.guias[u.valor] || {}).fio)).map((u) => u.valor);
  const c = ficha.dados.campos;
  const vazios = ["codigo", "descricao", "maquina", "fio"].filter((k) => !preenchido(c[k])).map((k) => ROTULOS_FICHA[k].toLowerCase());
  const base = baseDoNome(a.nome);
  const junto = (tipo) => estado.abas.some((x) => x.tipo === tipo && baseDoNome(x.nome) === base);
  const programas = junto("programa") && junto("ajustes");
  const erros = ficha.erros;
  return [
    { ok: !erros, titulo: "Verificação sem erros", detalhe: erros ? `${erros} erro${erros === 1 ? "" : "s"} no Verificar` : "nenhum erro nas regras do Verificar", ir: "verificar", botao: "Verificar…" },
    { ok: !total, titulo: "Processamento completo", detalhe: total ? `faltam ${total} valores` : "todos os passos preenchidos", ir: "processar", botao: "Processar…" },
    { ok: !semFio.length, titulo: "Fio de cada guia-fio", detalhe: semFio.length ? `sem fio: R3 ${semFio.join(", ")} (preencha nesta ficha)` : uso.guias.length ? "todos os guias com fio" : "a R3 não usa guias" },
    { ok: !vazios.length, titulo: "Ficha preenchida", detalhe: vazios.length ? `falta: ${vazios.join(", ")}` : "código, descrição, máquina e fio" },
    { ok: preenchido(c.tempo), titulo: "Tempo de tecimento", detalhe: preenchido(c.tempo) ? c.tempo : "calcule aqui e use no campo TEMPO TEC" },
    { ok: !a.modificado, titulo: "Desenho salvo", detalhe: a.modificado ? "há alterações sem salvar" : "sem alterações pendentes", ir: "salvar", botao: "Salvar" },
    {
      ok: programas,
      titulo: "Programa (.000) e ajustes (.QFD)",
      detalhe: programas ? "abertos, com o mesmo nome do desenho" : "gere no KnitPaint com estes valores, ou abra os da pasta para irem no .zip",
    },
  ];
}

function desenharChecklist() {
  const itens = itensAntesDeTecer();
  $("ficha-check-total").textContent = `${itens.filter((i) => i.ok).length} de ${itens.length}`;
  $("ficha-checklist").innerHTML = itens
    .map(
      (i) => `<li class="${i.ok ? "ok" : "pendente"}"><span class="marca-check" aria-hidden="true">${i.ok ? "✓" : "!"}</span><span><span class="escondido">${
        i.ok ? "Feito:" : "Pendente:"
      } </span>${esc(i.titulo)}<small>${esc(i.detalhe)}</small></span>${!i.ok && i.ir ? `<button type="button" class="botao pequeno" data-ir="${i.ir}">${esc(i.botao)}</button>` : "<span></span>"}</li>`,
    )
    .join("");
}

{
  const form = $("dlg-ficha").querySelector("form");
  form.addEventListener("input", (e) => {
    if (!ficha) return;
    const alvo = e.target;
    const v = ficha.dados;
    if (alvo.dataset.fio) {
      const pd = processamentoDe(ficha.a);
      pd.guias[alvo.dataset.fio] = { ...(pd.guias[alvo.dataset.fio] || {}), fio: alvo.value };
      gravarProcessamento(ficha.a);
    } else {
      if (alvo.dataset.campo) v.campos[alvo.dataset.campo] = alvo.value;
      else if (alvo.name && alvo.name.startsWith("t-")) v.tempo[alvo.name.slice(2)] = alvo.value;
      else if (alvo.name === "corTexto" || alvo.name === "corFundo") v[alvo.name] = numeroCor(alvo.value);
      else if (alvo.name === "escala") v.escala = Number(alvo.value);
      else return;
      gravarFicha();
    }
    desenharFicha();
    desenharChecklist();
  });
  $("ficha-usar-tempo").addEventListener("click", () => {
    const s = ficha && tempoDaFicha();
    if (s === null || !ficha) return;
    ficha.dados.campos.tempo = formatarTempo(s);
    $("ficha-campos").querySelector('[data-campo="tempo"]').value = ficha.dados.campos.tempo;
    gravarFicha();
    desenharFicha();
    desenharChecklist();
  });
  $("ficha-txt").addEventListener("click", () => {
    if (!ficha) return;
    const { linhas } = imagemDaFicha();
    baixar(new Blob([linhas.join("\r\n") + "\r\n"], { type: "text/plain" }), trocarExtensao(ficha.a.nome, "_FICHA.txt"));
  });
  $("ficha-zip").addEventListener("click", baixarZipDaFicha);
  $("ficha-checklist").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir]");
    if (!b || !mesmaAba(ficha)) return;
    const ir = b.dataset.ir;
    $("dlg-ficha").close();
    if (ir === "salvar") salvar();
    else RECURSOS[ir]();
  });
  $("ficha-escrever").addEventListener("click", () => {
    if (!mesmaAba(ficha)) return;
    const { a, dados } = ficha;
    const { img } = imagemDaFicha();
    $("dlg-ficha").close();
    if (a.selecao && form.limpar.checked) {
      salvarHistorico(a);
      preencherArea(a.doc, a.selecao, dados.corFundo);
    }
    colarNoDesenho(a, img, "Ficha como colagem: arraste para posicionar e aperte Enter para fixar.");
    a.flutuante.transparente = null; // o fundo da ficha cobre o que estava embaixo
    renderizar();
  });
}

// ------------------------------------------------------------------ botões do painel e teclas nos diálogos

const RECURSOS = {
  modelo: abrirModelo,
  forma: () => abrirForma(),
  gerar: abrirGerar,
  jacquard: abrirJacquard,
  verificar: abrirVerificar,
  desenvolver: abrirDesenvolver,
  processar: () => abrirProcessar(),
  simular: abrirSimular,
  ficha: abrirFicha,
};

$("painel-dat").addEventListener("click", (e) => {
  const b = e.target.closest("[data-recurso]");
  if (b && abaDat()) RECURSOS[b.dataset.recurso]();
});

// Enter num campo dos diálogos grandes confirma o campo, sem fechar o diálogo.
document.querySelectorAll("dialog.largo").forEach((dlg) =>
  dlg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("input")) return;
    e.preventDefault();
    e.target.dispatchEvent(new Event("change", { bubbles: true }));
  }),
);

// Ao fechar, os diálogos soltam a aba em que estavam (senão ela e o histórico dela ficam na memória).
$("dlg-jacquard").addEventListener("close", () => (jacquard = null));
$("dlg-desenvolver").addEventListener("close", () => (desenv = null));
$("dlg-simular").addEventListener("close", () => {
  cancelAnimationFrame(pedidoSimular);
  pedidoSimular = 0;
  simul = null;
});
$("dlg-ficha").addEventListener("close", () => (ficha = null));

desenharLegendaSimbolos();
