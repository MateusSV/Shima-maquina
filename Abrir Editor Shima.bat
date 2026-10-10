@echo off
rem Abre o Editor Shima no navegador.
rem  - Com Python instalado: liga o servidor do projeto e o "Salvar" grava direto na pasta
rem    "virtual_knitting_machine\07 122 SSGsv" (o original fica guardado como .bak).
rem  - Sem Python: abre o "Editor Shima.html"; o "Salvar" baixa o arquivo para a pasta Downloads.
rem Deixe este arquivo na pasta do projeto, ao lado do "Editor Shima.html".

title Editor Shima
cd /d "%~dp0"
set "SERVIDOR=virtual_knitting_machine\virtual_knitting_machine-main\simulador\servidor.py"
set "PORTA=8765"
set "PYTHONIOENCODING=utf-8"

set "PY="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python"
if not defined PY (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3"
)

if not defined PY goto SEM_SERVIDOR
if not exist "%SERVIDOR%" goto SEM_SERVIDOR

echo.
echo  Editor Shima
echo  ------------
echo  O editor vai abrir no navegador: http://localhost:%PORTA%/editor.html
echo  O "Salvar" grava direto na pasta "virtual_knitting_machine\07 122 SSGsv".
echo.
echo  Deixe esta janela aberta enquanto usa o editor.
echo  Quando terminar, feche esta janela.
echo.
%PY% "%SERVIDOR%" --porta %PORTA% --abrir
if errorlevel 1 (
  echo.
  echo  O servidor nao conseguiu iniciar. Abrindo a versao sem servidor...
  start "" "%~dp0Editor Shima.html"
  pause
)
exit /b

:SEM_SERVIDOR
if not exist "%~dp0Editor Shima.html" (
  echo  Nao encontrei o arquivo "Editor Shima.html" ao lado deste .bat.
  pause
  exit /b 1
)
start "" "%~dp0Editor Shima.html"
exit /b
