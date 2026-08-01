@echo off
setlocal
cd /d "%~dp0"

set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%CODEX_NODE%" goto use_codex_node

where node >nul 2>nul
if not errorlevel 1 goto use_path_node

echo Node.js was not found.
echo Please start this from Codex, or install Node.js.
pause
exit /b 1

:use_codex_node
start "" "http://127.0.0.1:8765/"
"%CODEX_NODE%" admin\server.js
pause
exit /b

:use_path_node
start "" "http://127.0.0.1:8765/"
node admin\server.js
pause
exit /b
