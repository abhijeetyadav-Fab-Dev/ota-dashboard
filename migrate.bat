@echo off
REM Migration script for OTA Dashboard
REM Usage: migrate.bat "DATABASE_URL"
REM Example: migrate.bat "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"

setlocal enabledelayedexpansion

set "DATABASE_URL=%1"
if "%DATABASE_URL%"=="" (
    echo Usage: migrate.bat "DATABASE_URL"
    echo Example: migrate.bat "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
    exit /b 1
)

REM Generate session secret
for /f "delims=" %%i in ('powershell -Command "[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set "SESSION_SECRET=%%i"

echo === OTA Dashboard Migration ===
echo Database: !DATABASE_URL:*@=***@!
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

REM Generate Prisma client
echo Generating Prisma client...
call npx prisma generate

REM Push schema to database
echo Pushing schema to database...
set "DATABASE_URL=%DATABASE_URL%"
call npx prisma db push --accept-data-loss

echo.
echo === Migration Complete ===
echo SESSION_SECRET: !SESSION_SECRET!
echo.
echo Add these to your .env.local:
echo DATABASE_URL=%DATABASE_URL%
echo SESSION_SECRET=!SESSION_SECRET!

endlocal
