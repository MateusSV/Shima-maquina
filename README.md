# Shima-maquina
Shima projeto

## Editor de arquivos Shima (.dat, .000, .QFD)

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

Testes: `python -m unittest` dentro de `simulador/` e `node --test simulador/test_shima.js`.
