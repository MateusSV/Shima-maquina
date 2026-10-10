// Leitura e gravação dos arquivos .dat de design da Shima Seiki (KnitPaint / SDS-ONE APEX).
//
// Mesmo formato descrito em simulador/ler_dat_shima.py:
//   arquivo:     0x40 bytes de cabeçalho ("SDS LZSS COMPRESS Ver 1.00"), tamanho descompactado (uint32 LE), dados em LZSS
//   descompactado:
//     0x004  x final e y final (uint16 LE) -> largura = x + 1, altura = y + 1
//     0x200  paleta: 256 bytes de R, 256 de G, 256 de B
//     0x600  pixels em pares (cor, repetições), linha de baixo primeiro, cada linha codificada separadamente
//
// Funciona no navegador (window.ShimaDat) e no Node (module.exports), para os testes.

(function (raiz) {
  "use strict";

  const ASSINATURA = "SDS LZSS COMPRESS";
  const N = 4096;          // tamanho da janela
  const F = 18;            // maior repetição
  const MINIMO = 3;        // menor repetição que vale a pena codificar
  const INICIO = N - F;    // posição inicial de escrita na janela
  const PALETA = 0x200;
  const PIXELS = 0x600;

  function descompactar(dados, tamanho) {
    const janela = new Uint8Array(N);
    const saida = new Uint8Array(tamanho);
    let r = INICIO, i = 0, o = 0, flags = 0;
    while (i < dados.length && o < tamanho) {
      flags >>= 1;
      if (!(flags & 0x100)) {
        flags = dados[i++] | 0xff00;
        if (i >= dados.length) break;
      }
      if (flags & 1) {
        const c = dados[i++];
        saida[o++] = c;
        janela[r] = c;
        r = (r + 1) & (N - 1);
      } else {
        if (i + 1 >= dados.length) break;
        const a = dados[i], b = dados[i + 1];
        i += 2;
        const posicao = a | ((b & 0xf0) << 4);
        const comprimento = (b & 0x0f) + MINIMO;
        for (let k = 0; k < comprimento && o < tamanho; k++) {
          const c = janela[(posicao + k) & (N - 1)];
          saida[o++] = c;
          janela[r] = c;
          r = (r + 1) & (N - 1);
        }
      }
    }
    if (o < tamanho) throw new Error(`Arquivo truncado: ${o} de ${tamanho} bytes descompactados.`);
    return saida;
  }

  // Compactador guloso com cadeias de hash. Só referencia bytes já escritos e a no máximo N - F de distância,
  // para que a cópia byte a byte do descompactador nunca sobrescreva a origem antes de lê-la.
  function compactar(dados) {
    const saida = [];
    const cabeca = new Int32Array(1 << 16).fill(-1);
    const anterior = new Int32Array(dados.length).fill(-1);
    const hash = (j) => ((dados[j] << 8) ^ (dados[j + 1] << 4) ^ dados[j + 2]) & 0xffff;
    const inserir = (j) => {
      if (j + 2 >= dados.length) return;
      const h = hash(j);
      anterior[j] = cabeca[h];
      cabeca[h] = j;
    };

    let i = 0;
    while (i < dados.length) {
      const posFlags = saida.length;
      saida.push(0);
      let flags = 0;
      for (let bit = 0; bit < 8 && i < dados.length; bit++) {
        let melhor = 0, origem = -1;
        if (i + 2 < dados.length) {
          let candidato = cabeca[hash(i)];
          for (let tentativas = 0; candidato >= 0 && tentativas < 256; tentativas++) {
            if (i - candidato > N - F) break;
            let n = 0;
            const limite = Math.min(F, dados.length - i);
            while (n < limite && dados[candidato + n] === dados[i + n]) n++;
            if (n > melhor) {
              melhor = n;
              origem = candidato;
              if (n === F) break;
            }
            candidato = anterior[candidato];
          }
        }
        if (melhor >= MINIMO) {
          const p = (INICIO + origem) & (N - 1);
          saida.push(p & 0xff, ((p >> 4) & 0xf0) | (melhor - MINIMO));
          for (let k = 0; k < melhor; k++) inserir(i + k);
          i += melhor;
        } else {
          flags |= 1 << bit;
          saida.push(dados[i]);
          inserir(i);
          i++;
        }
      }
      saida[posFlags] = flags;
    }
    return Uint8Array.from(saida);
  }

  function texto(bytes, inicio, fim) {
    let s = "";
    for (let j = inicio; j < fim && bytes[j]; j++) s += String.fromCharCode(bytes[j]);
    return s;
  }

  // Lê um .dat. Devolve os pixels com a linha de cima primeiro (como na tela).
  function ler(buffer) {
    const bruto = new Uint8Array(buffer);
    const assinatura = texto(bruto, 0, 0x40);
    if (!assinatura.startsWith(ASSINATURA)) {
      throw new Error("Este arquivo não é um .dat compactado da Shima Seiki (falta a assinatura SDS LZSS).");
    }
    const visao = new DataView(bruto.buffer, bruto.byteOffset, bruto.byteLength);
    const tamanho = visao.getUint32(0x40, true);
    const dados = descompactar(bruto.subarray(0x44), tamanho);
    const d = new DataView(dados.buffer);
    const largura = d.getUint16(4, true) + 1;
    const altura = d.getUint16(6, true) + 1;

    const paleta = [];
    for (let c = 0; c < 256; c++) paleta.push([dados[PALETA + c], dados[PALETA + 0x100 + c], dados[PALETA + 0x200 + c]]);

    const total = largura * altura;
    const deBaixo = new Uint8Array(total);
    let o = 0;
    for (let j = PIXELS; j + 1 < dados.length && o < total; j += 2) {
      deBaixo.fill(dados[j], o, Math.min(total, o + dados[j + 1]));
      o += dados[j + 1];
    }
    if (o < total) throw new Error(`Faltam pixels: esperado ${total}, lido ${o}.`);

    const pixels = new Uint8Array(total);
    for (let y = 0; y < altura; y++) {
      pixels.set(deBaixo.subarray(y * largura, (y + 1) * largura), (altura - 1 - y) * largura);
    }
    return {
      assinatura,
      cabecalho: bruto.slice(0, 0x40),
      meta: dados.slice(0, PIXELS),
      largura,
      altura,
      paleta,
      pixels,
    };
  }

  // Grava o documento no mesmo formato. Cabeçalho e área de configurações (0x000–0x5FF) são preservados.
  function gravar(doc) {
    const { largura, altura, pixels } = doc;
    const meta = doc.meta.slice();
    const m = new DataView(meta.buffer);
    m.setUint16(4, largura - 1, true);
    m.setUint16(6, altura - 1, true);
    for (let c = 0; c < 256; c++) {
      meta[PALETA + c] = doc.paleta[c][0];
      meta[PALETA + 0x100 + c] = doc.paleta[c][1];
      meta[PALETA + 0x200 + c] = doc.paleta[c][2];
    }

    const pares = [];
    for (let y = altura - 1; y >= 0; y--) {
      const linha = pixels.subarray(y * largura, (y + 1) * largura);
      let x = 0;
      while (x < largura) {
        const cor = linha[x];
        let n = 1;
        while (x + n < largura && n < 255 && linha[x + n] === cor) n++;
        pares.push(cor, n);
        x += n;
      }
    }
    const dados = new Uint8Array(PIXELS + pares.length);
    dados.set(meta, 0);
    dados.set(pares, PIXELS);

    const compactado = compactar(dados);
    const arquivo = new Uint8Array(0x44 + compactado.length);
    arquivo.set(doc.cabecalho, 0);
    new DataView(arquivo.buffer).setUint32(0x40, dados.length, true);
    arquivo.set(compactado, 0x44);
    return arquivo;
  }

  // Documento novo, em branco, com a paleta e as configurações de um documento de referência.
  function novo(largura, altura, referencia) {
    const cabecalho = new Uint8Array(0x40);
    for (let j = 0; j < "SDS LZSS COMPRESS Ver 1.00".length; j++) cabecalho[j] = "SDS LZSS COMPRESS Ver 1.00".charCodeAt(j);
    return {
      assinatura: "SDS LZSS COMPRESS Ver 1.00",
      cabecalho: referencia ? referencia.cabecalho.slice() : cabecalho,
      meta: referencia ? referencia.meta.slice() : new Uint8Array(PIXELS),
      largura,
      altura,
      paleta: referencia ? referencia.paleta.map((c) => c.slice()) : paletaPadrao(),
      pixels: new Uint8Array(largura * altura),
    };
  }

  function paletaPadrao() {
    const p = [];
    for (let c = 0; c < 256; c++) p.push([(c * 37) & 255, (c * 91) & 255, (c * 157) & 255]);
    return p;
  }

  const api = { ler, gravar, novo, compactar, descompactar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ShimaDat = api;
})(typeof window !== "undefined" ? window : globalThis);
