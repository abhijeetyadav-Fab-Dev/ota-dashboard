@echo off
:RESTART
echo Starting OTA Dashboard...
cd /d "C:\Users\CS05180\Documents\ota-dashboard-main"
set PATH=%PATH%;C:\Program Files\nodejs
npm run dev
echo Dashboard stopped with error code %errorlevel%. Restarting in 5 seconds...
timeout /t 5 >nul
goto RESTART