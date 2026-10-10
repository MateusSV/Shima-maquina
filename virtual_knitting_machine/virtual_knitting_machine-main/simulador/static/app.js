"use strict";

// Simulador de Tricô: pede os quadros ao servidor (/api/simular), controla a reprodução
// e chama desenharPalco (maquina.js) a cada quadro.

const VELOCIDADES = [0.25, 0.5, 1, 2, 4, 8];
const OPERACOES_POR_SEGUNDO = 6; // na velocidade 1×
const NOMES = { meia: "Meia", ribana: "Ribana 1x1", arroz: "Ponto arroz" };

const $ = (id) => document.getElementById(id);

const estado = {
  padrao: "ribana", largura: 16, carreiras: 12,
  cfg: null, sim: null,
  quadro: 0, t: 0, tocando: false, vel: 2,
  carregando: false, arrastandoTempo: false,
};

let cores = lerCores();
let precisaDesenhar = true;
let ultimoTs = null;

function lerCores() {
  const cs = getComputedStyle(document.documentElement);
  const v = (nome) => cs.getPropertyValue(nome).trim();
  return {
    card: v("--card"), faixa: v("--faixa"), agulha: v("--agulha"), agulhaBorda: v("--agulha-borda"),
    tinta: v("--tinta"), suave: v("--suave"), fio: v("--fio"), trico: v("--trico"), linha: v("--linha"),
    carro: v("--carro"), carroBorda: v("--carro-borda"), destaque: v("--destaque"),
    ok: v("--ok"), pausa: v("--pausa"),
    ssrTrilho: v("--ssr-trilho"), ssrTrilhoBorda: v("--ssr-trilho-borda"), ssrInterior: v("--ssr-interior"),
    ssrChapa: v("--ssr-chapa"), ssrTaupe: v("--ssr-taupe"), ssrTaupeEscuro: v("--ssr-taupe-escuro"),
    ssrCaqui: v("--ssr-caqui"), ssrCaquiEscuro: v("--ssr-caqui-escuro"),
    ssrGabinete: v("--ssr-gabinete"), ssrGabineteBorda: v("--ssr-gabinete-borda"),
    ssrLcd: v("--ssr-lcd"), ssrPainel: v("--ssr-painel"), ssrCarro: v("--ssr-carro"), ssrCarroEscuro: v("--ssr-carro-escuro"),
  };
}

// ---------- Servidor ----------

