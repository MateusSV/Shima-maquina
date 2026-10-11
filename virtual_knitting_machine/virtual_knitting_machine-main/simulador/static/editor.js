"use strict";

// Editor dos arquivos da Shima Seiki.
//   .dat        desenho do KnitPaint: edição completa (ShimaDat lê e grava)
//   .000 / .QFD programa e ajustes da máquina: consulta (ShimaArquivos lê)
//   imagens     visualização e importação para dentro de um desenho
// Os pixels do desenho ficam em doc.pixels (um número de cor por pixel, linha de cima primeiro).

const $ = (id) => document.getElementById(id);

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const ZOOM_GRADE = 6;
const LIMITE_HISTORICO = 60;
const LIMITE_MEMORIA_HISTORICO = 300 * 1024 * 1024; // bytes de pixels guardados para desfazer, por aba
const LIMITE_HEX = 4096; // linhas de 16 bytes mostradas de uma vez
const EXT_IMAGEM = /\.(png|jpe?g|gif|webp|bmp)$/i;
const FERRAMENTAS = {
  lapis: { nome: "Lápis", tecla: "b" },
  borracha: { nome: "Borracha", tecla: "e" },
  linha: { nome: "Linha", tecla: "l" },
  retangulo: { nome: "Retângulo", tecla: "r" },
  "retangulo-cheio": { nome: "Retângulo cheio", tecla: "f" },
  balde: { nome: "Balde", tecla: "g" },
  "conta-gotas": { nome: "Conta-gotas", tecla: "i" },
  selecao: { nome: "Seleção", tecla: "m" },
  carimbo: { nome: "Carimbo", tecla: "k" },
};
// Nomes de cores e de linhas de opção vindos de referências públicas do KnitPaint. Variam entre versões:
// aparecem como sugestão ("?") até a pessoa confirmar ou trocar o nome na legenda.
const SUGESTOES_CORES = {
  1: "malha na frente",
  2: "malha atrás",
  3: "malha frente e atrás",
  11: "tuck na frente",
  12: "tuck atrás",
  13: "largura do guia-fio",
  16: "sem seleção (não tece)",
};
const NOMES_LINHAS = { R1: "economizador / repetição", R2: "economizador: repetição de fora", R3: "guia-fio", R5: "cancelar malha", R6: "ponto (densidade)" };
const CHAVE_LEGENDA = "editor-shima-legenda";
const CHAVE_NOMES_LINHAS = "editor-shima-nomes-linhas";

function lerLegenda() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LEGENDA) || "{}") || {};
  } catch (erro) {
    return {};
  }
}

function gravarLegenda(legenda) {
  try {
    localStorage.setItem(CHAVE_LEGENDA, JSON.stringify(legenda));
  } catch (erro) {
    // Sem armazenamento: a legenda vale só até fechar a página.
  }
}

const legenda = lerLegenda();

function nomeDaCor(n) {
  if (legenda[n]) return legenda[n];
  return SUGESTOES_CORES[n] ? `${SUGESTOES_CORES[n]}?` : "";
}

// Nomes das linhas de opção (L1–L20, R1–R20) dados pela pessoa; sem nome, vale a sugestão com "?".
const nomesLinhas = (() => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_NOMES_LINHAS) || "{}") || {};
  } catch (erro) {
    return {};
  }
})();

function nomeDaLinha(id) {
  if (nomesLinhas[id]) return nomesLinhas[id];
  return NOMES_LINHAS[id] ? `${NOMES_LINHAS[id]}?` : "";
}

function renomearLinha(id, nome) {
  if (nome) nomesLinhas[id] = nome;
  else delete nomesLinhas[id];
  try {
    localStorage.setItem(CHAVE_NOMES_LINHAS, JSON.stringify(nomesLinhas));
  } catch (erro) {
    // Sem armazenamento: o nome vale só até fechar a página.
  }
}

const TIPOS = { dat: "desenho", programa: "programa", ajustes: "ajustes", imagem: "imagem", desconhecido: "outro" };

const estado = {
  abas: [],
  atual: null,
  servidor: false,
  pastaLocal: null, // pasta do computador conectada pelo navegador (Chrome/Edge)
  pastaGuardada: null, // pasta da última vez, esperando permissão para reconectar
  pasta: "",
  arquivosPasta: [],
  ferramenta: "lapis",
  pincel: 1,
  primaria: 1,
  secundaria: 0,
  fundo: 0,
  grade: true,
  colarTransparente: false,
  area: null, // área copiada: { w, h, px }
  espelhado: false, // desenhar simétrico
  destacar: false, // destacar a cor primária, apagando as outras
  carreiraFoco: null, // carreira sob o cursor, para o painel de linhas de opção
  imagemImportar: null, // { nome, url } escolhida numa aba de imagem
  simbolos: false, // desenhar o tipo de ponto de cada código por cima do desenho
  escurecer: false, // escurecer o desenho para as linhas de opção aparecerem
  motivo: null, // motivo do carimbo: { nome, w, h, px } (linha de cima primeiro)
};

const tela = $("tela");
const ctx = tela.getContext("2d");
let imagem = null;
let lut = new Uint32Array(256);
let gesto = null;
let contadorAbas = 0;

// ------------------------------------------------------------------ utilidades

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function bytesLegiveis(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

const hexCor = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const rgbDeHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
const numeroCor = (v) => limitar(Math.round(Number(v) || 0), 0, 255);

let temporizadorAviso = null;
function avisar(texto, erro = false) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.toggle("erro", erro);
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.hidden = true), erro ? 7000 : 3500);
}

// Extensões que a página publicada no Claude consegue entregar; outras (como .dat) vão dentro de um .zip.
const EXT_PERMITIDAS_NO_CLAUDE = /\.(png|jpe?g|gif|webp|txt|json|md|csv|html|svg|pdf|zip)$/i;

function dentroDoClaude() {
  return !!(window.claude && typeof window.claude.use === "function");
}

// Entrega o arquivo ao usuário. Devolve o nome com que ele foi oferecido, ou null se não foi baixado.
async function baixar(dados, nome) {
  if (dentroDoClaude()) {
    const downloads = await window.claude.use("downloads");
    if (!downloads) {
      avisar("Esta página não pode baixar arquivos aqui. Use o Editor Shima.html no computador.", true);
      return null;
    }
    let arquivo = nome;
    let conteudo = dados instanceof Blob ? dados : new Blob([dados]);
    if (!EXT_PERMITIDAS_NO_CLAUDE.test(nome)) {
      conteudo = new Blob([zipComUmArquivo(nome, new Uint8Array(await conteudo.arrayBuffer()))]);
      arquivo = trocarExtensao(nome, ".zip");
    }
    try {
      await downloads.save({ filename: arquivo, data: conteudo });
      return arquivo;
    } catch (erro) {
      if (erro && erro.code === "declined") avisar("Download cancelado.");
      else avisar(`Não foi possível baixar ${arquivo}: ${(erro && erro.message) || erro}`, true);
      return null;
    }
  }
  const blob = dados instanceof Blob ? dados : new Blob([dados], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nome;
}

let tabelaCrc = null;
function crc32(bytes) {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = tabelaCrc[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP sem compressão (nomes em UTF-8, para manter o Ç). arquivos: [{ nome, bytes }]
function zipComArquivos(arquivos) {
  const locais = [], centrais = [];
  let posicao = 0;
  for (const { nome, bytes } of arquivos) {
    const nomeBytes = new TextEncoder().encode(nome);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nome em UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nomeBytes.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, nomeBytes.length, true);
    central.setUint32(42, posicao, true); // onde começa o registro local deste arquivo
    locais.push(new Uint8Array(local.buffer), nomeBytes, bytes);
    centrais.push(new Uint8Array(central.buffer), nomeBytes);
    posicao += 30 + nomeBytes.length + bytes.length;
  }
  const tamanhoCentral = centrais.reduce((t, p) => t + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);
  const partes = [...locais, ...centrais, new Uint8Array(fim.buffer)];
  const zip = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    zip.set(p, pos);
    pos += p.length;
  }
  return zip;
}

function zipComUmArquivo(nome, bytes) {
  return zipComArquivos([{ nome, bytes }]);
}

// Substitutos das janelas confirm e prompt do navegador, que não funcionam na página publicada no Claude.
function perguntar(texto, botao = "Continuar") {
  return new Promise((responder) => {
    const dlg = $("dlg-confirmar");
    $("confirmar-texto").textContent = texto;
    $("confirmar-ok").textContent = botao;
    dlg.addEventListener("close", () => responder(dlg.returnValue === "ok"), { once: true });
    abrirDialogo("dlg-confirmar");
  });
}

function pedirNome(titulo, valor, rotulo = "Nome do arquivo") {
  return new Promise((responder) => {
    const dlg = $("dlg-nome");
    const campo = dlg.querySelector("input[name=nome]");
    $("dlg-nome-titulo").textContent = titulo;
    $("dlg-nome-rotulo").textContent = rotulo;
    campo.value = valor;
    dlg.addEventListener("close", () => responder(dlg.returnValue === "ok" ? campo.value.trim() || null : null), { once: true });
    abrirDialogo("dlg-nome");
    campo.select();
  });
}

function abrirDialogo(id) {
  const dlg = $(id);
  dlg.returnValue = ""; // senão um Esc repetiria a última resposta
  dlg.showModal();
}

function trocarExtensao(nome, ext) {
  return nome.replace(/\.[^.]*$/, "") + ext;
}

// ------------------------------------------------------------------ abas

function abaAtual() {
  return estado.abas.find((a) => a.id === estado.atual) || null;
}

function abaDat() {
  const a = abaAtual();
  return a && a.tipo === "dat" ? a : null;
}

function abrirBuffer(nome, buffer, origem) {
  if (!buffer.byteLength) {
    avisar(`${nome} está vazio (0 bytes).`, true);
    return null;
  }
  const existente = estado.abas.find((a) => a.nome === nome && a.origem === origem);
  if (existente) {
    mostrarAba(existente);
    return existente;
  }
  let aberto;
  try {
    if (EXT_IMAGEM.test(nome)) {
      aberto = { tipo: "imagem", tamanho: buffer.byteLength, url: URL.createObjectURL(new Blob([buffer])) };
    } else {
      aberto = ShimaArquivos.abrir(nome, buffer);
    }
  } catch (erro) {
    avisar(`Não foi possível abrir ${nome}: ${erro.message}`, true);
    return null;
  }
  const aba = { id: ++contadorAbas, nome, origem, tipo: aberto.tipo, aberto, modificado: false, tamanho: buffer.byteLength };
  if (aba.tipo === "dat") {
    Object.assign(aba, { doc: aberto.doc, hist: [], refazer: [], selecao: null, flutuante: null, zoom: null, rolagem: null });
    aba.original = retrato(aba); // para "Voltar ao original"
  } else {
    Object.assign(aba, { guia: "resumo", detalhe: null, comparar: "" });
  }
  estado.abas.push(aba);
  mostrarAba(aba);
  return aba;
}

function mostrarAba(aba) {
  const anterior = abaDat();
  if (anterior && anterior !== aba) {
    fixarFlutuante(anterior);
    anterior.rolagem = { x: $("janela").scrollLeft, y: $("janela").scrollTop };
  }
  estado.atual = aba ? aba.id : null;
  desenharAbas();
  desenharPasta();
  const dat = aba && aba.tipo === "dat";
  $("vazio").hidden = !!aba;
  $("area-dat").hidden = !dat;
  $("painel-dat").hidden = !dat;
  $("acoes-dat").hidden = !dat;
  $("inspetor").hidden = !aba || dat;
  document.querySelector(".corpo").classList.toggle("com-painel", !!dat);
  if (dat) prepararTela(aba);
  else if (aba) desenharInspetor(aba);
  atualizarBotoes();
}

async function fecharAba(id) {
  const aba = estado.abas.find((a) => a.id === id);
  if (!aba) return;
  if (aba.modificado && !(await perguntar(`${aba.nome} tem alterações não salvas. Fechar mesmo assim?`, "Fechar sem salvar"))) return;
  if (aba.tipo === "imagem") {
    if (estado.imagemImportar && estado.imagemImportar.url === aba.aberto.url) estado.imagemImportar = null;
    URL.revokeObjectURL(aba.aberto.url);
  }
  const i = estado.abas.indexOf(aba);
  estado.abas.splice(i, 1);
  if (estado.atual === id) {
    estado.atual = null;
    mostrarAba(estado.abas[Math.min(i, estado.abas.length - 1)] || null);
  } else {
    desenharAbas();
    desenharPasta();
  }
}

function desenharAbas() {
  $("abas").innerHTML = estado.abas
    .map(
      (a) => `<div class="aba${a.id === estado.atual ? " ativa" : ""}">
        <button type="button" class="aba-nome" data-aba="${a.id}" aria-current="${a.id === estado.atual}">
          <span class="tipo tipo-${a.tipo}">${TIPOS[a.tipo]}</span>
          <span class="mono">${esc(a.nome)}</span>${a.modificado ? '<span class="modificado" title="Não salvo">●</span>' : ""}
        </button>
        <button type="button" class="aba-fechar" data-fechar="${a.id}" aria-label="Fechar ${esc(a.nome)}">×</button>
      </div>`,
    )
    .join("");
}

function marcarModificado(aba) {
  if (!aba.modificado) {
    aba.modificado = true;
    desenharAbas();
  }
}

// ------------------------------------------------------------------ pasta (servidor ou pasta conectada)
// A pasta vem do servidor do projeto (Abrir Editor Shima.bat) ou de uma pasta do computador conectada
// pelo navegador (File System Access, no Chrome e no Edge). As duas gravam o .dat direto na pasta e
// guardam o original como <nome>.bak na primeira gravação.

const acessoAPastasDisponivel = () => typeof window.showDirectoryPicker === "function" && !dentroDoClaude();
const temPasta = () => estado.servidor || !!estado.pastaLocal;

async function carregarPasta() {
  if (location.protocol !== "file:" && !dentroDoClaude() && !estado.pastaLocal) {
    try {
      const resposta = await fetch("/api/arquivos", { cache: "no-store" });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const dados = await resposta.json();
      estado.servidor = true;
      estado.pasta = dados.pasta;
      estado.arquivosPasta = dados.arquivos;
      if (dados.erro) avisar(dados.erro, true);
    } catch (erro) {
      estado.servidor = false;
    }
  }
  if (!estado.servidor) {
    estado.arquivosPasta = [];
    if (estado.pastaLocal) {
      try {
        estado.pasta = estado.pastaLocal.name;
        estado.arquivosPasta = await listarPastaLocal(estado.pastaLocal);
      } catch (erro) {
        avisar(`Não foi possível ler a pasta ${estado.pastaLocal.name}: ${erro.message}. Conecte a pasta de novo.`, true);
        desconectarPasta();
      }
    }
  }
  desenharPasta();
  atualizarBotoes();
}

async function listarPastaLocal(pasta) {
  const arquivos = [];
  for await (const [nome, item] of pasta.entries()) {
    if (item.kind !== "file" || nome.startsWith(".") || /\.(tmp|crswap)$/i.test(nome)) continue;
    arquivos.push({ nome, tamanho: (await item.getFile()).size });
  }
  return arquivos.sort((a, b) => a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()));
}

