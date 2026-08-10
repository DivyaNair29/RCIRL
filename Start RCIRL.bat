@echo off
title RCIRL Property Manager
cd /d "%~dp0"
echo Starting RCIRL...
echo (closing this window will stop the app)
echo.
python run_local.py
pause
