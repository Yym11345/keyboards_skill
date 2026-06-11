@echo off
chcp 65001 >nul
echo ╔═════════════════════════════════════════╗
echo ║     keyboards_skill  v1.0  Setup        ║
echo ╚═════════════════════════════════════════╝
echo.
echo [1/2] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [Error] npm install failed!
    pause
    exit /b %errorlevel%
)
echo.
echo [2/2] Installing Playwright Chromium browser...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo [Error] Playwright browser installation failed!
    pause
    exit /b %errorlevel%
)
echo.
echo [Success] Setup complete! You can now run miner.mjs
pause
