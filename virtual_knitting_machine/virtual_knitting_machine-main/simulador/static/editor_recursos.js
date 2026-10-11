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

// Valores guardados de um desenho (processamento, repetições, pacotes, ficha): por pasta e nome, para dois X.dat de
// pastas diferentes não se misturarem. Também vão para a chave só do nome (a de quem abre o arquivo sem a pasta, e a
// dos valores de antes), junto com a pasta de quem gravou: a aba de outra pasta não pega os valores de lá.
function lerDoDesenho(prefixo, a, padrao) {
  if (a.pastaNome) {
    const proprio = lerArmazenado(`${prefixo}${a.pastaNome}/${a.nome}`, null);
    if (proprio !== null) return proprio;
    const dono = lerArmazenado(`${prefixo}pasta:${a.nome}`, "");
    if (dono && dono !== a.pastaNome) return padrao;
  }
  return lerArmazenado(prefixo + a.nome, padrao);
}

function gravarDoDesenho(prefixo, a, valor) {
  if (a.pastaNome) gravarArmazenado(`${prefixo}${a.pastaNome}/${a.nome}`, valor);
  gravarArmazenado(prefixo + a.nome, valor);
  gravarArmazenado(`${prefixo}pasta:${a.nome}`, a.pastaNome || "");
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
  aba.original = retrato(aba);
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
  } else if (tipo === "transfere") {
    // Seta dupla na vertical: o ponto passa de uma frontura para a outra.
    c.moveTo(X(0.5), Y(0.16));
    c.lineTo(X(0.5), Y(0.84));
    c.moveTo(X(0.34), Y(0.32));
    c.lineTo(X(0.5), Y(0.16));
    c.lineTo(X(0.66), Y(0.32));
    c.moveTo(X(0.34), Y(0.68));
    c.lineTo(X(0.5), Y(0.84));
    c.lineTo(X(0.66), Y(0.68));
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
  ["transfere", "60 70", "transferência"],
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
        (m, i) => `<div class="item-motivo"><button type="button" class="motivo" data-motivo="${i}" aria-pressed="${estado.motivo === m}" title="${esc(m.nome)}: ${m.w} × ${m.h} pontos, códigos ${codigosDoMotivo(m)}">
          <canvas aria-hidden="true"></canvas><span class="nome-motivo">${esc(m.nome)}</span><span class="tamanho-motivo mono">${m.w} × ${m.h} · ${codigosDoMotivo(m, 6)}</span></button>${
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

// Códigos que o motivo usa, em ordem: "1, 2, 61, 71". No cartão vão no máximo `maximo` (o resto é contado).
function codigosDoMotivo(m, maximo = Infinity) {
  const lista = [...new Set(m.px)].sort((x, y) => x - y);
  return lista.length > maximo ? `${lista.slice(0, maximo).join(", ")} e mais ${lista.length - maximo}` : lista.join(", ");
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

// Repete o motivo na seleção ou, sem seleção, no corpo do painel que está na janela (só nas agulhas que tecem).
function repetirMotivoNaSelecao(a) {
  fixarFlutuante(a); // uma colagem solta vira a seleção
  const m = estado.motivo;
  if (!m) return avisar("Escolha um motivo na Biblioteca de pontos.");
  let area = a.selecao, onde = "na seleção";
  if (!area) {
    const corpo = corpoVisivel(a);
    if (!corpo) return avisar("Selecione onde repetir: este desenho não tem um corpo reconhecido pelas linhas de opção (R5 e R6).", true);
    area = corpo.r;
    onde = `no corpo do painel ${corpo.p.numero} (carreiras ${corpo.trecho.de}–${corpo.trecho.ate}, agulhas ${area.x + 1}–${area.x + area.w})`;
  }
  const degraus = $("tipo-repeticao").value === "degraus";
  const deslocamento = degraus ? inteiro($("deslocamento-repeticao").value, 1, -99, 99) : 0;
  const d = a.doc;
  const antes = d.pixels.slice();
  const blocos = blocosDeOpcao(a); // antes de pintar: depois o motivo pode ter apagado as linhas
  salvarHistorico(a);
  RM.repetirMotivo(d.pixels, d.largura, area, m, deslocamento);
  // No corpo, o que não tece (fora da forma, sem seleção) fica como estava; e o motivo nunca entra nas colunas
  // das linhas de opção.
  if (!a.selecao) {
    for (let y = area.y; y < area.y + area.h; y++) {
      for (let x = area.x; x < area.x + area.w; x++) if (!RM.TECE.has(antes[y * d.largura + x])) d.pixels[y * d.largura + x] = antes[y * d.largura + x];
    }
  }
  // As colunas das linhas de opção ficam inteiras como estavam (o editor acha as linhas pela cor de cada coluna).
  for (const b of blocos) {
    for (let y = 0; y < d.altura; y++) d.pixels.set(antes.subarray(y * d.largura + b.xMin, y * d.largura + b.xMax + 1), y * d.largura + b.xMin);
  }
  a.opcoes = null;
  renderizar();
  atualizarPainel();
  const passo = Math.abs(deslocamento) === 1 ? "agulha" : "agulhas";
  avisar(`${m.nome} repetido ${onde}${degraus ? `, andando ${deslocamento} ${passo} a cada fileira` : ""}.`);
}

// ------------------------------------------------------------------ trechos do desenho

const trechosPorBlocos = new WeakMap(); // blocos de linhas de opção → painéis com os trechos de cada um

// Painéis com linhas de opção e os trechos de cada um (início, barra, corpo...), refeitos quando o desenho muda.
function paineisComTrechos(a) {
  const blocos = blocosDeOpcao(a);
  let lista = trechosPorBlocos.get(blocos);
  if (!lista) {
    lista = RM.paineis(blocos)
      .filter((p) => p.R)
      .map((p) => ({ p, trechos: RM.trechosDoPainel(a.doc, p) }));
    trechosPorBlocos.set(blocos, lista);
  }
  return lista;
}

// Trecho do ponto x, y (para a barra de status): "Corpo do painel 1".
function trechoNoPonto(a, x, y) {
  const c = a.doc.altura - y;
  for (const { p, trechos } of paineisComTrechos(a)) {
    if (x < (p.L || p.R).xMin || x > p.R.xMax || y < p.y0 || y > p.y1) continue;
    const t = trechos.find((q) => c >= q.de && c <= q.ate);
    return t ? `${t.nome} do painel ${p.numero}` : "";
  }
  return "";
}

// Corpo do painel que está no meio da janela (ou o mais perto dele): agulhas que tecem × carreiras do corpo.
function corpoVisivel(a) {
  const lista = paineisComTrechos(a).filter(({ p, trechos }) => RM.areaDeMalha(a.doc, p) && trechos.some((t) => t.id === "corpo"));
  if (!lista.length) return null;
  const j = $("janela"), folha = $("folha");
  const v0 = (j.scrollLeft - folha.offsetLeft) / a.zoom, v1 = v0 + j.clientWidth / a.zoom;
  const visivel = ({ p }) => Math.max(0, Math.min(v1, p.x1 + 1) - Math.max(v0, p.x0));
  const { p, trechos } = lista.reduce((melhor, item) => (visivel(item) > visivel(melhor) ? item : melhor));
  const trecho = trechos.find((t) => t.id === "corpo");
  const m = RM.areaDeMalha(a.doc, p);
  const H = a.doc.altura;
  return { p, trecho, r: { x: m.x0, y: H - trecho.ate, w: m.x1 - m.x0 + 1, h: trecho.ate - trecho.de + 1 } };
}

// ------------------------------------------------------------------ uma linha de opção

// Contorno da linha escolhida no desenho, depois que ela foi escolhida (não aparece sozinho ao abrir).
function contornoDaLinha(a) {
  if (!a.linhaMarcada) return null;
  const atual = linhaAtual(a);
  const cols = atual && atual.bloco && atual.bloco.colunas[atual.k];
  if (!cols) return null;
  const b = atual.bloco;
  return { x: Math.min(...cols), y: b.carreiraInicio, w: Math.abs(cols[1] - cols[0]) + 1, h: b.carreiraFim - b.carreiraInicio + 1 };
}

// Escolha feita por quem usa: a linha ganha o contorno no desenho.
function marcarLinha(a) {
  a.linhaMarcada = true;
  atualizarLinhaEscolhida(a);
  posicionarCaixas();
}

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
  R1: "Num manual antigo da Shima, a R1 marca a repetição que fica dentro de outra (economizador). A coluna de dentro costuma alternar 6 e 7 a cada carreira, como a ida e a volta do carro; o valor vai na de fora.",
  R2: "Os blocos desta linha se repetem na máquina: diga quantas vezes em Pacotes e altura ou no Processar. O valor da R2 pode ser só um endereço do bloco, não o número de repetições.",
  R3: "O número é um endereço do guia-fio (até 127 combinações), ajustado no processamento: no Processar, cada número desta linha vira um guia-fio, com o fio, a cor e o lado por onde ele entra.",
  R5: "As carreiras com R5 não tricotam (cancelar malha). Pacotes e altura usa esta linha para achar as carreiras de transferência.",
  R6: "No Processar, cada número desta linha recebe o valor de ponto da frente e de trás. Pacotes e altura usa esta linha para achar a barra e o corpo.",
};

const AJUDA_OUTRA_LINHA =
  "Função não confirmada para esta linha. Racking, velocidade do carro e puxador também são definidos em linhas de opção: confira o número de cada um no manual da sua versão e dê um nome aqui.";

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
  // Sem função conhecida (e sem nome dado pela pessoa), a ajuda lembra que outras funções também usam linhas.
  const ajuda = AJUDA_LINHAS[id] || (nomesLinhas[id] ? "" : AJUDA_OUTRA_LINHA);
  $("opcao-ajuda").textContent = `${id}${nomeAtual ? ` (${nomeAtual})` : ""}: ${usadas.has(id) ? "tem valores neste painel" : "vazia neste painel"}.${ajuda ? ` ${ajuda}` : ""}${
    usadas.has(id) ? " Clique num valor da lista para selecionar as carreiras dele no desenho." : ""
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
  marcarLinha(a);
  $("uma-linha").scrollIntoView({ block: "nearest" });
}

$("opcao-painel").addEventListener("change", (e) => {
  const a = abaDat();
  if (!a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { linha: "R3" }), painel: Number(e.target.value) };
  marcarLinha(a);
});

$("opcao-linha").addEventListener("change", (e) => {
  const a = abaDat();
  if (!a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { painel: 0 }), linha: e.target.value };
  marcarLinha(a);
});

$("opcao-todas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-linha-op]");
  const a = abaDat();
  if (!b || b.disabled || !a) return;
  a.linhaOpcao = { ...(a.linhaOpcao || { painel: 0 }), linha: b.dataset.linhaOp };
  marcarLinha(a);
});

// Na tabela da carreira (Linhas de opção), clicar no nome da linha a escolhe em Uma linha.
$("lista-opcoes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-escolher-linha]");
  const a = abaDat();
  if (!b || !a) return;
  const bloco = blocosDeOpcao(a)[Number(b.dataset.bloco)];
  const id = b.dataset.escolherLinha;
  if (bloco) escolherLinhaDeOpcao(a, { bloco, lado: id[0], numero: Number(id.slice(1)) });
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

// Desde que a pessoa abriu o Modelo ou a Forma, o Verificar mostra os trechos difíceis das peças.
function marcarModeloEmUso() {
  if (modelo.emUso) return;
  modelo.emUso = true;
  gravarArmazenado(CHAVE_MODELO, modelo);
}

function abrirModelo() {
  marcarModeloEmUso();
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
  $("modelo-dica").textContent = r.estilo.dica || "";
  $("modelo-aviso-medidas").textContent =
    r.estilo.id === "painel"
      ? "Os valores de exemplo são os do painel 1 do 00FE_BLS_ESTAMPA_ONÇA (203 × 179 pontos com a amostra de 30 × 40). Troque pelas medidas do seu painel."
      : "Exemplo de tamanho médio. Troque pelas medidas da ficha do cliente.";
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
        <td class="mono">${p.agulhas} × ${p.carreiras}</td><td>${esc(p.detalhe)}${formaOpcoes.ajustes[chaveAjuste(r, p)] ? ' <strong class="ok-texto">Ajustada na Forma.</strong>' : ""}</td>
        <td><button type="button" class="botao pequeno" data-forma="${i}">Forma…</button></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  const escolha = $("dlg-modelo").querySelector("form").esquema;
  esquemaPeca = limitar(esquemaPeca, 0, r.pecas.length - 1);
  trocarHtml(escolha, r.pecas.map((p, i) => `<option value="${i}">${esc(p.nome)}</option>`).join(""));
  escolha.value = String(esquemaPeca);
  desenharEsquema(r);
  atualizarTextosModelo();
}

// A distância entre agulhas pela finura e o desenho aberto medido em cm com a amostra.
function atualizarTextosModelo() {
  const a = abaDat();
  const pasta = a && a.pastaNome ? RM.maquinaDaPasta(a.pastaNome) : { maquina: "", finura: "" };
  const elPasta = $("modelo-pasta");
  elPasta.hidden = !(pasta.maquina || pasta.finura);
  if (!elPasta.hidden) {
    const texto = [pasta.maquina, pasta.finura && `${pasta.finura}G`].filter(Boolean).join(" e ");
    const iguais = (!pasta.maquina || pasta.maquina === modelo.maquina) && (!pasta.finura || Number(pasta.finura) === Number(modelo.finura));
    elPasta.innerHTML = iguais
      ? `${esc(texto)}, como no nome da pasta ${esc(a.pastaNome)}.`
      : `Pelo nome da pasta ${esc(a.pastaNome)}: ${esc(texto)}. <button type="button" class="botao pequeno" id="modelo-usar-pasta">Usar</button>`;
  }
  const f = Number(modelo.finura) || 7;
  $("modelo-passo").textContent = `Na finura ${f}G a distância entre agulhas é de ${(25.4 / f).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mm (25,4 ÷ ${f}).`;
  const el = $("modelo-arquivo");
  const texto = textoDoArquivoAberto();
  el.hidden = !texto;
  el.innerHTML = texto;
}

