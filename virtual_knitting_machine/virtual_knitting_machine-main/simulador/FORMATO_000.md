# O programa `.000` da Shima: o que já se sabe

A Shima Seiki não publica o formato do `.000`, o programa que o KnitPaint gera para a máquina. Este texto
junta o que foi descoberto comparando os arquivos da pasta `07 122 SSGsv`:

- `00_C_P.000` e `00_M_P.000`: dois programas do mesmo desenho, um por painel (203 e 199 agulhas);
- `00FE_BLS_ESTAMPA_ONÇA.dat`: o desenho de onde eles saíram;
- `00_C_P.QFD` e `00_M_P.QFD`: os ajustes do processamento.

Nada aqui vem do KnitPaint em si (nem do programa nem da documentação dele): só desses arquivos. O leitor
fica em `static/shima_arquivos.js` (`decifrarPrograma`), e os testes em `test_shima.js` conferem cada ponto
contra o desenho.

Marcas usadas abaixo: **✔** confere com o desenho nos dois arquivos; **~** provável, falta outro exemplo;
**?** ainda não se sabe.

Com um único desenho de exemplo, muita coisa só aparece com um valor. Para ir além, é preciso de mais
pares `.dat` + `.000` + `.QFD`, de preferência parecidos, com uma diferença pequena entre eles (outro
ponto, outro guia-fio, outra repetição, outra largura).

## Visão geral

| Posição | Conteúdo |
| --- | --- |
| `0x000` | texto `START\r`, linhas `CHAVE=valor\t\r` (F = nome do arquivo; S, I, C, T, M = ?) e `END\r` |
| depois | `Copyright SHIMA SEIKI KNICAD` e zeros |
| `0x1FF` | seções: cada uma começa por `80 00 02 <tipo>` e termina com zeros até a próxima |

As seções do exemplo, na ordem (as diferenças entre C e M estão só nas seções 4, 6, 7 e 8, e no nome no cabeçalho):

| Nº | Tipo | Tamanho | O que é | |
| --- | --- | --- | --- | --- |
| 1 | `AF` | 24 | ? | ? |
| 2 | `A1` | 155 descompactados | linhas do programa (2 linhas) | ~ |
| 3 | `A1` | 13 883 descompactados | linhas do programa (210 linhas) | ✔ |
| 4 | `F5` | 67 | repetições (economizador) | ✔ |
| 5 | `E8` | 534 | conjuntos de guias-fio | ✔ |
| 6 | `E2` | 52 | tabela de agulhas 1 | ✔ |
| 7 | `E2` | 88 | tabela de agulhas 2 | ~ |
| 8 | `B0` | 2018 (C) / 2025 (M) | padrão das agulhas | ✔ |
| 9–12 | `CC` | 69 cada | uma lista por guia-fio, 1 a 8; só 1, 4 e 8 marcados | ~ |
| 13 | `CD` | 69 | guias-fio usados: 1, 4 e 8 | ~ |
| 14 | `B5` | 175 | o mesmo da 13 e preenchimento `FF` | ? |

Quase todas as seções começam por `03 03` e terminam com `03 03 01`.

## Números

Números de um byte vêm em BCD: `0x64` = 64. Números de dois bytes guardam as centenas no nibble baixo do
primeiro byte e o resto em BCD no segundo; o nibble alto do primeiro é uma marca: `0x80` = agulha da
máquina, `0x40` = coluna do desenho. Exemplos: `80 11` = 11, `83 33` = 333, `41 83` = 183.
Os números das listas (repetição 1 a 31, guia-fio) usam `0x80` + o número em BCD: `81` = 1, `A9` = 29, `B1` = 31.

## Linhas do programa (tipo `A1`)

Compactadas: depois da marca vêm um `u32` little-endian com o tamanho descompactado e os dados em LZSS (o
mesmo do `.dat`). Descompactado:

- 19 bytes de cabeçalho: `03 03 C0 <n> …` (n = 0 na seção 3 e 1 na seção 2) e, no fim, 3 bytes que mudam
  entre as seções (`01 FD 0B` e `01 09 97`), não são soma nem CRC simples (?);
- uma linha de 66 bytes por passada do carro, em três blocos de 22 bytes que começam por `81`, `82` e `83`;
- `00 03 03 01` no fim.

No primeiro bloco (sistema 1), contando os bytes a partir de 0:

| Byte | Significado | |
| --- | --- | --- |
| 0 | `81` | ✔ |
| 3 | número do conjunto de guias-fio (seção `E8`); 0 = sem fio | ✔ |
| 5 | `04` no começo de um trecho (barra, corpo, repetição) | ~ |
| 6 | número do ponto: o valor do R6 do desenho | ✔ |
| 10, 11 | fim de um trecho que repete: número da repetição e quantas linhas voltar | ✔ |
| 14 | `70` nas passadas sem tecer | ~ |

No exemplo, a linha 63 tem `01 07` nos bytes 10 e 11: volta 7 linhas, até a 56, e repete as linhas 56 a 63
(as carreiras 216 a 223 do desenho, as do R2) pelo valor da repetição 1.

O segundo bloco muda com o que as agulhas fazem: no corpo, o byte 6 vale `01` em toda linha (tricotar na
frente) e o byte 9 vale `02` só nas carreiras ímpares, as que tricotam a ourela atrás (~). O terceiro bloco é
quase todo zero (?).

Linhas e carreiras do desenho no exemplo (painel C):

| Linhas | Carreiras | Ponto |
| --- | --- | --- |
| 1–32 | 187–190 e o começo automático do KnitPaint | vários |
| 33–40 | 191–198 (barra) | 14 |
| 41–42 | 199–200 (barra) | 17 |
| 43–199 | 203–359 (corpo) | 5 |
| 200–204 | 360–364 | 12 |
| 205–210 | 365 e o fim automático | — |

