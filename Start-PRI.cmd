@echo off
setlocal
chcp 65001 >nul
node "%~dp0scripts\local.mjs" %*
set "PRI_EXIT_CODE=%ERRORLEVEL%"
if not "%PRI_EXIT_CODE%"=="0" pause
exit /b %PRI_EXIT_CODE%