async function existeNaPastaLocal(pasta, nome) {
  try {
    await pasta.getFileHandle(nome);
    return true;
  } catch (erro) {
    return false;
  }
}

async function gravarArquivoLocal(pasta, nome, dados) {
  const escrita = await (await pasta.getFileHandle(nome, { create: true })).createWritable();
  await escrita.write(dados);
  await escrita.close(); // o navegador só troca o arquivo no fim, se tudo deu certo
}

async function gravarNaPastaLocal(pasta, nome, bytes) {
  if (!/\.dat$/i.test(nome)) throw new Error("só arquivos .dat podem ser gravados pelo editor");
  const copia = `${nome}.bak`;
  if ((await existeNaPastaLocal(pasta, nome)) && !(await existeNaPastaLocal(pasta, copia))) {
    const original = await (await pasta.getFileHandle(nome)).getFile();
    await gravarArquivoLocal(pasta, copia, await original.arrayBuffer());
  }
  await gravarArquivoLocal(pasta, nome, bytes);
  return { copia: (await existeNaPastaLocal(pasta, copia)) ? copia : null };
}

async function permissaoDaPasta(pasta, pedir) {
  const opcoes = { mode: "readwrite" };
  if (typeof pasta.queryPermission !== "function") return true;
  if ((await pasta.queryPermission(opcoes)) === "granted") return true;
  return pedir && (await pasta.requestPermission(opcoes)) === "granted";
}

async function conectarPasta(pasta, lembrar = true) {
  // Abas abertas de outra pasta passam a ser arquivos avulsos: o "Salvar" delas não vai para a pasta nova.
  for (const aba of estado.abas) if (aba.origem === "pasta") aba.origem = "local";
  estado.pastaLocal = pasta;
  estado.pastaGuardada = null;
  if (lembrar) await lembrarPasta(pasta);
  await carregarPasta();
  desenharAbas();
  desenharConexao();
  avisar(`Pasta ${pasta.name} conectada: ${estado.arquivosPasta.length} arquivos. O Salvar grava direto nela.`);
}

function desconectarPasta() {
  estado.pastaLocal = null;
  estado.arquivosPasta = [];
  for (const aba of estado.abas) if (aba.origem === "pasta") aba.origem = "local";
  desenharPasta();
  desenharConexao();
}

function desenharConexao() {
  const disponivel = acessoAPastasDisponivel();
  $("grupo-conectar").hidden = estado.servidor;
  $("btn-conectar-pasta").hidden = !disponivel;
  $("btn-conectar-pasta").textContent = estado.pastaLocal ? "Trocar de pasta…" : "Conectar uma pasta…";
  $("btn-reconectar-pasta").hidden = !estado.pastaGuardada || !!estado.pastaLocal;
  if (estado.pastaGuardada) $("btn-reconectar-pasta").textContent = `Reconectar a pasta ${estado.pastaGuardada.name}`;
  $("texto-conectar").textContent = !disponivel
    ? dentroDoClaude()
      ? "Para gravar direto numa pasta do computador, use o Editor Shima.html no Chrome ou no Edge."
      : "Para gravar direto numa pasta do computador, abra o editor no Chrome ou no Edge."
    : estado.pastaLocal
      ? "Os arquivos abertos da pasta são salvos direto nela."
      : "Escolha a pasta dos desenhos (por exemplo, 07 122 SSGsv): os arquivos aparecem aqui e o Salvar grava direto nela.";
}