function textoDoArquivoAberto() {
  const a = abaDat();
  if (!a) return "";
  const lista = RM.paineis(blocosDeOpcao(a)).filter((p) => p.R && p.x0 !== null);
  if (!lista.length) return `<strong>No seu arquivo:</strong> ${esc(a.nome)} não tem painéis com as linhas de opção.`;
  const col = Math.max(0.1, decimal(modelo.colunas, 30)), car = Math.max(0.1, decimal(modelo.carreiras, 40));
  const paineis = lista.map((p) => {
    // Painel ainda sem malha (só 0 e marcas): vale a largura da área de desenho.
    const m = RM.areaDeMalha(a.doc, p) || { x0: p.x0, x1: p.x1 };
    return { p, agulhas: m.x1 - m.x0 + 1, carreiras: p.y1 - p.y0 + 1 };
  });
  const primeiro = paineis[0];
  const alt = alturaDesenvolvida(a);
  const desenvolvido = alt && alt.carreiras !== alt.compactadas ? ` Desenvolvido (${alt.carreiras} carreiras, com os pacotes e as repetições escolhidos), fica com ${cm1((alt.carreiras * 10) / car)} cm de altura.` : "";
  const r2 = RM.usoDoProcessamento(a.doc, blocosDeOpcao(a)).blocosR2;
  const blocos = r2.length
    ? ` A altura final depende de quantas vezes ${r2.length === 1 ? "o bloco" : "os blocos"} da R2 se ${r2.length === 1 ? "repete" : "repetem"}: ${r2
        .map((b) => `carreiras ${b.de}–${b.ate} com R2 = ${esc(b.valor)} no painel ${b.painel}`)
        .join("; ")}.`
    : "";
  return `<strong>No seu arquivo:</strong> ${esc(a.nome)} tem ${paineis
    .map((x) => `o painel ${x.p.numero} com ${x.agulhas} agulhas e ${x.carreiras} carreiras`)
    .join(", ")} (compactados). Com a amostra acima, o painel ${primeiro.p.numero} dá ${cm1((primeiro.agulhas * 10) / col)} cm de largura e ${cm1((primeiro.carreiras * 10) / car)} cm de altura.${desenvolvido}${blocos}`;
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
function esquemaSvg(peca, f, plano, densidade) {
  const cmX = 10 / Math.max(0.1, decimal(densidade.colunas, 30)), cmY = 10 / Math.max(0.1, decimal(densidade.carreiras, 40));
  const { W, H } = plano;
  // Na frente do cardigã aparece também a outra frente (o espelho, tracejada), com as vistas dos botões uma
  // sobre a outra, e a abertura no meio do corpo, da barra até o começo do V.
  const vista = f.meia ? limitar(Math.round(f.vista || 0), 0, Math.floor(W / 2)) : 0;
  const centro = W - vista; // meio do corpo, em agulhas da frente desenhada
  const larguraTotal = f.meia ? 2 * centro : W;
  const k = Math.min(300 / (larguraTotal * cmX), 320 / (H * cmY));
  const mx = 74, mt = 34, mb = 48, mr = 40;
  const sx = cmX * k, sy = cmY * k;
  const X = (x) => mx + x * sx, Y = (c) => mt + (H - c) * sy;
  const vbW = Math.round(mx + larguraTotal * sx + mr), vbH = Math.round(mt + H * sy + mb);
  const ocup = ocupacaoDaForma(plano);
  const partes = [];
  if (f.meia) partes.push(`<path class="contorno-espelho" d="${contornoDaForma(ocup, (x) => X(2 * centro - x), Y)}"/>`);
  partes.push(`<path class="contorno" d="${contornoDaForma(ocup, X, Y)}"/>`);
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
    const xr = X(larguraTotal) + 14;
    linha(xr, Y(de), xr, Y(H));
    linha(xr - 5, Y(de), xr + 5, Y(de));
    linha(xr - 5, Y(H), xr + 5, Y(H));
    const meio = (Y(de) + Y(H)) / 2;
    texto(xr + 16, meio, `${nome} ${cm1((H - de) * cmY)} cm`, ` text-anchor="middle" transform="rotate(-90 ${(xr + 16).toFixed(1)} ${meio.toFixed(1)})"`);
  };
  if (f.tipo === "corpo" && f.meia) {
    lado(H - Math.round(f.cava), "cava");
    // O V começa na primeira carreira em que a borda do meio entra.
    const v0 = ocup.findIndex((r) => r.length && r[r.length - 1][1] + 1 < W);
    if (v0 > 0) {
      linha(X(centro), Y(0), X(centro), Y(v0), "linha-abertura");
      texto(X(centro) - 4, Y(v0 / 2), "abertura", ` class="pequeno" text-anchor="middle" transform="rotate(-90 ${(X(centro) - 4).toFixed(1)} ${Y(v0 / 2).toFixed(1)})"`);
    }
    const gola = Math.max(0, 2 * (Math.round(f.gola) - vista));
    texto(X(centro), mt - 12, `gola V ${cm1(gola * cmX)} cm · ${gola} ag.`, ' text-anchor="middle"');
    texto(X(2 * centro - W / 2), Y(H / 2), "outra frente", ' text-anchor="middle" class="pequeno suave"');
  } else if (f.tipo === "corpo") {
    lado(H - Math.round(f.cava), "cava");
    const gola = Math.round(f.gola);
    texto(X(W / 2), mt - 12, `gola${f.decote === "v" ? " V" : ""} ${cm1(gola * cmX)} cm · ${gola} ag.`, ' text-anchor="middle"');
  } else if (f.tipo === "manga") {
    const copa0 = H - Math.round(f.copa);
    lado(copa0, "copa");
    const r = ocup[Math.max(0, copa0 - 1)];
    if (r && r.length) texto(X(W / 2), Y(copa0) + 16, `${cm1((r[r.length - 1][1] + 1 - r[0][0]) * cmX)} cm`, ' text-anchor="middle"');
  }
  const nome = `${peca.nome}: ${cm1(W * cmX)} × ${cm1(H * cmY)} cm${f.meia ? ", com a outra frente tracejada ao lado" : ""}`;
  return `<svg viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="${esc(`Esquema da peça ${nome}`)}">${partes.join("")}</svg>`;
}

// "Cava de 20 cm (80 carreiras) · ombro de 11 cm (33 agulhas) · barra de 5 cm (20 carreiras)."
function medidasDoEsquema(f, plano) {
  const cmX = 10 / Math.max(0.1, decimal(modelo.colunas, 30)), cmY = 10 / Math.max(0.1, decimal(modelo.carreiras, 40));
  const ag = (n) => `${cm1(n * cmX)} cm (${n} agulha${n === 1 ? "" : "s"})`, ca = (n) => `${cm1(n * cmY)} cm (${n} carreira${n === 1 ? "" : "s"})`;
  const partes = [];
  const barra = Math.round(f.barra || 0);
  if (f.tipo === "corpo") {
    // O arremate final é o dos ombros (dois na peça inteira, um na frente do cardigã).
    const topo = plano.linhas[plano.H - 1].arrem.reduce((t, [p, q]) => t + q - p + 1, 0);
    partes.push(`Cava de ${ca(Math.round(f.cava))}`, `ombro de ${ag(Math.round(topo / (f.meia ? 1 : 2)))}`);
  } else if (f.tipo === "manga") {
    const inicio = plano.linhas[0].segs[0] || plano.linhas[0].arrem[0];
    if (inicio) partes.push(`Punho de ${ag(inicio[1] - inicio[0] + 1)}`);
    partes.push(`copa de ${ca(Math.round(f.copa))}`);
  }
  if (barra > 0) partes.push(`barra de ${ca(barra)}`);
  if (!partes.length) return "";
  const texto = partes.join(" · ");
  return `${texto[0].toUpperCase()}${texto.slice(1)}.`;
}

