@echo off
title OTA Dashboard - Autonomous Mode
cd /d "C:\Users\CS05180\Documents\ota-dashboard-main"
set PATH=%PATH%;C:\Program Files\nodejs

:start
echo [%date% %time%] Starting OTA Dashboard...
"C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
echo [%date% %time%] Dashboard stopped with error level %errorlevel%. Restarting in 5 seconds...
timeout /t 5 >nul
goto start