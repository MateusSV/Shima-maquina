// Leitura (somente) dos outros arquivos que acompanham um desenho da Shima Seiki:
//   .000  programa de tricô gerado pelo KnitPaint para a máquina ("Copyright SHIMA SEIKI KNICAD")
//   .QFD  ajustes automáticos ("AUTOMATIC SETTINGS REV 4.")
//
// Não há documentação oficial desses formatos. O que está aqui foi descoberto analisando
// os arquivos da pasta "07 122 SSGsv":
//
// .000
//   0x000  texto "START\r" + linhas "CHAVE=valor\t\r" até "END\r" (F = nome do arquivo, S, I, C, T, M)
//   ...    "Copyright SHIMA SEIKI KNICAD"
//   0x1FF  seções, cada uma começando por 80 00 02 <tipo>, separadas por zeros.
//          Tipo 0xA1: compactada. u32 LE com o tamanho descompactado e, em seguida, LZSS (o mesmo do .dat).
//          O conteúdo descompactado tem 19 bytes de cabeçalho, linhas de 66 bytes e 4 bytes de fechamento.
//          Cada linha tem três blocos de 22 bytes que começam por 0x81, 0x82 e 0x83 (um por sistema do carro).
//          Repetições, guias-fio, tabelas de agulhas e padrão: decifrarPrograma, mais abaixo, e FORMATO_000.md.
//
// .QFD
//   0x00   texto "AUTOMATIC SETTINGS REV  4."
//   0x20   registros: "QFD4", u32 número, u32 tamanho total do registro, conteúdo.
//
// Funciona no navegador (window.ShimaArquivos) e no Node (module.exports).