function desenharEsquema(r = ultimoModelo || calcularModeloAtual()) {
  const peca = r.pecas[limitar(esquemaPeca, 0, r.pecas.length - 1)];
  const forma = formaDaPeca(peca, r);
  const el = $("modelo-esquema");
  const legenda = $("modelo-esquema-legenda");
  if (!(forma.W > 0 && forma.H > 0) || forma.W > 8000 || forma.H > 8000) {
    el.innerHTML = "";
    legenda.textContent = `${peca.nome} ficaria com ${forma.W} agulhas × ${forma.H} carreiras: confira as medidas e a densidade.`;
    return;
  }
  const plano = RM.planoForma(forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca });
  el.innerHTML = esquemaSvg(peca, forma, plano, modelo);
  const qtd = peca.qtd > 1 ? ` (${peca.qtd} peças)` : "";
  const ajustada = formaOpcoes.ajustes[chaveAjuste(r, peca)] ? ", com os ajustes feitos na Forma" : "";
  legenda.textContent = `${peca.nome}${qtd}: ${plano.W} agulhas × ${plano.H} carreiras, desenhada ponto a ponto pela forma e pela densidade da amostra${ajustada}. ${medidasDoEsquema(forma, plano)}`;
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
    atualizarTextosModelo();
  });
  form.finura.addEventListener("change", () => {
    modelo.finura = Number(form.finura.value);
    gravarArmazenado(CHAVE_MODELO, modelo);
    atualizarTextosModelo();
  });
  form.esquema.addEventListener("change", () => {
    esquemaPeca = Number(form.esquema.value);
    desenharEsquema();
  });
  $("modelo-pasta").addEventListener("click", (e) => {
    if (!e.target.closest("#modelo-usar-pasta")) return;
    const a = abaDat();
    const pasta = RM.maquinaDaPasta(a && a.pastaNome);
    if (pasta.maquina) modelo.maquina = pasta.maquina;
    if (pasta.finura) modelo.finura = pasta.finura;
    gravarArmazenado(CHAVE_MODELO, modelo);
    abrirModelo();
    form.maquina.focus(); // o botão sumiu com a nota nova
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
const formaOpcoes = Object.assign({ porVez: 1, marca: 3, vista: "real", zoom: 0, ajustes: {} }, lerArmazenado(CHAVE_FORMA, {}));
formaOpcoes.codigos = { ...CODIGOS_FORMA, ...(formaOpcoes.codigos || {}) };
if (!formaOpcoes.ajustes || typeof formaOpcoes.ajustes !== "object") formaOpcoes.ajustes = {};
let formaPeca = 0;
let formaDestaque = null; // nome do passo da forma destacado na grade
let formaGrade = null; // medidas da última grade desenhada (para ler o ponto debaixo do mouse)
// Cores da grade (no desenho entram os códigos acima).
const CORES_FORMA = [
  ["#CDBB9A", "malha"],
  ["#8C7B55", "barra"],
  ["#E8615F", "arremate"],
  ["#6CB2F0", "malha parcial"],
  ["#F0A73A", "diminuição"],
  ["#7FC98C", "aumento"],
];
const COR_FORMA = Object.fromEntries(CORES_FORMA.map(([cor, nome]) => [nome, cor]));
const ZOOMS_FORMA = [0, 2, 3, 4, 6, 8, 12]; // agulha em pixels na grade; 0 = caber no quadro
const MARGEM_FORMA = { esq: 44, topo: 10, dir: 10, base: 26 };
// Números de cada tipo de forma que dá para ajustar à mão: [campo, nome, unidade].
const CAMPOS_AJUSTE = {
  corpo: [
    ["W", "Largura", "agulhas"],
    ["H", "Altura", "carreiras"],
    ["barra", "Barra", "carreiras"],
    ["cava", "Altura da cava", "carreiras"],
    ["recuo", "Cava: tirar por lado", "agulhas"],
    ["arremCava", "Cava: arremate inicial", "agulhas"],
    ["gola", "Largura da gola", "agulhas"],
    ["golaP", "Fundo da gola", "carreiras"],
    ["arremGola", "Gola: arremate central", "agulhas"],
    ["degraus", "Ombro: degraus", "malha parcial, 1 a cada 2 carreiras"],
  ],
  manga: [
    ["punho", "Punho", "agulhas"],
    ["W", "Largura na cava", "agulhas"],
    ["H", "Altura", "carreiras"],
    ["barra", "Barra do punho", "carreiras"],
    ["copa", "Altura da copa", "carreiras"],
    ["arremCopa", "Copa: arremate inicial", "agulhas"],
    ["topo", "Topo da copa", "agulhas"],
  ],
  painel: [
    ["W", "Largura", "agulhas"],
    ["H", "Altura", "carreiras"],
    ["barra", "Barra", "carreiras"],
  ],
  // Frente do cardigã: a cava fica de um lado só e a gola em V na borda do meio.
  frente: [
    ["W", "Largura da frente", "agulhas (com a vista)"],
    ["H", "Altura", "carreiras"],
    ["barra", "Barra", "carreiras"],
    ["cava", "Altura da cava", "carreiras"],
    ["recuo", "Cava: tirar", "agulhas"],
    ["arremCava", "Cava: arremate inicial", "agulhas"],
    ["gola", "Gola V: tirar no meio", "agulhas"],
    ["golaP", "Fundo da gola", "carreiras"],
    ["degraus", "Ombro: degraus", "malha parcial, 1 a cada 2 carreiras"],
  ],
};
const camposDeAjuste = (forma) => CAMPOS_AJUSTE[forma.meia ? "frente" : forma.tipo] || [];

// A frente do cardigã mudou de forma (antes era a frente inteira): os ajustes velhos dela não valem mais.
const chaveAjuste = (r, peca) => `${r.estilo.id}|${peca.nome}${peca.forma.meia ? "|meia" : ""}`;

// Forma da peça com os números ajustados à mão na Forma (o resto vem das medidas do Modelo).
function formaDaPeca(peca, r = ultimoModelo || calcularModeloAtual()) {
  const ajustes = formaOpcoes.ajustes[chaveAjuste(r, peca)] || {};
  const forma = { ...peca.forma };
  for (const [k, v] of Object.entries(ajustes)) if (k in forma && Number.isFinite(Number(v))) forma[k] = Number(v);
  return forma;
}

function abrirForma(indice = formaPeca) {
  marcarModeloEmUso();
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
  desenharAjustesForma();
  abrirJanela("dlg-forma");
  desenharFormaDialogo();
}

// Campos com os números da peça: mostram o número em uso; os mudados à mão ficam marcados.
function desenharAjustesForma() {
  const r = ultimoModelo || calcularModeloAtual();
  const peca = r.pecas[limitar(formaPeca, 0, r.pecas.length - 1)];
  const ajustes = formaOpcoes.ajustes[chaveAjuste(r, peca)] || {};
  const forma = formaDaPeca(peca, r);
  $("forma-origem").textContent = `Números do Modelo (${r.estilo.nome}, amostra ${modelo.colunas} × ${modelo.carreiras} em 10 cm). Mude aqui para ajustar em agulhas e carreiras.`;
  $("forma-ajustes").innerHTML = camposDeAjuste(peca.forma)
    .map(
      ([k, nome, unidade]) => `<label class="campo${k in ajustes ? " ajustado" : ""}">${esc(nome)}
        <input type="number" min="0" max="8000" step="1" data-ajuste="${k}" value="${esc(forma[k])}" title="Do Modelo: ${esc(peca.forma[k])}">
        <span class="unidade">${esc(unidade)}${k in ajustes ? ` · Modelo: ${esc(peca.forma[k])}` : ""}</span></label>`,
    )
    .join("");
  $("forma-voltar").hidden = !Object.keys(ajustes).length;
}

function planoAtual() {
  const r = ultimoModelo || calcularModeloAtual();
  const peca = r.pecas[limitar(formaPeca, 0, r.pecas.length - 1)];
  const forma = formaDaPeca(peca, r);
  if (forma.W > 8000 || forma.H > 8000) return { peca, forma, plano: null };
  return { peca, forma, plano: RM.planoForma(forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca }) };
}

// O que acontece na agulha x de uma carreira do plano.
function estadoNaForma(row, x) {
  const dentro = (lista) => lista.some(([a, b]) => x >= a && x <= b);
  if (row.marcas.some((m) => m.x === x)) return "marca de diminuição";
  if (row.aumentos.some((m) => m.x === x)) return "aumento";
  if (dentro(row.arrem)) return "arremate";
  if (dentro(row.parcial)) return "malha parcial (agulha parada)";
  if (dentro(row.segs)) return row.barra ? "barra" : "malha";
  return "fora da peça";
}

// De quantos em quantos numerar um eixo para os números não se encostarem.
const passoDoEixo = (tamanho, minimo) => [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((p) => p * tamanho >= minimo) || 5000;

// Grade da peça: cada agulha um quadrinho, na proporção da malha (pela amostra) ou quadrada, com os números
// das carreiras e das agulhas nos eixos e o passo escolhido marcado.
function desenharGradeForma(plano, passo) {
  const cv = $("forma-previa");
  const M = MARGEM_FORMA;
  const razao = formaOpcoes.vista === "grade" ? 1 : Math.max(0.1, decimal(modelo.colunas, 30)) / Math.max(0.1, decimal(modelo.carreiras, 40));
  const caber = Math.min((larguraUtil(cv, 440) - M.esq - M.dir) / plano.W, 460 / (plano.H * razao));
  const dprTela = Math.min(2, window.devicePixelRatio || 1);
  const maximo = 4096 / dprTela; // o canvas não passa de 4.096 pixels da tela de cada lado
  let cw = ZOOMS_FORMA[formaOpcoes.zoom] || caber;
  cw = Math.max(0.05, Math.min(cw, (maximo - M.esq - M.dir) / plano.W, (maximo - M.topo - M.base) / (plano.H * razao)));
  const ch = cw * razao;
  const w = M.esq + plano.W * cw + M.dir, h = M.topo + plano.H * ch + M.base;
  const g = ajustarTela(cv, w, h);
  g.fillStyle = "#0D0F13";
  g.fillRect(0, 0, w, h);
  const yDe = (c) => M.topo + (plano.H - c) * ch;
  // Bordas arredondadas para os pixels da tela: sem isso, com zoom quebrado, aparecem frestas entre as carreiras.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = (v) => Math.round(v * dpr) / dpr;
  // Cada borda sai sempre da mesma conta (pelo número da borda), para duas carreiras vizinhas dividirem a
  // mesma borda: somar ch a uma e multiplicar na outra às vezes arredonda para pixels diferentes.
  const bordaY = (j) => px(M.topo + j * ch), bordaX = (x) => px(M.esq + x * cw);
  const faixa = (x0, x1, c, cor) => {
    const xa = bordaX(x0), xb = bordaX(x1 + 1), ya = bordaY(plano.H - c), yb = bordaY(plano.H - c + 1);
    g.fillStyle = cor;
    g.fillRect(xa, ya, Math.max(1 / dpr, xb - xa), Math.max(1 / dpr, yb - ya));
  };
  plano.linhas.forEach((row, i) => {
    const c = i + 1;
    row.segs.forEach(([a, b]) => faixa(a, b, c, row.barra ? COR_FORMA.barra : COR_FORMA.malha));
    row.parcial.forEach(([a, b]) => faixa(a, b, c, COR_FORMA["malha parcial"]));
    row.arrem.forEach(([a, b]) => faixa(a, b, c, COR_FORMA.arremate));
    row.marcas.forEach((m) => faixa(m.x, m.x, c, COR_FORMA["diminuição"]));
    row.aumentos.forEach((m) => faixa(m.x, m.x, c, COR_FORMA.aumento));
  });
  if (cw >= 4) {
    g.strokeStyle = "rgba(255, 255, 255, 0.1)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= plano.W; x += 10) {
      g.moveTo(M.esq + x * cw + 0.5, M.topo);
      g.lineTo(M.esq + x * cw + 0.5, M.topo + plano.H * ch);
    }
    for (let c = 0; c <= plano.H; c += 10) {
      const y = M.topo + (plano.H - c) * ch + 0.5;
      g.moveTo(M.esq, y);
      g.lineTo(M.esq + plano.W * cw, y);
    }
    g.stroke();
  }
  g.fillStyle = "#9AA1AE";
  g.font = '11px "IBM Plex Mono", monospace';
  g.textAlign = "right";
  g.textBaseline = "middle";
  const passoC = passoDoEixo(ch, 16), passoX = passoDoEixo(cw, 34);
  for (let c = passoC; c <= plano.H; c += passoC) g.fillText(String(c), M.esq - 6, yDe(c) + ch / 2);
  g.textAlign = "center";
  g.textBaseline = "top";
  for (let x = passoX; x <= plano.W; x += passoX) g.fillText(String(x), M.esq + (x - 0.5) * cw, M.topo + plano.H * ch + 6);
  if (passo) {
    const y0 = yDe(passo.ate), y1 = yDe(passo.de) + ch;
    g.fillStyle = "rgba(240, 167, 58, 0.14)";
    g.fillRect(M.esq - 2, y0 - 2, plano.W * cw + 4, y1 - y0 + 4);
    g.strokeStyle = "#F0A73A";
    g.lineWidth = 2;
    g.strokeRect(M.esq - 2, y0 - 2, plano.W * cw + 4, y1 - y0 + 4);
  }
  formaGrade = { plano, cw, ch, caber };
  return { yDe, ch };
}

function desenharFormaDialogo() {
  const { peca, forma, plano } = planoAtual();
  $("forma-novo").disabled = $("forma-colar").disabled = !plano;
  $("forma-previa").hidden = !plano;
  formaGrade = null;
  if (!plano) {
    $("forma-resumo").textContent = `${peca.nome} ficaria com ${forma.W} agulhas × ${forma.H} carreiras; o limite do editor é 8.000. Confira as medidas, a densidade e os ajustes.`;
    $("forma-passos").innerHTML = "";
    return;
  }
  const iDestaque = formaDestaque === null ? -1 : plano.passos.findIndex((s) => s.nome === formaDestaque && s.de !== undefined);
  if (iDestaque < 0) formaDestaque = null;
  const passo = iDestaque >= 0 ? plano.passos[iDestaque] : null;
  const cv = $("forma-previa");
  const { yDe, ch } = desenharGradeForma(plano, passo);
  cv.setAttribute("aria-label", `Grade da peça ${peca.nome} com ${plano.W} agulhas e ${plano.H} carreiras. ${plano.resumo}${passo ? ` Destaque: ${passo.nome}.` : ""}`);
  $("forma-zoom").textContent = formaOpcoes.zoom ? `${ZOOMS_FORMA[formaOpcoes.zoom]} px` : "caber";
  $("forma-vista").querySelectorAll("[data-vista]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === formaOpcoes.vista)));
  $("forma-resumo").textContent = `${peca.nome} · ${plano.W} agulhas × ${plano.H} carreiras. ${plano.resumo}`;
  $("forma-passos").innerHTML = plano.passos
    .map((s, i) => {
      const onde = s.de !== undefined ? ` <span class="onde">${s.de === s.ate ? `carreira ${s.de}` : `carreiras ${s.de}–${s.ate}`}</span>` : "";
      const corpo = `<strong>${esc(s.nome)}</strong>${onde}<br>${esc(s.texto)}`;
      if (s.aviso || s.de === undefined) return `<li${s.aviso ? ' class="passo-aviso"' : ""}>${corpo}</li>`;
      return `<li><button type="button" class="passo-forma" data-passo-forma="${i}" aria-pressed="${i === iDestaque}">${corpo}</button></li>`;
    })
    .join("");
  if (passo) {
    // Rola a grade até as carreiras do passo.
    const quadro = cv.parentElement;
    const meio = (yDe(passo.ate) + yDe(passo.de) + ch) / 2;
    quadro.scrollTop = Math.max(0, meio + 10 - quadro.clientHeight / 2);
  }
}

// Pontos da forma com os códigos escolhidos (barra e aumento usam o código da malha).
function imagemDaForma() {
  const { peca, plano } = planoAtual();
  return { peca, img: plano ? RM.pixelsDaForma(plano, { ...formaOpcoes.codigos }) : null };
}

// Carreira, agulha e estado do ponto debaixo do mouse (ou do dedo) na grade.
function lerPontoDaForma(e) {
  const el = $("forma-status");
  if (!formaGrade) return;
  const { plano, cw, ch } = formaGrade;
  const x = Math.floor((e.offsetX - MARGEM_FORMA.esq) / cw);
  const c = plano.H - Math.floor((e.offsetY - MARGEM_FORMA.topo) / ch);
  el.textContent = x >= 0 && x < plano.W && c >= 1 && c <= plano.H ? `Carreira ${c} · agulha ${x + 1} · ${estadoNaForma(plano.linhas[c - 1], x)}` : "Passe o mouse na grade.";
}

{
  const form = $("dlg-forma").querySelector("form");
  $("forma-passos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-passo-forma]");
    if (!b) return;
    const i = Number(b.dataset.passoForma);
    const { plano } = planoAtual();
    const nome = plano && plano.passos[i] ? plano.passos[i].nome : null;
    formaDestaque = formaDestaque === nome ? null : nome;
    desenharFormaDialogo();
    const novo = $("forma-passos").querySelector(`[data-passo-forma="${i}"]`);
    if (novo) novo.focus();
  });
  $("forma-previa").addEventListener("pointermove", lerPontoDaForma);
  $("forma-previa").addEventListener("pointerdown", lerPontoDaForma);
  $("forma-previa").addEventListener("pointerleave", () => ($("forma-status").textContent = "Passe o mouse na grade."));
  $("forma-vista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vista]");
    if (!b) return;
    formaOpcoes.vista = b.dataset.vista;
    gravarArmazenado(CHAVE_FORMA, formaOpcoes);
    desenharFormaDialogo();
  });
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zoom-forma]");
    if (!b) return;
    const passo = Number(b.dataset.zoomForma);
    if (formaOpcoes.zoom === 0 && passo > 0) {
      // Do "caber" para o primeiro tamanho maior que o de agora (não para um menor).
      const atual = formaGrade ? formaGrade.caber : 0;
      const i = ZOOMS_FORMA.findIndex((z, k) => k > 0 && z > atual);
      if (i < 0) return;
      formaOpcoes.zoom = i;
    } else formaOpcoes.zoom = limitar(formaOpcoes.zoom + passo, 0, ZOOMS_FORMA.length - 1);
    gravarArmazenado(CHAVE_FORMA, formaOpcoes);
    desenharFormaDialogo();
  });
  $("forma-voltar").addEventListener("click", () => {
    const r = ultimoModelo || calcularModeloAtual();
    delete formaOpcoes.ajustes[chaveAjuste(r, r.pecas[limitar(formaPeca, 0, r.pecas.length - 1)])];
    gravarArmazenado(CHAVE_FORMA, formaOpcoes);
    desenharAjustesForma();
    desenharFormaDialogo();
  });
  form.addEventListener("input", (e) => {
    const alvo = e.target;
    if (alvo.dataset.ajuste) {
      // Vazio ou igual ao do Modelo: volta a seguir o Modelo.
      const r = ultimoModelo || calcularModeloAtual();
      const peca = r.pecas[limitar(formaPeca, 0, r.pecas.length - 1)];
      const chave = chaveAjuste(r, peca), k = alvo.dataset.ajuste;
      const ajustes = { ...(formaOpcoes.ajustes[chave] || {}) };
      const v = String(alvo.value).trim();
      if (v === "" || inteiro(v, peca.forma[k], 0, 8000) === peca.forma[k]) delete ajustes[k];
      else ajustes[k] = inteiro(v, peca.forma[k], 0, 8000);
      if (Object.keys(ajustes).length) formaOpcoes.ajustes[chave] = ajustes;
      else delete formaOpcoes.ajustes[chave];
      const campo = alvo.closest(".campo");
      campo.classList.toggle("ajustado", k in ajustes);
      campo.querySelector(".unidade").textContent = `${camposDeAjuste(peca.forma).find((c) => c[0] === k)[2]}${k in ajustes ? ` · Modelo: ${peca.forma[k]}` : ""}`;
      $("forma-voltar").hidden = !Object.keys(ajustes).length;
    } else if (alvo.name === "peca") {
      formaPeca = Number(alvo.value);
      formaDestaque = null;
      desenharAjustesForma();
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
  // Largura em cm vira agulhas pela densidade da amostra no Modelo.
  const w = limitar(Math.round((decimal(form.logoCm.value, 20) * Math.max(0.1, decimal(modelo.colunas, 30))) / 10), 8, 2000);
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
  return { w, h, px, fonte, medias: q.medias };
}

// Sem malha, largura do guia, sem seleção, transferência e o 99 dos arquivos (nada tece) não são cor de fio.
const RESERVADAS_FIO = new Set([0, 13, 16, 60, 70, 99]);
// Cor de fio para o Verificar e o Jacquard: nem marca nem código de ponto (1 frente, 2 trás...).
const ehCorDeFio = (c) => !RESERVADAS_FIO.has(c) && !RM.tipoDePonto(c);

// Para cada fio, a cor da paleta mais parecida com a cor dele na imagem (sem repetir a mesma cor e só entre as
// cores de fio: o preto da paleta, por exemplo, é o código 1, de ponto).
function coresDaImagemNosFios(form) {
  const a = abaDat();
  const img = imagemDoLogo(form);
  if (!a || !img) return;
  const paleta = a.doc.paleta;
  const usadas = new Set();
  const escolhidas = img.medias.map((m) => {
    if (!m) return null;
    let melhor = -1, menor = Infinity;
    paleta.forEach((c, i) => {
      if (usadas.has(i) || !ehCorDeFio(i)) return;
      const dist = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
      if (dist < menor) [melhor, menor] = [i, dist];
    });
    usadas.add(melhor);
    return melhor;
  });
  escolhidas.forEach((v, i) => {
    if (v !== null && v >= 0) form[`logoC${i}`].value = v;
  });
  desenharGerar();
  avisar(`Fios com as cores da paleta mais parecidas com a imagem: ${escolhidas.filter((v) => v !== null).join(", ")}.`);
}

// Imagem do logo a partir do arquivo escolhido. Não pode se chamar carregarImagem: o editor.js já tem essa, por
// URL, e as duas dividem o mesmo escopo global (a do último script venceria).
function carregarImagemDoArquivo(arquivo) {
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

// Parte da seleção dentro da área de desenho do painel: as linhas de opção dos lados ficam de fora.
function areaNoPainel(sel, p) {
  const x0 = Math.max(sel.x, p.x0), x1 = Math.min(sel.x + sel.w - 1, p.x1);
  const y0 = Math.max(sel.y, p.y0), y1 = Math.min(sel.y + sel.h - 1, p.y1);
  return x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}

// O que acontece com a R3 ao aplicar as listras (ou o que falta para poder escrever nela).
function textoListrasR3(a, form) {
  if (!form.listrasR3.checked) return "";
  const listras = lerListras(form.listras.value);
  if (listras.length && !listras.some((l) => l.guia)) return "Escreva o guia de cada listra como cor:carreiras:guia, por exemplo 4:6:3.";
  if (!a.selecao) return "Selecione no desenho a área das listras antes de abrir: com a R3, elas entram direto na seleção.";
  const p = painelDaArea(a, a.selecao);
  if (!p || !p.R.colunas[3]) return "A seleção não está num painel com a linha R3.";
  const area = areaNoPainel(a.selecao, p);
  if (!area) return "A seleção não pega a área de desenho do painel.";
  const corta = area.w !== a.selecao.w || area.h !== a.selecao.h;
  return `As listras entram direto ${
    corta ? `em ${area.w} × ${area.h} pontos da seleção, só na área de desenho do painel ${p.numero} (as linhas de opção ficam como estão),` : `na seleção (${area.w} × ${area.h})`
  } e a R3 do painel ${p.numero} recebe o guia de cada listra.`;
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
    $("gerar-logo-origem").textContent = fonte
      ? `Origem: ${fonte.nome}${logoImagem ? ` (${fonte.w} × ${fonte.h} pixels)` : ""}${img ? ` · ${decimal(form.logoCm.value, 20).toLocaleString("pt-BR")} cm = ${img.w} agulhas na amostra de ${modelo.colunas} colunas` : ""}`
      : "Escreva o texto ou escolha uma imagem.";
    // A cor de cada fio na imagem, ao lado do número da cor que ele vai usar.
    form.querySelectorAll("[data-media]").forEach((el) => {
      const m = img && img.medias[Number(el.dataset.media)];
      if (m) el.style.background = `rgb(${m.join(",")})`;
      else el.removeAttribute("style");
    });
    $("gerar-logo-cores").disabled = !img;
  }
  const cv = $("gerar-previa");
  $("gerar-colar").disabled = !img;
  cv.hidden = !img;
  $("gerar-aviso-cores").hidden = true;
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
  const aviso = avisoDasCoresGeradas(cores, comR3);
  $("gerar-aviso-cores").textContent = aviso;
  $("gerar-aviso-cores").hidden = !aviso;
}

// O 0 não tem malha (colado por cima, abre buraco no corpo) e os códigos de ponto não contam como fio no Verificar
// nem no Jacquard: avisa quando o padrão usa um deles.
function avisoDasCoresGeradas(cores, direto) {
  const avisos = [];
  // Com "Colar sem a cor de fundo" e o fundo 0, o 0 da colagem não apaga o que está embaixo.
  const zeroPassa = !direto && estado.colarTransparente && estado.fundo === 0;
  if (cores.includes(0) && !zeroPassa) {
    avisos.push(`A cor 0 não tem malha: no corpo, ela abre buracos. Troque a cor${direto ? "" : " ou marque “Colar sem a cor de fundo” (com o fundo 0) no painel"}.`);
  }
  const dePonto = cores.filter((c) => c !== 0 && !ehCorDeFio(c));
  if (dePonto.length) {
    const nome = (c) => (LEGENDA_SIMBOLOS.find(([tipo]) => tipo === RM.tipoDePonto(c)) || [])[2];
    const nomes = dePonto.map((c) => (nome(c) ? `${c} (${nome(c)})` : String(c)));
    avisos.push(
      `${dePonto.length === 1 ? "A cor" : "As cores"} ${RM.listaComE(nomes)} ${dePonto.length === 1 ? "é código de ponto ou marca e não conta" : "são códigos de ponto ou marcas e não contam"} como fio no Verificar e no Jacquard. Para um padrão de cores, use cores de fio, como 4, 5, 6 e 7.`,
    );
  }
  return avisos.join(" ");
}

// Listras direto na seleção, com o guia de cada listra escrito na R3 do painel, carreira a carreira.
function aplicarListrasComR3(a, form) {
  fixarFlutuante(a);
  const sel = a.selecao;
  const listras = lerListras(form.listras.value);
  if (!listras.length) return;
  if (!listras.some((l) => l.guia)) return avisar("Escreva o guia de cada listra como cor:carreiras:guia (por exemplo 4:6:3).", true);
  if (!sel) return avisar("Selecione no desenho a área das listras: com a R3, elas entram direto na seleção.", true);
  const p = painelDaArea(a, sel);
  if (!p || !p.R.colunas[3]) return avisar("A seleção precisa estar num painel com a linha R3.", true);
  const area = areaNoPainel(sel, p);
  if (!area) return avisar("A seleção não pega a área de desenho do painel.", true);
  const d = a.doc;
  const px = RM.gerarListras(area.w, area.h, listras);
  const porCarreira = RM.listrasPorCarreira(area.h, listras);
  salvarHistorico(a);
  for (let y = 0; y < area.h; y++) d.pixels.set(px.subarray(y * area.w, (y + 1) * area.w), (area.y + y) * d.largura + area.x);
  // Cada sequência de carreiras com o mesmo guia recebe o número dele; listras sem guia deixam a R3 como está.
  const guiaEm = (c) => (porCarreira[c] >= 0 ? listras[porCarreira[c]].guia : 0);
  let escritas = 0;
  for (let c = 0; c < area.h; ) {
    const guia = guiaEm(c);
    let fim = c;
    while (fim + 1 < area.h && guiaEm(fim + 1) === guia) fim++;
    if (guia) escritas += RM.pintarValorNaLinha(d, p.R, 3, area.y + area.h - 1 - fim, area.y + area.h - 1 - c, guia);
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
        const imagem = await carregarImagemDoArquivo(arquivo);
        logoImagem = { id: `imagem:${++contadorLogo}`, imagem, w: imagem.width, h: imagem.height, nome: `imagem ${arquivo.name}` };
      } catch (erro) {
        logoImagem = null;
        form.logoImagem.value = "";
        avisar(`Não foi possível abrir ${arquivo.name} como imagem.`, true);
      }
    }
    if ($("dlg-gerar").open) desenharGerar();
  });
  $("gerar-logo-cores").addEventListener("click", () => coresDaImagemNosFios(form));
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

