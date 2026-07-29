@echo off
title Agente Robot Facel (Visible)
color 0A
echo ===================================================
echo Iniciando Agente de Facturacion (Modo Visible)...
echo ===================================================
cd /d "%~dp0public\agente"
node agente_local.js
pause
