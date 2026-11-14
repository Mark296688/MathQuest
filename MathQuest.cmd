@echo off
rem Startet MathQuest: lokaler Server, Spiel-Fenster auf dem größten Bildschirm, bei Bedarf Couch Workstation und Handy.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\start.ps1"
