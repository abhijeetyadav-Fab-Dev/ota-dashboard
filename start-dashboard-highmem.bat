@echo off
title OTA Dashboard - High Performance Mode
cd /d "C:\Users\CS05180\Documents\ota-dashboard-main"
set PATH=C:\PROGRA~1\nodejs;%PATH%

echo Starting Next.js dev server with increased memory limit...
echo.

npm run dev