// A pasta escolhida fica guardada no navegador para a próxima vez (só o acesso, não os arquivos).
function bancoDePastas() {
  return new Promise((ok, falha) => {
    const pedido = indexedDB.open("editor-shima", 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore("pastas");
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });
}

async function lembrarPasta(pasta) {
  try {
    const banco = await bancoDePastas();
    banco.transaction("pastas", "readwrite").objectStore("pastas").put(pasta, "ultima");
  } catch (erro) {
    // Sem armazenamento (janela anônima, por exemplo): só não lembra na próxima vez.
  }
}

async function pastaLembrada() {
  try {
    const banco = await bancoDePastas();
    return await new Promise((ok) => {
      const pedido = banco.transaction("pastas").objectStore("pastas").get("ultima");
      pedido.onsuccess = () => ok(pedido.result || null);
      pedido.onerror = () => ok(null);
    });
  } catch (erro) {
    return null;
  }
}

async function retomarPastaLembrada() {
  if (estado.servidor || !acessoAPastasDisponivel()) return;
  const pasta = await pastaLembrada();
  if (!pasta) return;
  if (await permissaoDaPasta(pasta, false)) await conectarPasta(pasta, false);
  else {
    // O navegador só devolve o acesso depois de um clique: mostra o botão de reconectar.
    estado.pastaGuardada = pasta;
    desenharConexao();
  }
}

function desenharPasta() {
  $("nome-pasta").textContent = estado.pasta;
  $("grupo-pasta").hidden = !temPasta();
  $("btn-abrir-todos").hidden = !temPasta() || !estado.arquivosPasta.length;
  $("btn-atualizar-pasta").hidden = !temPasta();
  $("lista-pasta").innerHTML = estado.arquivosPasta
    .map((a) => {
      const tipo = EXT_IMAGEM.test(a.nome) ? "imagem" : ShimaArquivos.tipoPeloNome(a.nome);
      const aberta = estado.abas.find((x) => x.nome === a.nome && x.origem === "pasta");
      const ativa = aberta && aberta.id === estado.atual;
      return `<li><button type="button" class="arquivo${ativa ? " ativo" : ""}" data-arquivo="${esc(a.nome)}">
        <span class="tipo tipo-${tipo}">${TIPOS[tipo]}</span>
        <span class="arquivo-nome mono">${esc(a.nome)}</span>
        <span class="arquivo-tamanho suave">${bytesLegiveis(a.tamanho)}${aberta ? " · aberto" : ""}</span>
      </button></li>`;
    })
    .join("");
}

async function abrirDaPasta(nome) {
  const aberta = estado.abas.find((a) => a.nome === nome && a.origem === "pasta");
  if (aberta) {
    mostrarAba(aberta);
    return aberta;
  }
  try {
    if (estado.pastaLocal) {
      const arquivo = await (await estado.pastaLocal.getFileHandle(nome)).getFile();
      return abrirBuffer(nome, await arquivo.arrayBuffer(), "pasta");
    }
    const resposta = await fetch("/api/arquivos/" + encodeURIComponent(nome), { cache: "no-store" });
    if (!resposta.ok) throw new Error(`o servidor respondeu ${resposta.status}`);
    return abrirBuffer(nome, await resposta.arrayBuffer(), "pasta");
  } catch (erro) {
    avisar(`Não foi possível abrir ${nome}: ${erro.message}`, true);
    return null;
  }
}

async function abrirTodos() {
  let primeiroDat = null;
  for (const a of estado.arquivosPasta) {
    if (a.nome.endsWith(".bak")) continue;
    const aba = await abrirDaPasta(a.nome);
    if (aba && aba.tipo === "dat" && !primeiroDat) primeiroDat = aba;
  }
  if (primeiroDat) mostrarAba(primeiroDat);
  avisar(`${estado.abas.length} arquivos abertos.`);
}

async function abrirLocais(arquivos) {
  let primeiroDat = null;
  let abertos = 0;
  const falhas = [];
  for (const arquivo of arquivos) {
    // Numa pasta inteira, ignora arquivos ocultos e as cópias .bak.
    if (arquivo.name.startsWith(".") || /\.(bak|tmp)$/i.test(arquivo.name)) continue;
    let conteudo;
    try {
      conteudo = await arquivo.arrayBuffer();
    } catch (erro) {
      // Uma pasta arrastada chega como um "arquivo" que não pode ser lido.
      falhas.push(arquivo.name);
      continue;
    }
    const aba = abrirBuffer(arquivo.name, conteudo, "local");
    if (!aba) {
      falhas.push(arquivo.name);
      continue;
    }
    abertos++;
    if (aba.tipo === "dat" && !primeiroDat) primeiroDat = aba;
  }
  if (primeiroDat && abertos > 1) mostrarAba(primeiroDat);
  if (falhas.length) {
    const dica = falhas.some((n) => !n.includes(".")) ? " Para abrir uma pasta, use “Abrir uma pasta inteira…”." : "";
    avisar(`${abertos ? `${abertos} arquivos abertos. ` : ""}Não foi possível abrir: ${falhas.join(", ")}.${dica}`, true);
  } else if (abertos > 1) avisar(`${abertos} arquivos abertos.`);
}

// ------------------------------------------------------------------ tela do desenho

function prepararTela(aba) {
  const d = aba.doc;
  tela.width = d.largura;
  tela.height = d.altura;
  imagem = ctx.createImageData(d.largura, d.altura);
  atualizarLut(d.paleta);
  if (aba.zoom == null) aba.zoom = zoomQueCabe(d);
  aplicarTamanho(aba);
  renderizar();
  if (aba.rolagem) {
    $("janela").scrollLeft = aba.rolagem.x;
    $("janela").scrollTop = aba.rolagem.y;
  }
  atualizarPainel();
  atualizarStatus();
  desenharOpcoes();
}

function atualizarLut(paleta) {
  lut = new Uint32Array(256);
  for (let c = 0; c < 256; c++) {
    const [r, g, b] = paleta[c];
    lut[c] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
}

function renderizar() {
  const a = abaDat();
  if (!a) return;
  const d = a.doc;
  const px32 = new Uint32Array(imagem.data.buffer);
  const p = d.pixels;
  if (estado.destacar) {
    // Só a cor primária fica com a cor dela; o resto vira cinza claro.
    const alvo = estado.primaria;
    const apagado = ((255 << 24) | (205 << 16) | (205 << 8) | 205) >>> 0;
    for (let i = 0; i < p.length; i++) px32[i] = p[i] === alvo ? lut[p[i]] : apagado;
  } else {
    for (let i = 0; i < p.length; i++) px32[i] = lut[p[i]];
  }
  const f = a.flutuante;
  if (f) {
    for (let y = 0; y < f.h; y++) {
      const ty = f.y + y;
      if (ty < 0 || ty >= d.altura) continue;
      for (let x = 0; x < f.w; x++) {
        const tx = f.x + x;
        if (tx < 0 || tx >= d.largura) continue;
        const v = f.px[y * f.w + x];
        if (f.transparente !== null && v === f.transparente) continue;
        px32[ty * d.largura + tx] = lut[v];
      }
    }
  }
  if (estado.escurecer) escurecerForaDasLinhas(a, px32);
  ctx.putImageData(imagem, 0, 0);
  posicionarCaixas();
  agendarSimbolos();
}

// Escurece o desenho e deixa as linhas de opção como estão, para elas aparecerem.
function escurecerForaDasLinhas(a, px32) {
  const W = a.doc.largura;
  const guardados = blocosDeOpcao(a).map((b) => {
    const linhas = [];
    for (let y = b.carreiraInicio; y <= b.carreiraFim; y++) linhas.push(px32.slice(y * W + b.xMin, y * W + b.xMax + 1));
    return { b, linhas };
  });
  for (let i = 0; i < px32.length; i++) px32[i] = ((px32[i] >>> 2) & 0x3f3f3f) | 0xff000000;
  for (const { b, linhas } of guardados) linhas.forEach((l, k) => px32.set(l, (b.carreiraInicio + k) * W + b.xMin));
}

function zoomQueCabe(d) {
  const j = $("janela");
  const w = Math.max(200, j.clientWidth - 48);
  const h = Math.max(200, j.clientHeight - 48);
  let melhor = ZOOMS[0];
  for (const z of ZOOMS) if (d.largura * z <= w && d.altura * z <= h) melhor = z;
  return melhor;
}

function aplicarTamanho(aba) {
  const z = aba.zoom;
  const w = Math.round(aba.doc.largura * z);
  const h = Math.round(aba.doc.altura * z);
  const folha = $("folha");
  folha.style.width = w + "px";
  folha.style.height = h + "px";
  tela.style.width = w + "px";
  tela.style.height = h + "px";
  const grade = $("grade");
  grade.hidden = !(estado.grade && z >= ZOOM_GRADE);
  grade.style.backgroundSize = `${z}px ${z}px, ${z}px ${z}px, ${10 * z}px ${10 * z}px, ${10 * z}px ${10 * z}px`;
  $("zoom").value = String(z);
  posicionarCaixas();
  agendarSimbolos();
}

function definirZoom(z, cx, cy) {
  const a = abaDat();
  if (!a) return;
  z = limitar(z, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
  const j = $("janela");
  const r = j.getBoundingClientRect();
  if (cx == null) {
    cx = r.left + j.clientWidth / 2;
    cy = r.top + j.clientHeight / 2;
  }
  const fr = $("folha").getBoundingClientRect();
  const px = (cx - fr.left) / a.zoom;
  const py = (cy - fr.top) / a.zoom;
  a.zoom = z;
  aplicarTamanho(a);
  const folha = $("folha");
  j.scrollLeft = folha.offsetLeft + px * z - (cx - r.left);
  j.scrollTop = folha.offsetTop + py * z - (cy - r.top);
  atualizarStatus();
}

function passoZoom(direcao, cx, cy) {
  const a = abaDat();
  if (!a) return;
  const i = ZOOMS.findIndex((z) => z >= a.zoom);
  const atual = i < 0 ? ZOOMS.length - 1 : i;
  const proximo = direcao > 0 ? (ZOOMS[atual] > a.zoom ? atual : atual + 1) : atual - 1;
  definirZoom(ZOOMS[limitar(proximo, 0, ZOOMS.length - 1)], cx, cy);
}

function posicionarCaixas() {
  const a = abaDat();
  const caixaSel = $("caixa-selecao");
  const caixaFlu = $("caixa-flutuante");
  if (!a) return;
  const z = a.zoom;
  const posicionar = (el, r) => {
    el.style.left = r.x * z + "px";
    el.style.top = r.y * z + "px";
    el.style.width = Math.max(1, r.w * z) + "px";
    el.style.height = Math.max(1, r.h * z) + "px";
  };
  caixaSel.hidden = !a.selecao || !!a.flutuante;
  if (a.selecao) posicionar(caixaSel, a.selecao);
  caixaFlu.hidden = !a.flutuante;
  if (a.flutuante) posicionar(caixaFlu, a.flutuante);
  const contorno = $("contorno-linha");
  const r = contornoDaLinha(a);
  contorno.hidden = !r;
  if (r) posicionar(contorno, r);
}

// ------------------------------------------------------------------ histórico

function retrato(aba) {
  const d = aba.doc;
  return { pixels: d.pixels.slice(), largura: d.largura, altura: d.altura, paleta: d.paleta.map((c) => c.slice()) };
}

function salvarHistorico(aba) {
  aba.hist.push(retrato(aba));
  aba.refazer = [];
  limitarHistorico(aba);
  marcarModificado(aba);
}

// Desenhos grandes ocupam muita memória por passo: guarda menos passos em vez de travar o navegador.
function limitarHistorico(aba) {
  let total = aba.hist.reduce((t, r) => t + r.pixels.length, 0);
  while (aba.hist.length > 1 && (aba.hist.length > LIMITE_HISTORICO || total > LIMITE_MEMORIA_HISTORICO)) {
    total -= aba.hist.shift().pixels.length;
  }
}

function blocosDeOpcao(aba) {
  if (!aba.opcoes) aba.opcoes = ShimaDat.linhasDeOpcao(aba.doc);
  return aba.opcoes;
}

function restaurar(aba, r) {
  aba.opcoes = null;
  const d = aba.doc;
  const mudouTamanho = r.largura !== d.largura || r.altura !== d.altura;
  Object.assign(d, { pixels: r.pixels, largura: r.largura, altura: r.altura, paleta: r.paleta });
  aba.flutuante = null;
  if (aba.selecao && !dentroDoDesenho(aba.selecao, d)) aba.selecao = null;
  marcarModificado(aba);
  if (mudouTamanho) prepararTela(aba);
  else {
    atualizarLut(d.paleta);
    renderizar();
    atualizarPainel();
  }
}

// Volta o desenho a como ele foi aberto; é uma alteração como as outras, que dá para desfazer.
async function voltarAoOriginal(a) {
  if (!a.original) return;
  fixarFlutuante(a);
  if (!(await perguntar(`Voltar ${a.nome} a como ele foi aberto? Todas as alterações desta aba saem do desenho (dá para desfazer com Ctrl+Z).`, "Voltar ao original"))) return;
  if (abaDat() !== a) return;
  salvarHistorico(a);
  const o = a.original;
  restaurar(a, { pixels: o.pixels.slice(), largura: o.largura, altura: o.altura, paleta: o.paleta.map((c) => c.slice()) });
  atualizarBotoes();
  avisar("O desenho voltou a como foi aberto. Ctrl+Z desfaz.");
}

function desfazer() {
  const a = abaDat();
  if (!a) return;
  gesto = null; // um arrasto em andamento não sobrevive ao desfazer
  if (a.flutuante && !a.flutuante.levantado) {
    a.flutuante = null;
    renderizar();
    atualizarBotoes();
    return;
  }
  if (!a.hist.length) return avisar("Nada para desfazer.");
  const atual = retrato(a);
  // Uma área movida ainda solta: o "refazer" precisa trazê-la de volta já no lugar novo.
  const f = a.flutuante;
  if (f) colarArea({ largura: atual.largura, altura: atual.altura, pixels: atual.pixels }, f, f.x, f.y, f.transparente);
  a.refazer.push(atual);
  restaurar(a, a.hist.pop());
}

function refazer() {
  const a = abaDat();
  if (!a || !a.refazer.length) return avisar("Nada para refazer.");
  // Fixar a colagem seria uma alteração nova, que apaga o que havia para refazer.
  if (a.flutuante) return avisar("Fixe (Enter) ou descarte (Esc) a colagem antes de refazer.");
  gesto = null;
  a.hist.push(retrato(a));
  limitarHistorico(a);
  restaurar(a, a.refazer.pop());
}

// ------------------------------------------------------------------ desenho: primitivas

function dentroDoDesenho(r, d) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= d.largura && r.y + r.h <= d.altura;
}

let eixoEspelho = null; // com "Espelhado" ligado: soma das colunas simétricas (x + x' = eixo)

function pintar(d, x, y, cor) {
  if (eixoEspelho !== null) pintarSimples(d, eixoEspelho - x, y, cor);
  pintarSimples(d, x, y, cor);
}

function pintarSimples(d, x, y, cor) {
  if (x >= 0 && y >= 0 && x < d.largura && y < d.altura) d.pixels[y * d.largura + x] = cor;
}

function carimbo(d, p, cor, tamanho) {
  const ini = -Math.floor((tamanho - 1) / 2);
  for (let dy = 0; dy < tamanho; dy++) for (let dx = 0; dx < tamanho; dx++) pintar(d, p.x + ini + dx, p.y + ini + dy, cor);
}

function pontosDaLinha(a, b, fazer) {
  // Bresenham: só pixels inteiros, sem cores intermediárias.
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let erro = dx + dy;
  for (;;) {
    fazer(x, y);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * erro;
    if (e2 >= dy) { erro += dy; x += sx; }
    if (e2 <= dx) { erro += dx; y += sy; }
  }
}

function retanguloEntre(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
}

function travarAngulo(inicio, p) {
  const dx = p.x - inicio.x, dy = p.y - inicio.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx > 2 * ady) return { x: p.x, y: inicio.y };
  if (ady > 2 * adx) return { x: inicio.x, y: p.y };
  const m = Math.max(adx, ady);
  return { x: inicio.x + Math.sign(dx) * m, y: inicio.y + Math.sign(dy) * m };
}

function desenharForma(d, forma, a, b, cor, tamanho) {
  if (forma === "linha") return pontosDaLinha(a, b, (x, y) => carimbo(d, { x, y }, cor, tamanho));
  const r = retanguloEntre(a, b);
  if (forma === "retangulo-cheio") {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) pintar(d, x, y, cor);
    return;
  }
  const x2 = r.x + r.w - 1, y2 = r.y + r.h - 1;
  pontosDaLinha({ x: r.x, y: r.y }, { x: x2, y: r.y }, (x, y) => carimbo(d, { x, y }, cor, tamanho));
  pontosDaLinha({ x: r.x, y: y2 }, { x: x2, y: y2 }, (x, y) => carimbo(d, { x, y }, cor, tamanho));
  pontosDaLinha({ x: r.x, y: r.y }, { x: r.x, y: y2 }, (x, y) => carimbo(d, { x, y }, cor, tamanho));
  pontosDaLinha({ x: x2, y: r.y }, { x: x2, y: y2 }, (x, y) => carimbo(d, { x, y }, cor, tamanho));
}

function balde(d, p, cor) {
  const W = d.largura, px = d.pixels;
  const inicio = p.y * W + p.x;
  const alvo = px[inicio];
  if (alvo === cor) return false;
  const pilha = [inicio];
  while (pilha.length) {
    const i = pilha.pop();
    if (px[i] !== alvo) continue;
    px[i] = cor;
    const x = i % W;
    if (x > 0) pilha.push(i - 1);
    if (x < W - 1) pilha.push(i + 1);
    if (i >= W) pilha.push(i - W);
    if (i + W < px.length) pilha.push(i + W);
  }
  return true;
}

function recortarArea(d, r) {
  const px = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) px.set(d.pixels.subarray((r.y + y) * d.largura + r.x, (r.y + y) * d.largura + r.x + r.w), y * r.w);
  return { w: r.w, h: r.h, px };
}

function preencherArea(d, r, cor) {
  for (let y = r.y; y < r.y + r.h; y++) d.pixels.fill(cor, y * d.largura + r.x, y * d.largura + r.x + r.w);
}

function espelharH(b) {
  const px = new Uint8Array(b.px.length);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) px[y * b.w + x] = b.px[y * b.w + (b.w - 1 - x)];
  return { ...b, px };
}

function espelharV(b) {
  const px = new Uint8Array(b.px.length);
  for (let y = 0; y < b.h; y++) px.set(b.px.subarray((b.h - 1 - y) * b.w, (b.h - y) * b.w), y * b.w);
  return { ...b, px };
}

function girar90(b) {
  // Sentido horário: o pixel (x, y) vai para (h - 1 - y, x).
  const px = new Uint8Array(b.px.length);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) px[x * b.h + (b.h - 1 - y)] = b.px[y * b.w + x];
  return { ...b, w: b.h, h: b.w, px };
}

