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

O `Editor Shima.html` é gerado a partir de `simulador/static/editor.*`. Depois de mudar o editor, rode
`python simulador/gerar_editor_portatil.py` para atualizá-lo.

Testes: `python -m unittest` dentro de `simulador/` e `node --test simulador/test_shima.js`.
