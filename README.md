# Shima-maquina
Shima projeto

## Editor de arquivos Shima (.dat, .000, .QFD)

### No Windows: dois cliques em `Abrir Editor Shima.bat`

Baixe o repositório inteiro (no GitHub: **Code → Download ZIP**), descompacte e dê dois cliques em
**`Abrir Editor Shima.bat`**, na raiz da pasta.

- **Com Python instalado** (3.10 ou mais novo): abre uma janela preta e o editor no navegador. A lista da
  pasta `07 122 SSGsv` aparece à esquerda, e o **Salvar** grava direto nela (o original fica guardado
  como `.bak`). Deixe a janela preta aberta enquanto usa o editor; feche-a quando terminar.
- **Sem Python:** abre o `Editor Shima.html` (abaixo), e o **Salvar** baixa o arquivo.

### Sem instalar nada: abrir o `Editor Shima.html`

1. Baixe o arquivo **`Editor Shima.html`** (está na raiz deste repositório).
2. Dê dois cliques nele. Ele abre no navegador (Chrome, Edge ou Firefox), sem instalar nada.
3. No **Chrome** ou no **Edge**, clique em **Conectar uma pasta…** e escolha a pasta dos desenhos (por exemplo,
   `07 122 SSGsv`). Os arquivos aparecem na lista à esquerda, e o **Salvar** (Ctrl+S) grava direto na pasta,
   guardando o original como `<nome>.bak` na primeira vez. O navegador pede permissão para editar a pasta;
   da próxima vez, basta clicar em **Reconectar a pasta**.
4. Em outros navegadores, arraste os arquivos para a janela ou use **Abrir uma pasta inteira…**. Nesse caso o
   **Salvar** baixa o `.dat` (normalmente para a pasta Downloads), e você copia o arquivo para a pasta dos desenhos.

### Com o servidor do projeto (salva direto na pasta)

O editor fica em `virtual_knitting_machine/virtual_knitting_machine-main/simulador` e abre os arquivos da pasta
`virtual_knitting_machine/07 122 SSGsv`.

```
cd virtual_knitting_machine/virtual_knitting_machine-main
pip install -e .            (só na primeira vez; ou poetry install)
python simulador/servidor.py
```

Depois abra http://localhost:8000/editor.html no navegador. Para usar outra pasta: `--pasta "C:\caminho\da\pasta"`.

### O que dá para fazer no `.dat`

- Desenhar: lápis e borracha (1 a 9 px), linha, retângulo, balde, conta-gotas e **desenho espelhado** (simétrico).
- Seleção: mover, copiar, colar, espelhar, girar, repetir um motivo, **mudar o tamanho** sem criar cores novas.
- **Duplicar ou excluir carreiras e agulhas** da seleção, na largura ou altura inteira, levando junto as
  linhas de opção (como o inserir/apagar linha do KnitPaint).
- **Linhas de opção**: o editor reconhece os blocos L1–L20 e R1–R20 ao lado de cada painel, mostra no rodapé
  qual linha está sob o cursor e lista os valores da carreira apontada (R3 guia-fio, R5 cancelar malha,
  R6 ponto, segundo referências públicas: confira na sua versão).
- **Legenda das cores**: dê nome a cada número de cor; os nomes ficam guardados no navegador.
- **Destacar cor**: mostra só uma cor para achar onde ela aparece. Grade com linha forte a cada 10.
- Substituir cor, redimensionar, importar imagem, desfazer/refazer, exportar PNG.

### Desenvolver o modelo (recursos do KnitPaint)

No painel à direita, em **Desenvolver o modelo**, **Biblioteca de pontos** e **Linhas de opção**:

- **Modelo**: escolha o estilo (painel reto, gola careca, gola V, cardigã, regata, gola polo), a densidade
  da amostra (colunas e carreiras em 10 cm) e as medidas em cm; o editor calcula as agulhas e carreiras de
  cada peça.