function colarArea(d, b, x0, y0, transparente) {
  for (let y = 0; y < b.h; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= d.altura) continue;
    for (let x = 0; x < b.w; x++) {
      const tx = x0 + x;
      if (tx < 0 || tx >= d.largura) continue;
      const v = b.px[y * b.w + x];
      if (transparente !== null && v === transparente) continue;
      d.pixels[ty * d.largura + tx] = v;
    }
  }
}

function contarCores(d) {
  const contagem = new Uint32Array(256);
  for (let i = 0; i < d.pixels.length; i++) contagem[d.pixels[i]]++;
  return contagem;
}

// ------------------------------------------------------------------ colagem flutuante

function fixarFlutuante(aba = abaDat()) {
  if (!aba || !aba.flutuante) return;
  const f = aba.flutuante;
  if (!f.levantado) salvarHistorico(aba);
  colarArea(aba.doc, f, f.x, f.y, f.transparente);
  const x = limitar(f.x, 0, aba.doc.largura - 1), y = limitar(f.y, 0, aba.doc.altura - 1);
  const w = limitar(f.x + f.w, 1, aba.doc.largura) - x, h = limitar(f.y + f.h, 1, aba.doc.altura) - y;
  aba.selecao = w > 0 && h > 0 ? { x, y, w, h } : null;
  aba.flutuante = null;
  marcarModificado(aba);
  if (aba === abaDat()) {
    renderizar();
    atualizarPainel();
  }
}

function levantarSelecao(a) {
  salvarHistorico(a);
  const b = recortarArea(a.doc, a.selecao);
  preencherArea(a.doc, a.selecao, estado.fundo);
  a.flutuante = { ...b, x: a.selecao.x, y: a.selecao.y, transparente: null, levantado: true };
  a.selecao = null;
}

function novaColagem(a, b, x, y) {
  fixarFlutuante(a);
  a.flutuante = { w: b.w, h: b.h, px: b.px.slice(), x, y, transparente: estado.colarTransparente ? estado.fundo : null, levantado: false };
  a.selecao = null;
  escolherFerramenta("selecao");
  renderizar();
  atualizarBotoes();
}

function cantoVisivel(a) {
  const j = $("janela");
  const folha = $("folha");
  const x = Math.floor(Math.max(0, j.scrollLeft - folha.offsetLeft) / a.zoom);
  const y = Math.floor(Math.max(0, j.scrollTop - folha.offsetTop) / a.zoom);
  return { x: limitar(x, 0, a.doc.largura - 1), y: limitar(y, 0, a.doc.altura - 1) };
}

// ------------------------------------------------------------------ ponteiro

function pontoDoEvento(e) {
  const a = abaDat();
  const r = tela.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / a.zoom), y: Math.floor((e.clientY - r.top) / a.zoom) };
}

function noDesenho(p, d) {
  return p.x >= 0 && p.y >= 0 && p.x < d.largura && p.y < d.altura;
}

function prender(p, d) {
  return { x: limitar(p.x, 0, d.largura - 1), y: limitar(p.y, 0, d.altura - 1) };
}

function dentro(p, r) {
  return r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

tela.addEventListener("contextmenu", (e) => e.preventDefault());

tela.addEventListener("pointerdown", (e) => {
  const a = abaDat();
  if (!a || (e.button !== 0 && e.button !== 2)) return;
  e.preventDefault();
  // O preventDefault impede o navegador de tirar o foco de um campo: sem isto, os atalhos de teclado
  // continuariam presos no último campo digitado.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  tela.setPointerCapture(e.pointerId);
  const d = a.doc;
  const p = pontoDoEvento(e);
  const cor = e.button === 2 ? estado.secundaria : estado.primaria;
  const f = estado.ferramenta;
  if (f !== "selecao") fixarFlutuante(a);

  // Espelhado: a simetria é no meio da seleção ou, sem seleção, no meio do desenho.
  eixoEspelho = estado.espelhado ? (a.selecao ? 2 * a.selecao.x + a.selecao.w - 1 : d.largura - 1) : null;
  if (f === "lapis" || f === "borracha") {
    salvarHistorico(a);
    const c = f === "borracha" ? estado.fundo : cor;
    gesto = { tipo: "pincel", cor: c, ultimo: p };
    carimbo(d, p, c, estado.pincel);
    renderizar();
  } else if (f === "linha" || f === "retangulo" || f === "retangulo-cheio") {
    salvarHistorico(a);
    gesto = { tipo: "forma", forma: f, inicio: p, base: a.hist[a.hist.length - 1].pixels, cor };
    desenharForma(d, f, p, p, cor, estado.pincel);
    renderizar();
  } else if (f === "balde") {
    if (!noDesenho(p, d) || d.pixels[p.y * d.largura + p.x] === cor) return;
    salvarHistorico(a);
    balde(d, p, cor);
    renderizar();
    atualizarPainel();
  } else if (f === "conta-gotas") {
    if (!noDesenho(p, d)) return;
    const n = d.pixels[p.y * d.largura + p.x];
    if (e.button === 2) estado.secundaria = n;
    else estado.primaria = n;
    atualizarPainel();
    const linha = ShimaDat.linhaDeOpcaoEm(blocosDeOpcao(a), p.x, p.y);
    if (linha) escolherLinhaDeOpcao(a, linha);
  } else if (f === "carimbo") {
    if (!estado.motivo) return avisar("Escolha um motivo na Biblioteca de pontos.");
    salvarHistorico(a);
    gesto = { tipo: "carimbo", origem: p, ultimo: p, feitos: new Set(["0,0"]) };
    carimbarMotivo(d, p, estado.motivo);
    renderizar();
  } else if (f === "selecao") {
    if (a.flutuante && dentro(p, a.flutuante)) {
      gesto = { tipo: "mover", dx: p.x - a.flutuante.x, dy: p.y - a.flutuante.y };
    } else if (a.selecao && dentro(p, a.selecao)) {
      levantarSelecao(a);
      gesto = { tipo: "mover", dx: p.x - a.flutuante.x, dy: p.y - a.flutuante.y };
      renderizar();
    } else {
      fixarFlutuante(a);
      const q = prender(p, d);
      gesto = { tipo: "selecionar", inicio: q };
      a.selecao = retanguloEntre(q, q);
      posicionarCaixas();
    }
  }
  atualizarStatus(p);
  atualizarBotoes();
});

tela.addEventListener("pointermove", (e) => {
  const a = abaDat();
  if (!a) return;
  const d = a.doc;
  const p = pontoDoEvento(e);
  if (gesto) {
    if (gesto.tipo === "pincel") {
      pontosDaLinha(gesto.ultimo, p, (x, y) => carimbo(d, { x, y }, gesto.cor, estado.pincel));
      gesto.ultimo = p;
      renderizar();
    } else if (gesto.tipo === "forma") {
      d.pixels.set(gesto.base);
      const fim = gesto.forma === "linha" && e.shiftKey ? travarAngulo(gesto.inicio, p) : p;
      desenharForma(d, gesto.forma, gesto.inicio, fim, gesto.cor, estado.pincel);
      renderizar();
    } else if (gesto.tipo === "carimbo") {
      // Arrastando, o motivo se repete alinhado com o primeiro carimbo, em todo o caminho do ponteiro.
      const m = estado.motivo;
      pontosDaLinha(gesto.ultimo, p, (x, y) => {
        const i = Math.floor((x - gesto.origem.x) / m.w), j = Math.floor((gesto.origem.y - y) / m.h);
        if (gesto.feitos.has(`${i},${j}`)) return;
        gesto.feitos.add(`${i},${j}`);
        carimbarMotivo(d, { x: gesto.origem.x + i * m.w, y: gesto.origem.y - j * m.h }, m);
      });
      gesto.ultimo = p;
      renderizar();
    } else if (gesto.tipo === "selecionar") {
      a.selecao = retanguloEntre(gesto.inicio, prender(p, d));
      posicionarCaixas();
    } else if (gesto.tipo === "mover" && a.flutuante) {
      a.flutuante.x = p.x - gesto.dx;
      a.flutuante.y = p.y - gesto.dy;
      renderizar();
    }
  }
  atualizarStatus(p);
});

function terminarGesto() {
  eixoEspelho = null;
  const a = abaDat();
  if (gesto && a && (gesto.tipo === "pincel" || gesto.tipo === "forma" || gesto.tipo === "carimbo")) atualizarPainel();
  gesto = null;
  atualizarBotoes();
}

tela.addEventListener("pointerup", terminarGesto);
tela.addEventListener("pointercancel", terminarGesto);
tela.addEventListener("pointerleave", () => {
  if (!gesto) atualizarStatus(null);
});

$("janela").addEventListener(
  "wheel",
  (e) => {
    if (!abaDat() || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    passoZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  },
  { passive: false },
);

// ------------------------------------------------------------------ operações do painel

function exigirSelecao(a) {
  if (a.selecao) return true;
  avisar("Faça uma seleção primeiro (ferramenta Seleção, tecla M).");
  return false;
}

function transformar(a, fn, nome) {
  if (a.flutuante) {
    const f = a.flutuante;
    const t = fn(f);
    const cx = f.x + Math.floor(f.w / 2), cy = f.y + Math.floor(f.h / 2);
    a.flutuante = { ...f, ...t, x: cx - Math.floor(t.w / 2), y: cy - Math.floor(t.h / 2) };
  } else if (a.selecao) {
    levantarSelecao(a);
    return transformar(a, fn, nome);
  } else {
    salvarHistorico(a);
    const d = a.doc;
    const t = fn({ w: d.largura, h: d.altura, px: d.pixels });
    if (t.w !== d.largura) return avisar("Para girar, selecione uma área (o desenho inteiro não muda de formato).");
    d.pixels = t.px;
  }
  renderizar();
  atualizarPainel();
  avisar(nome);
}

const ACOES = {
  "selecionar-tudo"(a) {
    fixarFlutuante(a);
    a.selecao = { x: 0, y: 0, w: a.doc.largura, h: a.doc.altura };
    escolherFerramenta("selecao");
    posicionarCaixas();
  },
  copiar(a) {
    if (a.flutuante) estado.area = { w: a.flutuante.w, h: a.flutuante.h, px: a.flutuante.px.slice() };
    else if (exigirSelecao(a)) estado.area = recortarArea(a.doc, a.selecao);
    else return;
    avisar(`Copiado: ${estado.area.w} × ${estado.area.h}.`);
  },
  recortar(a) {
    if (!a.flutuante && !exigirSelecao(a)) return;
    ACOES.copiar(a);
    ACOES.apagar(a);
  },
  colar(a) {
    if (!estado.area) return avisar("Nada copiado ainda.");
    const pos = a.selecao ? { x: a.selecao.x, y: a.selecao.y } : cantoVisivel(a);
    novaColagem(a, estado.area, pos.x, pos.y);
    avisar("Colagem: arraste para posicionar e aperte Enter para fixar.");
  },
  apagar(a) {
    if (a.flutuante) {
      a.flutuante = null;
    } else if (exigirSelecao(a)) {
      salvarHistorico(a);
      preencherArea(a.doc, a.selecao, estado.fundo);
    } else return;
    renderizar();
    atualizarPainel();
  },
  preencher(a) {
    fixarFlutuante(a);
    if (!exigirSelecao(a)) return;
    salvarHistorico(a);
    preencherArea(a.doc, a.selecao, estado.primaria);
    renderizar();
    atualizarPainel();
  },
  "espelhar-h"(a) {
    transformar(a, espelharH, "Espelhado na horizontal.");
  },
  "espelhar-v"(a) {
    transformar(a, espelharV, "Espelhado na vertical.");
  },
  girar(a) {
    if (!a.flutuante && !a.selecao) return avisar("Selecione a área que vai girar.");
    transformar(a, girar90, "Girado 90° no sentido horário.");
  },
  repetir(a) {
    fixarFlutuante(a);
    if (!estado.area) return avisar("Copie primeiro o motivo que vai ser repetido.");
    if (!exigirSelecao(a)) return;
    salvarHistorico(a);
    const d = a.doc, s = a.selecao, b = estado.area;
    const transparente = estado.colarTransparente ? estado.fundo : null;
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const v = b.px[(y % b.h) * b.w + (x % b.w)];
        if (transparente === null || v !== transparente) d.pixels[(s.y + y) * d.largura + s.x + x] = v;
      }
    }
    renderizar();
    atualizarPainel();
  },
  fixar(a) {
    if (!a.flutuante) return avisar("Não há colagem para fixar.");
    fixarFlutuante(a);
  },
  "duplicar-carreiras"(a) {
    alterarLinhas(a, "carreiras", "duplicar");
  },
  "excluir-carreiras"(a) {
    alterarLinhas(a, "carreiras", "excluir");
  },
  "duplicar-agulhas"(a) {
    alterarLinhas(a, "agulhas", "duplicar");
  },
  "excluir-agulhas"(a) {
    alterarLinhas(a, "agulhas", "excluir");
  },
  "mudar-tamanho"(a) {
    if (!a.flutuante && !exigirSelecao(a)) return;
    const r = a.flutuante || a.selecao;
    const form = $("dlg-esticar").querySelector("form");
    form.largura.value = r.w;
    form.altura.value = r.h;
    form.dataset.proporcao = String(r.w / r.h);
    abrirDialogo("dlg-esticar");
  },
  async "cortar-desenho"(a) {
    fixarFlutuante(a);
    if (!exigirSelecao(a)) return;
    if (!(await perguntar(`Deixar o desenho com ${a.selecao.w} agulhas × ${a.selecao.h} carreiras, só com a área selecionada?`, "Cortar"))) return;
    salvarHistorico(a);
    const b = recortarArea(a.doc, a.selecao);
    Object.assign(a.doc, { largura: b.w, altura: b.h, pixels: b.px });
    a.opcoes = null;
    a.selecao = null;
    a.zoom = null;
    prepararTela(a);
  },
  substituir(a) {
    fixarFlutuante(a);
    const form = $("dlg-substituir").querySelector("form");
    form.de.value = estado.primaria;
    form.para.value = estado.secundaria;
    form["so-selecao"].checked = !!a.selecao;
    form["so-selecao"].disabled = !a.selecao;
    abrirDialogo("dlg-substituir");
  },
  importar(a) {
    fixarFlutuante(a);
    abrirDialogoImportar(a);
  },
  redimensionar(a) {
    fixarFlutuante(a);
    const form = $("dlg-redimensionar").querySelector("form");
    form.largura.value = a.doc.largura;
    form.altura.value = a.doc.altura;
    abrirDialogo("dlg-redimensionar");
  },
  "voltar-original"(a) {
    voltarAoOriginal(a);
  },
  // Biblioteca de pontos (editor_recursos.js)
  "repetir-motivo"(a) {
    repetirMotivoNaSelecao(a);
  },
  "usar-copia"() {
    usarCopiaComoMotivo();
  },
  "guardar-motivo"() {
    guardarMotivo();
  },
};