(function (raiz) {
  "use strict";

  const ShimaDat = typeof module !== "undefined" && module.exports ? require("./shima_dat.js") : raiz.ShimaDat;

  const MARCA_SECAO = [0x80, 0x00, 0x02];
  const SECAO_COMPACTADA = 0xa1;
  const CABECALHO_LINHAS = 19;
  const TAMANHO_LINHA = 66;
  const TAMANHO_SISTEMA = 22;

  function texto(bytes, inicio, fim) {
    let s = "";
    for (let j = inicio; j < fim; j++) s += String.fromCharCode(bytes[j]);
    return s;
  }

  // Trechos de texto ASCII legível com pelo menos `minimo` caracteres (como o comando strings).
  function textos(bytes, minimo = 4) {
    const achados = [];
    let inicio = -1;
    for (let j = 0; j <= bytes.length; j++) {
      const c = j < bytes.length ? bytes[j] : 0;
      const legivel = c >= 0x20 && c < 0x7f;
      if (legivel && inicio < 0) inicio = j;
      if (!legivel && inicio >= 0) {
        if (j - inicio >= minimo) achados.push({ posicao: inicio, texto: texto(bytes, inicio, j) });
        inicio = -1;
      }
    }
    return achados;
  }

  // Tipo pela extensão (lista da pasta, antes de ler o arquivo).
  function tipoPeloNome(nome) {
    const ext = (nome.split(".").pop() || "").toLowerCase();
    if (ext === "dat") return "dat";
    if (ext === "qfd") return "ajustes";
    if (/^\d{3}$/.test(ext)) return "programa";
    return "desconhecido";
  }

  // Tipo pelo conteúdo; a extensão só decide quando o começo do arquivo não diz nada.
  function tipoDoArquivo(nome, bytes) {
    const inicio = texto(bytes, 0, Math.min(32, bytes.length));
    if (inicio.startsWith("SDS LZSS COMPRESS")) return "dat";
    if (inicio.startsWith("START")) return "programa";
    if (inicio.startsWith("AUTOMATIC SETTINGS")) return "ajustes";
    return tipoPeloNome(nome);
  }

  // ----- .000 -----

  function lerCabecalhoPrograma(bytes) {
    const campos = [];
    const fimTexto = Math.min(bytes.length, 0x200);
    // O cabeçalho vai até a linha END (um nome como F=LEGEND.000 também tem "END"); sem ela, não há campos.
    const linhas = texto(bytes, 0, fimTexto).split(/\r\n?|\n/);
    const fim = linhas.findIndex((linha) => linha.trim() === "END");
    for (const linha of linhas.slice(0, Math.max(0, fim))) {
      const igual = linha.indexOf("=");
      if (igual > 0) campos.push({ chave: linha.slice(0, igual), valor: linha.slice(igual + 1).replace(/\t/g, "") });
    }
    const copyright = textos(bytes.subarray(0, fimTexto)).find((t) => t.texto.startsWith("Copyright"));
    return { campos, copyright: copyright ? copyright.texto : "" };
  }

  function acharSecoes(bytes) {
    const inicios = [];
    for (let j = 0x100; j + 3 < bytes.length; j++) {
      if (bytes[j] !== MARCA_SECAO[0] || bytes[j + 1] !== MARCA_SECAO[1] || bytes[j + 2] !== MARCA_SECAO[2]) continue;
      // Toda seção vem depois de bytes zerados (o preenchimento da seção anterior).
      let zeros = true;
      for (let k = Math.max(0, j - 4); k < j; k++) if (bytes[k] !== 0) zeros = false;
      if (zeros) inicios.push(j);
    }
    return inicios.map((inicio, n) => {
      const proxima = n + 1 < inicios.length ? inicios[n + 1] : bytes.length;
      let fim = proxima;
      while (fim > inicio + 4 && bytes[fim - 1] === 0) fim--;
      const secao = { numero: n + 1, inicio, fim, tamanho: fim - inicio, tipo: bytes[inicio + 3], compactada: false };
      if (secao.tipo === SECAO_COMPACTADA && inicio + 8 <= bytes.length) {
        const tamanho = new DataView(bytes.buffer, bytes.byteOffset + inicio + 4, 4).getUint32(0, true);
        try {
          secao.dados = ShimaDat.descompactar(bytes.subarray(inicio + 8, proxima), tamanho);
          secao.compactada = true;
          secao.linhas = lerLinhas(secao.dados);
        } catch (erro) {
          secao.erro = String(erro.message || erro);
        }
      }
      if (!secao.dados) secao.dados = bytes.slice(inicio + 4, fim);
      return secao;
    });
  }

  function lerLinhas(dados) {
    const total = Math.floor((dados.length - CABECALHO_LINHAS) / TAMANHO_LINHA);
    const linhas = [];
    for (let n = 0; n < total; n++) {
      const inicio = CABECALHO_LINHAS + n * TAMANHO_LINHA;
      const sistemas = [0, 1, 2].map((s) => dados.slice(inicio + s * TAMANHO_SISTEMA, inicio + (s + 1) * TAMANHO_SISTEMA));
      if (sistemas[0][0] !== 0x81 || sistemas[1][0] !== 0x82 || sistemas[2][0] !== 0x83) return null;
      linhas.push(sistemas);
    }
    return linhas;
  }

  function lerPrograma(buffer) {
    const bytes = new Uint8Array(buffer);
    return { tipo: "programa", tamanho: bytes.length, ...lerCabecalhoPrograma(bytes), secoes: acharSecoes(bytes), bytes };
  }

  // ----- .000: o que já foi decifrado de cada seção -----
  // Descoberto comparando 00_C_P.000 e 00_M_P.000 (painéis de 203 e 199 agulhas) com o desenho
  // 00FE_BLS_ESTAMPA_ONÇA.dat e com os .QFD. Detalhes e o que falta em simulador/FORMATO_000.md.

  const TIPO_REPETICOES = 0xf5;
  const TIPO_GUIAS = 0xe8;
  const TIPO_AGULHAS = 0xe2;
  const TIPO_PADRAO = 0xb0;

  // Nome de cada tipo de seção (o 4º byte da marca 80 00 02 <tipo>); "?" = ainda não decifrado.
  const NOMES_SECOES = {
    0xaf: "início (?)",
    0xa1: "linhas do programa",
    0xf5: "repetições (economizador)",
    0xe8: "conjuntos de guias-fio",
    0xe2: "tabela de agulhas",
    0xb0: "padrão das agulhas",
    0xcc: "guias-fio por trilho (?)",
    0xcd: "guias-fio usados (?)",
    0xb5: "guias-fio usados (?)",
  };

  function nomeDaSecao(secao) {
    return NOMES_SECOES[secao.tipo] || "?";
  }

  const bcd = (b) => (b >> 4) * 10 + (b & 0x0f);
  const ehBcd = (b) => b >> 4 <= 9 && (b & 0x0f) <= 9;
  // Números de dois bytes: centenas no nibble baixo do primeiro byte (o alto é uma marca: 0x80 agulha da
  // máquina, 0x40 coluna do desenho) e o resto em BCD no segundo. "83 33" = 333, "41 83" = 183.
  const numero2 = (alto, baixo) => (alto & 0x0f) * 100 + bcd(baixo);

  // Repetições (0xF5): 03 03, 31 pares (0x80 + número em BCD, valor em BCD) e 03 03 01.
  // O valor é o da repetição usada no R2 do desenho; no .QFD fica um a mais (65 no .QFD, 64 aqui).
  function lerRepeticoes(dados) {
    const lista = [];
    for (let j = 2; j + 1 < dados.length && dados[j] !== 0x03; j += 2) {
      lista.push({ numero: bcd(dados[j] & 0x7f), valor: ehBcd(dados[j + 1]) ? bcd(dados[j + 1]) : dados[j + 1] });
    }
    return lista;
  }

  // Conjuntos de guias-fio (0xE8): 03 03 e, para cada conjunto, 80 <número> e 32 pares
  // (0x10 ou 0x20 = lado, guia-fio; 16 posições por lado). Cada linha do programa diz qual conjunto usa.
  function lerConjuntosDeGuias(dados) {
    const conjuntos = [];
    let j = 2;
    while (j + 1 < dados.length && dados[j] === 0x80) {
      const conjunto = { numero: dados[j + 1], guias: [] };
      j += 2;
      for (let posicao = 0; j + 1 < dados.length && (dados[j] === 0x10 || dados[j] === 0x20); posicao++, j += 2) {
        if (dados[j + 1]) conjunto.guias.push({ lado: dados[j] >> 4, posicao: posicao % 16, guia: dados[j + 1] });
      }
      conjuntos.push(conjunto);
    }
    return conjuntos;
  }

  // Tabela de agulhas (0xE2): número da tabela (0x81, 0x82…) e trechos de 12 bytes
  // 03 03 <tipo> <agulha inicial> <agulha final> <origem> <origem final> 00, até 03 03 01.
  // Tipo 0x82: as agulhas da máquina recebem as colunas do desenho a partir de <origem>.
  // Tipo 0x88: as agulhas repetem as agulhas da máquina <origem>…<origem final> (economizador de largura).
  function lerTabelaAgulhas(dados) {
    const tabela = { numero: dados[0] & 0x0f, trechos: [] };
    for (let j = 1; j + 11 < dados.length && dados[j] === 0x03 && dados[j + 1] === 0x03; j += 12) {
      const tipo = dados[j + 2];
      const n = (k) => numero2(dados[j + k], dados[j + k + 1]);
      tabela.trechos.push({ tipo: tipo === 0x88 ? "repete" : tipo === 0x82 ? "copia" : `0x${tipo.toString(16)}`, de: n(3), ate: n(5), origem: n(7), origemFim: n(9) });
    }
    return tabela;
  }

  // Padrão (0xB0): comprimido em corridas. Um byte de contagem e o valor; 0xFF, n, n valores e a
  // contagem de vezes que o grupo se repete. Expandido: 14 valores de cabeçalho, as carreiras
  // (5 valores de controle, um byte por agulha e mais 5) e 2 valores no fim.
  const CABECALHO_PADRAO = 14;
  const BORDA_PADRAO = 5;
  const FIM_PADRAO = 2;

  const LIMITE_PADRAO = 16_000_000; // valores expandidos; um arquivo estragado não pode travar a página

  function expandirPadrao(dados) {
    const valores = [];
    // O fim da seção perde os zeros (são o preenchimento até a próxima): um valor que falta é 0.
    const em = (k) => (k < dados.length ? dados[k] : 0);
    for (let j = 0; j < dados.length; ) {
      if (valores.length > LIMITE_PADRAO) throw new Error("padrão grande demais");
      if (dados[j] === 0xff) {
        const n = em(j + 1);
        const grupo = Array.from({ length: n }, (_, k) => em(j + 2 + k));
        for (let vez = em(j + 2 + n); vez > 0; vez--) valores.push(...grupo);
        j += 3 + n;
      } else {
        for (let vez = dados[j]; vez > 0; vez--) valores.push(em(j + 1));
        j += 2;
      }
    }
    return valores;
  }

  function lerPadrao(dados) {
    const valores = expandirPadrao(dados);
    const util = valores.length - CABECALHO_PADRAO - FIM_PADRAO;
    // A largura é a que faz toda carreira começar e terminar pelo valor 03.
    for (let passo = 2 * BORDA_PADRAO + 1; passo <= util; passo++) {
      if (util % passo) continue;
      let encaixa = true;
      for (let s = CABECALHO_PADRAO; s < CABECALHO_PADRAO + util && encaixa; s += passo) encaixa = valores[s] === 3 && valores[s + passo - 1] === 3;
      if (!encaixa) continue;
      const largura = passo - 2 * BORDA_PADRAO;
      const carreiras = [];
      for (let s = CABECALHO_PADRAO; s < CABECALHO_PADRAO + util; s += passo) {
        carreiras.push({
          antes: valores.slice(s, s + BORDA_PADRAO),
          agulhas: Uint8Array.from(valores.slice(s + BORDA_PADRAO, s + BORDA_PADRAO + largura)),
          depois: valores.slice(s + BORDA_PADRAO + largura, s + passo),
        });
      }
      return { cabecalho: valores.slice(0, CABECALHO_PADRAO), largura, carreiras, fim: valores.slice(valores.length - FIM_PADRAO) };
    }
    throw new Error("não foi possível achar a largura das carreiras do padrão");
  }

  // O que já se sabe de uma linha do programa (uma passada do carro), pelo bloco do sistema 1.
  function descreverLinha(sistemas) {
    const s1 = sistemas[0];
    return {
      conjunto: s1[3], // conjunto de guias-fio (seção 0xE8); 0 = sem fio
      ponto: s1[6], // número do ponto: o valor do R6 no desenho; 0 = nenhum
      repeticao: s1[10] ? { numero: s1[10], voltar: s1[11] } : null, // fim de um trecho que repete
    };
  }

  // Resumo do que foi decifrado de um programa já lido (lerPrograma).
  function decifrarPrograma(programa) {
    const secoes = programa.secoes;
    const daSecao = (tipo, ler) => {
      const s = secoes.find((x) => x.tipo === tipo);
      if (!s) return null;
      try {
        return ler(s.dados);
      } catch (erro) {
        return null;
      }
    };
    const principal = secoes.filter((s) => s.linhas && s.linhas.length).sort((a, b) => b.linhas.length - a.linhas.length)[0] || null;
    const repeticoes = daSecao(TIPO_REPETICOES, lerRepeticoes) || [];
    const conjuntos = daSecao(TIPO_GUIAS, lerConjuntosDeGuias) || [];
    const tabelas = secoes.filter((s) => s.tipo === TIPO_AGULHAS).map((s) => lerTabelaAgulhas(s.dados));
    const padrao = daSecao(TIPO_PADRAO, lerPadrao);
    const linhas = principal ? principal.linhas.map(descreverLinha) : [];

    const pontos = new Map();
    const usados = new Set();
    const blocos = [];
    linhas.forEach((l, i) => {
      if (l.ponto) pontos.set(l.ponto, (pontos.get(l.ponto) || 0) + 1);
      if (l.conjunto) usados.add(l.conjunto);
      if (l.repeticao) {
        const r = repeticoes.find((x) => x.numero === l.repeticao.numero);
        blocos.push({ numero: l.repeticao.numero, de: i + 1 - l.repeticao.voltar, ate: i + 1, valor: r ? r.valor : null });
      }
    });
    const guias = new Set();
    for (const c of conjuntos) if (usados.has(c.numero)) for (const g of c.guias) guias.add(g.guia);
    const tabela = tabelas[0];
    const agulhas = tabela && tabela.trechos.length ? { de: tabela.trechos[0].de, ate: tabela.trechos[tabela.trechos.length - 1].ate } : null;
    return {
      secaoLinhas: principal,
      linhas,
      pontos: [...pontos].sort((a, b) => a[0] - b[0]).map(([ponto, linhasComEle]) => ({ ponto, linhas: linhasComEle })),
      guias: [...guias].sort((a, b) => a - b),
      conjuntos,
      repeticoes,
      blocos,
      tabelas,
      agulhas,
      padrao,
    };
  }

  // ----- .QFD -----

  function lerAjustes(buffer) {
    const bytes = new Uint8Array(buffer);
    const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const titulo = texto(bytes, 0, 0x20).replace(/\0+$/, "").trim();
    const registros = [];
    let j = 0x20;
    while (j + 12 <= bytes.length && texto(bytes, j, j + 4) === "QFD4") {
      const numero = visao.getUint32(j + 4, true);
      const tamanho = visao.getUint32(j + 8, true);
      if (tamanho < 12 || j + tamanho > bytes.length) break;
      const conteudo = bytes.slice(j + 12, j + tamanho);
      registros.push({ numero, inicio: j, tamanho, conteudo, textos: textos(conteudo) });
      j += tamanho;
    }
    return { tipo: "ajustes", tamanho: bytes.length, titulo, registros, resto: bytes.length - j, bytes };
  }

  // ----- comum -----

  function hex(bytes, inicio = 0, fim = bytes.length) {
    const partes = [];
    for (let j = inicio; j < fim; j++) partes.push(bytes[j].toString(16).padStart(2, "0"));
    return partes.join(" ");
  }

  // Linhas no estilo "od": posição, 16 bytes em hexadecimal e o texto legível.
  function linhasHex(bytes, inicio = 0, quantidade = Infinity) {
    const linhas = [];
    for (let j = inicio - (inicio % 16); j < bytes.length && linhas.length < quantidade; j += 16) {
      const fim = Math.min(j + 16, bytes.length);
      let legivel = "";
      for (let k = j; k < fim; k++) legivel += bytes[k] >= 0x20 && bytes[k] < 0x7f ? String.fromCharCode(bytes[k]) : ".";
      linhas.push({ posicao: j, hex: hex(bytes, j, fim), texto: legivel });
    }
    return linhas;
  }

  function abrir(nome, buffer) {
    const bytes = new Uint8Array(buffer);
    const tipo = tipoDoArquivo(nome, bytes);
    if (tipo === "dat") return { tipo, nome, doc: ShimaDat.ler(buffer) };
    if (tipo === "programa") return { nome, ...lerPrograma(buffer) };
    if (tipo === "ajustes") return { nome, ...lerAjustes(buffer) };
    return { tipo, nome, tamanho: bytes.length, bytes, textos: textos(bytes) };
  }

  const api = {
    abrir,
    tipoDoArquivo,
    tipoPeloNome,
    lerPrograma,
    lerAjustes,
    textos,
    hex,
    linhasHex,
    nomeDaSecao,
    lerRepeticoes,
    lerConjuntosDeGuias,
    lerTabelaAgulhas,
    expandirPadrao,
    lerPadrao,
    descreverLinha,
    decifrarPrograma,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ShimaArquivos = api;
})(typeof window !== "undefined" ? window : globalThis);
