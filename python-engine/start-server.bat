@echo off
REM Script para iniciar el servidor Python de SynBio-LLVM
REM Windows nativo - No requiere Docker

echo.
echo ========================================
echo   SynBio-LLVM Python Engine
echo   Iniciando servidor local...
echo ========================================
echo.

REM Buscar Python en el sistema
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python no encontrado en PATH
    echo Por favor instala Python 3.9+ desde python.org
    pause
    exit /b 1
)

REM Verificar version de Python
python --version
echo.

REM Ir al directorio del script
cd /d "%~dp0"

REM Verificar si existe venv
if not exist ".venv" (
    echo [INFO] Creando entorno virtual...
    python -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] No se pudo crear el entorno virtual
        pause
        exit /b 1
    )
)

REM Activar entorno virtual
echo [INFO] Activando entorno virtual...
call .venv\Scripts\activate.bat

REM Instalar dependencias si no estan instaladas
if not exist ".venv\Lib\site-packages\fastapi" (
    echo [INFO] Instalando dependencias...
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] No se pudieron instalar las dependencias
        pause
        exit /b 1
    )
)

REM Iniciar servidor
echo.
echo [INFO] Iniciando servidor en http://127.0.0.1:8765
echo [INFO] Presiona Ctrl+C para detener
echo.

python server.py --port 8765 --host 127.0.0.1

REM Si el servidor se detiene
echo.
echo [INFO] Servidor detenido
pause
