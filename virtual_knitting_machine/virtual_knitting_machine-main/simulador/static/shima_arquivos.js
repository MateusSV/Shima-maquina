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

  const api = { abrir, tipoDoArquivo, tipoPeloNome, lerPrograma, lerAjustes, textos, hex, linhasHex };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ShimaArquivos = api;
})(typeof window !== "undefined" ? window : globalThis);