// Cores que são fio no jacquard. Nunca contam o 0, as marcas (13 largura do guia, 16 sem seleção, 99) e a
// transferência (60/70), nem a ourela (cores só nas duas agulhas de cada ponta). No corpo de um painel, como no
// Verificar, também ficam de fora os códigos de ponto (uma ribana de 1 e 2 não é jacquard) e as cores com menos
// de 1% dos pontos (códigos soltos); numa seleção conta toda cor, mesmo pouca, como os pontos de um motivo, e a
// ourela só sai quando é código de ponto (como o 2 do exemplo): um fio do motivo pode ficar só na borda da seleção.
const NAO_FIO = RESERVADAS_FIO;
const REGRA_FIO_VERIFICAR = { minimo: 0.01, semCodigosDePonto: true };
function coresDeFio(d, r, cores, { minimo = 0, semCodigosDePonto = false } = {}) {
  const ourela = RM.coresSoNaOurela(d.pixels, d.largura, r);
  const daOurela = (cor) => ourela.has(cor) && (semCodigosDePonto || !!RM.tipoDePonto(cor));
  return new Set(
    cores
      .filter((c) => !NAO_FIO.has(c.cor) && !daOurela(c.cor) && c.n >= minimo * r.w * r.h && !(semCodigosDePonto && RM.tipoDePonto(c.cor)))
      .map((c) => c.cor),
  );
}

// regraDoVerificar: quem vem de um item do Verificar analisa com a mesma regra de fio dele.
function abrirJacquard(regraDoVerificar = null) {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  let { r, texto } = areaDeAnalise(a, "analisando");
  // Na seleção conta toda cor que não é marca nem ourela.
  let regra = regraDoVerificar || {};
  if (!a.selecao) {
    // Sem seleção: o corpo do painel que está na tela, com a mesma regra de fio do Verificar.
    const corpo = corpoVisivel(a);
    if (corpo) {
      r = corpo.r;
      regra = REGRA_FIO_VERIFICAR;
      texto = `Sem seleção: analisando o corpo do painel ${corpo.p.numero} (carreiras ${corpo.trecho.de}–${corpo.trecho.ate}, agulhas ${r.x + 1}–${r.x + r.w}). Contam como fio as cores com pelo menos ${REGRA_FIO_VERIFICAR.minimo * 100}% dos pontos que não são códigos de ponto nem ficam só na ourela. Para ver outra parte, selecione-a antes de abrir.`;
    }
  }
  if (r.w * r.h > LIMITE_JACQUARD) {
    return avisar(`A área tem ${(r.w * r.h).toLocaleString("pt-BR")} pontos. Selecione o motivo (até ${LIMITE_JACQUARD.toLocaleString("pt-BR")} pontos) e abra de novo.`, true);
  }
  const d = a.doc;
  const cores = RM.coresDaArea(d.pixels, d.largura, r);
  const fios = coresDeFio(d, r, cores, regra);
  jacquard = { a, r, cores, fios, automatico: !a.selecao, intarsia: RM.guiasIntarsia(d.pixels, d.largura, r, fios) };
  $("jacquard-area").textContent = texto;
  abrirJanela("dlg-jacquard");
  analisarJacquard();
}

const amostraCor = (d, cor) => `<span class="amostra" style="background:${hexCor(d.paleta[cor])}"></span><span class="mono">${cor}</span>`;

const EXPLICA_AVESSO = {
  flutuacao: () => "Flutuação: sem malha atrás, cada cor corre solta pelo avesso onde não aparece na frente. É o mais leve, mas fio longo engancha: limite a flutuação.",
  birdseye: () => "Birdseye (olho de pássaro): as cores que não aparecem na frente tricotam atrás em agulhas alternadas (salpicado). Fios curtos; é o mais pesado, com tecido plano, liso e firme.",
  escada: (n) => `Escada (ladder-back): cada cor prende atrás só a cada ${n} agulhas. Mais leve que o birdseye e com mais volume.`,
  tubular: () => "Tubular: frente e avesso viram dois tecidos ligados pelo desenho; o avesso tece todas as cores e não sobra fio solto. Firme, duplo e com pouco caimento.",
};
// O que fazer quando sobram fios soltos longos, conforme o avesso escolhido.
const CONSELHO_AVESSO = {
  flutuacao: () => "Use birdseye ou escada para prender os fios no avesso, ou diminua o desenho.",
  escada: (n) => `Prenda a cada menos agulhas na escada (hoje ${n}) ou use birdseye.`,
  birdseye: () => "Com muitas cores até o birdseye deixa fio solto: use menos cores na carreira.",
};

function analisarJacquard() {
  if (!jacquard) return;
  const { a, r, cores, fios, intarsia } = jacquard;
  const d = a.doc, H = d.altura;
  const form = $("dlg-jacquard").querySelector("form");
  const estrutura = form.estrutura.value;
  const escada = inteiro(form.escada.value, 4, 2, 12);
  const maximo = inteiro(form.maximo.value, 5, 1, 500);
  form.escada.disabled = estrutura !== "escada";
  const fl = RM.flutuacoes(d.pixels, d.largura, r, estrutura, escada, fios);
  const longas = fl.lista.filter((f) => f.comprimento > maximo);
  const maior = fl.lista.reduce((m, f) => (!m || f.comprimento > m.comprimento ? f : m), null);
  Object.assign(jacquard, { longas, maior, fl, maximo, estrutura, escada });
  const mostrar = cores.slice(0, 24);
  let html = `<div class="cores-area">${mostrar
    .map((c) => `<span${fios.has(c.cor) ? "" : ' class="nao-fio"'}>${amostraCor(d, c.cor)} <span class="suave">× ${c.n.toLocaleString("pt-BR")}${fios.has(c.cor) ? "" : " · não é fio"}</span></span>`)
    .join("")}${cores.length > mostrar.length ? `<span class="suave">+${cores.length - mostrar.length}</span>` : ""}</div>`;
  const k = fios.size;
  html += `<p>${cores.length} ${cores.length === 1 ? "cor" : "cores"} na área${k === cores.length ? "" : `, ${k} como fio`}. ${EXPLICA_AVESSO[estrutura](escada)}</p>`;
  if (k > 1) {
    html += `<p>${k} fios · ${r.h.toLocaleString("pt-BR")} carreiras de desenho = <strong>${(k * r.h).toLocaleString("pt-BR")} carreiras na máquina</strong> (uma por fio).</p>`;
  } else {
    html += `<p class="suave">Menos de dois fios na área: não há jacquard para analisar.${jacquard.automatico ? " Selecione a área do desenho de cores e abra de novo." : ""}</p>`;
  }
  if (k > 1 && estrutura !== "tubular") {
    html += longas.length
      ? `<p class="alerta">${longas.length.toLocaleString("pt-BR")} fios soltos com mais de ${maximo} agulhas. ${(CONSELHO_AVESSO[estrutura] || (() => ""))(escada)}</p>`
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
  const pequenas = intarsia.areas.filter((ar) => ar.n < 12).length;
  if (fios.size < 2) {
    $("intarsia-resultado").innerHTML = `<div class="resultado"><p class="suave">Menos de dois fios na área: não há intarsia para analisar.</p></div>`;
    $("intarsia-tabela").innerHTML = "";
    desenharMapaJacquard();
    return;
  }
  $("intarsia-resultado").innerHTML = `<div class="resultado">
    <p class="${n > disponiveis ? "alerta" : "ok-texto"}">Precisa de ${n} guia-fio${n === 1 ? "" : "s"}${n > disponiveis ? `, mais que os ${disponiveis} da máquina` : ""}.</p>
    <div class="cores-area">${[...porCor].slice(0, 24).map(([cor, k]) => `<span>${amostraCor(d, cor)} <span class="suave">${k} guia${k === 1 ? "" : "s"}</span></span>`).join("")}</div>
    <p>${intarsia.areas.length === 1 ? "1 área de cor" : `${intarsia.areas.length.toLocaleString("pt-BR")} áreas de cor`}${
      pequenas ? `, ${pequenas.toLocaleString("pt-BR")} delas com menos de 12 pontos` : ""
    }. ${n <= disponiveis ? `Dá para fazer em intarsia com ${n} guia${n === 1 ? "" : "s"}, sem fio correndo por trás.` : `Passa dos ${disponiveis} guias da máquina: faça em jacquard ou simplifique o desenho.`}</p>
    <p class="suave pequeno">Cada trecho seguido de uma cor numa carreira precisa do seu guia; um guia volta a servir quando a área dele acaba.</p></div>`;
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

// O avesso visto por trás (espelhado), conforme a estrutura: no birdseye as cores prendem salpicadas em agulhas
// alternadas; no tubular o avesso tece a outra cor (o negativo da frente); na escada cada cor prende numa coluna
// a cada N agulhas; na flutuação aparece o desenho escurecido. Os fios soltos são traços da cor deles.
function desenharAvessoJacquard(g, z) {
  const { a, r, fl, maximo, estrutura, escada } = jacquard;
  const d = a.doc;
  const img = recortarArea(d, r);
  const cores = fl.cores; // na ordem que a regra de prender usa
  const k = cores.length;
  const indice = new Map(cores.map((c, i) => [c, i]));
  const base = document.createElement("canvas");
  base.width = r.w;
  base.height = r.h;
  const bg = base.getContext("2d");
  const dados = bg.createImageData(r.w, r.h);
  const px32 = new Uint32Array(dados.data.buffer);
  const rgba = (v, apagar) => {
    const [rr, gg, bb] = d.paleta[v].map((c) => (apagar ? Math.round(c * 0.4) : c));
    return ((255 << 24) | (bb << 16) | (gg << 8) | rr) >>> 0;
  };
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const frente = img.px[y * r.w + x];
      let v = frente, apagar = true;
      if (!indice.has(frente)) {
        // Não é fio (marca, ourela, fora da malha): fica como está, escurecida.
      } else if (k > 1 && estrutura === "birdseye") {
        v = cores[(k - ((x + y) % k)) % k];
        apagar = false;
      } else if (k > 1 && estrutura === "tubular") {
        v = cores[(indice.get(frente) + 1) % k];
        apagar = false;
      } else if (k > 1 && estrutura === "escada" && x % escada < k) {
        v = cores[x % escada];
        apagar = false;
      }
      px32[y * r.w + (r.w - 1 - x)] = rgba(v, apagar);
    }
  }
  bg.putImageData(dados, 0, 0);
  g.drawImage(base, 0, 0, r.w * z, r.h * z);
  if (estrutura === "tubular") return;
  // No birdseye os fios soltos são curtos: só os longos aparecem.
  const lista = (estrutura === "birdseye" ? fl.lista.filter((f) => f.comprimento > maximo) : fl.lista).slice(0, 40000);
  const espessura = Math.max(1, Math.round(z * 0.5));
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
    ({
      tubular: "O avesso visto por trás (espelhado). No tubular o avesso tece a outra cor em cada ponto (o negativo da frente): não há fio solto.",
      birdseye: `O avesso visto por trás (espelhado). No birdseye as cores prendem salpicadas, em agulhas alternadas; só aparecem os fios soltos de mais de ${j.maximo} agulhas, com borda amarela.`,
      escada: `O avesso visto por trás (espelhado). Na escada cada cor prende numa coluna a cada ${j.escada} agulhas e corre solta entre elas (os traços); os de mais de ${j.maximo} agulhas têm borda amarela.`,
    })[j.estrutura] || `O avesso visto por trás (espelhado): o desenho escurecido e cada fio solto como um traço da cor dele; os de mais de ${j.maximo} agulhas têm borda amarela.`,
  guias: () => "Cada cor é um guia-fio da intarsia; com zoom, o número do guia aparece no meio da área dele.",
};

