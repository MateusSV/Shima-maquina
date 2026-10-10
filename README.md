# Shima-maquina
Shima projeto

## Editor de arquivos Shima (.dat, .000, .QFD)

### Jeito mais simples: abrir no computador

1. Baixe o arquivo **`Editor Shima.html`** (está na raiz deste repositório).
2. Dê dois cliques nele. Ele abre no navegador (Chrome, Edge ou Firefox), sem instalar nada.
3. Arraste os arquivos `.dat`, `.000`, `.QFD` ou `.png` para a janela, ou use **Abrir uma pasta inteira…**
   para abrir todos os arquivos de uma pasta como `07 122 SSGsv`.
4. Para gravar, use **Salvar** (Ctrl+S): o navegador baixa o `.dat` editado, normalmente para a pasta
   Downloads. Copie o arquivo de lá para a pasta dos desenhos.

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
