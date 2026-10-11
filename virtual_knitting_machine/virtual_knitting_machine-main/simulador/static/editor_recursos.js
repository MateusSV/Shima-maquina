"use strict";

// Recursos para desenvolver o modelo dentro do editor, como no KnitPaint:
//   barra e painel  carimbo de ponto (K), símbolos dos pontos, biblioteca de pontos e repetição,
//                   uma linha de opção por vez (faixas de valores, nome, pintar valor)
//   diálogos        modelo, forma, gerar padrão, jacquard e intarsia, verificar (com as agulhas),
//                   altura com repetições, simular malha e ficha técnica
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

// Abre uma aba com um desenho novo, com a paleta e as configurações do desenho aberto.
function criarDesenhoNovo(nome, img) {
  const ref = referenciaParaNovo();
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
  m && typeof m.nome === "string" && Number.isInteger(m.w) && Number.isInteger(m.h) && m.w > 0 && m.h > 0 && Array.isArray(m.px) && m.px.length === m.w * m.h;
const meusMotivos = lerArmazenado(CHAVE_MOTIVOS, []).filter(motivoValido);
let categoriaBiblioteca = 0;

function categoriasDaBiblioteca() {
  return [...RM.BIBLIOTECA, { categoria: "Meus motivos", motivos: meusMotivos, meus: true }];
}

function desenharBiblioteca() {
  const a = abaDat();
  if (!a) return;
  const cats = categoriasDaBiblioteca();
  categoriaBiblioteca = limitar(categoriaBiblioteca, 0, cats.length - 1);
  $("categorias-biblioteca").innerHTML = cats
    .map((c, i) => `<button type="button" class="chip" data-categoria="${i}" aria-pressed="${i === categoriaBiblioteca}">${esc(c.categoria)}</button>`)
    .join("");
  const cat = cats[categoriaBiblioteca];
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
            const escolhida = e && e.id === id && e.yBase === f.yBase && e.yTopo === f.yTopo;
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
  a.faixaEscolhida = { id: atual.id, yBase: f.yBase, yTopo: f.yTopo };
  selecionarNoDesenho(a, { x: RM.colunaDoValor(atual.bloco, atual.k), y: f.yTopo, w: 1, h: f.yBase - f.yTopo + 1 });
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
const modelo = Object.assign({ estilo: "careca", colunas: 30, carreiras: 40, valores: {} }, lerArmazenado(CHAVE_MODELO, {}));
let ultimoModelo = null;

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
  desenharMedidas();
  abrirJanela("dlg-modelo");
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
  return { peca, plano: RM.planoForma(peca.forma, { porVez: formaOpcoes.porVez, marca: formaOpcoes.marca }) };
}

function desenharFormaDialogo() {
  const { plano } = planoAtual();
  const img = RM.pixelsDaForma(plano, { malha: 1, fora: 0, barra: 2, arremate: 3, parcial: 4, marcaEsq: 5, marcaDir: 5, aumento: 6 });
  const cores = [[43, 40, 36], ...CORES_FORMA.map(([cor]) => rgbDeHex(cor))];
  const cv = $("forma-previa");
  pintarPixels(cv, img, (v) => cores[v], zoomQueCabeEm(img.w, img.h, larguraUtil(cv, 440), 460, 6));
  cv.setAttribute("aria-label", `Forma: ${plano.resumo}`);
  $("forma-resumo").textContent = plano.resumo;
  $("forma-passos").innerHTML = plano.passos
    .map(
      (s) => `<li${s.aviso ? ' class="passo-aviso"' : ""}><strong>${esc(s.nome)}</strong>${
        s.de !== undefined ? ` <span class="onde">${s.de === s.ate ? `carreira ${s.de}` : `carreiras ${s.de}–${s.ate}`}</span>` : ""
      }<br>${esc(s.texto)}</li>`,
    )
    .join("");
}

// Pontos da forma com os códigos escolhidos (barra e aumento usam o código da malha).
function imagemDaForma() {
  const { peca, plano } = planoAtual();
  return { peca, img: RM.pixelsDaForma(plano, { ...formaOpcoes.codigos }) };
}

{
  const form = $("dlg-forma").querySelector("form");
  form.addEventListener("input", (e) => {
    const alvo = e.target;
    if (alvo.name === "peca") formaPeca = Number(alvo.value);
    else if (alvo.name === "porVez") formaOpcoes.porVez = Number(alvo.value);
    else if (alvo.name === "marca") formaOpcoes.marca = inteiro(alvo.value, 3, 1, 8);
    else if (alvo.name in CODIGOS_FORMA) formaOpcoes.codigos[alvo.name] = inteiro(alvo.value, CODIGOS_FORMA[alvo.name], 0, 255);
    else return;
    gravarArmazenado(CHAVE_FORMA, formaOpcoes);
    desenharFormaDialogo();
  });
  $("forma-novo").addEventListener("click", () => {
    const { peca, img } = imagemDaForma();
    $("dlg-forma").close();
    criarDesenhoNovo(`${RM.semAcento(peca.nome).replace(/\s+/g, "_")}.dat`, img);
    avisar(`${peca.nome}: ${img.w} agulhas × ${img.h} carreiras num desenho novo. Faltam as linhas de opção.`);
  });
  $("forma-colar").addEventListener("click", () => {
    const a = abaDat();
    if (!a) return;
    const { img } = imagemDaForma();
    $("dlg-forma").close();
    colarNoDesenho(a, img, "Forma como colagem: arraste para posicionar e aperte Enter para fixar.");
  });
}

// ------------------------------------------------------------------ gerar padrão

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
  const w = inteiro(form.largura.value, 48, 1, 8000), h = inteiro(form.altura.value, 40, 1, 8000);
  if (w * h > 4000000) return null;
  if (tipo === "listras") {
    const listras = form.listras.value
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [cor, n] = s.split(/\s*[:x×]\s*/);
        return { cor: numeroCor(cor), carreiras: inteiro(n, 1, 1, 8000) };
      });
    return listras.length ? { w, h, px: RM.gerarListras(w, h, listras) } : null;
  }
  const corC = String(form.corC.value).trim() === "" ? null : numeroCor(form.corC.value);
  const cores = [numeroCor(form.corA.value), numeroCor(form.corB.value), corC];
  return { w, h, px: RM.gerarLosango(w, h, inteiro(form.dw.value, 24, 2, 400), inteiro(form.dh.value, 30, 2, 400), cores) };
}