function desenharMapaJacquard() {
  const { a, r, longas, intarsia } = jacquard;
  const d = a.doc;
  const vista = $("dlg-jacquard").querySelector("form").vista.value;
  const guias = vista === "guias";
  const cv = $("jacquard-mapa");
  const z = limitar(Math.floor(Math.min(larguraUtil(cv, 480) / r.w, 460 / r.h)), 1, 12);
  jacquard.z = z;
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

// Agulha, carreira, cor, área e guia da intarsia do ponto debaixo do mouse no mapa (o avesso é espelhado).
function lerPontoDoJacquard(e) {
  const el = $("jacquard-status");
  if (!jacquard || !jacquard.z) return;
  const { a, r, intarsia, z } = jacquard;
  let x = Math.floor(e.offsetX / z);
  const y = Math.floor(e.offsetY / z);
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) {
    el.textContent = "Passe o mouse no mapa.";
    return;
  }
  if ($("dlg-jacquard").querySelector("form").vista.value === "avesso") x = r.w - 1 - x;
  const d = a.doc, i = y * r.w + x;
  const cor = d.pixels[(r.y + y) * d.largura + r.x + x];
  const nome = nomeDaCor(cor);
  const onde = intarsia.areaDe[i] < 0 ? "não conta como fio" : `área ${intarsia.areaDe[i] + 1} (guia ${intarsia.guiaDe[i]} na intarsia)`;
  el.textContent = `Agulha ${r.x + x + 1} · carreira ${d.altura - (r.y + y)} · cor ${cor}${nome ? ` (${nome})` : ""} · ${onde}`;
}
$("jacquard-mapa").addEventListener("pointermove", lerPontoDoJacquard);
$("jacquard-mapa").addEventListener("pointerdown", lerPontoDoJacquard);
$("jacquard-mapa").addEventListener("pointerleave", () => ($("jacquard-status").textContent = "Passe o mouse no mapa."));
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
  verif.itens = itensDoVerificar(verif.a, inteiro(form.maximo.value, 5, 1, 500));
  desenharItensVerif();
}

// Tudo o que o Verificar mostra: as regras do desenho, as de cor e os trechos difíceis das peças do Modelo
// (avisos que a Ficha não conta, porque não são deste desenho).
function itensDoVerificar(a, maximo) {
  const itens = RM.verificarDesenho(a.doc, blocosDeOpcao(a), { flutuacaoMaxima: maximo });
  const cor = itensDeCor(a, maximo);
  // "Nenhum problema" só vale se as regras de cor também passaram.
  return (cor.length ? itens.filter((i) => i.regra !== "nenhum") : itens).concat(cor, itensDaForma());
}

// Jacquard e intarsia no corpo de cada painel: fios soltos longos com o avesso escolhido no Jacquard e guia-fios
// da intarsia. Contam as cores de fio com pelo menos 1% dos pontos (ourela, marcas e códigos de ponto ficam de fora).
function itensDeCor(a, maximo) {
  const d = a.doc;
  const itens = [];
  // O avesso e os guias da máquina são os escolhidos no Jacquard (o avesso decide quanto fio fica solto).
  const formJ = $("dlg-jacquard").querySelector("form");
  const disponiveis = inteiro(formJ.guias.value, 8, 1, 64);
  const estrutura = formJ.estrutura.value || "flutuacao";
  const escada = inteiro(formJ.escada.value, 4, 2, 12);
  for (const { p, trechos } of paineisComTrechos(a)) {
    const corpo = trechos.find((t) => t.id === "corpo");
    if (p.x0 === null || !corpo) continue;
    const m = RM.areaDeMalha(d, p);
    if (!m) continue;
    const r = { x: m.x0, y: d.altura - corpo.ate, w: m.x1 - m.x0 + 1, h: corpo.ate - corpo.de + 1 };
    if (r.w * r.h > LIMITE_JACQUARD) continue;
    // Uma ribana (1 e 2) ou a forma (0 em volta) não são jacquard: códigos de ponto e o 0 não contam como fio.
    const principais = coresDeFio(d, r, RM.coresDaArea(d.pixels, d.largura, r), REGRA_FIO_VERIFICAR);
    if (principais.size < 2) continue;
    const nome = ` (painel ${p.numero})`;
    const longas = RM.flutuacoes(d.pixels, d.largura, r, estrutura, escada, principais).lista.filter((f) => f.comprimento > maximo);
    const guias = RM.guiasIntarsia(d.pixels, d.largura, r, principais).guias.length;
    // Jacquard e intarsia são dois jeitos de tecer o mesmo desenho: só é erro quando nenhum dos dois serve.
    const semJacquard = longas.length > 0, semIntarsia = guias > disponiveis;
    const nivel = semJacquard && semIntarsia ? "erro" : "aviso";
    const avesso = NOME_AVESSO[estrutura] || estrutura;
    if (semJacquard) {
      const maior = longas.reduce((x, f) => (f.comprimento > x.comprimento ? f : x));
      itens.push({
        nivel,
        regra: "jacquard",
        painel: p.numero,
        area: r,
        titulo: `Flutuações longas no jacquard${nome}`,
        texto: `Com o avesso ${avesso}, ${longas.length.toLocaleString("pt-BR")} fios soltos passam de ${maximo} agulhas no corpo; o maior tem ${maior.comprimento} agulhas (cor ${maior.cor}).${
          estrutura === "flutuacao" ? " Em birdseye ou escada eles ficam curtos." : ""
        }${semIntarsia ? "" : ` Em intarsia o corpo cabe em ${guias} guia-fio${guias === 1 ? "" : "s"}.`}`,
        carreiras: String(d.altura - maior.y),
        y: maior.y,
        x0: maior.x0,
        x1: maior.x1,
      });
    }
    if (semIntarsia) {
      itens.push({
        nivel,
        regra: "intarsia",
        painel: p.numero,
        area: r,
        titulo: `Intarsia passa do limite de guias${nome}`,
        texto: `Em intarsia o corpo precisaria de ${guias} guia-fios, mais que os ${disponiveis} da máquina.${
          semJacquard
            ? " E em jacquard com este avesso sobram fios soltos longos: simplifique o desenho ou mude o avesso no Jacquard."
            : ` Em jacquard (avesso ${avesso}) os fios soltos ficam curtos: faça em jacquard.`
        }`,
      });
    }
  }
  return itens;
}

const NOME_AVESSO = { flutuacao: "em flutuação", birdseye: "em birdseye", escada: "em escada", tubular: "tubular" };

const ONDE_NA_FORMA = { Cava: "na cava", Gola: "na gola", "Gola V": "na gola V", Copa: "na copa", Aumentos: "nos aumentos" };

// Trechos difíceis nas peças do Modelo (com os ajustes da Forma): diminuições ou aumentos fortes seguidos.
function itensDaForma() {
  // Só depois de abrir o Modelo ou a Forma: sem isso, as peças de exemplo dariam avisos em todo arquivo.
  if (!modelo.emUso) return [];
  const r = ultimoModelo || calcularModeloAtual();
  const itens = [];
  r.pecas.forEach((peca, indice) => {
    const forma = formaDaPeca(peca, r);
    if (!(forma.W > 0 && forma.H > 0) || forma.W > 8000 || forma.H > 8000) return;
    const plano = RM.planoForma(forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca });
    for (const t of RM.trechosDificeis(plano)) {
      const parte = t.passo.split(":")[0];
      const tipo = parte === "Aumentos" ? "aumentos" : "diminuições";
      itens.push({
        nivel: "aviso",
        regra: "forma",
        peca: indice,
        passo: t.passo,
        titulo: `Trecho difícil ${ONDE_NA_FORMA[parte] || `em ${parte.toLowerCase()}`} (${peca.nome} do Modelo)`,
        texto: `${peca.nome} · ${parte}: começa com ${t.vezes} ${tipo} de ${t.n} agulhas a cada ${t.intervalo} carreiras (carreiras ${t.de}–${t.ate} da peça). Use velocidade menor e confira o puxador nesse trecho.`,
      });
    }
  });
  return itens;
}

// Ferramenta que resolve cada tipo de item do Verificar.
const FERRAMENTAS_VERIF = {
  "sem-guia": "Abrir a linha R3",
  "sem-ponto": "Abrir o ponto no Processar",
  "cancela-com-guia": "Abrir a linha R5",
  "cancela-coerente": "Abrir a linha R5",
  "transferencia-com-guia": "Abrir a linha R3",
  "guia-sem-malha": "Abrir a linha R3",
  "transferencia-tecendo": "Abrir a linha R5",
  "transferencia-sem-r5": "Abrir a linha R5",
  "transferencia-coerente": "Abrir a linha R5",
  "paineis-diferentes": "Ver a R2",
  jacquard: "Abrir jacquard",
  intarsia: "Abrir intarsia",
  forma: "Abrir forma",
};
const LINHA_DO_ITEM = {
  "sem-guia": "R3",
  "cancela-com-guia": "R5",
  "cancela-coerente": "R5",
  "transferencia-com-guia": "R3",
  "guia-sem-malha": "R3",
  "transferencia-tecendo": "R5",
  "transferencia-sem-r5": "R5",
  "transferencia-coerente": "R5",
  "paineis-diferentes": "R2",
};

