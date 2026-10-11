// Recursos para desenvolver um modelo, no estilo do KnitPaint:
//   modelo      medidas em cm viram agulhas e carreiras pela densidade da amostra
//   forma       diminuições, aumentos, arremates e malha parcial distribuídos pelas carreiras
//   biblioteca  motivos de ponto (trança, barra, links, rendado, flutuação, transferência, tuck) e repetição
//   cor         flutuações do jacquard e guia-fios da intarsia; listras e losango
//   opção       faixas de valores das linhas L1–L20 e R1–R20, pintar valor, altura desenvolvida
//   verificar   regras que procuram falhas no desenho antes de ir para a máquina
//   tempo       estimativa do tempo de tecimento
//
// Tudo trabalha com números de cor (um por ponto), sem tela: funciona no navegador (window.RecursosMalha)
// e no Node (module.exports). Os significados de códigos e linhas de opção vêm de referências públicas do
// KnitPaint e mudam entre versões; por isso os códigos usados para desenhar são sempre escolhidos por quem usa.

(function (raiz) {
  "use strict";

  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const numero = (s, padrao = 0) => {
    const v = parseFloat(String(s).replace(",", "."));
    return Number.isFinite(v) ? v : padrao;
  };

  // ------------------------------------------------------------------ modelo

  const CORPO = [
    { id: "larg", nome: "Largura do corpo (busto ÷ 2)", cm: 48, eixo: "h" },
    { id: "comp", nome: "Comprimento total", cm: 60, eixo: "v" },
    { id: "barra", nome: "Barra", cm: 5, eixo: "v" },
    { id: "cava", nome: "Altura da cava", cm: 20, eixo: "v" },
    { id: "ombro", nome: "Ombro (cada lado)", cm: 11, eixo: "h" },
    { id: "gola", nome: "Largura da gola", cm: 18, eixo: "h" },
    { id: "golaP", nome: "Fundo da gola na frente", cm: 8, eixo: "v" },
    { id: "manga", nome: "Comprimento da manga", cm: 58, eixo: "v" },
    { id: "mangaL", nome: "Largura da manga na cava", cm: 34, eixo: "h" },
    { id: "punho", nome: "Largura do punho", cm: 20, eixo: "h" },
  ];
  const trocar = (lista, trocas, extra = []) => lista.map((m) => (trocas[m.id] !== undefined ? { ...m, cm: trocas[m.id] } : m)).concat(extra);

  const ESTILOS = [
    {
      id: "painel",
      nome: "Painel reto",
      dica: "Painel reto, sem diminuições nem aumentos. A barra é a faixa de baixo.",
      medidas: [
        { id: "larg", nome: "Largura do painel", cm: 67.7, eixo: "h" },
        { id: "comp", nome: "Altura do painel", cm: 44.8, eixo: "v" },
        { id: "barra", nome: "Barra", cm: 2.5, eixo: "v" },
      ],
    },
    {
      id: "careca",
      nome: "Gola careca",
      dica: "Gola careca: arremate no centro da gola e diminuições dos dois lados. A cava começa com um arremate e termina com diminuições.",
      medidas: CORPO,
    },
    { id: "v", nome: "Gola V", dica: "Gola V: a frente se divide no centro e diminui dos dois lados até o ombro.", medidas: trocar(CORPO, { gola: 16, golaP: 20 }) },
    {
      id: "cardiga",
      nome: "Cardigã",
      dica: "Cardigã: duas frentes, cada uma com metade da largura mais metade da vista dos botões e a gola em V na borda do meio.",
      medidas: trocar(CORPO, { gola: 16, golaP: 22 }, [{ id: "vista", nome: "Vista dos botões", cm: 3, eixo: "h" }]),
    },
    {
      id: "regata",
      nome: "Regata",
      dica: "Regata: cava mais funda e ombro estreito, sem manga.",
      medidas: trocar(CORPO.slice(0, 7), { larg: 46, comp: 58, barra: 3, cava: 22, ombro: 5, gola: 20, golaP: 12 }),
    },
    {
      id: "polo",
      nome: "Gola polo",
      dica: "Gola polo: peça separada. A Shima tem uma versão do KnitPaint-Online só para a máquina de golas N.SSR072.",
      medidas: [
        { id: "larg", nome: "Comprimento da gola", cm: 40, eixo: "h" },
        { id: "comp", nome: "Altura da gola", cm: 8, eixo: "v" },
        { id: "barra", nome: "Acabamento da borda", cm: 1.5, eixo: "v" },
      ],
    },
  ];

  function conversor(densidade = {}) {
    const col = Math.max(0.1, numero(densidade.colunas, 30));
    const car = Math.max(0.1, numero(densidade.carreiras, 40));
    return { ag: (cm) => Math.round((cm * col) / 10), ca: (cm) => Math.round((cm * car) / 10) };
  }

  // Arremate central da gola com a mesma paridade da largura, para os dois lados ficarem iguais.
  function centroPar(largura, arremate) {
    let a = Math.max(0, Math.round(arremate));
    if ((largura - a) % 2) a += a > 0 ? -1 : 1;
    return a;
  }

  // valores: { id da medida: cm }; o que faltar usa o padrão do estilo.
  function calcularModelo(estiloId, valores = {}, densidade = {}) {
    const estilo = ESTILOS.find((e) => e.id === estiloId) || ESTILOS[0];
    const { ag, ca } = conversor(densidade);
    const m = (id) => {
      const def = estilo.medidas.find((x) => x.id === id);
      if (!def) return 0;
      return Math.max(0, valores[id] === undefined || valores[id] === "" ? def.cm : numero(valores[id], def.cm));
    };
    const medidas = estilo.medidas.map((x) => ({ ...x, valor: m(x.id), pontos: x.eixo === "h" ? ag(m(x.id)) : ca(m(x.id)) }));
    const pecas = [];
    if (estilo.id === "painel" || estilo.id === "polo") {
      const W = ag(m("larg")), H = ca(m("comp")), barra = ca(m("barra"));
      pecas.push({
        nome: estilo.id === "polo" ? "Gola" : "Painel",
        qtd: estilo.id === "polo" ? 1 : 2,
        agulhas: W,
        carreiras: H,
        detalhe: `${estilo.id === "polo" ? "Borda" : "Barra"} de ${barra} carreiras. Sem diminuições nem aumentos.`,
        forma: { tipo: "painel", W, H, barra },
      });
      return { estilo, medidas, pecas };
    }
    const W = ag(m("larg")), H = ca(m("comp")), barra = ca(m("barra")), cava = ca(m("cava"));
    const gola = ag(m("gola")), ombro = ag(m("ombro"));
    const recuo = Math.max(0, Math.round((W - gola - 2 * ombro) / 2));
    const corpo = (nome, qtd, golaP, arremGola, extra, mais) => ({
      nome,
      qtd,
      agulhas: W,
      carreiras: H,
      detalhe: `Barra de ${barra} carreiras. Cava a partir da carreira ${H - cava + 1}, ${recuo} agulhas a menos de cada lado. Gola de ${gola} agulhas e ${golaP} carreiras de fundo.${extra || ""}`,
      forma: { tipo: "corpo", W, H, barra, cava, recuo, arremCava: Math.round(recuo / 3), gola, golaP, arremGola: centroPar(W, arremGola), degraus: 3, ...mais },
    });
    if (estilo.id === "cardiga") {
      // Cada frente é uma peça: metade do corpo mais metade da vista dos botões, aberta no meio (a borda
      // da direita) e com a gola em V nessa borda. A outra frente é o espelho.
      const vista = ag(m("vista") / 2), golaP = ca(m("golaP"));
      const largura = Math.round(W / 2) + vista, golaMeia = Math.round(gola / 2) + vista;
      pecas.push({
        nome: "Frentes",
        qtd: 2,
        agulhas: largura,
        carreiras: H,
        detalhe: `Cada frente: metade do corpo mais metade da vista dos botões (${vista} agulhas), aberta no meio da barra até a gola. Barra de ${barra} carreiras. Cava a partir da carreira ${H - cava + 1}, ${recuo} agulhas a menos na borda da cava. Gola em V de ${golaP} carreiras: tira ${golaMeia} agulhas na borda do meio até o ombro. A outra frente é o espelho.`,
        forma: { tipo: "corpo", meia: true, W: largura, H, barra, cava, recuo, arremCava: Math.round(recuo / 3), gola: golaMeia, golaP, vista, degraus: 3 },
      });
    } else if (estilo.id === "v") {
      pecas.push(corpo("Frente", 1, ca(m("golaP")), 0, " A frente se divide no centro e diminui dos dois lados até o ombro (gola em V).", { decote: "v" }));
    } else {
      pecas.push(corpo("Frente", 1, ca(m("golaP")), gola / 3));
    }
    pecas.push(corpo("Costas", 1, ca(Math.min(2.5, m("golaP"))), gola * 0.55));
    if (estilo.id !== "regata") {
      const mangaL = ag(m("mangaL")), punho = Math.min(ag(m("punho")), mangaL), manga = ca(m("manga"));
      const copa = ca(Math.min(m("manga") * 0.3, m("cava") * 0.75));
      const forma = { tipo: "manga", punho, W: mangaL, H: manga, barra, copa, arremCopa: Math.round(recuo / 3), topo: Math.round(mangaL / 4) };
      // O texto usa os números do passo a passo (o punho fica com a paridade da largura, e os aumentos
      // que não cabem antes da copa ficam de fora).
      const plano = planoManga(forma, 1, 3);
      const aumentos = plano.passos.find((s) => s.nome === "Aumentos");
      const ev = aumentos ? aumentos.eventos : [];
      const ganho = ev.reduce((t, e) => t + e.n, 0);
      const inicio = plano.linhas[0].segs[0] || [0, -1];
      const largPunho = inicio[1] - inicio[0] + 1;
      pecas.push({
        nome: "Manga",
        qtd: 2,
        agulhas: mangaL,
        carreiras: manga,
        detalhe: `Punho com ${largPunho} agulhas. ${ganho ? `Aumenta ${ganho} agulhas de cada lado, ${ritmo(ev)}, até ${largPunho + 2 * ganho}.` : "Sem aumentos."} Copa de ${copa} carreiras.`,
        forma,
      });
    }
    return { estilo, medidas, pecas };
  }

  // "1 a cada 6 ou 8 carreiras": quantas agulhas e de quantas em quantas carreiras, em poucas palavras.
  function ritmo(eventos) {
    const ns = [...new Set(eventos.map((e) => e.n))].sort((a, b) => a - b);
    const intervalos = [...new Set(eventos.map((e) => e.intervalo))].sort((a, b) => a - b);
    const cada = intervalos.length > 1 ? `${intervalos.slice(0, -1).join(", ")} ou ${intervalos[intervalos.length - 1]}` : intervalos[0];
    return `${ns.length > 1 ? `${ns[0]} a ${ns[ns.length - 1]}` : ns[0]} a cada ${cada} carreiras`;
  }

  // ------------------------------------------------------------------ forma

  // Espalha `total` agulhas em eventos a cada 2 carreiras ou mais, dentro de `trecho` carreiras.
  // Se não couber 1 agulha por vez, os primeiros eventos tiram mais agulhas (como numa curva).
  function distribuir(total, porVez, trecho) {
    total = Math.max(0, Math.round(total));
    if (!total) return [];
    const pares = Math.max(1, Math.floor(trecho / 2));
    const n = Math.min(Math.ceil(total / Math.max(1, porVez)), pares);
    const base = Math.floor(total / n), extra = total % n;
    const f = Math.max(1, Math.floor(pares / n));
    const longos = Math.max(0, Math.min(n, pares - n * f));
    const eventos = [];
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const intervalo = i < n - longos ? 2 * f : 2 * f + 2;
      pos += intervalo;
      eventos.push({ off: pos, n: i < extra ? base + 1 : base, intervalo });
    }
    return eventos;
  }

  // Como distribuir, mas com as diminuições espalhadas por igual (linha reta, como no V da gola): os
  // intervalos maiores e menores se alternam em vez de ficarem os curtos no começo.
  function distribuirReto(total, porVez, trecho) {
    total = Math.max(0, Math.round(total));
    if (!total) return [];
    const pares = Math.max(1, Math.floor(trecho / 2));
    const n = Math.min(Math.ceil(total / Math.max(1, porVez)), pares);
    const base = Math.floor(total / n), extra = total % n;
    const eventos = [];
    let antes = 0;
    for (let i = 0; i < n; i++) {
      const off = 2 * Math.round(((i + 1) * pares) / n);
      eventos.push({ off, n: i < extra ? base + 1 : base, intervalo: off - antes });
      antes = off;
    }
    return eventos;
  }

  function resumoEventos(eventos, sinal, onde = "de cada lado") {
    const grupos = [];
    for (const e of eventos) {
      const g = grupos[grupos.length - 1];
      if (g && g.n === e.n && g.intervalo === e.intervalo) g.vezes++;
      else grupos.push({ n: e.n, intervalo: e.intervalo, vezes: 1 });
    }
    return grupos.map((g) => `${sinal}${g.n} agulha${g.n > 1 ? "s" : ""}${onde ? ` ${onde}` : ""} a cada ${g.intervalo} carreiras, ${g.vezes}×`).join(" · ");
  }

  // Resumo das diminuições em linha reta: os dois intervalos se alternam, então o texto conta quantas
  // vezes vai cada um em vez de listar grupo por grupo.
  function resumoReto(eventos, sinal, onde) {
    const ns = new Set(eventos.map((e) => e.n));
    const intervalos = [...new Set(eventos.map((e) => e.intervalo))].sort((a, b) => a - b);
    if (ns.size > 1 || intervalos.length !== 2) return resumoEventos(eventos, sinal, onde);
    const n = eventos[0].n;
    const vezes = (iv) => eventos.filter((e) => e.intervalo === iv).length;
    return `${sinal}${n} agulha${n > 1 ? "s" : ""}${onde ? ` ${onde}` : ""}, ${eventos.length}×: a cada ${intervalos[0]} carreiras ${vezes(intervalos[0])}× e a cada ${intervalos[1]} carreiras ${vezes(intervalos[1])}×, alternando`;
  }

  const novaLinha = (barra) => ({ segs: [], marcas: [], arrem: [], parcial: [], aumentos: [], barra });

  function planoPainel(p) {
    const W = Math.max(1, Math.round(p.W)), H = Math.max(1, Math.round(p.H));
    const barra = limitar(Math.round(p.barra || 0), 0, H);
    const linhas = [];
    for (let c = 1; c <= H; c++) {
      const row = novaLinha(c <= barra);
      row.segs.push([0, W - 1]);
      linhas.push(row);
    }
    const passos = [
      { nome: "Barra", de: 1, ate: barra, texto: `${W} agulhas, ${barra} carreiras de barra.` },
      { nome: "Corpo reto", de: barra + 1, ate: H, texto: `${H - barra} carreiras sem forma.` },
    ].filter((s) => s.ate >= s.de);
    return { W, H, linhas, passos, resumo: `Painel reto de ${W} agulhas por ${H} carreiras.` };
  }

  // Frente, costas e a frente aberta do cardigã. Na gola em V (decote "v") a frente se divide no centro e
  // as diminuições vão em linha reta até perto do ombro. Na frente do cardigã (meia: true) a peça é uma
  // frente só: a cava, o ombro e a malha parcial ficam na borda da esquerda; a borda da direita é o meio,
  // reta da barra até o V (a abertura) e com as diminuições da gola daí até o ombro. Nela, gola é quanto
  // sai na borda do meio. A outra frente é o espelho.
  function planoCorpo(p, porVez, dist) {
    const meia = !!p.meia, emV = meia || p.decote === "v";
    const W = Math.max(8, Math.round(p.W)), H = Math.max(8, Math.round(p.H));
    const barra = limitar(Math.round(p.barra), 0, H - 2);
    const cava = limitar(Math.round(p.cava), 4, H - barra - 1);
    const gola = meia ? limitar(Math.round(p.gola), 1, W - 3) : limitar(Math.round(p.gola), 2, W - 4);
    const recuo = limitar(Math.round(p.recuo), 0, meia ? Math.max(0, W - gola - 1) : Math.max(0, Math.floor((W - gola) / 2) - 1));
    const arremC = limitar(Math.round(p.arremCava), 0, recuo);
    const golaP = limitar(Math.round(p.golaP), 4, H - barra - 1);
    const arremG = meia ? 0 : centroPar(W, limitar(Math.round(p.arremGola || 0), 0, gola));
    const deg = limitar(Math.round(p.degraus), 1, Math.max(1, Math.min(6, Math.floor((H - barra) / 2))));
    const cava0 = H - cava + 1, gola0 = H - golaP + 1, ombro0 = H - 2 * deg + 1;
    const evCava = distribuir(recuo - arremC, porVez, Math.round(cava * 0.45));
    const ladoGola = meia ? gola : Math.floor((gola - arremG) / 2);
    // A gola redonda faz curva (mais diminuições no começo); a em V vai reta até 2 carreiras do fim.
    const evGola = emV ? distribuirReto(ladoGola, porVez, Math.max(2, golaP - 2)) : distribuir(ladoGola, porVez, Math.max(2, golaP - 4));
    // O arremate central tem a paridade da largura: a gola abre arremG + 2 × ladoGola agulhas.
    const abertura = arremG + 2 * ladoGola;
    const ombro = meia ? W - gola - recuo : (W - abertura) / 2 - recuo;
    const degraus = [];
    for (let i = 0; i < deg; i++) degraus.push(Math.max(0, Math.floor(ombro / deg) + (i < ombro % deg ? 1 : 0)));

    const mapa = {};
    const add = (c, a) => (mapa[c] = mapa[c] || []).push(a);
    add(cava0, { t: "arremLados", n: arremC });
    evCava.forEach((e) => add(cava0 + e.off, { t: "dimLados", n: e.n }));
    if (!meia) add(gola0, { t: "arremCentro", n: arremG });
    evGola.forEach((e) => add(gola0 + e.off, { t: "dimGola", n: e.n }));
    degraus.forEach((n, i) => add(ombro0 + 2 * i, { t: "parcial", n }));

    const linhas = [];
    let L = 0, R = W - 1, holdL = 0, holdR = 0, nl = null, nr = null;
    for (let c = 1; c <= H; c++) {
      const row = novaLinha(c <= barra);
      for (const a of mapa[c] || []) {
        if (a.t === "arremLados" && a.n > 0) {
          row.arrem.push([L, L + a.n - 1]);
          L += a.n;
          if (!meia) {
            row.arrem.push([R - a.n + 1, R]);
            R -= a.n;
          }
        } else if (a.t === "dimLados") {
          L += a.n;
          row.marcas.push({ x: L + dist - 1, lado: "esq" });
          if (!meia) {
            R -= a.n;
            row.marcas.push({ x: R - dist + 1, lado: "dir" });
          }
        } else if (a.t === "arremCentro") {
          const x0 = Math.floor((W - a.n) / 2);
          if (a.n > 0) row.arrem.push([x0, x0 + a.n - 1]);
          nl = x0 - 1;
          nr = x0 + a.n;
        } else if (a.t === "dimGola" && meia) {
          R -= a.n;
          row.marcas.push({ x: R - dist + 1, lado: "dir" });
        } else if (a.t === "dimGola" && nl !== null) {
          nl -= a.n;
          nr += a.n;
          row.marcas.push({ x: nl - dist + 1, lado: "dir" }, { x: nr + dist - 1, lado: "esq" });
        } else if (a.t === "parcial") {
          holdL += a.n;
          if (!meia) holdR += a.n;
        }
      }
      const a0 = L + holdL, a1 = R - holdR;
      if (nl === null) {
        if (a1 >= a0) row.segs.push([a0, a1]);
      } else {
        if (nl >= a0) row.segs.push([a0, nl]);
        if (a1 >= nr) row.segs.push([nr, a1]);
      }
      if (holdL > 0) row.parcial.push([L, L + holdL - 1]);
      if (holdR > 0) row.parcial.push([R - holdR + 1, R]);
      row.marcas = row.marcas.filter((m) => row.segs.some(([s0, s1]) => m.x >= s0 && m.x <= s1));
      if (c === H) {
        row.arrem.push(...row.segs, ...row.parcial);
        row.segs = [];
        row.parcial = [];
      }
      linhas.push(row);
    }

    const avisos = [];
    const ajustes = avisoDeAjustes([
      [meia ? "largura da frente" : "largura", p.W, W],
      ["altura", p.H, H],
      ["barra", p.barra, barra],
      ["altura da cava", p.cava, cava],
      [meia ? "gola: tirar no meio" : "largura da gola", p.gola, gola],
      [meia ? "cava: tirar" : "cava: tirar por lado", p.recuo, recuo],
      ["cava: arremate", p.arremCava, arremC],
      ["fundo da gola", p.golaP, golaP],
      ["degraus do ombro", p.degraus, deg],
    ]);
    if (ajustes) avisos.push(ajustes);
    if (ombro <= 0) avisos.push({ nome: "Confira as medidas", aviso: true, texto: "A gola e a cava já ocupam toda a largura: não sobra ombro." });
    // A gola em V costuma começar na altura da cava ou antes; a redonda, depois.
    if (!emV && gola0 <= cava0) avisos.push({ nome: "Confira a gola", aviso: true, texto: "A gola começa antes da cava. Normalmente a gola começa depois." });
    const lado = meia ? "na borda da cava" : "de cada lado";
    const eventos = (lista, inicio) => lista.map((e) => ({ carreira: inicio + e.off, n: e.n, intervalo: e.intervalo }));
    const passos = [];
    passos.push({ nome: "Barra", de: 1, ate: barra, texto: `${W} agulhas, ${barra} carreiras de barra.` });
    const reto = Math.min(cava0, emV ? gola0 : cava0) - 1;
    passos.push({ nome: "Corpo reto", de: barra + 1, ate: reto, texto: `${reto - barra} carreiras sem forma.` });
    passos.push({ nome: "Cava: arremate", de: cava0, ate: cava0, texto: meia ? `${arremC} agulhas na borda da cava (à esquerda).` : `${arremC} agulhas de cada lado.` });
    if (evCava.length) passos.push({ nome: "Cava: diminuições", de: cava0 + evCava[0].off, ate: cava0 + evCava[evCava.length - 1].off, texto: `${resumoEventos(evCava, "−", lado)}.`, eventos: eventos(evCava, cava0) });
    if (meia) {
      if (evGola.length) passos.push({ nome: "Gola V: diminuições", de: gola0 + evGola[0].off, ate: gola0 + evGola[evGola.length - 1].off, texto: `Na borda do meio (à direita), da carreira ${gola0} para cima: ${resumoReto(evGola, "−", "")}.`, eventos: eventos(evGola, gola0) });
    } else if (emV) {
      passos.push({
        nome: "Gola V: divisão no centro",
        de: gola0,
        ate: gola0,
        texto: arremG
          ? `${arremG} agulha${arremG > 1 ? "s arrematadas" : " arrematada"} no centro. Daqui para cima os dois lados seguem separados.`
          : "A frente se divide no centro, sem arremate. Daqui para cima os dois lados seguem separados.",
      });
      if (evGola.length) passos.push({ nome: "Gola V: diminuições", de: gola0 + evGola[0].off, ate: gola0 + evGola[evGola.length - 1].off, texto: `${resumoReto(evGola, "−", "de cada lado")}.`, eventos: eventos(evGola, gola0) });
    } else {
      passos.push({ nome: "Gola: arremate central", de: gola0, ate: gola0, texto: `${arremG} agulhas no centro. Daqui para cima os dois lados seguem separados.` });
      if (evGola.length) passos.push({ nome: "Gola: diminuições", de: gola0 + evGola[0].off, ate: gola0 + evGola[evGola.length - 1].off, texto: `${resumoEventos(evGola, "−")}.`, eventos: eventos(evGola, gola0) });
    }
    passos.push({ nome: "Ombro: malha parcial", de: ombro0, ate: H, texto: `${deg} degraus de ${degraus.join(", ")} agulhas${meia ? " na borda da cava" : ""}, um a cada 2 carreiras.` });
    passos.push({ nome: "Arremate final", de: H, ate: H, texto: meia ? `Arremata as ${Math.max(0, ombro)} agulhas do ombro.` : `Arremata ${Math.max(0, ombro)} agulhas em cada ombro.` });
    // Em ordem de carreira: na gola em V funda o V começa antes da cava.
    passos.sort((s, t) => s.de - t.de);
    if (meia) passos.push({ nome: "A outra frente", texto: "Esta frente tem a abertura na borda da direita (o meio, com a vista dos botões). A outra frente é o espelho: abertura na borda da esquerda." });
    const resumo = meia
      ? `Uma das frentes: começa com ${W} agulhas e termina num ombro de ${Math.max(0, ombro)} agulhas. São ${recuo} agulhas tiradas na borda da cava e ${gola} na borda do meio (gola em V).`
      : `Começa com ${W} agulhas, fica com ${W - 2 * recuo} depois da cava e termina em 2 ombros de ${Math.max(0, ombro)} agulhas com uma gola ${emV ? "em V " : ""}de ${abertura}. São ${recuo} agulhas tiradas de cada lado na cava e ${ladoGola} de cada lado da gola.`;
    return { W, H, linhas, passos: [...avisos, ...passos], resumo };
  }

  function planoManga(p, porVez, dist) {
    const W = Math.max(8, Math.round(p.W)), H = Math.max(8, Math.round(p.H));
    const mesmaParidade = (v, min, max) => (v - W) % 2 === 0 ? v : v + 1 <= max ? v + 1 : Math.max(min, v - 1);
    // O punho e o topo ficam com a paridade da largura (para os dois lados serem iguais); isso não é aviso.
    const punhoPedido = limitar(Math.round(p.punho), 2, W);
    const punho = mesmaParidade(punhoPedido, 2, W);
    const barra = limitar(Math.round(p.barra), 0, H - 4);
    const copa = limitar(Math.round(p.copa), 4, H - barra - 2);
    const arremC = limitar(Math.round(p.arremCopa), 0, Math.floor(W / 4));
    const topoPedido = limitar(Math.round(p.topo), 2, W - 2 * arremC);
    const topo = mesmaParidade(topoPedido, 2, W - 2 * arremC);
    const copa0 = H - copa + 1;
    const aum = Math.floor((W - punho) / 2);
    // Os aumentos acabam antes da copa; os que não couberem ficam de fora (com aviso).
    const evAum = distribuir(aum, 1, Math.max(2, copa0 - 1 - barra)).filter((e) => barra + e.off < copa0);
    const aumentados = evAum.reduce((t, e) => t + e.n, 0);
    const dimTotal = Math.max(0, Math.floor((W - 2 * arremC - topo) / 2));
    const evCopa = distribuir(dimTotal, porVez, Math.max(2, copa - 2));
    const mapa = {};
    const add = (c, a) => (mapa[c] = mapa[c] || []).push(a);
    evAum.forEach((e) => add(barra + e.off, { t: "aum", n: e.n }));
    add(copa0, { t: "arremLados", n: arremC });
    evCopa.forEach((e) => add(copa0 + e.off, { t: "dimLados", n: e.n }));
    const linhas = [];
    let L = Math.floor((W - punho) / 2), R = L + punho - 1;
    for (let c = 1; c <= H; c++) {
      const row = novaLinha(c <= barra);
      for (const a of mapa[c] || []) {
        if (a.t === "aum") {
          L -= a.n;
          R += a.n;
          row.aumentos.push({ x: L, lado: "esq" }, { x: R, lado: "dir" });
        } else if (a.t === "arremLados" && a.n > 0) {
          row.arrem.push([L, L + a.n - 1], [R - a.n + 1, R]);
          L += a.n;
          R -= a.n;
        } else if (a.t === "dimLados") {
          L += a.n;
          R -= a.n;
          row.marcas.push({ x: L + dist - 1, lado: "esq" }, { x: R - dist + 1, lado: "dir" });
        }
      }
      if (R >= L) row.segs.push([L, R]);
      row.marcas = row.marcas.filter((m) => m.x >= L && m.x <= R);
      if (c === H) {
        row.arrem.push(...row.segs);
        row.segs = [];
      }
      linhas.push(row);
    }
    const passos = [];
    const ajustes = avisoDeAjustes([
      ["largura na cava", p.W, W],
      ["altura", p.H, H],
      ["punho", p.punho, punhoPedido],
      ["barra do punho", p.barra, barra],
      ["altura da copa", p.copa, copa],
      ["copa: arremate", p.arremCopa, arremC],
      ["topo da copa", p.topo, topoPedido],
    ]);
    if (ajustes) passos.push(ajustes);
    if (aumentados < aum) passos.push({ nome: "Confira a copa", aviso: true, texto: `Os aumentos não cabem antes da copa: a manga chega a ${punho + 2 * aumentados} agulhas, não ${punho + 2 * aum}. Aumente a altura ou diminua a barra e a copa.` });
    passos.push({ nome: "Punho", de: 1, ate: barra, texto: `${punho} agulhas, ${barra} carreiras de barra.` });
    const eventos = (lista, inicio) => lista.map((e) => ({ carreira: inicio + e.off, n: e.n, intervalo: e.intervalo }));
    if (evAum.length) passos.push({ nome: "Aumentos", de: barra + evAum[0].off, ate: barra + evAum[evAum.length - 1].off, texto: `${resumoEventos(evAum, "+")}.`, eventos: eventos(evAum, barra) });
    passos.push({ nome: "Copa: arremate", de: copa0, ate: copa0, texto: `${arremC} agulhas de cada lado.` });
    if (evCopa.length) passos.push({ nome: "Copa: diminuições", de: copa0 + evCopa[0].off, ate: copa0 + evCopa[evCopa.length - 1].off, texto: `${resumoEventos(evCopa, "−")}.`, eventos: eventos(evCopa, copa0) });
    passos.push({ nome: "Arremate final", de: H, ate: H, texto: `Arremata o topo da copa (${topo} agulhas).` });
    const resumo = `Começa no punho com ${punho} agulhas, ganha ${aum} de cada lado até ${punho + 2 * aum} na cava e fecha a copa em ${topo} agulhas.`;
    return { W, H, linhas, passos, resumo };
  }

  // forma: { tipo: "corpo" | "manga" | "painel", ... medidas em agulhas e carreiras }
  // opcoes: { porVez: agulhas tiradas por diminuição, marca: distância da marca até a borda }
  function planoForma(forma, opcoes = {}) {
    const porVez = limitar(Math.round(opcoes.porVez || 1), 1, 3);
    const marca = limitar(Math.round(opcoes.marca || 3), 1, 8);
    const plano = forma.tipo === "manga" ? planoManga(forma, porVez, marca) : forma.tipo === "corpo" ? planoCorpo(forma, porVez, marca) : planoPainel(forma);
    // Passos sem carreiras (barra 0, corpo reto que não cabe...) não aparecem.
    plano.passos = plano.passos.filter((s) => s.de === undefined || s.ate >= s.de);
    return plano;
  }

  // Números pedidos que não cabem na peça e o que foi usado no lugar, para avisar no começo do passo a passo.
  function avisoDeAjustes(lista) {
    const trocados = lista.filter(([, pedido, usado]) => Number.isFinite(Number(pedido)) && Math.round(Number(pedido)) !== usado);
    if (!trocados.length) return null;
    return {
      nome: "Confira os números",
      aviso: true,
      texto: `Não cabem na peça e foram trocados: ${trocados.map(([nome, pedido, usado]) => `${nome} ${Math.round(Number(pedido))} → ${usado}`).join("; ")}.`,
    };
  }

  // Trechos difíceis da forma: duas ou mais diminuições (ou aumentos) seguidas de 2 agulhas ou mais a cada
  // 2 carreiras ou menos. Pedem velocidade menor e atenção ao puxador. Devolve [{ passo, de, ate, vezes, n, intervalo }].
  function trechosDificeis(plano) {
    const lista = [];
    for (const s of plano.passos) {
      const ev = s.eventos || [];
      const forte = (e) => e.n >= 2 && e.intervalo <= 2;
      for (let i = 0; i < ev.length; i++) {
        if (!forte(ev[i])) continue;
        let j = i;
        while (j + 1 < ev.length && forte(ev[j + 1])) j++;
        if (j > i) lista.push({ passo: s.nome, de: ev[i].carreira, ate: ev[j].carreira, vezes: j - i + 1, n: Math.max(...ev.slice(i, j + 1).map((e) => e.n)), intervalo: ev[i].intervalo });
        i = j;
      }
    }
    return lista;
  }

  // Desenho da forma em números de cor (linha de cima primeiro, como o .dat).
  // codigos: { malha, fora, barra, arremate, parcial, marcaEsq, marcaDir, aumento } (barra, aumento: opcionais)
  function pixelsDaForma(plano, codigos) {
    const { W, H } = plano;
    const c = codigos;
    const px = new Uint8Array(W * H).fill(c.fora);
    plano.linhas.forEach((row, i) => {
      const y = H - 1 - i;
      const pinta = (x0, x1, v) => {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) px[y * W + x] = v;
      };
      row.segs.forEach(([a, b]) => pinta(a, b, row.barra && c.barra != null ? c.barra : c.malha));
      row.parcial.forEach(([a, b]) => pinta(a, b, c.parcial));
      row.arrem.forEach(([a, b]) => pinta(a, b, c.arremate));
      row.aumentos.forEach((m) => pinta(m.x, m.x, c.aumento != null ? c.aumento : c.malha));
      row.marcas.forEach((m) => pinta(m.x, m.x, m.lado === "esq" ? c.marcaEsq : c.marcaDir));
    });
    return { w: W, h: H, px };
  }

  // ------------------------------------------------------------------ biblioteca de pontos
  // Motivos de exemplo montados com os códigos de referências públicas (1 frente, 2 atrás, 11 tuck,
  // 16 sem seleção, 61/71 frente e mover 1 agulha). A linha de cima do motivo vem primeiro.

  const BIBLIOTECA = [
    {
      categoria: "Trança (cable)",
      motivos: [
        { nome: "Trança 1×1", w: 4, h: 4, px: [2, 71, 61, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2] },
        { nome: "Trança dupla", w: 7, h: 4, px: [2, 71, 61, 2, 71, 61, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 2] },
      ],
    },
    {
      categoria: "Barra (hem)",
      motivos: [
        { nome: "Ribana 1×1", w: 2, h: 1, px: [1, 2] },
        { nome: "Ribana 2×2", w: 4, h: 1, px: [1, 1, 2, 2] },
      ],
    },
    {
      categoria: "Links",
      motivos: [
        { nome: "Links-links", w: 1, h: 2, px: [1, 2] },
        { nome: "Arroz", w: 2, h: 2, px: [1, 2, 2, 1] },
      ],
    },
    {
      categoria: "Rendado (mesh)",
      motivos: [
        { nome: "Ilhós", w: 4, h: 4, px: [1, 1, 1, 1, 1, 61, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
        { nome: "Ilhós alternado", w: 4, h: 8, px: [1, 1, 1, 1, 1, 61, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 71, 1, 1, 1, 1, 1, 1, 1, 1] },
      ],
    },
    {
      categoria: "Flutuação (miss)",
      motivos: [
        { nome: "Flutuação 1×1", w: 2, h: 2, px: [1, 16, 16, 1] },
        { nome: "Flutuação 1×3", w: 4, h: 2, px: [1, 16, 16, 16, 16, 16, 1, 16] },
      ],
    },
    {
      categoria: "Transferência (move)",
      motivos: [
        { nome: "Diagonal", w: 4, h: 4, px: [61, 1, 1, 1, 1, 61, 1, 1, 1, 1, 61, 1, 1, 1, 1, 61] },
        { nome: "Zigue-zague", w: 6, h: 6, px: [61, 1, 1, 1, 1, 1, 1, 61, 1, 1, 1, 1, 1, 1, 61, 1, 1, 1, 1, 1, 71, 1, 1, 1, 1, 71, 1, 1, 1, 1, 71, 1, 1, 1, 1, 1] },
      ],
    },
    {
      categoria: "Tuck",
      motivos: [
        { nome: "Tuck 1×1", w: 2, h: 2, px: [1, 11, 1, 1] },
        { nome: "Favo de mel", w: 4, h: 4, px: [11, 1, 1, 1, 1, 1, 1, 1, 1, 1, 11, 1, 1, 1, 1, 1] },
      ],
    },
  ];

  // Repete o motivo dentro do retângulo ret ({x, y, w, h}). Repetição escalonada: cada fileira de motivos
  // anda `deslocamento` agulhas em relação à de baixo, como a repetição em degraus do KnitPaint.
  // Conta a partir do canto de baixo à esquerda, que é onde a máquina começa.
  function repetirMotivo(px, W, ret, motivo, deslocamento = 0) {
    const base = ret.y + ret.h - 1;
    for (let y = ret.y; y < ret.y + ret.h; y++) {
      const daBase = base - y;
      const fileira = Math.floor(daBase / motivo.h);
      const linhaMotivo = motivo.h - 1 - (daBase % motivo.h);
      const desloc = (((fileira * deslocamento) % motivo.w) + motivo.w) % motivo.w;
      for (let x = ret.x; x < ret.x + ret.w; x++) {
        const col = (((x - ret.x - desloc) % motivo.w) + motivo.w) % motivo.w;
        px[y * W + x] = motivo.px[linhaMotivo * motivo.w + col];
      }
    }
  }

  // ------------------------------------------------------------------ jacquard e intarsia

  function coresDaArea(px, W, ret) {
    const conta = new Map();
    for (let y = ret.y; y < ret.y + ret.h; y++) for (let x = ret.x; x < ret.x + ret.w; x++) {
      const v = px[y * W + x];
      conta.set(v, (conta.get(v) || 0) + 1);
    }
    return [...conta].map(([cor, n]) => ({ cor, n })).sort((a, b) => b.n - a.n || a.cor - b.cor);
  }

  // Onde o fio de índice i (entre k cores) prende atrás, em cada estrutura de avesso do jacquard.
  function prende(estrutura, x, y, i, k, escada) {
    if (estrutura === "tubular") return true;
    if (estrutura === "birdseye") return (x + y + i) % k === 0;
    if (estrutura === "escada") return x % escada === i % escada;
    return false;
  }

  // Fios soltos no avesso: em cada carreira, para cada cor, os trechos entre dois pontos daquela cor
  // em que o fio não tece nem prende. Devolve { cores, lista } com posições absolutas.
  // apenas: as cores que são fio (as outras não contam nem para a regra de prender do avesso).
  function flutuacoes(px, W, ret, estrutura = "flutuacao", escada = 4, apenas = null) {
    const cores = coresDaArea(px, W, ret)
      .map((c) => c.cor)
      .filter((c) => !apenas || apenas.has(c));
    const k = cores.length;
    const lista = [];
    if (k < 2 || estrutura === "tubular") return { cores, lista };
    for (let y = ret.y; y < ret.y + ret.h; y++) {
      for (let i = 0; i < k; i++) {
        let ultimo = -1;
        for (let x = ret.x; x < ret.x + ret.w; x++) {
          if (px[y * W + x] === cores[i] || prende(estrutura, x - ret.x, y - ret.y, i, k, escada)) {
            if (ultimo >= 0 && x - ultimo > 1) lista.push({ y, cor: cores[i], x0: ultimo + 1, x1: x - 1, comprimento: x - ultimo - 1 });
            ultimo = x;
          }
        }
      }
    }
    return { cores, lista };
  }

  // Intarsia: cada trecho seguido de uma cor numa carreira precisa do seu guia-fio. Subindo carreira por
  // carreira, o guia continua no trecho de cima que encosta no seu; guias que ficaram sem trecho voltam a
  // servir para outro trecho da mesma cor. Por cor, usa o mínimo possível: o maior número de trechos
  // daquela cor numa mesma carreira.
  // apenas: as cores que são fio (os trechos das outras não pedem guia).
  function guiasIntarsia(px, W, ret, apenas = null) {
    const guiaDe = new Int32Array(ret.w * ret.h).fill(-1);
    const areaDe = new Int32Array(ret.w * ret.h).fill(-1);
    const guias = [];
    const guiasDaCor = new Map();
    const areas = [];
    let anteriores = [];
    for (let c = 0; c < ret.h; c++) {
      const yr = ret.h - 1 - c;
      const y = ret.y + yr;
      const trechos = [];
      let x = 0;
      while (x < ret.w) {
        const cor = px[y * W + ret.x + x];
        let x2 = x + 1;
        while (x2 < ret.w && px[y * W + ret.x + x2] === cor) x2++;
        if (!apenas || apenas.has(cor)) trechos.push({ cor, x0: x, x1: x2 - 1 });
        x = x2;
      }
      const usados = new Set();
      const novos = [];
      // Os trechos estão em ordem de agulha: os de baixo que encostam em t ficam a partir de j0.
      let j0 = 0;
      for (const t of trechos) {
        while (j0 < anteriores.length && anteriores[j0].x1 < t.x0) j0++;
        let ant = null;
        for (let j = j0; j < anteriores.length && anteriores[j].x0 <= t.x1; j++) {
          if (anteriores[j].cor === t.cor && !usados.has(anteriores[j].guia)) {
            ant = anteriores[j];
            break;
          }
        }
        if (ant) {
          t.guia = ant.guia;
          t.area = ant.area;
          usados.add(ant.guia);
        } else novos.push(t);
      }
      // Guia livre da mesma cor, na ordem em que os guias apareceram (cada cor anda só para a frente).
      const proximo = new Map();
      for (const t of novos) {
        const lista = guiasDaCor.get(t.cor) || [];
        let i = proximo.get(t.cor) || 0;
        while (i < lista.length && usados.has(lista[i].id)) i++;
        proximo.set(t.cor, i);
        let g = lista[i];
        if (!g) {
          g = { id: guias.length + 1, cor: t.cor, ini: c, fim: c, areas: 0 };
          guias.push(g);
          lista.push(g);
          guiasDaCor.set(t.cor, lista);
        }
        t.guia = g.id;
        usados.add(g.id);
        t.area = areas.length;
        areas.push({ id: areas.length, guia: g.id, cor: t.cor, n: 0, sx: 0, sy: 0 });
        g.areas++;
      }
      for (const t of trechos) {
        guias[t.guia - 1].fim = c;
        const a = areas[t.area];
        for (let i = t.x0; i <= t.x1; i++) {
          guiaDe[yr * ret.w + i] = t.guia;
          areaDe[yr * ret.w + i] = t.area;
          a.n++;
          a.sx += i;
          a.sy += yr;
        }
      }
      anteriores = trechos;
    }
    return { guias, areas, guiaDe, areaDe };
  }

  // Listra de cada carreira, de baixo para cima (índice na lista), repetindo a sequência até a altura.
  function listrasPorCarreira(h, listras) {
    const seq = [];
    listras.forEach((l, i) => {
      for (let k = 0; k < Math.max(1, Math.round(l.carreiras)); k++) seq.push(i);
    });
    return Array.from({ length: h }, (_, c) => (seq.length ? seq[c % seq.length] : -1));
  }

  // Listras de baixo para cima: [{ cor, carreiras }], repetidas até completar a altura.
  function gerarListras(w, h, listras) {
    const px = new Uint8Array(w * h);
    listrasPorCarreira(h, listras).forEach((i, c) => {
      if (i >= 0) px.fill(listras[i].cor, (h - 1 - c) * w, (h - c) * w);
    });
    return px;
  }

  function sorteio(semente) {
    let s = semente >>> 0 || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  // Módulo de rosetas de onça que se repete sem emenda na largura e na altura.
  // cores = [fundo, contorno da roseta (e pintas), centro da roseta].
  function gerarOnca(w, h, semente, cores) {
    const r = sorteio(semente);
    const rosetas = [];
    const sx = 18, sy = 15;
    for (let gy = 0; gy < Math.ceil(h / sy); gy++) {
      for (let gx = 0; gx < Math.ceil(w / sx); gx++) {
        rosetas.push({
          cx: gx * sx + (gy % 2) * (sx / 2) + (r() - 0.5) * 6,
          cy: gy * sy + sy / 2 + (r() - 0.5) * 5,
          rx: 5.5 + r() * 2.5,
          ry: 4.5 + r() * 2,
          n: 3 + Math.floor(r() * 3),
          fase: r() * 6.28,
          centro: r() < 0.8,
        });
      }
    }
    const pintas = [];
    for (let i = 0; i < Math.round((w * h) / 140); i++) pintas.push({ x: r() * w, y: r() * h, rr: 0.8 + r() * 0.9 });
    const delta = (a, b, t) => {
      const v = a - b;
      return v - t * Math.round(v / t);
    };
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (const o of rosetas) {
          const dx = delta(x + 0.5, o.cx, w), dy = delta(y + 0.5, o.cy, h);
          if (Math.abs(dx) > 9.5 || Math.abs(dy) > 7.5) continue;
          const q = Math.sqrt((dx / o.rx) ** 2 + (dy / o.ry) ** 2);
          if (q < 0.62 && o.centro) v = 2;
          else if (q >= 0.72 && q <= 1.08 && Math.sin(o.n * Math.atan2(dy, dx) + o.fase) > -0.35) v = 1;
        }
        if (!v) {
          for (const p of pintas) {
            const dx = delta(x + 0.5, p.x, w), dy = delta(y + 0.5, p.y, h);
            if (dx * dx + dy * dy < p.rr * p.rr) {
              v = 1;
              break;
            }
          }
        }
        px[y * w + x] = cores[v];
      }
    }
    return px;
  }

  // Logo em pontos: separa a imagem (RGBA) em k níveis de claridade (2 a 4 fios) e ordena os níveis do mais
  // usado (o fundo) para o menos usado. Devolve o nível de cada ponto e a cor média de cada nível.
  function quantizarLuminancia(rgba, w, h, k) {
    k = limitar(Math.round(k), 2, 4);
    const n = w * h;
    const lum = new Float32Array(n);
    let mn = 255, mx = 0;
    for (let i = 0; i < n; i++) {
      const v = rgba[i * 4 + 3] < 128 ? 255 : 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      lum[i] = v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const nivel = new Uint8Array(n);
    const soma = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const b = mx > mn ? Math.min(k - 1, Math.floor(((lum[i] - mn) / (mx - mn + 0.001)) * k)) : 0;
      nivel[i] = b;
      const transparente = rgba[i * 4 + 3] < 128;
      soma[b][0] += transparente ? 255 : rgba[i * 4];
      soma[b][1] += transparente ? 255 : rgba[i * 4 + 1];
      soma[b][2] += transparente ? 255 : rgba[i * 4 + 2];
      soma[b][3]++;
    }
    const ordem = soma.map((t, i) => ({ i, n: t[3] })).sort((a, b) => b.n - a.n || a.i - b.i).map((o) => o.i);
    const novo = new Uint8Array(k);
    ordem.forEach((b, pos) => (novo[b] = pos));
    const px = new Uint8Array(n);
    for (let i = 0; i < n; i++) px[i] = novo[nivel[i]];
    const medias = ordem.map((b) => (soma[b][3] ? [0, 1, 2].map((j) => Math.round(soma[b][j] / soma[b][3])) : null));
    return { px, medias, k };
  }

  // Losango (argyle): losangos da cor a no centro de cada módulo, cor b em volta e, se houver, linhas
  // diagonais finas da cor c cruzando os losangos.
  function gerarLosango(w, h, dw, dh, cores) {
    const [a, b, c] = cores;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = ((x + 0.5) % dw) / dw - 0.5, v = ((y + 0.5) % dh) / dh - 0.5;
        let cor = Math.abs(u) + Math.abs(v) <= 0.5 ? a : b;
        if (c != null) {
          const s1 = ((x + 0.5) / dw + (y + 0.5) / dh) % 1;
          const s2 = ((((x + 0.5) / dw - (y + 0.5) / dh) % 1) + 1) % 1;
          if (Math.min(s1, 1 - s1, s2, 1 - s2) * dw < 0.5) cor = c;
        }
        px[y * w + x] = cor;
      }
    }
    return px;
  }

  // ------------------------------------------------------------------ linhas de opção

  // Junta cada bloco da esquerda (L) com o bloco da direita (R) do mesmo painel. A área de desenho do
  // painel fica entre os dois (x0 a x1).
  function paineis(blocos) {
    const esquerdos = blocos.filter((b) => b.lado === "L").sort((a, b) => a.xMin - b.xMin);
    const direitos = blocos.filter((b) => b.lado === "R").sort((a, b) => a.xMin - b.xMin);
    const lista = [];
    const usados = new Set();
    for (const l of esquerdos) {
      const r = direitos.find((b) => !usados.has(b) && b.xMin > l.xMax && b.carreiraInicio <= l.carreiraFim && b.carreiraFim >= l.carreiraInicio);
      if (!r) continue;
      usados.add(r);
      lista.push({ L: l, R: r, x0: l.xMax + 1, x1: r.xMin - 1, y0: Math.max(l.carreiraInicio, r.carreiraInicio), y1: Math.min(l.carreiraFim, r.carreiraFim) });
    }
    for (const b of blocos) {
      if (lista.some((p) => p.L === b || p.R === b)) continue;
      lista.push({ L: b.lado === "L" ? b : null, R: b.lado === "R" ? b : null, x0: null, x1: null, y0: b.carreiraInicio, y1: b.carreiraFim });
    }
    lista.sort((a, b) => (a.L || a.R).xMin - (b.L || b.R).xMin);
    lista.forEach((p, i) => (p.numero = i + 1));
    return lista;
  }

  // Cada linha ocupa 2 colunas: a coluna-guia (com o número da linha) e a de fora. O valor costuma ir na
  // de fora, mas pode estar no lugar do número (no exemplo, o 55 da R2).
  const colunasDaLinha = (bloco, k) => (bloco.lado === "R" ? bloco.colunas[k] : [bloco.colunas[k][1], bloco.colunas[k][0]]);

  // Coluna-guia com outro número na maior parte das carreiras (no exemplo, a linha 1 com 6 e 7 alternando):
  // é uma marca da própria linha, que o editor não troca.
  function guiaComMarca(doc, bloco, k) {
    const [guia] = colunasDaLinha(bloco, k);
    let outros = 0, total = 0;
    for (let y = bloco.carreiraInicio; y <= bloco.carreiraFim; y++) {
      const g = doc.pixels[y * doc.largura + guia];
      if (!g) continue;
      total++;
      if (g !== k) outros++;
    }
    return outros * 2 > total;
  }

  // Coluna que guarda o valor da linha nesta carreira: a de fora se tiver valor; senão a guia, se ela tiver
  // um número que não é o da linha (e não for marca); senão a de fora (carreira sem valor).
  function colunaDoValor(doc, bloco, k, y, marca = guiaComMarca(doc, bloco, k)) {
    if (!bloco.colunas[k]) return null;
    const [guia, fora] = colunasDaLinha(bloco, k);
    if (doc.pixels[y * doc.largura + fora]) return fora;
    const g = doc.pixels[y * doc.largura + guia];
    return !marca && g && g !== k ? guia : fora;
  }

  // Valores de uma linha numa carreira (linha de cima = 0), sem a cor-guia da própria linha.
  function valoresDaLinha(doc, bloco, k, y) {
    const cols = bloco.colunas[k];
    if (!cols) return [];
    const out = [];
    for (const x of cols) {
      const c = doc.pixels[y * doc.largura + x];
      const guia = bloco.lado === "R" ? x === cols[0] : x === cols[1];
      if (c && !(guia && c === k) && !out.includes(c)) out.push(c);
    }
    return out;
  }

  // Valores que a linha k guarda nas carreiras de–ate (contadas de baixo), sem a marca da coluna-guia e sem
  // repetir: na R1 do exemplo, o 1 dentro do bloco do economizador (a guia tem 6 e 7 alternando).
  function valoresNasCarreiras(doc, bloco, k, de, ate) {
    if (!bloco.colunas[k]) return [];
    const marca = guiaComMarca(doc, bloco, k);
    const vistos = [];
    for (let c = de; c <= ate; c++) {
      const y = doc.altura - c;
      if (y < bloco.carreiraInicio || y > bloco.carreiraFim) continue;
      const v = doc.pixels[y * doc.largura + colunaDoValor(doc, bloco, k, y, marca)];
      if (v && !vistos.includes(v)) vistos.push(v);
    }
    return vistos.sort((a, b) => a - b);
  }

  // Faixas de carreiras com o mesmo valor, de baixo para cima. Trechos em que o valor alterna a cada
  // carreira entre dois números viram uma faixa só ("6 e 7 alternando").
  function faixasDaLinha(doc, bloco, k) {
    const H = doc.altura;
    const brutas = [];
    for (let y = bloco.carreiraFim; y >= bloco.carreiraInicio; y--) {
      const valor = valoresDaLinha(doc, bloco, k, y).join(", ");
      const ult = brutas[brutas.length - 1];
      if (ult && ult.valor === valor && ult.yTopo === y + 1) ult.yTopo = y;
      else brutas.push({ valor, yBase: y, yTopo: y });
    }
    const faixas = [];
    for (let i = 0; i < brutas.length; i++) {
      const f = brutas[i];
      if (f.yBase === f.yTopo && i + 1 < brutas.length) {
        const a = f.valor, b = brutas[i + 1].valor;
        let j = i;
        while (j + 1 < brutas.length && brutas[j + 1].yBase === brutas[j + 1].yTopo && brutas[j + 1].valor === ((j - i) % 2 ? a : b)) j++;
        if (j - i >= 3 && a && b) {
          faixas.push({ valor: `${a} e ${b} alternando`, alterna: true, yBase: f.yBase, yTopo: brutas[j].yTopo });
          i = j;
          continue;
        }
      }
      faixas.push({ ...f, alterna: false });
    }
    return faixas
      .filter((f) => f.valor)
      .map((f) => ({ ...f, de: H - f.yBase, ate: H - f.yTopo }));
  }

  // Troca o valor da linha nas carreiras das linhas yTopo até yBase (inclusive), na coluna que já guarda o
  // valor de cada carreira. Valor 0 apaga: a coluna de fora fica vazia e a guia volta a ter o número da linha.
  function pintarValorNaLinha(doc, bloco, k, yTopo, yBase, valor) {
    if (!bloco.colunas[k]) return 0;
    const [guia] = colunasDaLinha(bloco, k);
    const marca = guiaComMarca(doc, bloco, k);
    let n = 0;
    for (let y = Math.max(bloco.carreiraInicio, yTopo); y <= Math.min(bloco.carreiraFim, yBase); y++) {
      const x = colunaDoValor(doc, bloco, k, y, marca);
      doc.pixels[y * doc.largura + x] = x === guia && !valor ? k : valor;
      n++;
    }
    return n;
  }

  // Altura do painel com as repetições do economizador (blocos marcados na R2).
  // repeticoes: { "de-ate": vezes } (carreiras contadas de baixo); sem número, conta 1 vez.
  function desenvolvimento(doc, painel, repeticoes = {}) {
    const compactadas = painel.y1 - painel.y0 + 1;
    const blocos = painel.R && painel.R.colunas[2] ? faixasDaLinha(doc, painel.R, 2).filter((f) => !f.alterna) : [];
    let desenvolvidas = compactadas;
    const lista = blocos.map((f) => {
      const chave = `${f.de}-${f.ate}`;
      const vezes = Math.max(1, Math.round(numero(repeticoes[chave], 1)));
      const carreiras = f.yBase - f.yTopo + 1;
      desenvolvidas += (vezes - 1) * carreiras;
      return { ...f, chave, vezes, carreiras };
    });
    return { compactadas, desenvolvidas, blocos: lista };
  }

  // Desenho com os blocos do economizador repetidos de verdade, para ver a peça na altura final.
  // As carreiras inteiras se repetem (todos os painéis e as linhas de opção junto).
  function desenharDesenvolvido(doc, blocos) {
    const W = doc.largura;
    const vezesDaLinha = new Map();
    for (const b of blocos) if (b.vezes > 1) for (let y = b.yTopo; y <= b.yBase; y++) vezesDaLinha.set(y, b);
    const linhas = [];
    for (let y = 0; y < doc.altura; y++) {
      const b = vezesDaLinha.get(y);
      if (!b) linhas.push(y);
      else if (y === b.yBase) for (let r = 0; r < b.vezes; r++) for (let k = b.yTopo; k <= b.yBase; k++) linhas.push(k);
    }
    const px = new Uint8Array(W * linhas.length);
    linhas.forEach((y, i) => px.set(doc.pixels.subarray(y * W, (y + 1) * W), i * W));
    return { w: W, h: linhas.length, px };
  }

  // ------------------------------------------------------------------ trechos e pacotes

  const NOMES_TRECHOS = { inicio: "Início", barra: "Barra", transferencia: "Transferência", corpo: "Corpo", final: "Final" };

  // Carreiras que alternam entre dois pontos da R6 (a, b, a, b...) formam um trecho só, como nas faixas da
  // linha: senão um corpo em ponto alternado vira dezenas de trechos de uma carreira. Muda a lista no lugar.
  function juntarAlternados(segs) {
    const juntos = [];
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (g.de === g.ate && g.tipo.startsWith("R6") && i + 1 < segs.length && segs[i + 1].tipo.startsWith("R6")) {
        const a = g.tipo, b = segs[i + 1].tipo;
        let j = i;
        while (j + 1 < segs.length && segs[j + 1].de === segs[j + 1].ate && segs[j + 1].tipo === ((j - i) % 2 ? a : b)) j++;
        if (j - i >= 3) {
          juntos.push({ tipo: `${a}~${b}`, de: g.de, ate: segs[j].ate });
          i = j;
          continue;
        }
      }
      juntos.push(g);
    }
    segs.splice(0, segs.length, ...juntos);
  }

  // Divide o painel em trechos pelas linhas de opção, de baixo para cima: transferência onde há R5, corpo no
  // maior trecho com ponto (R6), barra entre o primeiro ponto e o corpo, início antes dela e final depois do
  // corpo. Devolve [{ id, nome, de, ate }] em carreiras (contadas de baixo).
  function trechosDoPainel(doc, painel) {
    const H = doc.altura;
    if (!painel.R) return [{ id: "corpo", nome: NOMES_TRECHOS.corpo, de: H - painel.y1, ate: H - painel.y0 }];
    const segs = [];
    for (let y = painel.y1; y >= painel.y0; y--) {
      const r5 = valoresDaLinha(doc, painel.R, 5, y).length > 0;
      const r6 = valoresDaLinha(doc, painel.R, 6, y).join(",");
      const tipo = r5 ? "R5" : r6 ? `R6:${r6}` : "";
      const c = H - y;
      const ult = segs[segs.length - 1];
      if (ult && ult.tipo === tipo) ult.ate = c;
      else segs.push({ tipo, de: c, ate: c });
    }
    juntarAlternados(segs);
    let corpo = -1, maior = -1;
    segs.forEach((g, i) => {
      if (g.tipo.startsWith("R6") && g.ate - g.de + 1 > maior) [corpo, maior] = [i, g.ate - g.de + 1];
    });
    if (corpo < 0) segs.forEach((g, i) => {
      if (g.ate - g.de + 1 > maior) [corpo, maior] = [i, g.ate - g.de + 1];
    });
    let viuPonto = false;
    const trechos = [];
    segs.forEach((g, i) => {
      let id;
      if (i === corpo) id = "corpo";
      else if (g.tipo === "R5") id = "transferencia";
      else if (i > corpo) id = "final";
      else {
        if (g.tipo) viuPonto = true;
        id = viuPonto ? "barra" : "inicio";
      }
      const ult = trechos[trechos.length - 1];
      if (ult && ult.base === id) ult.ate = g.ate;
      else trechos.push({ base: id, de: g.de, ate: g.ate });
    });
    const vistos = {};
    return trechos.map((t) => {
      vistos[t.base] = (vistos[t.base] || 0) + 1;
      const n = vistos[t.base];
      return { id: n > 1 ? `${t.base}-${n}` : t.base, nome: n > 1 ? `${NOMES_TRECHOS[t.base]} ${n}` : NOMES_TRECHOS[t.base], de: t.de, ate: t.ate };
    });
  }

  // Agulhas que tecem na área de desenho do painel (da primeira à última com código de malha).
  function areaDeMalha(doc, painel) {
    if (painel.x0 === null || painel.x1 < painel.x0) return null; // um lado só, ou L e R encostados
    let esquerda = Infinity, direita = -Infinity;
    for (let y = painel.y0; y <= painel.y1; y++) {
      for (let x = painel.x0; x <= painel.x1; x++) {
        if (!TECE.has(doc.pixels[y * doc.largura + x])) continue;
        if (x < esquerda) esquerda = x;
        if (x > direita) direita = x;
      }
    }
    return direita >= esquerda ? { x0: esquerda, x1: direita } : { x0: painel.x0, x1: painel.x1 };
  }

  const NOMES_BARRA = { tubular: "Barra tubular", rib11: "Barra em ribana 1×1", rib22: "Barra em ribana 2×2" };

  // Desenho desenvolvido com pacotes, como a atribuição de desenvolvimento do KnitPaint:
  //   inicio  { tipo: "arquivo" | "desperdicio", n }   n carreiras de fio de desperdício e 1 de separação antes
  //   barra   { tipo: "arquivo" | "tubular" | "rib11" | "rib22" | "sem", n }   troca o trecho da barra
  //   final   { tipo: "arquivo" | "arremate" | "desperdicio", n }   acrescenta depois da última carreira
  //   repeticoes  { "de-ate": vezes } dos blocos da R2
  //   codigos { desperdicio, separacao, arremate, frente, tras, tubularA, tubularB }
  //   paineis  painéis cujas agulhas que tecem recebem os pacotes (padrão: só o painel)
  //   semPixels, limite  só conta as carreiras (px: null) quando pedido ou quando passa de limite
  // As carreiras são inteiras (todos os painéis e linhas de opção). Uma carreira nova copia a carreira de
  // referência do trecho e troca só as agulhas que tecem de cada painel pelo código do pacote.
  function desenvolverComPacotes(doc, painel, opcoes = {}) {
    const W = doc.largura, H = doc.altura;
    const cod = { desperdicio: 1, separacao: 3, arremate: 16, frente: 1, tras: 2, tubularA: 51, tubularB: 52, ...(opcoes.codigos || {}) };
    const inicio = { tipo: "arquivo", n: 20, ...(opcoes.inicio || {}) };
    const barra = { tipo: "arquivo", n: 10, ...(opcoes.barra || {}) };
    const final = { tipo: "arquivo", n: 12, ...(opcoes.final || {}) };
    const qtd = (n, padrao) => limitar(Math.round(numero(n, padrao)), 1, 2000);
    const trechos = trechosDoPainel(doc, painel);
    const nomeDe = (c) => (trechos.find((t) => c >= t.de && c <= t.ate) || { nome: "" }).nome;
    const dev = desenvolvimento(doc, painel, opcoes.repeticoes || {});
    const blocoEm = new Map(dev.blocos.filter((b) => b.vezes > 1).map((b) => [b.de, b]));
    const areas = (opcoes.paineis || [painel]).map((p) => areaDeMalha(doc, p)).filter(Boolean);
    const barraT = trechos.find((t) => t.id === "barra");
    const trocaBarra = !!barraT && barra.tipo !== "arquivo";
    const transfT = barraT && trechos.find((t) => t.id === "transferencia" && t.de === barraT.ate + 1);
    const cIni = H - painel.y1, cFim = H - painel.y0;
    // Pedaços do desenho novo, de baixo para cima: carreiras do arquivo (de–ate, repetidas `vezes`) ou carreiras
    // novas (n cópias da carreira ref, com o código do pacote nas agulhas que tecem). A altura sai da soma,
    // sem montar uma lista por carreira (um bloco da R2 pode repetir milhares de vezes).
    const segs = [];
    const novas = (ref, parte, n, extra) => segs.push({ ref, parte, n, gerada: true, ...extra });
    const pacoteInicio = () => {
      if (inicio.tipo !== "desperdicio") return;
      novas(painel.y1, "Fio de desperdício", qtd(inicio.n, 20), { codigo: cod.desperdicio });
      novas(painel.y1, "Separação", 1, { codigo: cod.separacao });
    };
    const pacoteFinal = () => {
      if (final.tipo === "arremate") novas(painel.y0, "Arremate", 1, { codigo: cod.arremate });
      else if (final.tipo === "desperdicio") {
        novas(painel.y0, "Separação", 1, { codigo: cod.separacao });
        novas(painel.y0, "Fio de desperdício", qtd(final.n, 12), { codigo: cod.desperdicio });
      }
    };
    let comecou = false, terminou = false;
    let c = 1;
    while (c <= H) {
      if (!comecou && c >= cIni) {
        comecou = true;
        pacoteInicio();
      }
      if (!terminou && c > cFim) {
        terminou = true;
        pacoteFinal();
      }
      if (trocaBarra && c === barraT.de) {
        if (barra.tipo !== "sem") novas(H - barraT.de, NOMES_BARRA[barra.tipo] || "Barra", qtd(barra.n, 10), { barra: barra.tipo });
        c = barraT.ate + 1;
        if (barra.tipo === "sem" && transfT && c === transfT.de) c = transfT.ate + 1;
        continue;
      }
      const b = blocoEm.get(c);
      if (b) {
        segs.push({ de: b.de, ate: b.ate, vezes: b.vezes, parte: nomeDe(b.de) });
        c = b.ate + 1;
        continue;
      }
      // Carreiras seguidas do mesmo trecho, até um bloco, a troca da barra ou a borda do painel.
      const nome = nomeDe(c);
      let fim = c;
      while (fim < H) {
        const k = fim + 1;
        if (k === cIni || k === cFim + 1 || blocoEm.has(k) || (trocaBarra && k === barraT.de) || nomeDe(k) !== nome) break;
        fim = k;
      }
      segs.push({ de: c, ate: fim, vezes: 1, parte: nome });
      c = fim + 1;
    }
    if (!comecou) pacoteInicio();
    if (!terminou) pacoteFinal();

    const tamanho = (g) => (g.gerada ? g.n : (g.ate - g.de + 1) * g.vezes);
    const h = segs.reduce((t, g) => t + tamanho(g), 0);
    // Partes do desenho novo (carreiras contadas de baixo), para mostrar o que entrou.
    const partes = [];
    let pos = 0, painelDe = 0, painelAte = 0;
    for (const g of segs) {
      const n = tamanho(g);
      if (g.parte && n > 0) {
        const ult = partes[partes.length - 1];
        if (ult && ult.nome === g.parte && ult.ate === pos) ult.ate = pos + n;
        else partes.push({ nome: g.parte, de: pos + 1, ate: pos + n, gerada: !!g.gerada });
        if (!painelDe) painelDe = pos + 1;
        painelAte = pos + n;
      }
      pos += n;
    }
    const resumo = { w: W, h, partes, painel: { de: painelDe, ate: painelAte, carreiras: painelAte - painelDe + 1 } };
    // Só a contagem (sem a imagem) quando pedido ou quando passaria do limite de carreiras.
    if (opcoes.semPixels || (opcoes.limite && h > opcoes.limite)) return { ...resumo, px: null };
    const px = new Uint8Array(W * h);
    let linha = 0; // carreira do desenho novo, de baixo para cima
    const copiar = (y) => {
      const destino = (h - 1 - linha++) * W;
      px.set(doc.pixels.subarray(y * W, y * W + W), destino);
      return destino;
    };
    for (const g of segs) {
      if (!g.gerada) {
        for (let r = 0; r < g.vezes; r++) for (let k = g.de; k <= g.ate; k++) copiar(H - k);
        continue;
      }
      for (let i = 0; i < g.n; i++) {
        const destino = copiar(g.ref);
        for (const a of areas) {
          for (let x = a.x0; x <= a.x1; x++) {
            let v = g.codigo;
            if (g.barra === "tubular") v = i % 2 ? cod.tubularB : cod.tubularA;
            else if (g.barra === "rib11") v = (x - a.x0) % 2 ? cod.tras : cod.frente;
            else if (g.barra === "rib22") v = (x - a.x0) % 4 < 2 ? cod.frente : cod.tras;
            px[destino + x] = v;
          }
        }
      }
    }
    return { ...resumo, px };
  }

  // O que tem num trecho do painel: os códigos mais usados nas agulhas que tecem, se as carreiras alternam entre
  // dois códigos (51 e 52 na barra do exemplo) e os valores de guia-fio (R3), ponto (R6), cancelar malha (R5) e
  // economizador (R2) nas carreiras dele.
  function resumoDoTrecho(doc, painel, trecho) {
    const H = doc.altura, W = doc.largura;
    const m = areaDeMalha(doc, painel);
    const total = new Map();
    const principal = []; // código mais usado em cada carreira, de baixo para cima
    for (let c = trecho.de; c <= trecho.ate && m; c++) {
      const y = H - c;
      const linha = new Map();
      for (let x = m.x0; x <= m.x1; x++) {
        const v = doc.pixels[y * W + x];
        linha.set(v, (linha.get(v) || 0) + 1);
        total.set(v, (total.get(v) || 0) + 1);
      }
      if (linha.size) principal.push([...linha].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
    }
    const codigos = [...total].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([cor, n]) => ({ cor, n }));
    let alterna = null;
    if (principal.length >= 4 && principal[0] !== principal[1] && principal.every((v, i) => v === principal[i % 2])) alterna = [principal[0], principal[1]];
    const valores = (k) => (painel.R ? valoresNasCarreiras(doc, painel.R, k, trecho.de, trecho.ate) : []);
    return { codigos, alterna, guias: valores(3), pontos: valores(6), cancela: valores(5).length > 0, economizador: valores(2) };
  }

  // ------------------------------------------------------------------ processamento

  const PASSOS_PROCESSAMENTO = [
    { id: "maquina", nome: "Máquina" },
    { id: "guias", nome: "Guia-fios" },
    { id: "economizador", nome: "Economizador" },
    { id: "puxador", nome: "Puxador" },
    { id: "ponto", nome: "Ponto" },
    { id: "velocidade", nome: "Velocidade" },
    { id: "gerar", nome: "Gerar programa" },
  ];
  const MAQUINAS = ["SSG122SV", "SVR123SP", "SRY123LP", "MACH2XS (WHOLEGARMENT)", "N.SSR072 (golas)"];
  const FINURAS = [3, 5, 7, 10, 12, 14, 16, 18];
  const SERIES_SHIMA = ["SSG", "SSR", "SVR", "SRY", "SES", "SIG", "SIR", "SCG", "SFG", "SWG", "SPG", "SSI", "MACH"];

  // Máquina e finura pelo nome da pasta, como a Shima costuma nomear: "07 122 SSGsv" é a SSG122SV na
  // finura 7; "SVR123SP 12G" também vale. Devolve { maquina, finura } com "" no que não achar.
  function maquinaDaPasta(nome) {
    const texto = String(nome || "");
    const partes = texto.split(/[\s_\-.]+/).filter(Boolean);
    const junto = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let maquina = MAQUINAS.find((m) => junto.includes(m.replace(/\s.*$/, "").replace(/[^A-Z0-9]/g, ""))) || "";
    if (!maquina) {
      // Número e série separados: "122 SSGsv" vira SSG122SV (a série em maiúsculas e a variante depois).
      const numero = partes.find((x) => /^\d{3}$/.test(x));
      for (const x of partes) {
        const t = x.toUpperCase();
        const serie = /^[A-Z]{3,7}$/.test(t) && SERIES_SHIMA.find((sr) => t.startsWith(sr) && t.length - sr.length <= 3);
        if (numero && serie) {
          maquina = `${serie}${numero}${t.slice(serie.length)}`;
          break;
        }
      }
    }
    // A finura vem com G ("12G") ou, se a máquina apareceu no nome, como um número solto ("07").
    let finura = "";
    const comG = /(?:^|[^\d])(\d{1,2})\s*G(?![A-Z])/i.exec(texto);
    if (comG && FINURAS.includes(Number(comG[1]))) finura = Number(comG[1]);
    else if (maquina) {
      const t = partes.find((x) => /^\d{1,2}$/.test(x) && FINURAS.includes(Number(x)));
      if (t) finura = Number(t);
    }
    return { maquina, finura };
  }

  // O que o processamento precisa: os guia-fios da R3 e os pontos da R6 usados (com as carreiras de cada
  // painel), os trechos do primeiro painel e os blocos do economizador (R2) de cada painel.
  function usoDoProcessamento(doc, blocos) {
    const lista = paineis(blocos).filter((p) => p.R);
    const coletar = (k) => {
      const valores = new Map();
      for (const p of lista) {
        if (!p.R.colunas[k]) continue;
        for (let y = p.R.carreiraInicio; y <= p.R.carreiraFim; y++) {
          for (const v of valoresDaLinha(doc, p.R, k, y)) {
            if (!valores.has(v)) valores.set(v, new Map());
            const porPainel = valores.get(v);
            if (!porPainel.has(p.numero)) porPainel.set(p.numero, []);
            porPainel.get(p.numero).push(doc.altura - y);
          }
        }
      }
      return [...valores]
        .sort((a, b) => a[0] - b[0])
        .map(([valor, porPainel]) => ({ valor, onde: [...porPainel].map(([painel, cs]) => ({ painel, carreiras: intervalos(cs) })) }));
    };
    const primeiro = lista.find((p) => p.x0 !== null) || lista[0];
    return {
      guias: coletar(3),
      pontos: coletar(6),
      trechos: primeiro ? trechosDoPainel(doc, primeiro) : [],
      blocosR2: lista.flatMap((p) =>
        p.R.colunas[2]
          ? desenvolvimento(doc, p).blocos.map((b) => ({ painel: p.numero, chave: b.chave, de: b.de, ate: b.ate, valor: b.valor, dentro: valoresNasCarreiras(doc, p.R, 1, b.de, b.ate) }))
          : [],
      ),
    };
  }

  const vazio = (v) => String(v ?? "").trim() === "";

  // Quantos valores faltam em cada passo. dados: { maquina, finura, guias: { r3: { guia, fio, cor, lado } },
  // pontos: { r6: { f, t } }, puxador: { trecho: valor }, velocidade: { trecho: valor } }.
  function faltasDoProcessamento(dados, uso, repeticoes = {}) {
    const g = dados.guias || {}, p = dados.pontos || {}, pux = dados.puxador || {}, vel = dados.velocidade || {};
    return {
      maquina: (vazio(dados.maquina) ? 1 : 0) + (vazio(dados.finura) ? 1 : 0),
      guias: uso.guias.reduce((n, u) => n + (vazio((g[u.valor] || {}).guia) ? 1 : 0) + (vazio((g[u.valor] || {}).fio) ? 1 : 0), 0),
      economizador: uso.blocosR2.filter((b) => vazio((repeticoes[b.painel] || {})[b.chave])).length,
      puxador: uso.trechos.filter((t) => vazio(pux[t.id])).length,
      ponto: uso.pontos.reduce((n, u) => n + (vazio((p[u.valor] || {}).f) ? 1 : 0) + (vazio((p[u.valor] || {}).t) ? 1 : 0), 0),
      velocidade: uso.trechos.filter((t) => vazio(vel[t.id])).length,
      gerar: 0,
    };
  }

  // Resumo do processamento em texto, para levar à máquina ou ao KnitPaint.
  function linhasDoProcessamento(nome, dados, uso, repeticoes = {}) {
    const g = dados.guias || {}, p = dados.pontos || {}, pux = dados.puxador || {}, vel = dados.velocidade || {};
    const ou = (v) => (vazio(v) ? "—" : String(v).trim());
    const onde = (u) => u.onde.map((o) => `painel ${o.painel}: ${o.carreiras}`).join("; ");
    const linhas = [`PROCESSAMENTO · ${nome}`, "", `Máquina: ${ou(dados.maquina)} · finura ${vazio(dados.finura) ? "—" : `${dados.finura}G`}`, "", "GUIA-FIOS (R3)"];
    for (const u of uso.guias) {
      const d = g[u.valor] || {};
      const lado = d.lado === "D" ? "direita" : d.lado === "E" ? "esquerda" : "—";
      linhas.push(`R3 ${u.valor} → guia ${ou(d.guia)} · fio ${ou(d.fio)} · cor ${ou(d.cor)} · entra pela ${lado} (${onde(u)})`);
    }
    if (!uso.guias.length) linhas.push("(nenhum valor na R3)");
    linhas.push("", "ECONOMIZADOR (R2)");
    for (const b of uso.blocosR2) {
      const dentro = b.dentro && b.dentro.length ? `, R1 = ${b.dentro.join("/")}` : "";
      linhas.push(`Painel ${b.painel}, carreiras ${b.de}–${b.ate} (R2 = ${b.valor}${dentro}): repete ${ou((repeticoes[b.painel] || {})[b.chave])} vez(es)`);
    }
    if (!uso.blocosR2.length) linhas.push("(nenhum bloco na R2)");
    linhas.push("", "PONTO (R6)");
    for (const u of uso.pontos) {
      const d = p[u.valor] || {};
      linhas.push(`R6 ${u.valor} → frente ${ou(d.f)} · atrás ${ou(d.t)} (${onde(u)})`);
    }
    if (!uso.pontos.length) linhas.push("(nenhum valor na R6)");
    linhas.push("", "PUXADOR E VELOCIDADE POR TRECHO");
    for (const t of uso.trechos) linhas.push(`${t.nome} (carreiras ${t.de}–${t.ate}): puxador ${ou(pux[t.id])} · velocidade ${ou(vel[t.id])}`);
    return linhas;
  }

  // ------------------------------------------------------------------ verificação

  // Códigos que tecem, segundo as referências públicas (frente, atrás, os dois, tuck, sem transferir,
  // frente e mover). Os outros (13 largura do guia, 16 sem seleção, transferências) não contam como malha.
  const TECE = new Set([1, 2, 3, 11, 12, 51, 52, 61, 71]);
  const TRANSFERE = new Set([60, 70]); // só transferência, sem tricotar
  const MARCAS = new Set([0, 13, 16, 99]); // fora, largura do guia, sem seleção e o 99 dos arquivos (nada tece)

  function intervalos(carreiras) {
    const ord = [...carreiras].sort((a, b) => a - b);
    const partes = [];
    for (let i = 0; i < ord.length; i++) {
      let j = i;
      while (j + 1 < ord.length && ord[j + 1] === ord[j] + 1) j++;
      partes.push(j > i ? `${ord[i]}–${ord[j]}` : String(ord[i]));
      i = j;
    }
    return partes.join(", ");
  }

  const listaComE = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}` : String(l[0]));

  // Ourela: agulhas das bordas da malha (até 4 de cada lado) que, no corpo, alternam dois códigos a cada carreira
  // (como 2 e 16). Devolve { agulhas (numeradas a partir de 1), codigos, de, ate, x0, x1 } ou null.
  function ourelaAlternada(doc, p) {
    const m = areaDeMalha(doc, p);
    const corpo = m && trechosDoPainel(doc, p).find((t) => t.id === "corpo");
    if (!corpo || corpo.ate - corpo.de < 3) return null;
    const H = doc.altura, W = doc.largura;
    const colunas = new Set();
    for (let k = 0; k < 4; k++) {
      if (m.x0 + k <= m.x1) colunas.add(m.x0 + k);
      if (m.x1 - k >= m.x0) colunas.add(m.x1 - k);
    }
    // Uma coluna alterna dois códigos quando quase toda carreira troca: devolve os dois códigos ou null.
    const alterna = (x) => {
      const vals = [];
      for (let c = corpo.de; c <= corpo.ate; c++) vals.push(doc.pixels[(H - c) * W + x]);
      const dif = new Set(vals);
      let trocas = 0;
      for (let k = 1; k < vals.length; k++) if (vals[k] !== vals[k - 1]) trocas++;
      return dif.size === 2 && trocas >= 0.8 * (vals.length - 1) ? [...dif].sort((a, b) => a - b).join() : null;
    };
    // Se o meio da malha alterna os mesmos códigos (tubular, listras de uma carreira), é o desenho, não a ourela.
    const meio = new Set([0.25, 0.5, 0.75].map((f) => alterna(Math.round(m.x0 + f * (m.x1 - m.x0)))).filter(Boolean));
    const achadas = [], codigos = new Set();
    for (const x of [...colunas].sort((a, b) => a - b)) {
      const par = alterna(x);
      if (!par || meio.has(par)) continue;
      achadas.push(x + 1);
      par.split(",").forEach((v) => codigos.add(Number(v)));
    }
    if (!achadas.length) return null;
    return { agulhas: achadas, codigos: [...codigos].sort((a, b) => a - b), de: corpo.de, ate: corpo.ate, x0: m.x0, x1: m.x1 };
  }

  function verificarDesenho(doc, blocos, opcoes = {}) {
    const limite = opcoes.flutuacaoMaxima || 5;
    const H = doc.altura, W = doc.largura, px = doc.pixels;
    const itens = [];
    const lista = paineis(blocos);
    if (!lista.length) {
      itens.push({ nivel: "info", regra: "sem-linhas", titulo: "Sem linhas de opção", texto: "Não foram encontrados blocos L1–L20 e R1–R20 neste desenho. As regras de guia-fio, ponto e cancelar malha precisam deles." });
      return itens;
    }
    const resumos = [];
    for (const p of lista) {
      if (!p.L || !p.R) {
        itens.push({ nivel: "aviso", regra: "sem-par", painel: p.numero, titulo: `Bloco de linhas de opção sem par (painel ${p.numero})`, texto: "Achei só um lado (L ou R) deste painel. Confira se o outro lado está completo." });
        continue;
      }
      const semGuia = [], semPonto = [], cancelaComGuia = [], cancela = [], semLargura = [], soltos = [];
      const transfere = [], transfereComGuia = [], transfereTecendo = [], transfereSemR5 = [], guiaSemMalha = [];
      const guiasSemMalha = new Set();
      let esquerda = Infinity, direita = -Infinity;
      for (let y = p.y0; y <= p.y1; y++) {
        let tece = false, tem13 = false, transf = false, soMarcas = true, seguidos = 0, maior = 0;
        for (let x = p.x0; x <= p.x1; x++) {
          const v = px[y * W + x];
          if (TECE.has(v)) {
            tece = true;
            esquerda = Math.min(esquerda, x);
            direita = Math.max(direita, x);
          }
          if (v === 13) tem13 = true;
          if (TRANSFERE.has(v)) transf = true;
          if (!MARCAS.has(v)) soMarcas = false;
          seguidos = v === 16 ? seguidos + 1 : 0;
          maior = Math.max(maior, seguidos);
        }
        const tem = (k) => valoresDaLinha(doc, p.R, k, y).length > 0;
        const c = H - y;
        if (tece && !tem(3)) semGuia.push(c);
        if (tece && !tem(6)) semPonto.push(c);
        // Na carreira de transferência (60/70) a R5 cancela a malha e a R3 fica vazia: o carro só passa os
        // pontos de uma frontura para a outra. Ela entra só nestas regras, não nas de cancelar malha.
        if (transf) {
          const r3 = tem(3), r5 = tem(5);
          if (r3) transfereComGuia.push(c);
          if (!r5) (tece ? transfereTecendo : transfereSemR5).push(c);
          if (!r3 && r5) transfere.push(c);
        } else if (tem(5)) (tem(3) ? cancelaComGuia : cancela).push(c);
        else if (tem(3) && soMarcas) {
          // O guia passa sem nenhuma agulha tecer: normalmente a entrada do fio no começo da peça.
          guiaSemMalha.push(c);
          valoresDaLinha(doc, p.R, 3, y).forEach((v) => guiasSemMalha.add(v));
        }
        if (tece && !tem13) semLargura.push(c);
        if (maior > limite) soltos.push(c);
      }
      const onde = (lista2) => ({ carreiras: intervalos(lista2), y: H - lista2[0], x0: p.x0, x1: p.x1, painel: p.numero });
      const nome = lista.length > 1 ? ` (painel ${p.numero})` : "";
      if (semGuia.length) itens.push({ nivel: "aviso", regra: "sem-guia", titulo: `Carreiras com malha e sem guia-fio (R3)${nome}`, texto: "Estas carreiras têm códigos de malha, mas a linha R3 está vazia. Pode ser que usem o guia da carreira anterior; confira no KnitPaint.", ...onde(semGuia) });
      if (semPonto.length) itens.push({ nivel: "aviso", regra: "sem-ponto", titulo: `Carreiras com malha e sem número de ponto (R6)${nome}`, texto: "Sem R6 a carreira usa o ponto padrão da máquina. Confira se é isso que você quer.", ...onde(semPonto) });
      if (transfereComGuia.length)
        itens.push({
          nivel: "erro",
          regra: "transferencia-com-guia",
          titulo: `Transferência com guia-fio (R3)${nome}`,
          texto: "Há transferência (60/70) em carreira com guia-fio na R3. Na carreira de transferência a R3 fica vazia: as agulhas só passam os pontos de uma frontura para a outra.",
          ...onde(transfereComGuia),
        });
      if (transfereTecendo.length)
        itens.push({
          nivel: "erro",
          regra: "transferencia-tecendo",
          titulo: `Transferência em carreira que tricota${nome}`,
          texto: "Há transferência (60/70) em carreira que também tem códigos de malha e não tem R5. Na carreira de transferência a R5 cancela a malha.",
          ...onde(transfereTecendo),
        });
      if (transfereSemR5.length)
        itens.push({
          nivel: "aviso",
          regra: "transferencia-sem-r5",
          titulo: `Transferência sem cancelar malha (R5)${nome}`,
          texto: "Estas carreiras só transferem (60/70), mas não têm R5. Normalmente a R5 cancela a malha na carreira de transferência; confira no KnitPaint.",
          ...onde(transfereSemR5),
        });
      if (transfere.length && !transfereComGuia.length && !transfereTecendo.length && !transfereSemR5.length)
        itens.push({ nivel: "info", regra: "transferencia-coerente", titulo: `Transferência sem fio: coerente${nome}`, texto: "Nas carreiras de transferência (60/70) a R5 cancela a malha e a R3 está vazia: as agulhas só passam os pontos de uma frontura para a outra.", ...onde(transfere) });
      if (cancelaComGuia.length) itens.push({ nivel: "aviso", regra: "cancela-com-guia", titulo: `Cancelar malha (R5) com guia-fio (R3)${nome}`, texto: "A carreira não tece, mas tem guia-fio. Confira se o guia deve passar nessa carreira.", ...onde(cancelaComGuia) });
      else if (cancela.length) itens.push({ nivel: "info", regra: "cancela-coerente", titulo: `Cancelar malha sem guia-fio: coerente${nome}`, texto: "Nas carreiras com R5 a malha é cancelada e a R3 está vazia: as agulhas só transferem ou esperam.", ...onde(cancela) });
      if (guiaSemMalha.length) {
        const gs = [...guiasSemMalha].sort((a, b) => a - b);
        itens.push({
          nivel: "info",
          regra: "guia-sem-malha",
          titulo: `Guia-fio ${gs.join(", ")} sem malha (entrada do fio?)${nome}`,
          texto: "Nestas carreiras a R3 tem guia-fio, mas nenhuma agulha tece na área do painel: o guia só passa. Parece ser a entrada do fio; confira se é de propósito.",
          ...onde(guiaSemMalha),
        });
      }
      const ourela = ourelaAlternada(doc, p);
      if (ourela)
        itens.push({
          nivel: "info",
          regra: "ourela",
          painel: p.numero,
          titulo: `Ourela alternada${nome}`,
          texto: `No corpo, ${ourela.agulhas.length === 1 ? "a agulha" : "as agulhas"} ${listaComE(ourela.agulhas)} da borda da malha ${ourela.agulhas.length === 1 ? "alterna" : "alternam"} os códigos ${listaComE(ourela.codigos)} a cada carreira. É a ourela: confira se é de propósito.`,
          carreiras: `${ourela.de}–${ourela.ate}`,
          y: H - ourela.ate,
          x0: ourela.x0,
          x1: ourela.x1,
        });
      if (semLargura.length) itens.push({ nivel: "aviso", regra: "sem-largura", titulo: `Carreiras com malha sem a largura do guia-fio (13)${nome}`, texto: "O código 13 marca até onde o guia-fio vai. Estas carreiras tecem, mas não têm a marca na área do painel.", ...onde(semLargura) });
      if (soltos.length) itens.push({ nivel: "aviso", regra: "soltos-16", titulo: `Flutuações longas (16)${nome}`, texto: `Há mais de ${limite} agulhas seguidas sem seleção (16) na mesma carreira: o fio fica solto por trás.`, ...onde(soltos) });
      const r2 = new Set();
      for (let y = p.y0; y <= p.y1; y++) valoresDaLinha(doc, p.R, 2, y).forEach((v) => r2.add(v));
      resumos.push({ numero: p.numero, largura: direita >= esquerda ? direita - esquerda + 1 : 0, carreiras: p.y1 - p.y0 + 1, r2: [...r2].sort((a, b) => a - b).join("/") || "—", y0: p.y0 });
    }
    if (resumos.length > 1) {
      const ref = resumos[0];
      const dif = resumos.filter((r) => r.largura !== ref.largura || r.carreiras !== ref.carreiras || r.r2 !== ref.r2);
      if (dif.length) {
        itens.push({
          nivel: "aviso",
          regra: "paineis-diferentes",
          titulo: "Os painéis são diferentes",
          texto: `${resumos.map((r) => `Painel ${r.numero}: ${r.largura} agulhas de malha, ${r.carreiras} carreiras, R2 = ${r.r2}`).join(". ")}. Confira se é de propósito (por exemplo, peças de tamanhos diferentes).`,
          carreiras: "",
          y: ref.y0,
        });
      }
    }
    if (!itens.some((i) => i.nivel !== "info")) itens.push({ nivel: "info", regra: "nenhum", titulo: "Nenhum problema no desenho", texto: "As regras de guia-fio, ponto, cancelar malha, transferência, largura do guia e flutuação passaram." });
    return itens;
  }

  // ------------------------------------------------------------------ tempo, símbolos e ficha

  // Conta simples: carreiras × peças × largura percorrida pelo carro ÷ velocidade (em segundos).
  // Não inclui transferências, trocas de guia, economizador nem paradas.
  function tempoTecimento({ carreiras, agulhas, pecas = 1, finura = 7, velocidade, sobra = 0 }) {
    carreiras = numero(carreiras);
    agulhas = numero(agulhas);
    velocidade = numero(velocidade);
    finura = numero(finura, 7);
    if (!(carreiras > 0 && agulhas > 0 && velocidade > 0 && finura > 0)) return null;
    const metros = (agulhas * 25.4) / finura / 1000 + (2 * Math.max(0, numero(sobra))) / 100;
    return (carreiras * Math.max(1, numero(pecas, 1)) * metros) / velocidade;
  }

  const SIMBOLOS = { 1: "frente", 51: "frente", 2: "tras", 52: "tras", 3: "ambos", 11: "tuck-frente", 12: "tuck-tras", 16: "flutua", 61: "mover-esq", 71: "mover-dir", 13: "guia", 60: "transfere", 70: "transfere" };
  const tipoDePonto = (codigo) => SIMBOLOS[codigo] || null;

  const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  const CAMPOS_FICHA = [
    ["codigo", "CODIGO"],
    ["descricao", "DESCRICAO"],
    ["maquina", "MAQUINA"],
    ["tempo", "TEMPO TEC"],
    ["fio", "FIO"],
    ["bruto", "PESO BRUTO"],
    ["liquido", "PESO LIQUIDO"],
    ["data", "DATA"],
  ];

  // Linhas da ficha técnica como o KnitPaint escreve no desenho: maiúsculas e sem acentos.
  function linhasDaFicha(campos, guias = []) {
    const linhas = ["FICHA TECNICA", ""];
    for (const [id, rotulo] of CAMPOS_FICHA) linhas.push(`${rotulo}=${semAcento(campos[id])}`);
    const fios = guias.filter((g) => String(g.fio || "").trim()).map((g) => `${g.guia}:${semAcento(g.fio)}`);
    linhas.push(`GUIA FIOS${fios.length ? ` ${fios.join("  ")}` : ""}`);
    return linhas;
  }

  // Fonte de pixels 5 × 7 (linha de cima primeiro), para escrever no desenho sem borrar: cada ponto do
  // texto é um pixel inteiro com um número de cor.
  const FONTE = {
    A: "01110|10001|10001|11111|10001|10001|10001", B: "11110|10001|10001|11110|10001|10001|11110",
    C: "01110|10001|10000|10000|10000|10001|01110", D: "11100|10010|10001|10001|10001|10010|11100",
    E: "11111|10000|10000|11110|10000|10000|11111", F: "11111|10000|10000|11110|10000|10000|10000",
    G: "01110|10001|10000|10111|10001|10001|01111", H: "10001|10001|10001|11111|10001|10001|10001",
    I: "01110|00100|00100|00100|00100|00100|01110", J: "00111|00010|00010|00010|00010|10010|01100",
    K: "10001|10010|10100|11000|10100|10010|10001", L: "10000|10000|10000|10000|10000|10000|11111",
    M: "10001|11011|10101|10101|10001|10001|10001", N: "10001|10001|11001|10101|10011|10001|10001",
    O: "01110|10001|10001|10001|10001|10001|01110", P: "11110|10001|10001|11110|10000|10000|10000",
    Q: "01110|10001|10001|10001|10101|10010|01101", R: "11110|10001|10001|11110|10100|10010|10001",
    S: "01111|10000|10000|01110|00001|00001|11110", T: "11111|00100|00100|00100|00100|00100|00100",
    U: "10001|10001|10001|10001|10001|10001|01110", V: "10001|10001|10001|10001|10001|01010|00100",
    W: "10001|10001|10001|10101|10101|10101|01010", X: "10001|10001|01010|00100|01010|10001|10001",
    Y: "10001|10001|10001|01010|00100|00100|00100", Z: "11111|00001|00010|00100|01000|10000|11111",
    0: "01110|10001|10011|10101|11001|10001|01110", 1: "00100|01100|00100|00100|00100|00100|01110",
    2: "01110|10001|00001|00010|00100|01000|11111", 3: "11111|00010|00100|00010|00001|10001|01110",
    4: "00010|00110|01010|10010|11111|00010|00010", 5: "11111|10000|11110|00001|00001|10001|01110",
    6: "00110|01000|10000|11110|10001|10001|01110", 7: "11111|00001|00010|00100|01000|01000|01000",
    8: "01110|10001|10001|01110|10001|10001|01110", 9: "01110|10001|10001|01111|00001|00010|01100",
    " ": "00000|00000|00000|00000|00000|00000|00000", "=": "00000|00000|11111|00000|11111|00000|00000",
    ":": "00000|01100|01100|00000|01100|01100|00000", ".": "00000|00000|00000|00000|00000|01100|01100",
    ",": "00000|00000|00000|00000|01100|00100|01000", "-": "00000|00000|00000|11111|00000|00000|00000",
    "/": "00000|00001|00010|00100|01000|10000|00000", "(": "00010|00100|01000|01000|01000|00100|00010",
    ")": "01000|00100|00010|00010|00010|00100|01000", "+": "00000|00100|00100|11111|00100|00100|00000",
    "%": "11000|11001|00010|00100|01000|10011|00011", "*": "00000|00100|10101|01110|10101|00100|00000",
    "#": "01010|01010|11111|01010|11111|01010|01010", "'": "01100|00100|01000|00000|00000|00000|00000",
    "?": "01110|10001|00001|00010|00100|00000|00100", "_": "00000|00000|00000|00000|00000|00000|11111",
  };

  // Escreve as linhas de texto em pixels. Letras sem acento e maiúsculas; o que a fonte não tem vira "?".
  // opcoes: { cor, fundo, escala (1–4), margem (pixels da fonte) }
  function textoEmPixels(linhas, opcoes = {}) {
    const cor = opcoes.cor ?? 1, fundo = opcoes.fundo ?? 0;
    const k = limitar(Math.round(opcoes.escala || 1), 1, 4);
    const margem = Math.max(0, Math.round(opcoes.margem ?? 1));
    const textos = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => [...semAcento(l).replace(/\s+$/, "")]);
    const colunas = Math.max(1, ...textos.map((t) => t.length));
    const w = (2 * margem + colunas * 6 - 1) * k;
    const h = (2 * margem + textos.length * 9 - 2) * k;
    const px = new Uint8Array(w * h).fill(fundo);
    textos.forEach((t, l) => {
      t.forEach((letra, i) => {
        const linhasLetra = (FONTE[letra] || FONTE["?"]).split("|");
        for (let gy = 0; gy < 7; gy++) {
          for (let gx = 0; gx < 5; gx++) {
            if (linhasLetra[gy][gx] !== "1") continue;
            const x0 = (margem + i * 6 + gx) * k, y0 = (margem + l * 9 + gy) * k;
            for (let dy = 0; dy < k; dy++) px.fill(cor, (y0 + dy) * w + x0, (y0 + dy) * w + x0 + k);
          }
        }
      });
    });
    return { w, h, px };
  }

  const api = {
    ESTILOS, calcularModelo, distribuir, distribuirReto, resumoEventos, planoForma, pixelsDaForma,
    trechosDificeis, BIBLIOTECA, repetirMotivo,
    coresDaArea, flutuacoes, guiasIntarsia, gerarListras, gerarLosango,
    paineis, colunaDoValor, valoresDaLinha, faixasDaLinha, pintarValorNaLinha, desenvolvimento, desenharDesenvolvido,
    trechosDoPainel, areaDeMalha, desenvolverComPacotes, resumoDoTrecho, valoresNasCarreiras, listrasPorCarreira, gerarOnca, quantizarLuminancia,
    PASSOS_PROCESSAMENTO, MAQUINAS, FINURAS, maquinaDaPasta, usoDoProcessamento, faltasDoProcessamento, linhasDoProcessamento,
    TECE, verificarDesenho, intervalos,
    tempoTecimento, tipoDePonto, semAcento, CAMPOS_FICHA, linhasDaFicha, FONTE, textoEmPixels,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.RecursosMalha = api;
})(typeof window !== "undefined" ? window : globalThis);