$("painel-dat").addEventListener("click", (e) => {
  const botao = e.target.closest("[data-acao]");
  const a = abaDat();
  if (botao && a) ACOES[botao.dataset.acao](a);
});

// Duplica ou exclui carreiras (linhas inteiras) ou agulhas (colunas inteiras) da seleção, como o
// "inserir/apagar linha" do KnitPaint: as linhas de opção vão junto, porque a operação pega a largura toda.
function alterarLinhas(a, eixo, acao) {
  fixarFlutuante(a);
  if (!exigirSelecao(a)) return;
  const d = a.doc, s = a.selecao;
  const W = d.largura, H = d.altura;
  const carreiras = eixo === "carreiras";
  const n = carreiras ? s.h : s.w;
  if (acao === "excluir" && n >= (carreiras ? H : W)) return avisar(`Não dá para excluir ${carreiras ? "todas as carreiras" : "todas as agulhas"}.`, true);
  const novaL = carreiras ? W : acao === "duplicar" ? W + n : W - n;
  const novaA = carreiras ? (acao === "duplicar" ? H + n : H - n) : H;
  if (novaL > 8000 || novaA > 8000) return avisar("O desenho passaria de 8000 agulhas ou carreiras.", true);
  salvarHistorico(a);
  const px = new Uint8Array(novaL * novaA);
  if (carreiras) {
    // Linhas de cima para baixo: a cópia entra logo acima da seleção (carreiras de número maior).
    const linhas = [];
    for (let y = 0; y < H; y++) {
      const dentro = y >= s.y && y < s.y + s.h;
      if (acao === "duplicar" && y === s.y) for (let k = 0; k < s.h; k++) linhas.push(s.y + k);
      if (!(acao === "excluir" && dentro)) linhas.push(y);
    }
    linhas.forEach((y, i) => px.set(d.pixels.subarray(y * W, (y + 1) * W), i * W));
  } else {
    const colunas = [];
    for (let x = 0; x < W; x++) {
      const dentro = x >= s.x && x < s.x + s.w;
      if (acao === "duplicar" && x === s.x) for (let k = 0; k < s.w; k++) colunas.push(s.x + k);
      if (!(acao === "excluir" && dentro)) colunas.push(x);
    }
    for (let y = 0; y < H; y++) for (let i = 0; i < colunas.length; i++) px[y * novaL + i] = d.pixels[y * W + colunas[i]];
  }
  Object.assign(d, { largura: novaL, altura: novaA, pixels: px });
  a.opcoes = null;
  a.selecao = acao === "duplicar" ? { ...s } : null;
  prepararTela(a);
  const nomeEixo = carreiras ? (n === 1 ? "carreira" : "carreiras") : n === 1 ? "agulha" : "agulhas";
  avisar(`${n} ${nomeEixo} ${acao === "duplicar" ? (n === 1 ? "duplicada" : "duplicadas") : n === 1 ? "excluída" : "excluídas"}. Desenho agora com ${novaL} agulhas × ${novaA} carreiras.`);
}

function esticar(b, w, h) {
  // Vizinho mais próximo: não cria cores novas, cada pixel continua sendo um número de cor do desenho.
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(b.h - 1, Math.floor((y * b.h) / h));
    for (let x = 0; x < w; x++) px[y * w + x] = b.px[sy * b.w + Math.min(b.w - 1, Math.floor((x * b.w) / w))];
  }
  return { ...b, w, h, px };
}

$("dlg-esticar").querySelector("form").largura.addEventListener("input", (e) => {
  const form = e.target.form;
  if (form.proporcao.checked) form.altura.value = Math.max(1, Math.round(Number(e.target.value) / Number(form.dataset.proporcao)));
});
$("dlg-esticar").querySelector("form").altura.addEventListener("input", (e) => {
  const form = e.target.form;
  if (form.proporcao.checked) form.largura.value = Math.max(1, Math.round(Number(e.target.value) * Number(form.dataset.proporcao)));
});

$("dlg-esticar").addEventListener("close", () => {
  const dlg = $("dlg-esticar");
  const a = abaDat();
  if (dlg.returnValue !== "ok" || !a) return;
  const form = dlg.querySelector("form");
  const w = limitar(Math.round(Number(form.largura.value)), 1, 8000);
  const h = limitar(Math.round(Number(form.altura.value)), 1, 8000);
  if (!a.flutuante) {
    if (!a.selecao) return;
    levantarSelecao(a);
  }
  const f = a.flutuante;
  a.flutuante = { ...esticar(f, w, h), x: f.x, y: f.y + f.h - h }; // mantém a base (carreira de baixo) no lugar
  renderizar();
  atualizarBotoes();
  atualizarStatus();
  avisar(`Seleção com ${w} × ${h}. Arraste para posicionar e aperte Enter para fixar.`);
});

$("dlg-substituir").addEventListener("close", () => {
  const dlg = $("dlg-substituir");
  const a = abaDat();
  if (dlg.returnValue !== "ok" || !a) return;
  const form = dlg.querySelector("form");
  const de = numeroCor(form.de.value), para = numeroCor(form.para.value);
  if (de === para) return;
  const d = a.doc;
  const r = form["so-selecao"].checked && a.selecao ? a.selecao : { x: 0, y: 0, w: d.largura, h: d.altura };
  const posicoes = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let i = y * d.largura + r.x, fim = i + r.w; i < fim; i++) if (d.pixels[i] === de) posicoes.push(i);
  }
  if (!posicoes.length) return avisar(`A cor ${de} não aparece nessa área.`);
  salvarHistorico(a);
  for (const i of posicoes) d.pixels[i] = para;
  renderizar();
  atualizarPainel();
  avisar(`${posicoes.length.toLocaleString("pt-BR")} pixels da cor ${de} viraram cor ${para}.`);
});

$("dlg-redimensionar").addEventListener("close", () => {
  const dlg = $("dlg-redimensionar");
  const a = abaDat();
  if (dlg.returnValue !== "ok" || !a) return;
  const form = dlg.querySelector("form");
  const largura = limitar(Math.round(Number(form.largura.value)), 1, 8000);
  const altura = limitar(Math.round(Number(form.altura.value)), 1, 8000);
  const d = a.doc;
  if (largura === d.largura && altura === d.altura) return;
  const ancora = form.ancora.value;
  const ox = ancora === "baixo-esquerda" ? 0 : Math.floor((largura - d.largura) / 2);
  const oy = ancora === "centro" ? Math.floor((altura - d.altura) / 2) : altura - d.altura;
  salvarHistorico(a);
  const novo = { w: largura, h: altura, px: new Uint8Array(largura * altura).fill(estado.fundo) };
  const antigo = { w: d.largura, h: d.altura, px: d.pixels };
  const temp = { largura, altura, pixels: novo.px };
  colarArea(temp, antigo, ox, oy, null);
  Object.assign(d, { largura, altura, pixels: novo.px });
  a.opcoes = null;
  a.selecao = null;
  a.zoom = null;
  prepararTela(a);
  avisar(`Desenho agora com ${largura} agulhas × ${altura} carreiras.`);
});

// ------------------------------------------------------------------ importar imagem

function abrirDialogoImportar(a) {
  const dlg = $("dlg-importar");
  const form = dlg.querySelector("form");
  form.arquivo.value = "";
  form.ajustar.checked = !!a.selecao;
  form.ajustar.disabled = !a.selecao;
  form.largura.value = "";
  form.altura.value = "";
  $("importar-origem").textContent = estado.imagemImportar ? `Imagem escolhida: ${estado.imagemImportar.nome}` : "";
  if (estado.imagemImportar) carregarImagem(estado.imagemImportar.url).then((img) => preencherTamanho(form, img));
  abrirDialogo("dlg-importar");
}

function carregarImagem(url) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error("imagem inválida"));
    img.src = url;
  });
}

function preencherTamanho(form, img) {
  if (!form.largura.value) form.largura.value = img.naturalWidth;
  if (!form.altura.value) form.altura.value = img.naturalHeight;
}

$("dlg-importar").querySelector("form").arquivo.addEventListener("change", (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  if (estado.imagemImportar && estado.imagemImportar.temporaria) URL.revokeObjectURL(estado.imagemImportar.url);
  estado.imagemImportar = { nome: arquivo.name, url: URL.createObjectURL(arquivo), temporaria: true };
  $("importar-origem").textContent = `Imagem escolhida: ${arquivo.name}`;
  const form = e.target.form;
  form.largura.value = "";
  form.altura.value = "";
  carregarImagem(estado.imagemImportar.url).then((img) => preencherTamanho(form, img));
});

$("dlg-importar").addEventListener("close", async () => {
  const dlg = $("dlg-importar");
  const a = abaDat();
  if (dlg.returnValue !== "ok" || !a) return;
  if (!estado.imagemImportar) return avisar("Escolha uma imagem para importar.", true);
  const form = dlg.querySelector("form");
  let img;
  try {
    img = await carregarImagem(estado.imagemImportar.url);
  } catch (erro) {
    return avisar("Não foi possível ler a imagem.", true);
  }
  const ajustar = form.ajustar.checked && a.selecao;
  const w = ajustar ? a.selecao.w : limitar(Math.round(Number(form.largura.value) || img.naturalWidth), 1, 8000);
  const h = ajustar ? a.selecao.h : limitar(Math.round(Number(form.altura.value) || img.naturalHeight), 1, 8000);
  const b = converterImagem(img, w, h, a.doc, {
    modo: form.modo.value,
    limiar: Number(form.limiar.value),
    claroTransparente: form["claro-transparente"].checked,
  });
  const pos = a.selecao ? { x: a.selecao.x, y: a.selecao.y } : cantoVisivel(a);
  novaColagem(a, b, pos.x, pos.y);
  if (b.transparente !== null) a.flutuante.transparente = b.transparente;
  renderizar();
  avisar("Imagem importada como colagem: arraste para posicionar e aperte Enter para fixar.");
});