function abrirFerramentaDoItem(item) {
  const a = verif.a;
  if (!mesmaAba(verif)) return;
  $("dlg-verificar").close();
  const linha = LINHA_DO_ITEM[item.regra];
  if (linha) {
    const lista = RM.paineis(blocosDeOpcao(a));
    const i = Math.max(0, lista.findIndex((p) => p.numero === (item.painel || 1)));
    a.linhaOpcao = { painel: i, linha };
    marcarLinha(a);
    $("uma-linha").scrollIntoView({ block: "center" });
    const atual = linhaAtual(a);
    if (atual && atual.bloco.colunas[atual.k]) mostrarNoDesenho(a, { x: Math.min(...atual.bloco.colunas[atual.k]), y: item.y ?? atual.bloco.carreiraInicio, w: 2, h: 1 });
    avisar(`Linha ${linha} do painel ${lista[i].numero} escolhida em Linhas de opção, no painel à direita.`);
  } else if (item.regra === "sem-ponto") abrirProcessar(RM.PASSOS_PROCESSAMENTO.findIndex((s) => s.id === "ponto"));
  else if (item.regra === "jacquard" || item.regra === "intarsia") {
    selecionarNoDesenho(a, item.area);
    // O mesmo limite de fio solto do Verificar, para o Jacquard achar as mesmas flutuações longas.
    $("dlg-jacquard").querySelector("form").maximo.value = inteiro($("dlg-verificar").querySelector("form").maximo.value, 5, 1, 500);
    abrirJacquard(REGRA_FIO_VERIFICAR);
    if (item.regra === "intarsia" && jacquard) {
      $("dlg-jacquard").querySelector("form").vista.value = "guias";
      analisarJacquard();
    }
  } else if (item.regra === "forma") {
    abrirForma(item.peca);
    formaDestaque = item.passo || null;
    desenharFormaDialogo();
  }
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
        ${
          comCarreiras || FERRAMENTAS_VERIF[item.regra]
            ? `<div class="controles">${
                comCarreiras
                  ? `<button type="button" class="botao pequeno" data-ver-desenho="${i}">Ver no desenho</button><button type="button" class="botao pequeno" data-ver-agulhas="${i}">Ver nas agulhas</button>`
                  : ""
              }${FERRAMENTAS_VERIF[item.regra] ? `<button type="button" class="botao pequeno" data-ferramenta="${i}">${FERRAMENTAS_VERIF[item.regra]}</button>` : ""}</div>`
            : ""
        }
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
  const transferencias = [...conta].filter(([v]) => RM.tipoDePonto(v) === "transfere").reduce((t, [, n]) => t + n, 0);
  $("verificar-info").innerHTML = [
    ["Carreira", String(c)],
    ...(transferencias ? [["Transferência", `${transferencias} agulha${transferencias === 1 ? "" : "s"}: o ponto vai para a frontura em que a agulha tricota depois`]] : []),
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
    case "transfere":
      return { frente: 0, tras: 0, transfere: true };
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
  // Na transferência (60/70) o ponto vai para a frontura em que a agulha tricota depois (procurando algumas
  // carreiras acima); sem como saber, as laçadas ficam onde estavam e a seta tem duas pontas.
  const destino = (yy, i) => {
    for (let k = 1; k <= 6; k++) {
      const ac = acaoDoPonto(codigoEm(yy - k, i));
      if (ac.transfere || (!ac.frente && !ac.tras)) continue;
      return ac.frente > 0 && !ac.tras ? "frente" : ac.tras > 0 && !ac.frente ? "tras" : null;
    }
    return null;
  };
  // Laçadas nas agulhas depois da carreira yy: a malha deixa a laçada nova; a agulha parada (sem seleção, 99)
  // fica com a de antes, por quantas carreiras for; o 0 (fora da peça, depois de arrematar ou diminuir) não
  // tem laçada; a transferência leva a de antes para o destino.
  const lacos = (yy, i) => {
    const transferencias = [];
    let estado = { frente: 0, tras: 0 };
    for (let k = 0; yy + k <= ar.y1; k++) {
      const v = codigoEm(yy + k, i);
      const ac = acaoDoPonto(v);
      if (ac.frente || ac.tras) {
        estado = ac;
        break;
      }
      if (v === 0) break;
      if (ac.transfere) transferencias.push(yy + k);
    }
    // As transferências valem de baixo para cima.
    for (let j = transferencias.length - 1; j >= 0; j--) {
      const tem = estado.frente > 0 || estado.tras > 0 ? 1 : 0;
      const para = destino(transferencias[j], i);
      if (para === "frente") estado = { frente: tem, tras: 0 };
      else if (para === "tras") estado = { frente: 0, tras: tem };
    }
    return estado;
  };
  const caminho = [];
  for (let i = 0; i < jan; i++) {
    const v = codigoEm(y, i);
    const acao = acaoDoPonto(v);
    const para = acao.transfere ? destino(y, i) : null;
    const x = xAg(i);
    const perto = Math.max(0, 1 - Math.abs(carroX - x) / 40);
    // Na transferência sobe a agulha que entrega o ponto (as duas, quando não dá para saber o sentido).
    const sobeF = (acao.transfere ? (para === "tras" ? 1 : para ? 0 : 0.6) : acao.frente) * perto;
    const sobeT = (acao.transfere ? (para === "frente" ? 1 : para ? 0 : 0.6) : acao.tras) * perto;
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
    const antes = lacos(y + 1, i);
    const depois = lacos(y, i);
    const feito = passou(i);
    const lacoF = feito ? depois.frente : antes.frente;
    const lacoT = feito ? depois.tras : antes.tras;
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
    if (feito && acao.transfere) {
      // Transferência: seta da frontura que entrega para a que recebe (as duas pontas quando não dá para saber).
      g.strokeStyle = destaque;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 9, 138);
      g.lineTo(x + 9, 202);
      if (para !== "frente") {
        g.moveTo(x + 5, 144);
        g.lineTo(x + 9, 138);
        g.lineTo(x + 13, 144);
      }
      if (para !== "tras") {
        g.moveTo(x + 5, 196);
        g.lineTo(x + 9, 202);
        g.lineTo(x + 13, 196);
      }
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
    const ferramenta = e.target.closest("[data-ferramenta]");
    if (ferramenta && verif) {
      const item = verif.itens[Number(ferramenta.dataset.ferramenta)];
      if (item) abrirFerramentaDoItem(item);
      return;
    }
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
  if (!a.repeticoes) a.repeticoes = lerDoDesenho(CHAVE_REPETICOES, a, {});
  return a.repeticoes;
}

function pacotesDe(a) {
  if (!a.pacotes) {
    const salvo = lerDoDesenho(CHAVE_PACOTES, a, {});
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
  desenv = { a, lista, todos, painel: 0, dev: null, res: null, trechos: [], trecho: null };
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
  desenv.trechos = trechos;
  if (desenv.trecho !== null && !trechos[desenv.trecho]) desenv.trecho = null;
  $("desenvolver-trechos").innerHTML = trechos
    .map(
      (t, i) => `<button type="button" class="trecho" data-trecho="${i}" aria-pressed="${i === desenv.trecho}"><span class="amostra" style="background:${corDaParte(t.nome)}"></span>
        <span class="titulo-trecho"><span>${esc(t.nome)}</span><span class="mono">${t.de === t.ate ? `carreira ${t.de}` : `carreiras ${t.de}–${t.ate}`}</span></span>
        <span class="codigos-trecho">${esc(textoDoTrecho(RM.resumoDoTrecho(a.doc, p, t)))}</span></button>`,
    )
    .join("");
  $("desenvolver-ver").hidden = desenv.trecho === null || !RM.areaDeMalha(a.doc, p);
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
// O resumo de um trecho em uma linha: "51 e 52 alternando (tubular provável) · guia 4 · ponto 14 e 17".
function textoDoTrecho(r) {
  const partes = [];
  if (r.alterna) {
    const tubular = r.alterna.map((v) => RM.tipoDePonto(v)).sort().join() === "frente,tras";
    partes.push(`${r.alterna[0]} e ${r.alterna[1]} alternando${tubular ? " (tubular provável)" : ""}`);
  } else partes.push(`${r.codigos.length === 1 ? "código" : "códigos"} ${r.codigos.slice(0, 3).map((c) => c.cor).join(", ")}`);
  partes.push(r.guias.length ? `guia ${r.guias.join(", ")}` : "sem guia-fio");
  if (r.pontos.length) partes.push(`ponto ${r.pontos.join(" e ")}`);
  if (r.cancela) partes.push("cancelar malha (R5)");
  if (r.economizador.length) partes.push(`R2 = ${r.economizador.join(", ")}`);
  return partes.join(" · ");
}

// Partes do desenho desenvolvido que vêm do trecho escolhido (a barra trocada por um pacote também conta).
function partesDoTrecho(res, t) {
  return res.partes.filter((x) => x.nome === t.nome || (t.id === "barra" && x.gerada && x.nome.startsWith("Barra")));
}

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
  // Com um trecho escolhido, as outras carreiras ficam apagadas (valores somados de 1000).
  const t = desenv.trecho !== null ? desenv.trechos[desenv.trecho] : null;
  if (t) {
    const marcadas = partesDoTrecho(res, t);
    for (let c = res.painel.de; c <= res.painel.ate; c++) {
      if (marcadas.some((x) => c >= x.de && c <= x.ate)) continue;
      const y = res.painel.ate - c;
      for (let i = y * w; i < (y + 1) * w; i++) px[i] += 1000;
    }
  }
  const fundo = [43, 40, 36];
  const base = (v) => (v < 256 ? d.paleta[v] : v === 256 ? fundo : cores[v - 257]);
  const cor = (v) => (v < 1000 ? base(v) : base(v - 1000).map((c, i) => Math.round(c * 0.3 + fundo[i] * 0.7)));
  const z = zoomQueCabeEm(w, h, larguraUtil(cv, 360), 460, 4);
  pintarPixels(cv, { w, h, px }, cor, z);
  cv.setAttribute("aria-label", `Painel ${p.numero} desenvolvido: ${h} carreiras, com as partes marcadas à esquerda${t ? ` e o trecho ${t.nome} destacado` : ""}`);
  if (t) {
    // Rola a prévia até o trecho.
    const marcadas = partesDoTrecho(res, t);
    if (marcadas.length) {
      const quadro = cv.parentElement;
      const meio = (res.painel.ate - (marcadas[0].de + marcadas[marcadas.length - 1].ate) / 2) * z;
      quadro.scrollTop = Math.max(0, meio - quadro.clientHeight / 2);
    }
  }
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
      desenv.trecho = null;
      desenharDesenvolver();
      return;
    }
    if (alvo.dataset.chave) {
      const todas = repeticoesDe(a);
      todas[p.numero] = { ...(todas[p.numero] || {}), [alvo.dataset.chave]: inteiro(alvo.value, 1, 1, 9999) };
      gravarDoDesenho(CHAVE_REPETICOES, a, todas);
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
    gravarDoDesenho(CHAVE_PACOTES, a, pk);
    estadoCamposPacotes(form, desenv.temBarra);
    atualizarTotalDesenvolver();
  });
  $("desenvolver-trechos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-trecho]");
    if (!b || !desenv) return;
    const i = Number(b.dataset.trecho);
    desenv.trecho = desenv.trecho === i ? null : i;
    $("desenvolver-trechos").querySelectorAll("[data-trecho]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.trecho) === desenv.trecho)));
    $("desenvolver-ver").hidden = desenv.trecho === null || !RM.areaDeMalha(desenv.a.doc, desenv.lista[desenv.painel]);
    desenharPreviaDesenvolvida(desenv.lista[desenv.painel], desenv.res);
  });
  $("desenvolver-ver").addEventListener("click", () => {
    if (!mesmaAba(desenv) || desenv.trecho === null) return;
    const { a, lista } = desenv;
    const p = lista[desenv.painel], t = desenv.trechos[desenv.trecho];
    const m = RM.areaDeMalha(a.doc, p);
    if (!m) return;
    $("dlg-desenvolver").close();
    selecionarNoDesenho(a, { x: m.x0, y: a.doc.altura - t.ate, w: m.x1 - m.x0 + 1, h: t.ate - t.de + 1 });
    avisar(`${t.nome} do painel ${p.numero} selecionado: carreiras ${t.de}–${t.ate}, agulhas ${m.x0 + 1}–${m.x1 + 1}.`);
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
      return `<div class="item-variante"><button type="button" class="variante" data-variante="${i}" aria-pressed="${v === simul.variante}" title="Usar as cores ${esc(v.nome)}"><span>${esc(v.nome)}</span><span class="amostras" aria-hidden="true">${cores
        .map((c) => `<span style="background:${c}"></span>`)
        .join("")}</span></button>${minha ? `<button type="button" class="apagar-motivo" data-apagar-variante="${i - VARIANTES_PRONTAS.length}" aria-label="Apagar ${esc(v.nome)}" title="Apagar">×</button>` : ""}</div>`;
    })
    .join("");
}

// As cores da variante vão para os fios na ordem (e voltam ao começo se houver mais fios que cores).
// Marca a variante escolhida nos botões que já estão na tela (redesenhar tiraria o foco do botão).
function marcarVariante() {
  const lista = [...VARIANTES_PRONTAS, ...minhasVariantes];
  $("simular-variantes")
    .querySelectorAll("[data-variante]")
    .forEach((b) => b.setAttribute("aria-pressed", String(lista[Number(b.dataset.variante)] === simul.variante)));
}

function aplicarVariante(v) {
  const porGuia = porGuiaNaSimulacao();
  simul.variante = v; // fica marcada até mudar uma cor à mão
  marcarVariante();
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
  const forma = formaDaPeca(peca, r);
  const cv = $("simular-peca");
  const info = $("simular-peca-info");
  if (!(forma.W > 0 && forma.H > 0) || forma.W > 2000 || forma.H > 4000) {
    cv.hidden = true;
    info.textContent = `${peca.nome} ficaria com ${forma.W} × ${forma.H} pontos: confira as medidas no Modelo e na Forma.`;
    return;
  }
  const plano = RM.planoForma(forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca });
  const dentro = RM.pixelsDaForma(plano, { malha: 1, fora: 0, arremate: 1, parcial: 1, marcaEsq: 1, marcaDir: 1 }).px;
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
      if (!dentro[i]) px32[i] = fundo;
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
      if (!tipo || tipo === "guia" || tipo === "transfere") continue;
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
    // Uma cor mudada à mão (ou outro jeito de colorir) já não é a variante escolhida.
    if ((chave || alvo.name === "cores") && simul.variante) {
      simul.variante = null;
      marcarVariante();
    }
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
      if (simul && simul.variante === v) simul.variante = null;
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
  guias: "Cada número da R3 vira um guia-fio da máquina, com o fio, a cor e o lado por onde ele entra. Usar o mesmo número na R3 e no guia da máquina evita confusão (o editor já começa assim).",
  economizador: "Quantas vezes cada bloco marcado na R2 se repete. O desenho guarda cada bloco uma vez só, e o valor da R2 pode ser só um endereço: escreva aqui o número de repetições.",
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
  const salvo = lerDoDesenho(CHAVE_PROCESSAMENTO, a, {});
  // Sem nada guardado, a máquina e a finura vêm do nome da pasta ("07 122 SSGsv") e depois do Modelo.
  const daPasta = RM.maquinaDaPasta(a.pastaNome);
  const dados = {
    maquina: salvo.maquina ?? (daPasta.maquina || modelo.maquina || ""),
    finura: salvo.finura ?? (daPasta.finura || modelo.finura || ""),
    guias: { ...(salvo.guias || {}) },
    pontos: { ...(salvo.pontos || {}) },
    puxador: { ...(salvo.puxador || {}) },
    velocidade: { ...(salvo.velocidade || {}) },
  };
  const fichaSalva = lerDoDesenho(CHAVE_FICHA, a, null);
  if (fichaSalva && fichaSalva.fios) {
    // Uma vez só: os fios saem da ficha e ficam aqui (um fio apagado no processamento não volta).
    for (const [g, fio] of Object.entries(fichaSalva.fios)) {
      if (fio && (dados.guias[g] || {}).fio === undefined) dados.guias[g] = { ...(dados.guias[g] || {}), fio };
    }
    delete fichaSalva.fios;
    gravarDoDesenho(CHAVE_FICHA, a, fichaSalva);
    gravarDoDesenho(CHAVE_PROCESSAMENTO, a, dados);
  }
  a.processamento = dados;
  return dados;
}

// Cada guia usado na R3 começa com o mesmo número e uma cor própria; o fio fica para preencher. Vale em
// todo lugar que conta o que falta, para a conta não depender de qual diálogo abriu antes.
function completarGuias(dados, uso) {
  for (const u of uso.guias) dados.guias[u.valor] = { guia: String(u.valor), fio: "", cor: corPadraoDoGuia(u.valor), lado: "E", ...(dados.guias[u.valor] || {}) };
  return dados;
}

function gravarProcessamento(a) {
  gravarDoDesenho(CHAVE_PROCESSAMENTO, a, processamentoDe(a));
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
  const d = processamentoDe(a);
  if (!alt || String(d.finura ?? "").trim() === "") return null;
  return RM.tempoTecimento({ carreiras: alt.carreiras, agulhas: alt.agulhas, pecas: 1, finura: d.finura, velocidade: d.velocidade.corpo });
}