- **Forma**: para cada peça, as diminuições e aumentos espalhados pelas carreiras, arremates, malha parcial
  dos ombros e marcas de diminuição, passo a passo. Cria um desenho novo com a forma ou cola no desenho
  aberto. Os códigos usados (malha, fora, arremate, malha parcial, diminuições) podem ser trocados.
- **Biblioteca de pontos e carimbo (K)**: trança, barra, links, rendado, flutuação, transferência e tuck.
  O carimbo põe o motivo com o canto de baixo à esquerda no clique e, arrastando, repete alinhado.
  **Repetir o motivo na seleção** em repetição normal ou em degraus. **Usar a cópia** e **Guardar motivo**
  criam os seus próprios motivos (ficam no navegador).
- **Símbolos**: com zoom de 800% ou mais, mostra o tipo de ponto de cada código (frente, atrás, tuck, sem
  seleção, mover).
- **Gerar padrão**: listras, losango (argyle) e texto em letras de pixels, como colagem.
- **Jacquard e intarsia**: fios soltos no avesso em flutuação, birdseye, escada ou tubular, com a maior
  flutuação marcada no desenho; quantos guia-fios a intarsia precisa e o mapa de cada um.
- **Uma linha de opção**: escolha o painel e a linha (L1–L20, R1–R20) para ver as faixas de valores por
  carreira, dar um nome à linha e **pintar um valor** de uma carreira até outra. O conta-gotas numa linha
  de opção a escolhe.
- **Verificar**: procura carreiras com malha sem guia-fio (R3) ou sem ponto (R6), cancelar malha (R5) com
  guia-fio, falta da largura do guia (13), flutuações longas (16) e painéis diferentes. Mostra as agulhas
  das duas fronturas com o carro passando, carreira a carreira.
- **Altura com repetições**: os blocos do economizador (R2) com quantas vezes cada um repete, a altura real
  e um desenho desenvolvido com as carreiras repetidas.
- **Simular malha**: prévia da malha (frente ou avesso, tipo de fio, cor pelo guia-fio ou pelo desenho).
- **Ficha técnica**: código, descrição, máquina, tempo, fio, pesos, data e fio de cada guia; estimativa do
  tempo de tecimento; baixa em `.txt` ou escreve a ficha no desenho em letras de pixels.

Os significados de códigos e linhas de opção vêm de referências públicas do KnitPaint e mudam entre
versões: os nomes aparecem com “?” e os códigos usados pelos recursos podem ser trocados.

O que o editor **não** faz: gerar o programa da máquina (`.000`) a partir do `.dat`. Isso é o
processamento do KnitPaint. Para isso use o KnitPaint ou o SDS KnitPaint-Online da Shima Seiki.

| Arquivo | O que é | No editor |
| --- | --- | --- |
| `.dat` | desenho do KnitPaint (SDS-ONE) | edição completa e gravação |
| `.000` | programa de tricô da máquina | consulta: cabeçalho, seções, linhas, comparação |
| `.QFD` | ajustes automáticos | consulta: registros, comparação |
| `.png` / `.jpg` | imagem | importação para dentro de um desenho |

Ao salvar na pasta, o arquivo original é guardado como `<nome>.bak` na primeira vez.
Teste sempre um arquivo gravado pelo editor no KnitPaint antes de mandar para a máquina: os formatos
não têm documentação oficial e foram descobertos analisando os arquivos.

Para converter um `.dat` em PNG sem abrir o editor: `python simulador/ler_dat_shima.py ARQUIVO.dat`.

O `Editor Shima.html` é gerado a partir de `simulador/static/editor.*`, `recursos_malha.js` (a lógica dos
recursos acima) e `editor_recursos.js` (os diálogos). Depois de mudar o editor, rode
`python simulador/gerar_editor_portatil.py` para atualizá-lo.

Testes: `python -m unittest` dentro de `simulador/` e `node --test simulador/test_shima.js`.