function converterImagem(img, w, h, d, opcoes) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  const rgba = g.getImageData(0, 0, w, h).data;
  const px = new Uint8Array(w * h);
  let transparente = null;
  if (opcoes.modo === "duas") {
    const escuro = estado.primaria, claro = estado.secundaria;
    if (opcoes.claroTransparente) transparente = claro;
    for (let i = 0; i < px.length; i++) {
      const k = i * 4;
      const luz = 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2];
      px[i] = rgba[k + 3] < 128 || luz >= opcoes.limiar ? claro : escuro;
    }
  } else {
    const contagem = contarCores(d);
    const candidatas = [];
    for (let c2 = 0; c2 < 256; c2++) if (contagem[c2]) candidatas.push(c2);
    for (let i = 0; i < px.length; i++) {
      const k = i * 4;
      if (rgba[k + 3] < 128) {
        px[i] = estado.fundo;
        continue;
      }
      let melhor = candidatas[0], distancia = Infinity;
      for (const c2 of candidatas) {
        const [r, gg, b] = d.paleta[c2];
        const dist = (r - rgba[k]) ** 2 + (gg - rgba[k + 1]) ** 2 + (b - rgba[k + 2]) ** 2;
        if (dist < distancia) {
          distancia = dist;
          melhor = c2;
        }
      }
      px[i] = melhor;
    }
  }
  return { w, h, px, transparente };
}

// ------------------------------------------------------------------ novo desenho

function referenciaParaNovo() {
  const atual = abaDat();
  if (atual) return atual;
  return estado.abas.find((a) => a.tipo === "dat") || null;
}

$("btn-novo").addEventListener("click", () => {
  const ref = referenciaParaNovo();
  if (!ref) return avisar("Abra um .dat primeiro: o desenho novo usa a paleta e as configurações dele.", true);
  const form = $("dlg-novo").querySelector("form");
  $("novo-referencia").textContent = `Paleta e configurações copiadas de ${ref.nome}.`;
  form.nome.value = "NOVO.dat";
  form.largura.value = ref.doc.largura;
  form.altura.value = ref.doc.altura;
  form.fundo.value = estado.fundo;
  abrirDialogo("dlg-novo");
});

$("dlg-novo").addEventListener("close", () => {
  const dlg = $("dlg-novo");
  if (dlg.returnValue !== "ok") return;
  const ref = referenciaParaNovo();
  if (!ref) return;
  const form = dlg.querySelector("form");
  let nome = form.nome.value.trim() || "NOVO.dat";
  if (!/\.dat$/i.test(nome)) nome += ".dat";
  // Nome único: os valores guardados no navegador (processamento, pacotes, ficha) vão pelo nome do arquivo.
  const pedido = nome;
  for (let n = 2; estado.abas.some((x) => x.nome === nome); n++) nome = pedido.replace(/\.dat$/i, `_${n}.dat`);
  const largura = limitar(Math.round(Number(form.largura.value)), 1, 8000);
  const altura = limitar(Math.round(Number(form.altura.value)), 1, 8000);
  const doc = ShimaDat.novo(largura, altura, ref.doc);
  doc.pixels.fill(numeroCor(form.fundo.value));
  const aba = {
    id: ++contadorAbas, nome, origem: "novo", tipo: "dat", aberto: { tipo: "dat", doc }, modificado: true, tamanho: 0,
    doc, hist: [], refazer: [], selecao: null, flutuante: null, zoom: null, rolagem: null,
  };
  aba.original = retrato(aba);
  estado.abas.push(aba);
  mostrarAba(aba);
});

// ------------------------------------------------------------------ salvar

function bytesDoDesenho(a) {
  fixarFlutuante(a);
  const bytes = ShimaDat.gravar(a.doc);
  // Confere antes de entregar: o arquivo gravado precisa voltar idêntico.
  const conferido = ShimaDat.ler(bytes.buffer);
  const igual =
    conferido.largura === a.doc.largura &&
    conferido.altura === a.doc.altura &&
    conferido.pixels.every((v, i) => v === a.doc.pixels[i]);
  if (!igual) throw new Error("a conferência do arquivo gravado falhou; nada foi salvo");
  return bytes;
}

async function salvarNaPasta(a, nome) {
  let bytes;
  try {
    bytes = bytesDoDesenho(a);
  } catch (erro) {
    return avisar(`Erro ao gravar: ${erro.message}`, true);
  }
  try {
    let dados;
    if (estado.pastaLocal) {
      if (!(await permissaoDaPasta(estado.pastaLocal, true))) throw new Error("o navegador não liberou a gravação na pasta");
      dados = await gravarNaPastaLocal(estado.pastaLocal, nome, bytes);
    } else {
      const resposta = await fetch("/api/arquivos/" + encodeURIComponent(nome), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Editor-Shima": "1" },
        body: bytes,
      });
      dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || resposta.status);
    }
    a.nome = nome;
    a.origem = "pasta";
    a.modificado = false;
    a.tamanho = bytes.length;
    desenharAbas();
    await carregarPasta();
    atualizarPainel();
    avisar(`${nome} salvo na pasta${dados.copia ? ` (o original está em ${dados.copia})` : ""}.`);
  } catch (erro) {
    avisar(`Não foi possível salvar na pasta: ${erro.message}`, true);
  }
}

async function baixarDat(a, nome = a.nome) {
  let bytes;
  try {
    bytes = bytesDoDesenho(a);
  } catch (erro) {
    return avisar(`Erro ao gravar: ${erro.message}`, true);
  }
  const entregue = await baixar(bytes, nome);
  if (!entregue) return;
  if (a.origem !== "pasta") {
    a.modificado = false;
    desenharAbas();
  }
  if (entregue === nome) avisar(`${nome} foi baixado (normalmente vai para a pasta Downloads). Copie-o para a pasta dos desenhos.`);
  else avisar(`${entregue} foi baixado. Dentro dele está ${nome}: extraia e copie para a pasta dos desenhos.`);
}

// Só não pergunta quando o arquivo da pasta é o mesmo que foi aberto dela.
async function podeGravarNaPasta(a, nome) {
  const existe = estado.arquivosPasta.some((x) => x.nome === nome);
  if (!existe || (a.origem === "pasta" && a.nome === nome)) return true;
  return perguntar(`${nome} já existe na pasta. Substituir pelo desenho desta aba? Se ainda não houver ${nome}.bak, o arquivo atual fica guardado nele.`, "Substituir");
}

async function salvar() {
  const a = abaDat();
  if (!a) return;
  if (temPasta() && (a.origem === "pasta" || a.origem === "novo")) {
    if (await podeGravarNaPasta(a, a.nome)) salvarNaPasta(a, a.nome);
  } else baixarDat(a);
}

async function salvarComo() {
  const a = abaDat();
  if (!a) return;
  let nome = await pedirNome("Salvar como", a.nome);
  if (!nome) return;
  if (/[\\/]/.test(nome)) return avisar("O nome não pode ter barras.", true);
  if (!/\.dat$/i.test(nome)) nome += ".dat";
  if (temPasta()) {
    if (!(await podeGravarNaPasta(a, nome))) return;
    salvarNaPasta(a, nome);
  } else {
    a.nome = nome;
    baixarDat(a, nome);
    desenharAbas();
  }
}

function exportarPng() {
  const a = abaDat();
  if (!a) return;
  const c = document.createElement("canvas");
  c.width = a.doc.largura;
  c.height = a.doc.altura;
  const g = c.getContext("2d");
  const img = g.createImageData(c.width, c.height);
  const px32 = new Uint32Array(img.data.buffer);
  for (let i = 0; i < a.doc.pixels.length; i++) px32[i] = lut[a.doc.pixels[i]];
  g.putImageData(img, 0, 0);
  c.toBlob((blob) => baixar(blob, trocarExtensao(a.nome, ".png")), "image/png");
}

// ------------------------------------------------------------------ painel e estado da interface