async function tricotar(tocarDepois) {
  if (estado.carregando) return;
  estado.carregando = true;
  const pedido = { padrao: estado.padrao, largura: estado.largura, carreiras: estado.carreiras };
  $("tricotar").disabled = true;
  $("tricotar").textContent = "Simulando…";
  mostrarErro(null);
  try {
    const consulta = new URLSearchParams(pedido).toString();
    const resposta = await fetch(`/api/simular?${consulta}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
    estado.sim = dados;
    estado.cfg = pedido;
    estado.quadro = 0;
    estado.t = 0;
    estado.tocando = tocarDepois;
    $("linha-tempo").max = dados.quadros.length - 1;
    const avisos = dados.avisos || [];
    $("avisos").hidden = avisos.length === 0;
    $("avisos").textContent = avisos.length ? `A biblioteca emitiu ${avisos.length} aviso(s): ${avisos[0]}` : "";
  } catch (erro) {
    const semServidor = erro instanceof TypeError;
    mostrarErro(semServidor ? "Não foi possível falar com o servidor. Ele está rodando?" : erro.message);
  } finally {
    estado.carregando = false;
    $("tricotar").disabled = false;
    $("tricotar").textContent = "Tricotar";
    atualizarPainel();
    precisaDesenhar = true;
  }
}

function mostrarErro(mensagem) {
  $("erro").hidden = !mensagem;
  $("erro").textContent = mensagem || "";
}

// ---------- Controles ----------

function ultimoQuadro() {
  return estado.sim ? estado.sim.quadros.length - 1 : 0;
}

function alternarPlay() {
  if (!estado.sim) return;
  if (estado.tocando) {
    estado.tocando = false;
  } else {
    if (estado.quadro >= ultimoQuadro()) { estado.quadro = 0; estado.t = 0; }
    estado.tocando = true;
  }
  precisaDesenhar = true;
}

function avancarUmPasso() {
  if (!estado.sim || estado.tocando || estado.quadro >= ultimoQuadro()) return;
  estado.quadro += 1;
  estado.t = 0;
  precisaDesenhar = true;
}

function reiniciar() {
  estado.quadro = 0;
  estado.t = 0;
  estado.tocando = false;
  precisaDesenhar = true;
}

function montarControles() {
  for (const botao of document.querySelectorAll(".padrao")) {
    botao.addEventListener("click", () => {
      estado.padrao = botao.dataset.padrao;
      atualizarPainel();
    });
  }
  $("largura").addEventListener("input", (e) => { estado.largura = Number(e.target.value); atualizarPainel(); });
  $("carreiras").addEventListener("input", (e) => { estado.carreiras = Number(e.target.value); atualizarPainel(); });
  $("tricotar").addEventListener("click", () => tricotar(true));
  $("tocar").addEventListener("click", alternarPlay);
  $("passo").addEventListener("click", avancarUmPasso);
  $("reiniciar").addEventListener("click", reiniciar);

  const tempo = $("linha-tempo");
  tempo.addEventListener("pointerdown", () => { estado.arrastandoTempo = true; });
  window.addEventListener("pointerup", () => { estado.arrastandoTempo = false; });
  tempo.addEventListener("input", (e) => {
    estado.quadro = Math.min(ultimoQuadro(), Number(e.target.value));
    estado.t = 0;
    precisaDesenhar = true;
  });

  const velocidades = $("velocidades");
  VELOCIDADES.forEach((v, i) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = `${String(v).replace(".", ",")}×`;
    botao.addEventListener("click", () => { estado.vel = i; atualizarPainel(); });
    velocidades.appendChild(botao);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.closest("input, button, textarea, select")) return;
    e.preventDefault();
    alternarPlay();
  });

  new ResizeObserver(() => { precisaDesenhar = true; }).observe($("maquina"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    cores = lerCores();
    precisaDesenhar = true;
  });
}

// Partes do painel que só mudam com cliques (não a cada quadro).
function atualizarPainel() {
  for (const botao of document.querySelectorAll(".padrao")) {
    botao.setAttribute("aria-pressed", String(botao.dataset.padrao === estado.padrao));
  }
  $("largura-valor").textContent = estado.largura;
  $("carreiras-valor").textContent = estado.carreiras;
  [...$("velocidades").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === estado.vel)));
  const c = estado.cfg;
  $("alterado").hidden = !c || (c.padrao === estado.padrao && c.largura === estado.largura && c.carreiras === estado.carreiras);
  $("resumo").textContent = c && estado.sim
    ? `${ultimoQuadro()} operações · ${NOMES[c.padrao]} · ${c.largura}×${c.carreiras}`
    : "";
}

// Partes que mudam durante a animação.
function atualizarReproducao(quadro) {
  const ultimo = ultimoQuadro();
  const noFim = estado.quadro >= ultimo;
  const status = estado.tocando ? ["Tricotando", cores.ok] : noFim && estado.sim ? ["Concluído", cores.tinta]
    : estado.quadro === 0 ? ["Pronto", cores.pausa] : ["Pausado", cores.pausa];
  setTexto("status-texto", estado.sim ? status[0] : "Sem simulação");
  $("status-ponto").style.background = status[1];

  setTexto("tocar-texto", estado.tocando ? "Pausar" : noFim && estado.sim ? "Repetir" : "Play");
  $("icone-play").hidden = estado.tocando;
  $("icone-pausa").hidden = !estado.tocando;
  $("passo").disabled = !estado.sim || estado.tocando || noFim;
  $("tocar").disabled = !estado.sim;

  setTexto("contador", `Operação ${estado.quadro} de ${ultimo}`);
  if (!estado.arrastandoTempo) $("linha-tempo").value = estado.quadro;
  if (!quadro) return;
  const legenda = `${quadro.stage} · ${quadro.label}`;
  setTexto("legenda-op", legenda);
  $("maquina").setAttribute("aria-label", `Máquina: ${legenda}`);
}

function setTexto(id, texto) {
  const el = $(id);
  if (el.textContent !== texto) el.textContent = texto;
}

// ---------- Animação ----------

function passo(ts) {
  const dt = ultimoTs === null ? 0 : Math.min(0.1, (ts - ultimoTs) / 1000);
  ultimoTs = ts;
  if (estado.tocando && estado.sim) {
    const quadros = estado.sim.quadros;
    const ultimo = quadros.length - 1;
    if (estado.quadro >= ultimo) {
      estado.tocando = false;
      estado.t = 0;
    } else {
      // Deslocamentos longos do carrinho (voltas vazias) levam mais tempo, para ele andar em velocidade constante.
      const a = quadros[estado.quadro], b = quadros[estado.quadro + 1];
      const duracao = Math.max(1, Math.abs(b.pos - a.pos) / 3) / (OPERACOES_POR_SEGUNDO * VELOCIDADES[estado.vel]);
      estado.t += dt / duracao;
      while (estado.t >= 1 && estado.quadro < ultimo) { estado.t -= 1; estado.quadro += 1; }
      if (estado.quadro >= ultimo) estado.t = 0;
    }
    precisaDesenhar = true;
  }
  if (precisaDesenhar) {
    precisaDesenhar = false;
    desenhar();
  }
  requestAnimationFrame(passo);
}

function desenhar() {
  const sim = estado.sim;
  if (!sim) {
    atualizarReproducao(null);
    desenharPalco($("maquina"), null, cores);
    return;
  }
  const quadro = sim.quadros[estado.quadro];
  const ultimo = sim.quadros.length - 1;
  const movendo = estado.quadro < ultimo;
  const proximo = sim.quadros[Math.min(estado.quadro + 1, ultimo)];
  const t = movendo ? estado.t : 0;
  // Durante a transição, a legenda descreve a operação que está sendo animada.
  atualizarReproducao(t > 0 ? proximo : quadro);
  const tecido = desenharPalco($("maquina"), { sim, quadro, proximo, t, movendo, tocando: estado.tocando }, cores);
  setTexto("info-tecido", `${tecido.carreirasFeitas} de ${sim.carreiras} carreiras · ${tecido.pontosFeitos} pontos`);
}


// ---------- Início ----------

montarControles();
atualizarPainel();
document.fonts.ready.then(() => { precisaDesenhar = true; });
tricotar(false);
requestAnimationFrame(passo);