As carreiras de transferência 201 e 202 não têm linha própria (?).

## Repetições (tipo `F5`)

`03 03`, 31 pares (`0x80` + número da repetição em BCD, valor em BCD) e `03 03 01`. No exemplo só a
repetição 1 tem valor: 64 no painel C e 29 no M. Os `.QFD` guardam um a mais: 65 e 30 (registro 6, no byte
`0x1E` do registro). No desenho, o R2 dessas carreiras é 55 no painel C e 30 no M: o `.QFD` do C deve ter
sido mudado no processamento (~). Ainda não se sabe se a máquina tece o trecho 64 ou 65 vezes (?).

## Conjuntos de guias-fio (tipo `E8`)

`03 03` e, para cada conjunto, `80 <número>` seguido de 32 pares `<lado> <guia-fio>`: 16 com lado `10` e
16 com lado `20`. Cada linha do programa aponta um conjunto (byte 3 do primeiro bloco). No exemplo:

| Conjunto | Lado 1 | Lado 2 | Usado em |
| --- | --- | --- | --- |
| 1 | 8 (8 posições) | 8 (8 posições) | começo |
| 2, 3 | 8 | — | começo |
| 4, 7 | — | 8 | começo |
| 5 | 1 | 4 | começo e linha 200 |
| 6 | — | 1 | começo |
| 8 | 4 | — | barra e corpo (R3 = 4) ✔ |

Os guias-fio que as linhas usam (1, 4 e 8) são os mesmos marcados nas seções `CC` e `CD`. O 8 deve ser o
fio de separação do começo automático (~). O que são os dois lados e as 16 posições ainda não se sabe (?).

## Tabelas de agulhas (tipo `E2`)

O economizador de largura: dizem de onde vem cada agulha da máquina. Primeiro byte: número da tabela
(`81`, `82`). Depois, trechos de 12 bytes:

```
03 03 <tipo> <agulha inicial> <agulha final> <origem> <origem final> 00
```

- tipo `82`: as agulhas recebem as colunas do painel a partir de `<origem>` (a coluna 1 é a primeira depois
  das linhas de opção da esquerda; `<origem final>` fica `40 00`);
- tipo `88`: as agulhas repetem as agulhas da máquina `<origem>` a `<origem final>`.

Tabela 1 do painel C:

| Agulhas | Vêm de |
| --- | --- |
| 11–55 | colunas 1–45 |
| 56–63 | colunas 46–53 |
| 64–175 | repetem 56–63 (14 vezes a mais) |
| 176–333 | colunas 54–211 |

Ela sai de duas carreiras acima do painel no desenho (✔): a 367 tem 2 nas colunas que repetem (46 a 53) e 1
nas outras, e a 368 tem 14, quantas vezes a mais. O painel M tem as mesmas marcas.

A tabela 2 repete 4 colunas perto de cada borda (26–29 e 183–186 no C, 26–29 e 179–182 no M), também 14
vezes a mais. Não há marca dela no desenho: o KnitPaint monta sozinho; para que serve ainda não se sabe (?).

## Padrão (tipo `B0`)

Comprimido em corridas:

- um byte de contagem e o valor: `CB 90` = 203 vezes `0x90`;
- `FF`, n, n valores e quantas vezes o grupo se repete: `FF 04 98 58 D8 38 32` = `98 58 D8 38` 50 vezes.

O fim da seção perde os zeros (confundem-se com o preenchimento): um valor que falta vale 0.

Expandido:

- 14 valores de cabeçalho: `FC E3 07 80 00 01 00 80 00 80 01 xx yy 03`; só `xx yy` muda entre C e M
  (`14 08` e `4B D8`), e não é soma nem CRC-16 comum (?);
- as carreiras, cada uma com 5 valores de controle, um byte por agulha do painel e mais 5 (`03 … 03`);
- 2 valores no fim (`03 01`).

O exemplo tem 94 carreiras de 203 agulhas (C) e de 199 (M). As carreiras 12 a 88 são o corpo e batem com o
desenho (✔): `0x90` onde a carreira 203 tem o código 1 e `0x08` onde tem o 2 (a ourela).

O que cada bit quer dizer ainda não está fechado (~). O que encaixa até agora é cada carreira do padrão
servir a duas passadas do carro: bits 7, 6 e 5 para uma, bits 4, 3 e 2 para a outra, e a linha do programa
diz que bit cada operação usa (no corpo, tricotar na frente usa o 7 e o 4; a ourela atrás, o 3). Isso explica
a primeira carreira: `98 58 D8 38` é o 1-2-3-4 da carreira 187 (bits 7, 6, 7+6 e 5) junto do 3 da carreira 188
(bits 4 e 3). Mas o programa tem 193 linhas que usam padrão e só 188 lugares, então falta alguma coisa.

## O que falta para gerar um `.000`

- o significado dos outros bytes das linhas (direção do carro, velocidade, puxador, transferências);
- como o KnitPaint monta o começo e o fim automáticos (linhas 1–32 e 205–210 do exemplo);
- os bits do padrão e a ligação de cada linha com a carreira do padrão;
- o que são as seções 1, 9 a 14 e os bytes de conferência (cabeçalho das linhas e do padrão);
- se a máquina confere alguma soma: sem saber, um arquivo montado aqui pode ser recusado, ou pior, tecer
  errado. Nenhum `.000` feito fora do KnitPaint deve ir para a máquina sem um teste com fio barato e
  supervisão.