function escolherFerramenta(f) {
  const a = abaDat();
  if (f !== "selecao" && a) fixarFlutuante(a);
  estado.ferramenta = f;
  document.querySelectorAll("[data-ferramenta]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ferramenta === f)));
  tela.dataset.ferramenta = f;
  atualizarStatus();
}

function atualizarPainel() {
  const a = abaDat();
  if (!a) return;
  a.opcoes = null; // depois de uma edição, os blocos de linhas de opção podem ter mudado
  const d = a.doc;
  const cor = (n) => hexCor(d.paleta[n]);
  $("amostra-primaria").style.background = cor(estado.primaria);
  $("amostra-secundaria").style.background = cor(estado.secundaria);
  $("numero-primaria").textContent = estado.primaria;
  $("numero-secundaria").textContent = estado.secundaria;
  $("campo-primaria").value = estado.primaria;
  $("campo-fundo").value = estado.fundo;
  $("campo-rgb").value = cor(estado.primaria);
  $("campo-nome-cor").value = legenda[estado.primaria] || "";
  $("campo-nome-cor").placeholder = SUGESTOES_CORES[estado.primaria] ? `${SUGESTOES_CORES[estado.primaria]}? (sugestão)` : "ex.: malha na frente";
  $("rotulo-nome-cor").textContent = `Nome da cor ${estado.primaria}`;

  const contagem = contarCores(d);
  const usadas = [];
  for (let c = 0; c < 256; c++) if (contagem[c]) usadas.push(c);
  $("cores-uso").innerHTML = usadas
    .map(
      (c) => `<li><button type="button" class="cor-uso${c === estado.primaria ? " primaria" : ""}${c === estado.secundaria ? " secundaria" : ""}" data-cor="${c}" title="Cor ${c} — ${cor(c)}">
        <span class="amostra" style="background:${cor(c)}"></span>
        <span class="mono numero">${c}</span>
        <span class="nome-cor${legenda[c] ? "" : " sugestao"}">${esc(nomeDaCor(c)) || `<span class="mono suave">${cor(c)}</span>`}</span>
        <span class="mono contagem">${contagem[c].toLocaleString("pt-BR")}</span>
      </button></li>`,
    )
    .join("");
  $("grade-paleta").innerHTML = Array.from(
    { length: 256 },
    (_, c) => `<button type="button" class="celula-paleta${c === estado.primaria ? " primaria" : ""}${contagem[c] ? " usada" : ""}" data-cor="${c}" style="background:${cor(c)}" aria-label="Cor ${c}" title="Cor ${c}${contagem[c] ? ` · ${contagem[c]} pixels` : ""}"></button>`,
  ).join("");

  $("info-dat").innerHTML = [
    ["Agulhas", d.largura],
    ["Carreiras", d.altura],
    ["Cores em uso", `${usadas.length} de 256`],
    ["Origem", { pasta: `pasta ${estado.pasta}`, novo: "desenho novo", exemplo: "exemplo já carregado" }[a.origem] || "computador"],
    ["Arquivo", a.tamanho ? bytesLegiveis(a.tamanho) : "ainda não salvo"],
    ["Formato", esc(String(d.assinatura || "").trim())],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd class="mono">${v}</dd>`)
    .join("");
  atualizarBotoes();
  atualizarRecursos(a);
}

function escolherCor(n, secundaria) {
  if (secundaria) estado.secundaria = n;
  else estado.primaria = n;
  atualizarPainel();
  if (estado.destacar && !secundaria) renderizar();
}

for (const id of ["cores-uso", "grade-paleta"]) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("[data-cor]");
    if (b) escolherCor(Number(b.dataset.cor), false);
  });
  $(id).addEventListener("contextmenu", (e) => {
    const b = e.target.closest("[data-cor]");
    if (!b) return;
    e.preventDefault();
    escolherCor(Number(b.dataset.cor), true);
  });
}

$("campo-primaria").addEventListener("change", (e) => escolherCor(numeroCor(e.target.value), false));
$("campo-fundo").addEventListener("change", (e) => {
  estado.fundo = numeroCor(e.target.value);
  atualizarPainel();
});
$("campo-rgb").addEventListener("change", (e) => {
  const a = abaDat();
  if (!a) return;
  salvarHistorico(a);
  a.doc.paleta[estado.primaria] = rgbDeHex(e.target.value);
  atualizarLut(a.doc.paleta);
  renderizar();
  atualizarPainel();
  avisar(`A cor ${estado.primaria} agora aparece como ${e.target.value}. O número da cor não mudou.`);
});
$("campo-nome-cor").addEventListener("change", (e) => {
  const texto = e.target.value.trim();
  if (texto) legenda[estado.primaria] = texto;
  else delete legenda[estado.primaria];
  gravarLegenda(legenda);
  atualizarPainel();
});
$("btn-trocar-cores").addEventListener("click", trocarCores);
$("espelhado").addEventListener("change", (e) => {
  estado.espelhado = e.target.checked;
  atualizarStatus();
});
$("destacar-cor").addEventListener("change", (e) => {
  estado.destacar = e.target.checked;
  renderizar();
});
$("colar-transparente").addEventListener("change", (e) => {
  estado.colarTransparente = e.target.checked;
  const a = abaDat();
  if (a && a.flutuante) {
    a.flutuante.transparente = estado.colarTransparente ? estado.fundo : null;
    renderizar();
  }
});

function trocarCores() {
  [estado.primaria, estado.secundaria] = [estado.secundaria, estado.primaria];
  atualizarPainel();
}

function atualizarBotoes() {
  const a = abaDat();
  $("btn-desfazer").disabled = !a || (!a.hist.length && !(a.flutuante && !a.flutuante.levantado));
  $("btn-refazer").disabled = !a || !a.refazer.length || !!a.flutuante;
  $("btn-salvar").textContent = a && temPasta() && (a.origem === "pasta" || a.origem === "novo") ? "Salvar na pasta" : "Salvar";
  if (!a) return;
  const tem = (acao, ok) => {
    const b = document.querySelector(`[data-acao="${acao}"]`);
    if (b) b.disabled = !ok;
  };
  const sel = !!a.selecao || !!a.flutuante;
  tem("copiar", sel);
  tem("recortar", sel);
  tem("colar", !!estado.area);
  tem("apagar", sel);
  tem("preencher", !!a.selecao);
  tem("girar", sel);
  tem("repetir", !!estado.area && !!a.selecao);
  tem("fixar", !!a.flutuante);
  tem("cortar-desenho", !!a.selecao);
  for (const acao of ["duplicar-carreiras", "excluir-carreiras", "duplicar-agulhas", "excluir-agulhas"]) tem(acao, !!a.selecao);
  tem("mudar-tamanho", sel);
  tem("repetir-motivo", !!estado.motivo);
  const repetir = document.querySelector('[data-acao="repetir-motivo"]');
  if (repetir) repetir.textContent = a.selecao ? "Repetir o motivo na seleção" : "Repetir o motivo no corpo";
  tem("voltar-original", !!a.original && a.hist.length > 0);
  tem("usar-copia", !!estado.area);
  tem("guardar-motivo", !!estado.motivo);
}

function desenharOpcoes() {
  const a = abaDat();
  const el = $("lista-opcoes");
  if (!a) return;
  const blocos = blocosDeOpcao(a);
  if (!blocos.length) {
    $("titulo-opcoes").textContent = "";
    el.innerHTML = `<p class="suave pequeno">Nenhum bloco de linhas de opção encontrado neste desenho.</p>`;
    return;
  }
  const d = a.doc;
  const y = estado.carreiraFoco;
  const naFaixa = blocos.filter((b) => y !== null && y >= b.carreiraInicio && y <= b.carreiraFim);
  if (!naFaixa.length) {
    $("titulo-opcoes").textContent = "";
    el.innerHTML = `<p class="suave pequeno">Passe o cursor sobre uma carreira entre ${d.altura - blocos[0].carreiraFim} e ${d.altura - blocos[0].carreiraInicio} para ver os valores de L1–L20 e R1–R20.</p>`;
    return;
  }
  $("titulo-opcoes").textContent = `carreira ${d.altura - y}`;
  el.innerHTML = naFaixa
    .map((b) => {
      const valores = ShimaDat.valoresDasLinhas(d, b, y);
      const painel = Math.floor(blocos.indexOf(b) / 2) + 1;
      const linhas = valores.length
        ? valores
            .map(
              (v) =>
                `<tr><th class="mono"><button type="button" class="link-linha" data-escolher-linha="${v.linha}" data-bloco="${blocos.indexOf(b)}" title="Escolher a linha ${v.linha} em Uma linha">${v.linha}</button></th><td class="mono">${v.cores.join(", ")}</td><td class="suave">${esc(nomeDaLinha(v.linha))}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="3" class="suave">sem valores</td></tr>`;
      return `<table class="tabela tabela-opcoes"><caption>${b.lado === "L" ? "Esquerda" : "Direita"} · painel ${painel}</caption><tbody>${linhas}</tbody></table>`;
    })
    .join("");
}

function atualizarStatus(p) {
  const a = abaDat();
  if (!a) return;
  const d = a.doc;
  if (p && noDesenho(p, d)) {
    const n = d.pixels[p.y * d.largura + p.x];
    const nome = nomeDaCor(n);
    const linha = ShimaDat.linhaDeOpcaoEm(blocosDeOpcao(a), p.x, p.y);
    const nomeLinha = linha ? nomeDaLinha(linha.lado + linha.numero) : "";
    const textoLinha = linha ? ` · Linha de opção ${linha.lado}${linha.numero}${nomeLinha ? `: ${nomeLinha}` : ""}` : "";
    const trecho = trechoNoPonto(a, p.x, p.y);
    $("status-posicao").textContent = `Agulha ${p.x + 1} · Carreira ${d.altura - p.y} · Cor ${n}${nome ? ` (${nome})` : ""}${textoLinha}${trecho ? ` · ${trecho}` : ""}`;
    if (estado.carreiraFoco !== p.y) {
      estado.carreiraFoco = p.y;
      desenharOpcoes();
    }
  } else if (p !== undefined) {
    $("status-posicao").textContent = "—";
  }
  const r = a.flutuante || a.selecao;
  $("status-selecao").textContent = r ? `${a.flutuante ? "Colagem" : "Seleção"} ${r.w} × ${r.h}` : "";
  const motivo = estado.ferramenta === "carimbo" ? (estado.motivo ? ` · ${estado.motivo.nome} ${estado.motivo.w}×${estado.motivo.h}` : " · escolha um motivo") : "";
  $("status-ferramenta").textContent = `${FERRAMENTAS[estado.ferramenta].nome}${["lapis", "borracha", "linha", "retangulo"].includes(estado.ferramenta) ? ` · ${estado.pincel} px` : ""}${motivo}${estado.espelhado ? " · espelhado" : ""}`;
  $("status-tamanho").textContent = `${d.largura} × ${d.altura} · ${Math.round(a.zoom * 100)}%`;
}

// ------------------------------------------------------------------ inspetor (.000, .QFD, imagens)

function guias(aba, lista) {
  return `<div class="guias" role="tablist">${lista
    .map(([id, nome]) => `<button type="button" role="tab" class="guia" data-guia="${id}" aria-selected="${aba.guia === id}">${nome}</button>`)
    .join("")}</div>`;
}

function tabelaHex(bytes, comparar) {
  const linhas = ShimaArquivos.linhasHex(bytes, 0, LIMITE_HEX);
  const corpo = linhas
    .map((l) => {
      let hex;
      if (comparar) {
        hex = l.hex
          .split(" ")
          .map((b, k) => {
            const j = l.posicao + k;
            const outro = j < comparar.length ? comparar[j].toString(16).padStart(2, "0") : null;
            return outro === b ? b : `<mark>${b}</mark>`;
          })
          .join(" ");
      } else hex = l.hex;
      return `<tr><th class="mono">${l.posicao.toString(16).padStart(6, "0")}</th><td class="mono hex">${hex}</td><td class="mono texto">${esc(l.texto)}</td></tr>`;
    })
    .join("");
  const aviso = bytes.length > LIMITE_HEX * 16 ? `<p class="suave pequeno">Mostrando os primeiros ${bytesLegiveis(LIMITE_HEX * 16)}.</p>` : "";
  return `<div class="tabela-rolavel"><table class="tabela tabela-hex"><tbody>${corpo}</tbody></table></div>${aviso}`;
}

function outrasAbas(aba) {
  return estado.abas.filter((a) => a !== aba && a.tipo === aba.tipo);
}

function seletorComparar(aba) {
  const outras = outrasAbas(aba);
  if (!outras.length) return `<p class="suave pequeno">Abra outro arquivo do mesmo tipo para comparar (por exemplo, ${aba.tipo === "programa" ? "00_C_P.000 com 00_M_P.000" : "00_C_P.QFD com 00_M_P.QFD"}).</p>`;
  return `<label class="campo campo-linha">Comparar com
    <select data-comparar>
      <option value="">— nenhum —</option>
      ${outras.map((o) => `<option value="${o.id}"${String(o.id) === aba.comparar ? " selected" : ""}>${esc(o.nome)}</option>`).join("")}
    </select></label>`;
}

function abaComparada(aba) {
  return aba.comparar ? estado.abas.find((a) => String(a.id) === aba.comparar) || null : null;
}

function inspetorPrograma(aba) {
  const p = aba.aberto;
  const outra = abaComparada(aba);
  const secoesComLinhas = p.secoes.filter((s) => s.linhas && s.linhas.length);
  const principal = secoesComLinhas.sort((x, y) => y.linhas.length - x.linhas.length)[0];
  let html = `<div class="cabecalho-inspetor"><h2 class="mono">${esc(aba.nome)}</h2>
    <p class="suave">Programa de tricô gerado pelo KnitPaint para a máquina. Aberto só para consulta: para alterar, edite o .dat e processe de novo no SDS-ONE.</p></div>`;
  html += guias(aba, [["resumo", "Resumo"], ["secoes", "Seções"], ["linhas", "Linhas do programa"], ["hex", "Hexadecimal"]]);

  if (aba.guia === "resumo") {
    html += `<dl class="info grande">
      ${p.campos.map((c) => `<dt>${esc(c.chave)}</dt><dd class="mono">${esc(c.valor)}</dd>`).join("")}
      <dt>Assinatura</dt><dd class="mono">${esc(p.copyright)}</dd>
      <dt>Tamanho</dt><dd class="mono">${bytesLegiveis(p.tamanho)}</dd>
      <dt>Seções</dt><dd class="mono">${p.secoes.length} (${p.secoes.filter((s) => s.compactada).length} compactadas)</dd>
      <dt>Linhas do programa</dt><dd class="mono">${principal ? `${principal.linhas.length} linhas × 3 sistemas` : "—"}</dd>
    </dl>
    <p class="suave pequeno">Campos do cabeçalho: F = nome do arquivo. Os outros (S, I, C, T, M) são gravados pelo KnitPaint; o significado não é documentado.</p>`;
  } else if (aba.guia === "secoes") {
    html += `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>Nº</th><th>Posição</th><th>Tipo</th><th>No arquivo</th><th>Conteúdo</th><th>Linhas</th>${outra ? "<th>Igual ao outro?</th>" : ""}</tr></thead><tbody>
      ${p.secoes
        .map((s, i) => {
          let igual = "";
          if (outra) {
            const o = outra.aberto.secoes[i];
            const mesmo = o && o.tipo === s.tipo && o.dados.length === s.dados.length && o.dados.every((v, k) => v === s.dados[k]);
            igual = `<td>${mesmo ? "sim" : "<strong>diferente</strong>"}</td>`;
          }
          return `<tr class="${aba.detalhe === i ? "selecionada" : ""}"><td><button type="button" class="link" data-detalhe="${i}">${s.numero}</button></td>
          <td class="mono">0x${s.inicio.toString(16)}</td><td class="mono">0x${s.tipo.toString(16).toUpperCase()}${s.compactada ? " · LZSS" : ""}</td>
          <td class="mono">${s.tamanho} bytes</td><td class="mono">${s.dados.length} bytes</td><td class="mono">${s.linhas ? s.linhas.length : "—"}</td>${igual}</tr>`;
        })
        .join("")}
    </tbody></table></div>`;
    html += seletorComparar(aba);
    if (aba.detalhe != null && p.secoes[aba.detalhe]) {
      const s = p.secoes[aba.detalhe];
      const o = outra && outra.aberto.secoes[aba.detalhe];
      html += `<h3 class="sub">Seção ${s.numero}${s.compactada ? " (descompactada)" : ""}${o ? ` — bytes diferentes de ${esc(outra.nome)} destacados` : ""}</h3>${tabelaHex(s.dados, o ? o.dados : null)}`;
    }
  } else if (aba.guia === "linhas") {
    if (!principal) html += `<p>Não foram encontradas linhas neste programa.</p>`;
    else {
      const indice = p.secoes.indexOf(principal);
      const o = outra && outra.aberto.secoes[indice];
      const linhasOutra = o && o.linhas;
      let diferentes = 0;
      const corpo = principal.linhas
        .map((sistemas, n) => {
          const celulas = sistemas.map((bytes, s) => {
            const ref = linhasOutra && linhasOutra[n] ? linhasOutra[n][s] : null;
            const hex = Array.from(bytes, (b, k) => {
              const t = b.toString(16).padStart(2, "0");
              return ref && ref[k] !== b ? `<mark>${t}</mark>` : t;
            }).join(" ");
            return `<td class="mono hex">${hex}</td>`;
          });
          const dif = linhasOutra && (!linhasOutra[n] || sistemas.some((bytes, s) => bytes.some((b, k) => linhasOutra[n][s][k] !== b)));
          if (dif) diferentes++;
          return `<tr class="${dif ? "diferente" : ""}"><th class="mono">${n + 1}</th>${celulas.join("")}</tr>`;
        })
        .join("");
      html += `<p class="suave pequeno">Seção ${principal.numero}: ${principal.linhas.length} linhas de 66 bytes, um bloco de 22 bytes por sistema do carro (começam por 81, 82 e 83).</p>`;
      html += seletorComparar(aba);
      if (linhasOutra) html += `<p><strong>${diferentes}</strong> de ${principal.linhas.length} linhas diferentes de ${esc(outra.nome)}.</p>`;
      html += `<div class="tabela-rolavel alta"><table class="tabela tabela-hex"><thead><tr><th>Linha</th><th>Sistema 1</th><th>Sistema 2</th><th>Sistema 3</th></tr></thead><tbody>${corpo}</tbody></table></div>`;
    }
  } else {
    html += seletorComparar(aba);
    html += tabelaHex(p.bytes, outra ? outra.aberto.bytes : null);
  }
  return html;
}

function inspetorAjustes(aba) {
  const q = aba.aberto;
  const outra = abaComparada(aba);
  let html = `<div class="cabecalho-inspetor"><h2 class="mono">${esc(aba.nome)}</h2>
    <p class="suave">Ajustes automáticos do programa (${esc(q.titulo)}). Aberto só para consulta.</p></div>`;
  html += guias(aba, [["resumo", "Registros"], ["hex", "Hexadecimal"]]);
  if (aba.guia === "resumo") {
    html += seletorComparar(aba);
    html += `<div class="tabela-rolavel"><table class="tabela"><thead><tr><th>Registro</th><th>Posição</th><th>Tamanho</th><th>Textos encontrados</th>${outra ? "<th>Bytes diferentes</th>" : ""}</tr></thead><tbody>
      ${q.registros
        .map((r, i) => {
          let dif = "";
          if (outra) {
            const o = outra.aberto.registros.find((x) => x.numero === r.numero);
            const n = o ? r.conteudo.reduce((t, b, k) => t + (o.conteudo[k] !== b ? 1 : 0), 0) + Math.abs(o.conteudo.length - r.conteudo.length) : r.conteudo.length;
            dif = `<td class="mono">${n ? `<strong>${n}</strong>` : "0"}</td>`;
          }
          const textos = r.textos.slice(0, 4).map((t) => esc(t.texto)).join(" · ") + (r.textos.length > 4 ? ` · +${r.textos.length - 4}` : "");
          return `<tr class="${aba.detalhe === i ? "selecionada" : ""}"><td><button type="button" class="link" data-detalhe="${i}">${r.numero}</button></td>
            <td class="mono">0x${r.inicio.toString(16)}</td><td class="mono">${r.tamanho} bytes</td><td class="mono pequeno">${textos || "—"}</td>${dif}</tr>`;
        })
        .join("")}
    </tbody></table></div>`;
    if (aba.detalhe != null && q.registros[aba.detalhe]) {
      const r = q.registros[aba.detalhe];
      const o = outra && outra.aberto.registros.find((x) => x.numero === r.numero);
      html += `<h3 class="sub">Registro ${r.numero}</h3>${tabelaHex(r.conteudo, o ? o.conteudo : null)}`;
    }
  } else {
    html += seletorComparar(aba);
    html += tabelaHex(q.bytes, outra ? outra.aberto.bytes : null);
  }
  return html;
}

function inspetorImagem(aba) {
  return `<div class="cabecalho-inspetor"><h2 class="mono">${esc(aba.nome)}</h2>
    <p class="suave">Imagem (${bytesLegiveis(aba.tamanho)}). Pode ser importada num desenho .dat aberto.</p></div>
    <div class="acoes-inspetor"><button type="button" class="botao principal" data-usar-imagem>Importar num desenho…</button></div>
    <div class="previa"><img src="${aba.aberto.url}" alt="Prévia de ${esc(aba.nome)}"></div>`;
}

function inspetorDesconhecido(aba) {
  const t = aba.aberto.textos || [];
  return `<div class="cabecalho-inspetor"><h2 class="mono">${esc(aba.nome)}</h2>
    <p class="suave">Formato não reconhecido (${bytesLegiveis(aba.tamanho)}). Mostrando o conteúdo bruto.</p></div>
    ${t.length ? `<h3 class="sub">Textos encontrados</h3><p class="mono pequeno">${t.slice(0, 40).map((x) => esc(x.texto)).join(" · ")}</p>` : ""}
    ${tabelaHex(aba.aberto.bytes)}`;
}

function desenharInspetor(aba) {
  const el = $("inspetor");
  if (aba.tipo === "programa") el.innerHTML = inspetorPrograma(aba);
  else if (aba.tipo === "ajustes") el.innerHTML = inspetorAjustes(aba);
  else if (aba.tipo === "imagem") el.innerHTML = inspetorImagem(aba);
  else el.innerHTML = inspetorDesconhecido(aba);
}

$("inspetor").addEventListener("click", (e) => {
  const aba = abaAtual();
  if (!aba) return;
  const guia = e.target.closest("[data-guia]");
  const detalhe = e.target.closest("[data-detalhe]");
  if (guia) {
    aba.guia = guia.dataset.guia;
    desenharInspetor(aba);
  } else if (detalhe) {
    const i = Number(detalhe.dataset.detalhe);
    aba.detalhe = aba.detalhe === i ? null : i;
    desenharInspetor(aba);
  } else if (e.target.closest("[data-usar-imagem]")) {
    const destino = [...estado.abas].reverse().find((a) => a.tipo === "dat");
    if (!destino) return avisar("Abra um .dat primeiro para importar a imagem nele.", true);
    estado.imagemImportar = { nome: aba.nome, url: aba.aberto.url, temporaria: false };
    mostrarAba(destino);
    abrirDialogoImportar(destino);
  }
});

$("inspetor").addEventListener("change", (e) => {
  const aba = abaAtual();
  if (aba && e.target.matches("[data-comparar]")) {
    aba.comparar = e.target.value;
    desenharInspetor(aba);
  }
});

// ------------------------------------------------------------------ eventos gerais

$("abas").addEventListener("click", (e) => {
  const fechar = e.target.closest("[data-fechar]");
  const abrir = e.target.closest("[data-aba]");
  if (fechar) fecharAba(Number(fechar.dataset.fechar));
  else if (abrir) mostrarAba(estado.abas.find((a) => a.id === Number(abrir.dataset.aba)));
});

$("lista-pasta").addEventListener("click", (e) => {
  const b = e.target.closest("[data-arquivo]");
  if (b) abrirDaPasta(b.dataset.arquivo);
});

$("btn-abrir-todos").addEventListener("click", abrirTodos);
$("btn-conectar-pasta").addEventListener("click", async () => {
  try {
    const pasta = await window.showDirectoryPicker({ id: "editor-shima", mode: "readwrite" });
    if (await permissaoDaPasta(pasta, true)) await conectarPasta(pasta);
    else avisar("Sem permissão para gravar, a pasta não foi conectada.", true);
  } catch (erro) {
    if (erro && erro.name === "AbortError") return; // a pessoa fechou a janela de escolha
    avisar(`Não foi possível conectar a pasta: ${(erro && erro.message) || erro}`, true);
  }
});
$("btn-reconectar-pasta").addEventListener("click", async () => {
  const pasta = estado.pastaGuardada;
  if (!pasta) return;
  try {
    if (await permissaoDaPasta(pasta, true)) await conectarPasta(pasta, false);
    else avisar("O navegador não liberou o acesso. Use “Conectar uma pasta…” para escolher de novo.", true);
  } catch (erro) {
    avisar(`Não foi possível reconectar: ${(erro && erro.message) || erro}`, true);
  }
});
$("btn-atualizar-pasta").addEventListener("click", carregarPasta);
$("entrada-pasta").addEventListener("change", (e) => {
  abrirLocais([...e.target.files].sort((a, b) => a.name.localeCompare(b.name)));
  e.target.value = "";
});
$("entrada-arquivo").addEventListener("change", (e) => {
  abrirLocais([...e.target.files]);
  e.target.value = "";
});

$("ferramentas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ferramenta]");
  if (b) escolherFerramenta(b.dataset.ferramenta);
});
$("tamanho-pincel").addEventListener("change", (e) => {
  estado.pincel = Number(e.target.value);
  atualizarStatus();
});
$("btn-desfazer").addEventListener("click", desfazer);
$("btn-refazer").addEventListener("click", refazer);
$("btn-zoom-mais").addEventListener("click", () => passoZoom(1));
$("btn-zoom-menos").addEventListener("click", () => passoZoom(-1));
$("zoom").innerHTML = ZOOMS.map((z) => `<option value="${z}">${Math.round(z * 100)}%</option>`).join("");
$("zoom").addEventListener("change", (e) => definirZoom(Number(e.target.value)));
$("btn-ajustar").addEventListener("click", () => {
  const a = abaDat();
  if (a) definirZoom(zoomQueCabe(a.doc));
});
$("mostrar-grade").addEventListener("change", (e) => {
  estado.grade = e.target.checked;
  const a = abaDat();
  if (a) aplicarTamanho(a);
});
$("btn-salvar").addEventListener("click", salvar);
$("btn-salvar-como").addEventListener("click", salvarComo);
$("btn-baixar").addEventListener("click", () => {
  const a = abaDat();
  if (a) baixarDat(a);
});
$("btn-png").addEventListener("click", exportarPng);

document.addEventListener("keydown", (e) => {
  // Caixas de marcar (Grade, Espelhado, Símbolos…) não usam letras: os atalhos continuam valendo nelas.
  if (e.target.closest('input:not([type="checkbox"]), select, textarea') || document.querySelector("dialog[open]")) return;
  const a = abaDat();
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === "s") {
    e.preventDefault();
    salvar();
    return;
  }
  if (!a) return;
  if (ctrl && k === "z" && !e.shiftKey) desfazer();
  else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) refazer();
  else if (ctrl && k === "c") ACOES.copiar(a);
  else if (ctrl && k === "x") ACOES.recortar(a);
  else if (ctrl && k === "v") ACOES.colar(a);
  else if (ctrl && k === "a") ACOES["selecionar-tudo"](a);
  else if (ctrl) return;
  else if (k === "delete" || k === "backspace") ACOES.apagar(a);
  else if (k === "enter") fixarFlutuante(a);
  else if (k === "escape") {
    if (a.flutuante) desfazer();
    else a.selecao = null;
    posicionarCaixas();
  } else if (k === "x") trocarCores();
  else if (k === "+" || k === "=") passoZoom(1);
  else if (k === "-") passoZoom(-1);
  else {
    const f = Object.keys(FERRAMENTAS).find((id) => FERRAMENTAS[id].tecla === k);
    if (!f) return;
    escolherFerramenta(f);
  }
  e.preventDefault();
  atualizarBotoes();
  atualizarStatus();
});

let profundidadeArrasto = 0;
window.addEventListener("dragenter", (e) => {
  if (![...e.dataTransfer.types].includes("Files") || document.querySelector("dialog[open]")) return;
  profundidadeArrasto++;
  $("soltar").hidden = false;
});
window.addEventListener("dragleave", () => {
  profundidadeArrasto = Math.max(0, profundidadeArrasto - 1);
  if (!profundidadeArrasto) $("soltar").hidden = true;
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  profundidadeArrasto = 0;
  $("soltar").hidden = true;
  // Com um diálogo aberto, a aba nova ficaria por baixo e o diálogo continuaria agindo na anterior.
  if (document.querySelector("dialog[open]")) return avisar("Feche a janela aberta antes de abrir outros arquivos.");
  abrirLocais([...e.dataTransfer.files]);
});

window.addEventListener("beforeunload", (e) => {
  if (estado.abas.some((a) => a.modificado)) e.preventDefault();
});

window.addEventListener("resize", () => {
  const a = abaDat();
  if (a) posicionarCaixas();
});

// Começa depois que todos os scripts da página carregaram: editor_recursos.js vem depois deste arquivo e
// a tela do desenho já usa as funções dele.
function iniciar() {
  escolherFerramenta("lapis");
  if (window.SHIMA_EXEMPLO) {
    // Versão publicada: abre já com um desenho de exemplo embutido na página.
    const binario = atob(window.SHIMA_EXEMPLO.base64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    abrirBuffer(window.SHIMA_EXEMPLO.nome, bytes.buffer, "exemplo");
  }
  desenharConexao();
  carregarPasta().then(async () => {
    desenharConexao();
    await retomarPastaLembrada();
    const pedido = new URLSearchParams(location.search).get("abrir");
    if (pedido) abrirDaPasta(pedido);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
else setTimeout(iniciar);
