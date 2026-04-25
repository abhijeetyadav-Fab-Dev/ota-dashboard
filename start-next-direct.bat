@echo off
cd /d "C:\Users\CS05180\Documents\ota-dashboard-main"
set NODE_PATH="C:\Program Files\nodejs\node.exe"
set NEXT_PATH="%~dp0\node_modules\next\dist\bin\next"
%NODE_PATH% %NEXT_PATH% dev