// Resumo em texto (para baixar ou ir no .zip da ficha).
function resumoDoProcessamento(a) {
  const uso = RM.usoDoProcessamento(a.doc, blocosDeOpcao(a));
  const linhas = RM.linhasDoProcessamento(a.nome, completarGuias(processamentoDe(a), uso), uso, repeticoesDe(a));
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
  const dados = completarGuias(processamentoDe(a), uso);
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
  const daPasta = RM.maquinaDaPasta(a.pastaNome);
  const pelaPasta = [daPasta.maquina, daPasta.finura && `${daPasta.finura}G`].filter(Boolean).join(" ");
  const info = [
    ...(a.pastaNome ? [["Pasta", `${a.pastaNome}${pelaPasta ? ` (pelo nome: ${pelaPasta})` : ""}`]] : []),
    ["Desenho", `${a.doc.largura} × ${a.doc.altura} pontos`],
    ["Painéis", comMalha.length ? comMalha.join(", ") : String(lista.length)],
    ["Linhas usadas", [...usadas].sort((x, y) => ordem(x) - ordem(y)).join(", ") || "nenhuma"],
    ["Trechos", trechos || "—"],
  ];
  return `<div class="linha-campos">
      <label class="campo">Máquina <input type="text" data-proc="maquina" data-obrigatorio list="proc-maquinas" maxlength="40" value="${esc(dados.maquina ?? "")}" autocomplete="off"></label>
      <label class="campo">Finura <select data-proc="finura" data-obrigatorio><option value="">—</option>${RM.FINURAS.map(
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
        <td><input type="number" min="1" max="32" data-g="${u.valor}" data-campo="guia" data-obrigatorio value="${esc(g.guia ?? "")}" aria-label="Guia-fio da R3 ${u.valor}"></td>
        <td><input type="text" maxlength="40" data-g="${u.valor}" data-campo="fio" data-obrigatorio value="${esc(g.fio ?? "")}" placeholder="ex.: algodão 2/30" autocomplete="off" aria-label="Fio da R3 ${u.valor}"></td>
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
  return `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>Painel</th><th>Carreiras</th><th>R1 · dentro</th><th>R2 · fora</th><th>Repete (vezes)</th></tr></thead><tbody>${uso.blocosR2
    .map(
      (b) => `<tr><td class="mono">${b.painel}</td><td class="mono">${b.de}–${b.ate}</td><td class="mono">${b.dentro.length ? b.dentro.join("/") : "—"}</td><td class="mono">${esc(b.valor)}</td>
      <td><input type="number" min="1" max="9999" data-obrigatorio data-rep-painel="${b.painel}" data-rep-chave="${b.chave}" value="${esc((reps[b.painel] || {})[b.chave] ?? "")}" placeholder="vezes" aria-label="Vezes que as carreiras ${b.de} a ${b.ate} do painel ${b.painel} se repetem"></td></tr>`,
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
      <td><input type="number" ${limites} ${atributo}="${t.id}" data-obrigatorio value="${esc(dados[id][t.id] ?? "")}" aria-label="${ehPuxador ? "Puxador" : "Velocidade"} no trecho ${esc(t.nome)}"></td></tr>`,
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
        <td><input type="number" min="0" max="999" data-pt="${u.valor}" data-lado="f" data-obrigatorio value="${esc(p.f ?? "")}" placeholder="ex.: 45" aria-label="Ponto da frente da R6 ${u.valor}"></td>
        <td><input type="number" min="0" max="999" data-pt="${u.valor}" data-lado="t" data-obrigatorio value="${esc(p.t ?? "")}" placeholder="ex.: 45" aria-label="Ponto de trás da R6 ${u.valor}"></td></tr>`;
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
  const pct = proc.rodando ? Math.round((proc.log.length / proc.total) * 100) : proc.log ? 100 : 0;
  const barra = `<div class="barra-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progresso do processamento"><span style="width:${pct}%"></span></div>`;
  const verificar = `<div class="controles"><button type="button" class="botao" data-abrir="verificar">Abrir o assistente de verificação</button></div>`;
  return situacao + barra + log + verificar + htmlArquivosDoPrograma(proc.a);
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
  marcarVazios();
  const form = $("dlg-processar").querySelector("form");
  form.querySelector('[data-passo="-1"]').disabled = proc.passo === 0;
  form.querySelector('[data-passo="1"]').disabled = proc.passo === RM.PASSOS_PROCESSAMENTO.length - 1;
  $("processar-rodar").disabled = proc.rodando;
}

// Os campos que o processamento precisa ficam com a borda amarela enquanto estão vazios (como o passo que falta).
function marcarVazios() {
  $("processar-conteudo").querySelectorAll("[data-obrigatorio]").forEach(marcarCampo);
}

// Campo que falta: borda amarela e, para o leitor de tela, obrigatório e inválido enquanto vazio.
function marcarCampo(el) {
  const vazio = String(el.value).trim() === "";
  el.classList.toggle("falta", vazio);
  el.setAttribute("aria-required", "true");
  if (vazio) el.setAttribute("aria-invalid", "true");
  else el.removeAttribute("aria-invalid");
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
  proc.total = linhas.length;
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
      gravarDoDesenho(CHAVE_REPETICOES, proc.a, todas);
      const el = $("processar-altura");
      if (el) el.innerHTML = textoAlturaProc();
    } else return;
    if (!t.dataset.repChave) gravarProcessamento(proc.a);
    proc.log = null; // o que foi processado antes já não vale
    if (t.dataset.obrigatorio !== undefined) marcarCampo(t);
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
// De onde vem cada campo da ficha e um exemplo do que escrever.
const DICAS_FICHA = {
  codigo: ["do nome do arquivo", "ex.: 00FE"],
  descricao: ["do nome do arquivo", "ex.: BLS ESTAMPA ONÇA"],
  maquina: ["do Processar ou do nome da pasta", "ex.: SSG122SV 7G"],
  tempo: ["tempo de tecimento de uma peça", "use a estimativa abaixo"],
  fio: ["fio principal", "composição e título, ex.: algodão 2/30"],
  bruto: ["peça tecida, antes do acabamento, em gramas", "gramas"],
  liquido: ["peça pronta, em gramas", "gramas"],
  data: ["dia da ficha", "dd/mm/aaaa"],
};
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

// Dois arquivos da mesma pasta: os dois da pasta conectada, ou abertos juntos do computador.
const daMesmaPasta = (a, x) => (a.origem === "pasta" && x.origem === "pasta") || (a.lotes || []).some((l) => (x.lotes || []).includes(l));

// Os .000 e .QFD abertos que andam com o desenho: os de mesmo nome e, se não houver, os da mesma pasta (na
// pasta da máquina eles costumam ter outro nome, como 00_C_P.000 e 00_M_P.QFD).
function arquivosDoPrograma(a) {
  const candidatos = estado.abas.filter((x) => x.tipo === "programa" || x.tipo === "ajustes");
  const base = baseDoNome(a.nome);
  let lista = candidatos.filter((x) => baseDoNome(x.nome) === base);
  let como = "com o mesmo nome do desenho";
  if (!lista.length) {
    // Os que têm o nome de outro desenho (aberto ou na lista da pasta) são daquele desenho, não deste.
    const outros = new Set([
      ...estado.abas.filter((x) => x.tipo === "dat").map((x) => baseDoNome(x.nome)),
      ...(a.origem === "pasta" ? (estado.arquivosPasta || []).filter((f) => /\.dat$/i.test(f.nome)).map((f) => baseDoNome(f.nome)) : []),
    ]);
    outros.delete(base);
    lista = candidatos.filter((x) => daMesmaPasta(a, x) && !outros.has(baseDoNome(x.nome)));
    como = "da mesma pasta do desenho";
  }
  lista.sort((x, y) => (x.tipo === y.tipo ? x.nome.localeCompare(y.nome) : x.tipo === "programa" ? -1 : 1));
  return { lista, programas: lista.filter((x) => x.tipo === "programa"), ajustes: lista.filter((x) => x.tipo === "ajustes"), como: lista.length ? como : "" };
}

// "7.984 bytes, 14 seções, 210 linhas de programa"; nos arquivos do mesmo tamanho, quantos bytes mudam.
function infoDoArquivoDoPrograma(x, lista) {
  const ab = x.aberto;
  const bytes = `${ab.tamanho.toLocaleString("pt-BR")} bytes`;
  let info;
  if (x.tipo === "programa") {
    const linhas = Math.max(0, ...ab.secoes.map((s) => (s.linhas ? s.linhas.length : 0)));
    info = `${bytes}, ${ab.secoes.length} seções, ${linhas} linhas de programa`;
  } else info = `${bytes}, ${ab.registros.length} registros`;
  const par = lista.find((o) => o !== x && o.tipo === x.tipo && o.aberto.tamanho === ab.tamanho && lista.indexOf(o) < lista.indexOf(x));
  if (par) {
    let dif = 0;
    for (let k = 0; k < ab.bytes.length; k++) if (ab.bytes[k] !== par.aberto.bytes[k]) dif++;
    info += dif ? `; difere de ${rotuloDaAba(par)} em ${dif.toLocaleString("pt-BR")} byte${dif === 1 ? "" : "s"}` : `; igual a ${rotuloDaAba(par)}`;
  }
  return info;
}

function htmlArquivosDoPrograma(a) {
  const { lista, como } = arquivosDoPrograma(a);
  if (!lista.length)
    return `<p class="suave pequeno">Nenhum .000 ou .QFD aberto com este desenho. Para ver aqui o que já está na pasta da máquina, abra a pasta inteira (ou os arquivos dela juntos).</p>`;
  return `<h3 class="sub">Na pasta hoje</h3><p class="suave pequeno">Arquivos abertos ${como}. O KnitPaint troca estes arquivos quando processa de novo.</p>
    <ul class="arquivos-programa">${lista
      .map((x) => `<li><span class="etiqueta-arquivo tipo-${x.tipo}">${x.tipo === "programa" ? "PROGRAMA" : "AJUSTES"}</span><span class="mono">${esc(rotuloDaAba(x))}</span><span class="suave pequeno">${esc(infoDoArquivoDoPrograma(x, lista))}</span></li>`)
      .join("")}</ul>`;
}

// O que foi escrito na ficha: { proprios: { campos, tempo }, corTexto, corFundo, escala }. Só o que a pessoa
// escreveu fica guardado; o resto (carreiras, agulhas, máquina, velocidade...) vem do desenho e do
// processamento cada vez que a ficha abre, para não ficar com contas velhas.
function fichaGuardada(a) {
  const salvo = lerDoDesenho(CHAVE_FICHA, a, {});
  const { corTexto, corFundo, escala } = salvo;
  const conferidos = { ...(salvo.conferidos || {}) }; // itens de "Antes de tecer" marcados à mão
  if (salvo.proprios) return { corTexto, corFundo, escala, conferidos, proprios: { campos: { ...(salvo.proprios.campos || {}) }, tempo: { ...(salvo.proprios.tempo || {}) } } };
  // Formato antigo, que guardava tudo junto: ficam os campos escritos e os números que não são contas.
  const t = salvo.tempo || {};
  const escrito = (v) => String(v ?? "").trim() !== "";
  const tempo = {};
  if (escrito(t.pecas) && Number(t.pecas) !== 1) tempo.pecas = t.pecas;
  if (escrito(t.sobra)) tempo.sobra = t.sobra;
  if (escrito(t.velocidade)) tempo.velocidade = t.velocidade;
  if (escrito(t.finura) && Number(t.finura) !== 7) tempo.finura = t.finura;
  const campos = Object.fromEntries(Object.entries(salvo.campos || {}).filter(([, v]) => escrito(v)));
  return { corTexto, corFundo, escala, conferidos, proprios: { campos, tempo } };
}

function abrirFicha() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const contagem = contarCores(a.doc);
  const base = trocarExtensao(a.nome, "");
  const pd = processamentoDe(a);
  const alt = alturaDesenvolvida(a);
  // "00FE_BLS_ESTAMPA_ONÇA": o primeiro pedaço com número é o código e o resto, a descrição.
  const partes = base.split("_").filter(Boolean);
  const comCodigo = partes.length > 1 && /\d/.test(partes[0]);
  const padrao = {
    campos: {
      codigo: comCodigo ? partes[0] : base,
      descricao: comCodigo ? partes.slice(1).join(" ") : base.replace(/_/g, " "),
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
  const salvo = fichaGuardada(a);
  const { proprios } = salvo;
  ficha = {
    a,
    guias: guiasDoDesenho(a),
    verificacao: null, // { erros, avisos } do Verificar, contados quando a lista "Antes de tecer" abre
    proprios,
    conferidos: salvo.conferidos,
    dados: {
      corTexto: salvo.corTexto ?? padrao.corTexto,
      corFundo: salvo.corFundo ?? padrao.corFundo,
      escala: salvo.escala ?? padrao.escala,
      campos: { ...padrao.campos, ...proprios.campos },
      tempo: { ...padrao.tempo, ...proprios.tempo },
    },
  };
  const v = ficha.dados;
  $("ficha-campos").innerHTML = RM.CAMPOS_FICHA.map(([id]) => {
    const [dica, exemplo] = DICAS_FICHA[id] || ["", ""];
    return `<div class="campo-com-dica"><label class="campo">${ROTULOS_FICHA[id]} <input type="text" maxlength="60" data-campo="${id}" value="${esc(v.campos[id] || "")}" placeholder="${esc(
      exemplo,
    )}" aria-describedby="dica-ficha-${id}" autocomplete="off"></label><span class="unidade" id="dica-ficha-${id}">${esc(dica)}</span></div>`;
  }).join("");
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
  $("ficha-pasta").hidden = !acessoAPastasDisponivel();
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
  const { a, dados, proprios, conferidos } = ficha;
  gravarDoDesenho(CHAVE_FICHA, a, { corTexto: dados.corTexto, corFundo: dados.corFundo, escala: dados.escala, proprios, conferidos });
}

// Arquivos abertos que podem ir no .zip; já vêm marcados o desenho, os que têm o mesmo nome e os .000 e .QFD
// da mesma pasta.
function desenharArquivosFicha() {
  const { a } = ficha;
  const juntos = new Set(arquivosDoPrograma(a).lista);
  const base = baseDoNome(a.nome);
  $("ficha-arquivos").innerHTML = estado.abas
    .map((x) => {
      const marcado = x === a || juntos.has(x) || baseDoNome(x.nome) === base;
      const bytes = x.tipo === "dat" && x.modificado ? tamanhoAoGravar(x) : x.tamanho;
      const tamanho = bytes === null ? "não deu para gravar" : `${bytes.toLocaleString("pt-BR")} bytes`;
      return `<li><label><input type="checkbox" data-arquivo="${x.id}"${marcado ? " checked" : ""}><span class="nome-arquivo">${esc(rotuloDaAba(x))}${
        x.modificado ? ' <span class="suave">(alterado)</span>' : ""
      }</span><span class="suave mono">${esc(TIPOS_ARQUIVO[x.tipo] || x.tipo)} · ${tamanho}</span></label></li>`;
    })
    .join("");
  atualizarBotoesEnviar();
}

// O desenho alterado vai como está agora: o tamanho é o do arquivo que seria gravado (o .zip confere de novo).
function tamanhoAoGravar(x) {
  try {
    return ShimaDat.gravar(x.doc).length;
  } catch (erro) {
    return null;
  }
}

// Os arquivos escolhidos para levar à máquina (o desenho como está agora) e, se pedido, a ficha e o resumo do
// processamento. Devolve [{ nome, bytes }] ou null (com o aviso dado).
async function arquivosDaFicha() {
  const { a } = ficha;
  const form = $("dlg-ficha").querySelector("form");
  const escolhidas = [...$("ficha-arquivos").querySelectorAll("[data-arquivo]:checked")]
    .map((el) => estado.abas.find((x) => x.id === Number(el.dataset.arquivo)))
    .filter(Boolean);
  if (!escolhidas.length && !form.zipResumo.checked) {
    avisar("Marque pelo menos um arquivo.");
    return null;
  }
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
    avisar(`Não foi possível juntar os arquivos: ${erro.message}`, true);
    return null;
  }
  if (form.zipResumo.checked) {
    const texto = (linhas) => new TextEncoder().encode(linhas.join("\r\n") + "\r\n");
    arquivos.push({ nome: nomeLivre(trocarExtensao(a.nome, "_FICHA.txt")), bytes: texto(imagemDaFicha().linhas) });
    arquivos.push({ nome: nomeLivre(trocarExtensao(a.nome, "_PROCESSAMENTO.txt")), bytes: texto(resumoDoProcessamento(a)) });
  }
  return arquivos;
}

async function baixarZipDaFicha() {
  if (!ficha) return;
  const arquivos = await arquivosDaFicha();
  if (!arquivos) return;
  const nome = trocarExtensao(ficha.a.nome, "_MAQUINA.zip");
  const entregue = await baixar(new Blob([zipComArquivos(arquivos)], { type: "application/zip" }), nome);
  if (entregue) avisar(`${entregue} com ${arquivos.length} arquivo${arquivos.length === 1 ? "" : "s"}: extraia e copie para o pendrive da máquina.`);
}

// No Chrome e no Edge dá para gravar direto numa pasta escolhida, como a do pendrive da máquina.
async function gravarNaPastaDaFicha() {
  if (!ficha || !acessoAPastasDisponivel()) return;
  // A janela da pasta vem primeiro, enquanto o clique ainda vale para o navegador.
  let pasta;
  try {
    pasta = await window.showDirectoryPicker({ id: "pendrive", mode: "readwrite" });
  } catch (erro) {
    if (erro && erro.name !== "AbortError") avisar(`Não foi possível abrir a pasta: ${erro.message}`, true);
    return;
  }
  if (estado.pastaLocal && (await pasta.isSameEntry(estado.pastaLocal).catch(() => false))) {
    return avisar("Essa é a pasta dos desenhos conectada ao editor. Escolha a pasta do pendrive (para guardar o desenho, use Salvar).", true);
  }
  const arquivos = await arquivosDaFicha();
  if (!arquivos) return;
  try {
    const existentes = [];
    for (const f of arquivos) {
      try {
        await pasta.getFileHandle(f.nome);
        existentes.push(f.nome);
      } catch (erro) {
        // Ainda não existe: vai ser criado.
      }
    }
    if (existentes.length && !(await perguntar(`Na pasta ${pasta.name} já existe${existentes.length === 1 ? "" : "m"}: ${existentes.join(", ")}. Substituir?`, "Substituir"))) return;
    for (const f of arquivos) {
      const gravavel = await (await pasta.getFileHandle(f.nome, { create: true })).createWritable();
      await gravavel.write(f.bytes);
      await gravavel.close();
    }
    avisar(`${arquivos.length} arquivo${arquivos.length === 1 ? "" : "s"} gravado${arquivos.length === 1 ? "" : "s"} em ${pasta.name}.`);
  } catch (erro) {
    avisar(`Não foi possível gravar na pasta: ${erro.message}`, true);
  }
}

// Quantos arquivos vão (os marcados e os dois .txt, se pedidos), nos botões do .zip e da pasta.
function atualizarBotoesEnviar() {
  if (!ficha) return;
  const form = $("dlg-ficha").querySelector("form");
  const n = $("ficha-arquivos").querySelectorAll("[data-arquivo]:checked").length + (form.zipResumo.checked ? 2 : 0);
  const quantos = `${n} arquivo${n === 1 ? "" : "s"}`;
  $("ficha-zip").textContent = `Baixar .zip (${quantos})`;
  $("ficha-pasta").textContent = `Gravar numa pasta… (${quantos})`;
  $("ficha-zip").disabled = $("ficha-pasta").disabled = !n;
}

// O que conferir antes de levar à máquina, com o que falta e onde resolver.
function itensAntesDeTecer() {
  const { a } = ficha;
  const blocos = blocosDeOpcao(a);
  if (ficha.verificacao === null) {
    // Conta os erros e os avisos do Verificar, com o mesmo limite de fio solto do diálogo dele.
    const maximo = inteiro($("dlg-verificar").querySelector("form").maximo.value, 5, 1, 500);
    // Os trechos difíceis são das peças do Modelo, não deste desenho: ficam no Verificar, fora desta conta.
    const todos = itensDoVerificar(a, maximo);
    const lista = todos.filter((i) => i.regra !== "forma");
    ficha.verificacao = {
      erros: lista.filter((i) => i.nivel === "erro").length,
      avisos: lista.filter((i) => i.nivel === "aviso").length,
      forma: todos.length - lista.length,
    };
  }
  const uso = RM.usoDoProcessamento(a.doc, blocos);
  const pd = completarGuias(processamentoDe(a), uso);
  const total = somaFaltas(RM.faltasDoProcessamento(pd, uso, repeticoesDe(a)));
  const preenchido = (v) => String(v ?? "").trim() !== "";
  const semFio = uso.guias.filter((u) => !preenchido((pd.guias[u.valor] || {}).fio)).map((u) => u.valor);
  const c = ficha.dados.campos;
  const vazios = ["codigo", "descricao", "maquina", "fio"].filter((k) => !preenchido(c[k])).map((k) => ROTULOS_FICHA[k].toLowerCase());
  const doPrograma = arquivosDoPrograma(a);
  const programas = doPrograma.programas.length > 0 && doPrograma.ajustes.length > 0;
  const { erros, avisos, forma } = ficha.verificacao;
  const daForma = forma ? `; e ${forma} trecho${forma === 1 ? "" : "s"} difíce${forma === 1 ? "l" : "is"} na forma do Modelo, que não conta${forma === 1 ? "" : "m"} aqui` : "";
  const plural = (n, nome) => `${n} ${nome}${n === 1 ? "" : "s"}`;
  const itens = [
    {
      id: "verificar",
      ok: !erros && !avisos,
      titulo: "Verificar: desenho sem erros nem avisos",
      detalhe: `${
        erros
          ? `${plural(erros, "erro")}${avisos ? ` e ${plural(avisos, "aviso")}` : ""} no desenho: corrija os erros antes de tecer`
          : avisos
            ? `${plural(avisos, "aviso")} no desenho: confira se são esperados`
            : "nenhum erro nem aviso nas regras do desenho"
      }${daForma}`,
      ir: "verificar",
      botao: "Verificar…",
    },
    { id: "processamento", ok: !total, titulo: "Processamento completo", detalhe: total ? `faltam ${total} valores` : "todos os passos preenchidos", ir: "processar", botao: "Processar…" },
    { id: "fios", ok: !semFio.length, titulo: "Fio de cada guia-fio", detalhe: semFio.length ? `sem fio: R3 ${semFio.join(", ")} (preencha nesta ficha)` : uso.guias.length ? "todos os guias com fio" : "a R3 não usa guias" },
    { id: "ficha", ok: !vazios.length, titulo: "Ficha preenchida", detalhe: vazios.length ? `falta: ${vazios.join(", ")}` : "código, descrição, máquina e fio" },
    { id: "tempo", ok: preenchido(c.tempo), titulo: "Tempo de tecimento", detalhe: preenchido(c.tempo) ? c.tempo : "calcule aqui e use no campo TEMPO TEC" },
    { id: "salvo", ok: !a.modificado, titulo: "Desenho salvo", detalhe: a.modificado ? "há alterações sem salvar" : "sem alterações pendentes", ir: "salvar", botao: "Salvar" },
    {
      id: "programa",
      ok: programas,
      titulo: "Programa (.000) e ajustes (.QFD)",
      detalhe: programas
        ? `abertos ${doPrograma.como}: ${doPrograma.lista.map((x) => x.nome).join(", ")}`
        : "gere no KnitPaint com estes valores, ou abra os da pasta para irem no .zip",
    },
    { id: "amostra", manual: true, ok: false, titulo: "Amostra tecida e aprovada", detalhe: "marque depois de tecer a amostra e conferir medidas, ponto e cores" },
  ];
  // Os avisos esperados, o programa feito fora daqui e a amostra podem ser marcados à mão. A marca vale para o
  // desenho como ele estava ao marcar: mudou o desenho (ou é outro arquivo com o mesmo nome), ela cai.
  const impressao = impressaoDoDesenho(a);
  for (const i of itens) {
    i.marcavel = MARCAVEIS.has(i.id);
    if (i.ok || !i.marcavel || ficha.conferidos[i.id] !== impressao) continue;
    i.ok = true;
    i.aMao = true;
    i.detalhe = i.manual ? "marcado à mão" : `marcado à mão (${i.detalhe})`;
  }
  return itens;
}

const MARCAVEIS = new Set(["verificar", "programa", "amostra"]);

// Resumo do desenho (tamanho e soma dos pontos) que muda quando o desenho muda.
function impressaoDoDesenho(a) {
  const d = a.doc;
  return `${d.largura}x${d.altura}:${crc32(d.pixels).toString(16)}`;
}

function desenharChecklist() {
  const itens = itensAntesDeTecer();
  $("ficha-check-total").textContent = `${itens.filter((i) => i.ok).length} de ${itens.length}`;
  $("ficha-checklist").innerHTML = itens
    .map(
      (i) => `<li class="${i.ok ? "ok" : "pendente"}"><span class="marca-check" aria-hidden="true">${i.ok ? "✓" : "!"}</span><span><span class="escondido">${
        i.ok ? "Feito:" : "Pendente:"
      } </span>${esc(i.titulo)}<small>${esc(i.detalhe)}</small></span><span class="acoes-check">${
        !i.ok && i.ir ? `<button type="button" class="botao pequeno" data-ir="${i.ir}">${esc(i.botao)}</button>` : ""
      }${
        i.marcavel && (!i.ok || i.aMao)
          ? `<label class="marca-manual"><input type="checkbox" data-conferido="${i.id}"${i.aMao ? " checked" : ""}> ${i.manual ? "feito" : "conferido"}</label>`
          : ""
      }</span></li>`,
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
      if (alvo.dataset.campo) v.campos[alvo.dataset.campo] = ficha.proprios.campos[alvo.dataset.campo] = alvo.value;
      else if (alvo.name && alvo.name.startsWith("t-")) v.tempo[alvo.name.slice(2)] = ficha.proprios.tempo[alvo.name.slice(2)] = alvo.value;
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
    ficha.dados.campos.tempo = ficha.proprios.campos.tempo = formatarTempo(s);
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
  $("ficha-pasta").addEventListener("click", gravarNaPastaDaFicha);
  $("ficha-pasta").hidden = !acessoAPastasDisponivel();
  $("ficha-arquivos").addEventListener("change", atualizarBotoesEnviar);
  $("dlg-ficha").querySelector("form").zipResumo.addEventListener("change", atualizarBotoesEnviar);
  $("ficha-checklist").addEventListener("change", (e) => {
    const id = e.target.dataset.conferido;
    if (!id || !ficha) return;
    if (e.target.checked) ficha.conferidos[id] = impressaoDoDesenho(ficha.a);
    else delete ficha.conferidos[id];
    gravarFicha();
    desenharChecklist();
    const novo = $("ficha-checklist").querySelector(`[data-conferido="${id}"]`);
    if (novo) novo.focus();
  });
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

// ------------------------------------------------------------------ etapas
// As 10 etapas de desenvolver um modelo, na ordem do protótipo. O desenho e as linhas de opção não são diálogos:
// ficam no editor e no painel à direita. Cada diálogo diz em que etapa está e leva à próxima.

const ETAPAS = [
  { id: "modelo", nome: "Modelo", texto: "medidas em agulhas e carreiras" },
  { id: "forma", nome: "Forma", texto: "diminuições, aumentos e arremates de cada peça" },
  { id: "desenho", nome: "Desenho", texto: "o desenho ponto a ponto, com a biblioteca e o carimbo" },
  { id: "jacquard", nome: "Jacquard e intarsia", texto: "padrões, fios soltos e guia-fios" },
  { id: "linhas", nome: "Linhas de opção", texto: "guia-fio, ponto, economizador e outras funções carreira por carreira" },
  { id: "desenvolver", nome: "Pacotes e altura", texto: "início, barra, final e repetições" },
  { id: "processar", nome: "Processar", texto: "os números das linhas de opção ganham os valores da máquina" },
  { id: "verificar", nome: "Verificar", texto: "achar erros e trechos difíceis antes de regular a máquina" },
  { id: "simular", nome: "Simular", texto: "a malha com o fio e as cores" },
  { id: "ficha", nome: "Ficha e máquina", texto: "ficha técnica e arquivos para levar à máquina" },
];
const ETAPA_DO_DIALOGO = {
  "dlg-modelo": "modelo",
  "dlg-forma": "forma",
  "dlg-gerar": "jacquard",
  "dlg-jacquard": "jacquard",
  "dlg-desenvolver": "desenvolver",
  "dlg-processar": "processar",
  "dlg-verificar": "verificar",
  "dlg-simular": "simular",
  "dlg-ficha": "ficha",
};

function irParaEtapa(id) {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  if (id === "desenho") return avisar("Etapa 3: desenhe no editor (a biblioteca de pontos e o carimbo ficam no painel à direita). Depois siga para a 4: Gerar padrão ou Jacquard e intarsia.");
  if (id === "linhas") {
    $("lista-opcoes").scrollIntoView({ block: "start" });
    return avisar("Etapa 5: escolha uma linha de opção no painel à direita para ver e pintar os valores dela. Depois siga para a 6: Pacotes e altura.");
  }
  RECURSOS[id]();
}

for (const [dialogo, id] of Object.entries(ETAPA_DO_DIALOGO)) {
  const i = ETAPAS.findIndex((e) => e.id === id);
  const anterior = ETAPAS[i - 1], proxima = ETAPAS[i + 1];
  const barra = $(dialogo).querySelector(".botoes-dialogo");
  barra.insertAdjacentHTML("afterbegin", `<span class="etapa-dialogo">Etapa ${i + 1} de ${ETAPAS.length} · ${esc(ETAPAS[i].texto)}</span>`);
  const botoes = [
    anterior ? `<button type="button" class="botao" data-proxima-etapa="${anterior.id}">← ${esc(anterior.nome)}</button>` : "",
    proxima
      ? `<button type="button" class="botao" data-proxima-etapa="${proxima.id}">Próximo: ${esc(proxima.nome)} →</button>`
      : `<button type="button" class="botao" data-proxima-etapa="${ETAPAS[0].id}">Voltar ao início</button>`,
  ].join("");
  barra.querySelector('[value="fechar"]').insertAdjacentHTML("afterend", botoes);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-proxima-etapa]");
  if (b && abaDat()) irParaEtapa(b.dataset.proximaEtapa);
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