function desenharGerar() {
  const a = abaDat();
  if (!a) return;
  const form = $("dlg-gerar").querySelector("form");
  const tipo = form.tipo.value;
  form.querySelectorAll("[data-para]").forEach((el) => (el.hidden = !el.dataset.para.split(" ").includes(tipo)));
  const img = imagemGerada(form);
  const cv = $("gerar-previa");
  $("gerar-colar").disabled = !img;
  cv.hidden = !img;
  if (!img) {
    $("gerar-info").textContent = tipo === "listras" ? "Escreva as listras como cor:carreiras, separadas por vírgula." : "Tamanho grande demais.";
    return;
  }
  pintarPixels(cv, img, corDaPaleta(a.doc), zoomQueCabeEm(img.w, img.h, larguraUtil(cv, 440), 400, 8));
  const cores = RM.coresDaArea(img.px, img.w, { x: 0, y: 0, w: img.w, h: img.h }).map((c) => c.cor);
  $("gerar-info").textContent = `${img.w} agulhas × ${img.h} carreiras · cores ${cores.join(", ")}. Entra como colagem no canto da seleção (ou no canto visível).`;
}

{
  const form = $("dlg-gerar").querySelector("form");
  form.addEventListener("input", desenharGerar);
  $("gerar-colar").addEventListener("click", () => {
    const a = abaDat();
    const img = imagemGerada(form);
    if (!a || !img) return;
    $("dlg-gerar").close();
    colarNoDesenho(a, img);
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
  Object.assign(jacquard, { longas, maior });
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
    <p class="suave pequeno">Cada trecho seguido de uma cor numa carreira precisa do seu guia; um guia volta a servir quando a área dele acaba. São ${intarsia.areas.length.toLocaleString("pt-BR")} áreas de cor.</p></div>`;
  desenharMapaJacquard();
}

function desenharMapaJacquard() {
  const { a, r, longas, intarsia } = jacquard;
  const d = a.doc;
  const guias = $("dlg-jacquard").querySelector("form").vista.value === "guias";
  const cv = $("jacquard-mapa");
  const z = limitar(Math.floor(Math.min(larguraUtil(cv, 480) / r.w, 460 / r.h)), 1, 12);
  const base = document.createElement("canvas");
  if (guias) pintarPixels(base, { w: r.w, h: r.h, px: intarsia.guiaDe }, (v) => (v > 0 ? rgbDoGuia(v) : [0, 0, 0]), 1);
  else pintarPixels(base, recortarArea(d, r), corDaPaleta(d), 1);
  const g = ajustarTela(cv, r.w * z, r.h * z);
  g.imageSmoothingEnabled = false;
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
  if (!e.target.closest('[data-jacquard="maior"]') || !jacquard || !jacquard.maior) return;
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
    const d = verif.a.doc;
    if (noDesenho) {
      const x0 = item.x0 ?? 0, x1 = item.x1 ?? d.largura - 1;
      $("dlg-verificar").close();
      selecionarNoDesenho(verif.a, { x: x0, y: d.altura - faixa.ate, w: x1 - x0 + 1, h: faixa.ate - faixa.de + 1 });
      return;
    }
    const i = verif.lista.findIndex((p) => p.numero === item.painel);
    verif.tocando = false;
    form.querySelector('[data-agulhas="tocar"]').textContent = "Tocar";
    escolherPainelVerif(i < 0 ? verif.painel : i, faixa.de);
  });
  $("dlg-verificar").addEventListener("close", () => verif && cancelAnimationFrame(verif.raf));
}

// ------------------------------------------------------------------ altura com repetições (R2)

const CHAVE_REPETICOES = "editor-shima-repeticoes:";
let desenv = null;

function repeticoesDe(a) {
  if (!a.repeticoes) a.repeticoes = lerArmazenado(CHAVE_REPETICOES + a.nome, {});
  return a.repeticoes;
}

function abrirDesenvolver() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const lista = RM.paineis(blocosDeOpcao(a)).filter((p) => p.R && p.R.colunas[2]);
  if (!lista.length) return avisar("Este desenho não tem as linhas de opção R1–R20: não há blocos de repetição (R2).", true);
  desenv = { a, lista, painel: 0, dev: null };
  $("dlg-desenvolver").querySelector("form").painel.innerHTML = lista
    .map((p, i) => `<option value="${i}">Painel ${p.numero}${p.x0 !== null ? ` · agulhas ${p.x0 + 1}–${p.x1 + 1}` : ""}</option>`)
    .join("");
  desenharDesenvolver();
  abrirJanela("dlg-desenvolver");
}

function desenharDesenvolver() {
  const { a, lista } = desenv;
  const p = lista[desenv.painel];
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
    : `<p class="suave">Sem blocos marcados na R2 deste painel: a altura é a do desenho.</p>`;
  atualizarTotalDesenvolver();
}

function atualizarTotalDesenvolver() {
  const { dev } = desenv;
  for (const b of dev.blocos) {
    const el = $("desenvolver-tabela").querySelector(`[data-total="${b.chave}"]`);
    if (el) el.textContent = b.carreiras * b.vezes;
  }
  $("desenvolver-total").innerHTML = `<strong>${dev.desenvolvidas.toLocaleString("pt-BR")}</strong> carreiras com as repetições; o desenho tem ${dev.compactadas.toLocaleString("pt-BR")}.`;
}

{
  const form = $("dlg-desenvolver").querySelector("form");
  form.painel.addEventListener("change", () => {
    if (!desenv) return;
    desenv.painel = Number(form.painel.value);
    desenharDesenvolver();
  });
  $("desenvolver-tabela").addEventListener("input", (e) => {
    const chave = e.target.dataset.chave;
    if (!chave || !desenv) return;
    const { a, lista } = desenv;
    const p = lista[desenv.painel];
    const todas = repeticoesDe(a);
    todas[p.numero] = { ...(todas[p.numero] || {}), [chave]: inteiro(e.target.value, 1, 1, 9999) };
    gravarArmazenado(CHAVE_REPETICOES + a.nome, todas);
    desenv.dev = RM.desenvolvimento(a.doc, p, todas[p.numero]);
    atualizarTotalDesenvolver();
  });
  $("desenvolver-criar").addEventListener("click", () => {
    if (!desenv) return;
    const { a, dev } = desenv;
    if (!dev.blocos.some((b) => b.vezes > 1)) return avisar("Diga quantas vezes algum bloco se repete (mais de 1) para desenvolver.");
    const altura = a.doc.altura + dev.desenvolvidas - dev.compactadas;
    if (altura > 8000) return avisar(`O desenho ficaria com ${altura.toLocaleString("pt-BR")} carreiras; o limite do editor é 8.000.`, true);
    const img = RM.desenharDesenvolvido(a.doc, dev.blocos);
    $("dlg-desenvolver").close();
    criarDesenhoNovo(trocarExtensao(a.nome, "_DESENVOLVIDO.dat"), img);
    avisar(`Desenho desenvolvido com ${img.h} carreiras. As carreiras inteiras se repetem, com todos os painéis.`);
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
const coresDosGuias = {};
let simul = null;

function abrirSimular() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const d = a.doc;
  const { r, texto } = areaDeAnalise(a, "simulando");
  const w = Math.min(r.w, LIMITE_SIMULACAO.w), h = Math.min(r.h, LIMITE_SIMULACAO.h);
  const area = { x: r.x, y: r.y + r.h - h, w, h };
  // Guia-fio de cada carreira pela R3; sem valor, continua o da carreira de baixo.
  const p = painelDaArea(a, r);
  const guiaDaLinha = new Map();
  let ultimo = null;
  if (p) {
    for (let y = r.y + r.h - 1; y >= area.y; y--) {
      const v = RM.valoresDaLinha(d, p.R, 3, y)[0];
      if (v) ultimo = v;
      guiaDaLinha.set(y, ultimo);
    }
  }
  const guias = [...new Set([...guiaDaLinha.values()].filter((v) => v !== null))].sort((x, y) => x - y);
  guias.forEach((g) => {
    if (!coresDosGuias[g]) coresDosGuias[g] = CORES_FIO[(g - 1) % CORES_FIO.length];
  });
  simul = { a, area, guiaDaLinha, guias, zoom: 1 };
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
  desenharFiosSimular();
  abrirJanela("dlg-simular");
  desenharSimulacao();
}

function desenharFiosSimular() {
  const form = $("dlg-simular").querySelector("form");
  $("simular-fios").innerHTML =
    form.cores.value === "guia"
      ? simul.guias.map((g) => `<label class="fio"><input type="color" data-guia="${g}" value="${coresDosGuias[g]}"><span>Fio do guia ${g}</span></label>`).join("")
      : `<p class="suave pequeno">Cada ponto usa a cor dele na paleta do desenho.</p>`;
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
    const corDaLinha = guia ? coresDosGuias[guia] : "#9AA1AE";
    for (let xx = 0; xx < area.w; xx++) {
      // O avesso é visto por trás: espelhado, com frente e atrás trocados.
      const v = d.pixels[y * d.largura + area.x + (avesso ? area.w - 1 - xx : xx)];
      let tipo = todosEmMalha ? "frente" : RM.tipoDePonto(v);
      if (!tipo || tipo === "guia") continue;
      if (avesso) tipo = TROCA_AVESSO[tipo] || tipo;
      const cor = porGuia ? corDaLinha : hexCor(d.paleta[v]);
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
    if (e.target.dataset.guia) coresDosGuias[e.target.dataset.guia] = e.target.value;
    if (e.target.name === "cores") desenharFiosSimular();
    desenharSimulacao();
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

// ------------------------------------------------------------------ ficha técnica

const CHAVE_FICHA = "editor-shima-ficha:";
const ROTULOS_FICHA = { codigo: "Código", descricao: "Descrição", maquina: "Máquina", tempo: "Tempo de tecimento", fio: "Fio", bruto: "Peso bruto", liquido: "Peso líquido", data: "Data" };
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

// Agulhas que tecem na área de desenho do painel (da primeira à última com código de malha).
function agulhasDeMalha(a, p) {
  const d = a.doc;
  let esquerda = Infinity, direita = -Infinity;
  for (let y = p.y0; y <= p.y1; y++) {
    for (let x = p.x0; x <= p.x1; x++) {
      if (!RM.TECE.has(d.pixels[y * d.largura + x])) continue;
      if (x < esquerda) esquerda = x;
      if (x > direita) direita = x;
    }
  }
  return direita >= esquerda ? direita - esquerda + 1 : p.x1 - p.x0 + 1;
}

function abrirFicha() {
  const a = abaDat();
  if (!a) return;
  fixarFlutuante(a);
  const contagem = contarCores(a.doc);
  const base = trocarExtensao(a.nome, "");
  const p = RM.paineis(blocosDeOpcao(a)).find((q) => q.x0 !== null && q.R);
  const dev = p ? RM.desenvolvimento(a.doc, p, repeticoesDe(a)[p.numero] || {}) : null;
  const padrao = {
    campos: { codigo: base, descricao: base.replace(/_/g, " "), maquina: "", tempo: "", fio: "", bruto: "", liquido: "", data: new Date().toLocaleDateString("pt-BR") },
    fios: {},
    corTexto: contagem[232] ? 232 : estado.primaria,
    corFundo: estado.fundo,
    escala: 1,
    tempo: { carreiras: dev ? dev.desenvolvidas : a.doc.altura, agulhas: p ? agulhasDeMalha(a, p) : a.doc.largura, pecas: 1, finura: 7, velocidade: "", sobra: "" },
  };
  const salvo = lerArmazenado(CHAVE_FICHA + a.nome, {});
  ficha = {
    a,
    guias: guiasDoDesenho(a),
    dados: {
      ...padrao,
      ...salvo,
      campos: { ...padrao.campos, ...(salvo.campos || {}) },
      fios: { ...(salvo.fios || {}) },
      tempo: { ...padrao.tempo, ...(salvo.tempo || {}) },
    },
  };
  const v = ficha.dados;
  $("ficha-campos").innerHTML = RM.CAMPOS_FICHA.map(
    ([id]) => `<label class="campo">${ROTULOS_FICHA[id]} <input type="text" maxlength="60" data-campo="${id}" value="${esc(v.campos[id] || "")}" autocomplete="off"></label>`,
  ).join("");
  $("ficha-guias").innerHTML = ficha.guias.length
    ? ficha.guias.map((g) => `<label class="campo">Guia ${g} <input type="text" maxlength="40" data-fio="${g}" value="${esc(v.fios[g] || "")}" placeholder="ex.: algodão 2/30" autocomplete="off"></label>`).join("")
    : `<p class="suave pequeno">Nenhum guia-fio na R3 deste desenho.</p>`;
  const form = $("dlg-ficha").querySelector("form");
  for (const k of Object.keys(v.tempo)) if (form[`t-${k}`]) form[`t-${k}`].value = v.tempo[k];
  form.corTexto.value = v.corTexto;
  form.corFundo.value = v.corFundo;
  form.escala.value = String(v.escala);
  abrirJanela("dlg-ficha");
  desenharFicha();
}

function imagemDaFicha() {
  const v = ficha.dados;
  const linhas = RM.linhasDaFicha(v.campos, ficha.guias.map((g) => ({ guia: g, fio: v.fios[g] || "" })));
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

{
  const form = $("dlg-ficha").querySelector("form");
  form.addEventListener("input", (e) => {
    if (!ficha) return;
    const alvo = e.target;
    const v = ficha.dados;
    if (alvo.dataset.campo) v.campos[alvo.dataset.campo] = alvo.value;
    else if (alvo.dataset.fio) v.fios[alvo.dataset.fio] = alvo.value;
    else if (alvo.name && alvo.name.startsWith("t-")) v.tempo[alvo.name.slice(2)] = alvo.value;
    else if (alvo.name === "corTexto" || alvo.name === "corFundo") v[alvo.name] = numeroCor(alvo.value);
    else if (alvo.name === "escala") v.escala = Number(alvo.value);
    else return;
    gravarFicha();
    desenharFicha();
  });
  $("ficha-usar-tempo").addEventListener("click", () => {
    const s = ficha && tempoDaFicha();
    if (s === null || !ficha) return;
    ficha.dados.campos.tempo = formatarTempo(s);
    $("ficha-campos").querySelector('[data-campo="tempo"]').value = ficha.dados.campos.tempo;
    gravarFicha();
    desenharFicha();
  });
  $("ficha-txt").addEventListener("click", () => {
    if (!ficha) return;
    const { linhas } = imagemDaFicha();
    baixar(new Blob([linhas.join("\r\n") + "\r\n"], { type: "text/plain" }), trocarExtensao(ficha.a.nome, "_FICHA.txt"));
  });
  $("ficha-escrever").addEventListener("click", () => {
    if (!ficha) return;
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
  simular: abrirSimular,
  ficha: abrirFicha,
};

$("painel-dat").addEventListener("click", (e) => {
  const b = e.target.closest("[data-recurso]");
  if (b && abaDat()) RECURSOS[b.dataset.recurso]();
});

// Enter num campo dos diálogos grandes não fecha o diálogo.
document.querySelectorAll("dialog.largo").forEach((dlg) =>
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) e.preventDefault();
  }),
);

desenharLegendaSimbolos();
