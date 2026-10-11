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
      medidas: [
        { id: "larg", nome: "Largura do painel", cm: 67.7, eixo: "h" },
        { id: "comp", nome: "Altura do painel", cm: 44.8, eixo: "v" },
        { id: "barra", nome: "Barra", cm: 2.5, eixo: "v" },
      ],
    },
    { id: "careca", nome: "Gola careca", medidas: CORPO },
    { id: "v", nome: "Gola V", medidas: trocar(CORPO, { gola: 16, golaP: 20 }) },
    { id: "cardiga", nome: "Cardigã", medidas: trocar(CORPO, { gola: 16, golaP: 22 }, [{ id: "vista", nome: "Vista dos botões", cm: 3, eixo: "h" }]) },
    { id: "regata", nome: "Regata", medidas: trocar(CORPO.slice(0, 7), { larg: 46, comp: 58, barra: 3, cava: 22, ombro: 5, gola: 20, golaP: 12 }) },
    {
      id: "polo",
      nome: "Gola polo",
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
    const corpo = (nome, qtd, golaP, arremGola, extra) => ({
      nome,
      qtd,
      agulhas: W,
      carreiras: H,
      detalhe: `Barra de ${barra} carreiras. Cava a partir da carreira ${H - cava + 1}, ${recuo} agulhas a menos de cada lado. Gola de ${gola} agulhas e ${golaP} carreiras de fundo.${extra || ""}`,
      forma: { tipo: "corpo", W, H, barra, cava, recuo, arremCava: Math.round(recuo / 3), gola, golaP, arremGola: centroPar(W, arremGola), degraus: 3 },
    });
    if (estilo.id === "cardiga") {
      const frente = corpo("Frentes", 2, ca(m("golaP")), gola / 3, ` A forma é a da frente inteira: divida no meio e some ${ag(m("vista") / 2)} agulhas de vista em cada frente.`);
      frente.agulhas = Math.round(W / 2) + ag(m("vista") / 2);
      pecas.push(frente);
    } else {
      pecas.push(corpo("Frente", 1, ca(m("golaP")), gola / 3));
    }
    pecas.push(corpo("Costas", 1, ca(Math.min(2.5, m("golaP"))), gola * 0.55));
    if (estilo.id !== "regata") {
      const mangaL = ag(m("mangaL")), punho = Math.min(ag(m("punho")), mangaL), manga = ca(m("manga"));
      const copa = ca(Math.min(m("manga") * 0.3, m("cava") * 0.75));
      const aumento = Math.max(0, Math.round((mangaL - punho) / 2));
      pecas.push({
        nome: "Manga",
        qtd: 2,
        agulhas: mangaL,
        carreiras: manga,
        detalhe: `Punho com ${punho} agulhas. ${aumento ? `Aumenta ${aumento} agulhas de cada lado até ${mangaL}.` : "Sem aumentos."} Copa de ${copa} carreiras.`,
        forma: { tipo: "manga", punho, W: mangaL, H: manga, barra, copa, arremCopa: Math.round(recuo / 3), topo: Math.round(mangaL / 4) },
      });
    }
    return { estilo, medidas, pecas };
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

  function resumoEventos(eventos, sinal) {
    const grupos = [];
    for (const e of eventos) {
      const g = grupos[grupos.length - 1];
      if (g && g.n === e.n && g.intervalo === e.intervalo) g.vezes++;
      else grupos.push({ n: e.n, intervalo: e.intervalo, vezes: 1 });
    }
    return grupos.map((g) => `${sinal}${g.n} agulha${g.n > 1 ? "s" : ""} de cada lado a cada ${g.intervalo} carreiras, ${g.vezes}×`).join(" · ");
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

  function planoCorpo(p, porVez, dist) {
    const W = Math.max(8, Math.round(p.W)), H = Math.max(8, Math.round(p.H));
    const barra = limitar(Math.round(p.barra), 0, H - 2);
    const cava = limitar(Math.round(p.cava), 2, H - barra - 1);
    const gola = limitar(Math.round(p.gola), 2, W - 4);
    const recuo = limitar(Math.round(p.recuo), 0, Math.max(0, Math.floor((W - gola) / 2) - 1));
    const arremC = limitar(Math.round(p.arremCava), 0, recuo);
    const golaP = limitar(Math.round(p.golaP), 2, H - barra - 1);
    const arremG = centroPar(W, limitar(Math.round(p.arremGola), 0, gola));
    const deg = limitar(Math.round(p.degraus), 1, 6);
    const cava0 = H - cava + 1, gola0 = H - golaP + 1, ombro0 = H - 2 * deg + 1;
    const evCava = distribuir(recuo - arremC, porVez, Math.round(cava * 0.45));
    const ladoGola = Math.floor((gola - arremG) / 2);
    const evGola = distribuir(ladoGola, porVez, Math.max(2, golaP - 4));
    const ombro = Math.floor((W - gola) / 2) - recuo;
    const degraus = [];
    for (let i = 0; i < deg; i++) degraus.push(Math.max(0, Math.floor(ombro / deg) + (i < ombro % deg ? 1 : 0)));

    const mapa = {};
    const add = (c, a) => (mapa[c] = mapa[c] || []).push(a);
    add(cava0, { t: "arremLados", n: arremC });
    evCava.forEach((e) => add(cava0 + e.off, { t: "dimLados", n: e.n }));
    add(gola0, { t: "arremCentro", n: arremG });
    evGola.forEach((e) => add(gola0 + e.off, { t: "dimGola", n: e.n }));
    degraus.forEach((n, i) => add(ombro0 + 2 * i, { t: "parcial", n }));

    const linhas = [];
    let L = 0, R = W - 1, holdL = 0, holdR = 0, nl = null, nr = null;
    for (let c = 1; c <= H; c++) {
      const row = novaLinha(c <= barra);
      for (const a of mapa[c] || []) {
        if (a.t === "arremLados" && a.n > 0) {
          row.arrem.push([L, L + a.n - 1], [R - a.n + 1, R]);
          L += a.n;
          R -= a.n;
        } else if (a.t === "dimLados") {
          L += a.n;
          R -= a.n;
          row.marcas.push({ x: L + dist - 1, lado: "esq" }, { x: R - dist + 1, lado: "dir" });
        } else if (a.t === "arremCentro") {
          const x0 = Math.floor((W - a.n) / 2);
          if (a.n > 0) row.arrem.push([x0, x0 + a.n - 1]);
          nl = x0 - 1;
          nr = x0 + a.n;
        } else if (a.t === "dimGola" && nl !== null) {
          nl -= a.n;
          nr += a.n;
          row.marcas.push({ x: nl - dist + 1, lado: "dir" }, { x: nr + dist - 1, lado: "esq" });
        } else if (a.t === "parcial") {
          holdL += a.n;
          holdR += a.n;
        }
      }
      const a0 = L + holdL, a1 = R - holdR;
      if (nl === null) row.segs.push([a0, a1]);
      else {
        if (nl >= a0) row.segs.push([a0, nl]);
        if (a1 >= nr) row.segs.push([nr, a1]);
      }
      if (holdL > 0) row.parcial.push([L, L + holdL - 1], [R - holdR + 1, R]);
      row.marcas = row.marcas.filter((m) => row.segs.some(([s0, s1]) => m.x >= s0 && m.x <= s1));
      if (c === H) {
        row.arrem.push(...row.segs, ...row.parcial);
        row.segs = [];
        row.parcial = [];
      }
      linhas.push(row);
    }

    const passos = [];
    if (ombro <= 0) passos.push({ nome: "Confira as medidas", aviso: true, texto: "A gola e a cava já ocupam toda a largura: não sobra ombro." });
    if (gola0 <= cava0) passos.push({ nome: "Confira a gola", aviso: true, texto: "A gola começa antes da cava. Normalmente a gola começa depois." });
    passos.push({ nome: "Barra", de: 1, ate: barra, texto: `${W} agulhas, ${barra} carreiras de barra.` });
    passos.push({ nome: "Corpo reto", de: barra + 1, ate: cava0 - 1, texto: `${cava0 - 1 - barra} carreiras sem forma.` });
    passos.push({ nome: "Cava: arremate", de: cava0, ate: cava0, texto: `${arremC} agulhas de cada lado.` });
    if (evCava.length) passos.push({ nome: "Cava: diminuições", de: cava0 + evCava[0].off, ate: cava0 + evCava[evCava.length - 1].off, texto: `${resumoEventos(evCava, "−")}.` });
    passos.push({ nome: "Gola: arremate central", de: gola0, ate: gola0, texto: `${arremG} agulhas no centro. Daqui para cima os dois lados seguem separados.` });
    if (evGola.length) passos.push({ nome: "Gola: diminuições", de: gola0 + evGola[0].off, ate: gola0 + evGola[evGola.length - 1].off, texto: `${resumoEventos(evGola, "−")}.` });
    passos.push({ nome: "Ombro: malha parcial", de: ombro0, ate: H, texto: `${deg} degraus de ${degraus.join(", ")} agulhas, um a cada 2 carreiras.` });
    passos.push({ nome: "Arremate final", de: H, ate: H, texto: `Arremata ${Math.max(0, ombro)} agulhas em cada ombro.` });
    const resumo = `Começa com ${W} agulhas, fica com ${W - 2 * recuo} depois da cava e termina em 2 ombros de ${Math.max(0, ombro)} agulhas com uma gola de ${gola}. São ${recuo} agulhas tiradas de cada lado na cava e ${ladoGola} de cada lado da gola.`;
    return { W, H, linhas, passos, resumo };
  }

  function planoManga(p, porVez, dist) {
    const W = Math.max(8, Math.round(p.W)), H = Math.max(8, Math.round(p.H));
    const punho = limitar(Math.round(p.punho), 2, W);
    const barra = limitar(Math.round(p.barra), 0, H - 4);
    const copa = limitar(Math.round(p.copa), 4, H - barra - 2);
    const arremC = limitar(Math.round(p.arremCopa), 0, Math.floor(W / 4));
    const topo = limitar(Math.round(p.topo), 2, W - 2 * arremC);
    const copa0 = H - copa + 1;
    const aum = Math.floor((W - punho) / 2);
    const evAum = distribuir(aum, 1, Math.max(2, copa0 - 1 - barra));
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
    passos.push({ nome: "Punho", de: 1, ate: barra, texto: `${punho} agulhas, ${barra} carreiras de barra.` });
    if (evAum.length) passos.push({ nome: "Aumentos", de: barra + evAum[0].off, ate: barra + evAum[evAum.length - 1].off, texto: `${resumoEventos(evAum, "+")}.` });
    passos.push({ nome: "Copa: arremate", de: copa0, ate: copa0, texto: `${arremC} agulhas de cada lado.` });
    if (evCopa.length) passos.push({ nome: "Copa: diminuições", de: copa0 + evCopa[0].off, ate: copa0 + evCopa[evCopa.length - 1].off, texto: `${resumoEventos(evCopa, "−")}.` });
    passos.push({ nome: "Arremate final", de: H, ate: H, texto: `Arremata o topo da copa (${topo} agulhas).` });
    const resumo = `Começa no punho com ${punho} agulhas, ganha ${aum} de cada lado até ${punho + 2 * aum} na cava e fecha a copa em ${topo} agulhas.`;
    return { W, H, linhas, passos, resumo };
  }

  // forma: { tipo: "corpo" | "manga" | "painel", ... medidas em agulhas e carreiras }
  // opcoes: { porVez: agulhas tiradas por diminuição, marca: distância da marca até a borda }
  function planoForma(forma, opcoes = {}) {
    const porVez = limitar(Math.round(opcoes.porVez || 1), 1, 3);
    const marca = limitar(Math.round(opcoes.marca || 3), 1, 8);
    if (forma.tipo === "manga") return planoManga(forma, porVez, marca);
    if (forma.tipo === "corpo") return planoCorpo(forma, porVez, marca);
    return planoPainel(forma);
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
  function flutuacoes(px, W, ret, estrutura = "flutuacao", escada = 4) {
    const cores = coresDaArea(px, W, ret).map((c) => c.cor);
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
  function guiasIntarsia(px, W, ret) {
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
        trechos.push({ cor, x0: x, x1: x2 - 1 });
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

  // Listras de baixo para cima: [{ cor, carreiras }], repetidas até completar a altura.
  function gerarListras(w, h, listras) {
    const seq = [];
    for (const l of listras) for (let i = 0; i < Math.max(1, Math.round(l.carreiras)); i++) seq.push(l.cor);
    const px = new Uint8Array(w * h);
    if (!seq.length) return px;
    for (let c = 0; c < h; c++) px.fill(seq[c % seq.length], (h - 1 - c) * w, (h - c) * w);
    return px;
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

  // Coluna onde vai o valor da linha (a outra coluna mostra o número da linha).
  function colunaDoValor(bloco, k) {
    const cols = bloco.colunas[k];
    return cols ? (bloco.lado === "R" ? cols[1] : cols[0]) : null;
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

  // Pinta o valor na coluna de valor da linha, das linhas de cima yTopo até yBase (inclusive).
  function pintarValorNaLinha(doc, bloco, k, yTopo, yBase, valor) {
    const x = colunaDoValor(bloco, k);
    if (x === null) return 0;
    let n = 0;
    for (let y = Math.max(bloco.carreiraInicio, yTopo); y <= Math.min(bloco.carreiraFim, yBase); y++) {
      doc.pixels[y * doc.largura + x] = valor;
      n++;
    }
    return n;
  }

  // Altura do painel com as repetições do economizador (blocos marcados na R2).
  // repeticoes: { "yBase-yTopo": vezes }; sem número, conta 1 vez (como no desenho compactado).
  function desenvolvimento(doc, painel, repeticoes = {}) {
    const compactadas = painel.y1 - painel.y0 + 1;
    const blocos = painel.R && painel.R.colunas[2] ? faixasDaLinha(doc, painel.R, 2).filter((f) => !f.alterna) : [];
    let desenvolvidas = compactadas;
    const lista = blocos.map((f) => {
      const chave = `${f.yBase}-${f.yTopo}`;
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

  // ------------------------------------------------------------------ verificação

  // Códigos que tecem, segundo as referências públicas (frente, atrás, os dois, tuck, sem transferir,
  // frente e mover). Os outros (13 largura do guia, 16 sem seleção, transferências) não contam como malha.
  const TECE = new Set([1, 2, 3, 11, 12, 51, 52, 61, 71]);

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

  function verificarDesenho(doc, blocos, opcoes = {}) {
    const limite = opcoes.flutuacaoMaxima || 5;
    const H = doc.altura, W = doc.largura, px = doc.pixels;
    const itens = [];
    const lista = paineis(blocos);
    if (!lista.length) {
      itens.push({ nivel: "info", titulo: "Sem linhas de opção", texto: "Não foram encontrados blocos L1–L20 e R1–R20 neste desenho. As regras de guia-fio, ponto e cancelar malha precisam deles." });
      return itens;
    }
    const resumos = [];
    for (const p of lista) {
      if (!p.L || !p.R) {
        itens.push({ nivel: "aviso", titulo: `Bloco de linhas de opção sem par (painel ${p.numero})`, texto: "Achei só um lado (L ou R) deste painel. Confira se o outro lado está completo." });
        continue;
      }
      const semGuia = [], semPonto = [], cancelaComGuia = [], cancela = [], semLargura = [], soltos = [];
      let esquerda = Infinity, direita = -Infinity;
      for (let y = p.y0; y <= p.y1; y++) {
        let tece = false, tem13 = false, seguidos = 0, maior = 0;
        for (let x = p.x0; x <= p.x1; x++) {
          const v = px[y * W + x];
          if (TECE.has(v)) {
            tece = true;
            esquerda = Math.min(esquerda, x);
            direita = Math.max(direita, x);
          }
          if (v === 13) tem13 = true;
          seguidos = v === 16 ? seguidos + 1 : 0;
          maior = Math.max(maior, seguidos);
        }
        const tem = (k) => valoresDaLinha(doc, p.R, k, y).length > 0;
        const c = H - y;
        if (tece && !tem(3)) semGuia.push(c);
        if (tece && !tem(6)) semPonto.push(c);
        if (tem(5)) (tem(3) ? cancelaComGuia : cancela).push(c);
        if (tece && !tem13) semLargura.push(c);
        if (maior > limite) soltos.push(c);
      }
      const onde = (lista2) => ({ carreiras: intervalos(lista2), y: H - lista2[0], x0: p.x0, x1: p.x1, painel: p.numero });
      const nome = lista.length > 1 ? ` (painel ${p.numero})` : "";
      if (semGuia.length) itens.push({ nivel: "aviso", titulo: `Carreiras com malha e sem guia-fio (R3)${nome}`, texto: "Estas carreiras têm códigos de malha, mas a linha R3 está vazia. Pode ser que usem o guia da carreira anterior; confira no KnitPaint.", ...onde(semGuia) });
      if (semPonto.length) itens.push({ nivel: "aviso", titulo: `Carreiras com malha e sem número de ponto (R6)${nome}`, texto: "Sem R6 a carreira usa o ponto padrão da máquina. Confira se é isso que você quer.", ...onde(semPonto) });
      if (cancelaComGuia.length) itens.push({ nivel: "aviso", titulo: `Cancelar malha (R5) com guia-fio (R3)${nome}`, texto: "A carreira não tece, mas tem guia-fio. Confira se o guia deve passar nessa carreira.", ...onde(cancelaComGuia) });
      else if (cancela.length) itens.push({ nivel: "info", titulo: `Cancelar malha sem guia-fio: coerente${nome}`, texto: "Nas carreiras com R5 a malha é cancelada e a R3 está vazia: as agulhas só transferem ou esperam.", ...onde(cancela) });
      if (semLargura.length) itens.push({ nivel: "aviso", titulo: `Carreiras com malha sem a largura do guia-fio (13)${nome}`, texto: "O código 13 marca até onde o guia-fio vai. Estas carreiras tecem, mas não têm a marca na área do painel.", ...onde(semLargura) });
      if (soltos.length) itens.push({ nivel: "aviso", titulo: `Flutuações longas (16)${nome}`, texto: `Há mais de ${limite} agulhas seguidas sem seleção (16) na mesma carreira: o fio fica solto por trás.`, ...onde(soltos) });
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
          titulo: "Os painéis são diferentes",
          texto: `${resumos.map((r) => `Painel ${r.numero}: ${r.largura} agulhas de malha, ${r.carreiras} carreiras, R2 = ${r.r2}`).join(". ")}. Confira se é de propósito (por exemplo, peças de tamanhos diferentes).`,
          carreiras: "",
          y: ref.y0,
        });
      }
    }
    if (!itens.some((i) => i.nivel !== "info")) itens.push({ nivel: "info", titulo: "Nenhum problema encontrado", texto: "As regras de guia-fio, ponto, cancelar malha, largura do guia e flutuação passaram." });
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

  const SIMBOLOS = { 1: "frente", 51: "frente", 2: "tras", 52: "tras", 3: "ambos", 11: "tuck-frente", 12: "tuck-tras", 16: "flutua", 61: "mover-esq", 71: "mover-dir", 13: "guia" };
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
    const textos = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => semAcento(l).replace(/\s+$/, ""));
    const colunas = Math.max(1, ...textos.map((t) => t.length));
    const w = (2 * margem + colunas * 6 - 1) * k;
    const h = (2 * margem + textos.length * 9 - 2) * k;
    const px = new Uint8Array(w * h).fill(fundo);
    textos.forEach((t, l) => {
      [...t].forEach((letra, i) => {
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
    ESTILOS, calcularModelo, distribuir, resumoEventos, planoForma, pixelsDaForma,
    BIBLIOTECA, repetirMotivo,
    coresDaArea, flutuacoes, guiasIntarsia, gerarListras, gerarLosango,
    paineis, colunaDoValor, valoresDaLinha, faixasDaLinha, pintarValorNaLinha, desenvolvimento, desenharDesenvolvido,
    TECE, verificarDesenho, intervalos,
    tempoTecimento, tipoDePonto, semAcento, CAMPOS_FICHA, linhasDaFicha, FONTE, textoEmPixels,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.RecursosMalha = api;
})(typeof window !== "undefined" ? window : globalThis);
