# Einrichtung von MathQuest auf einem neuen Rechner (Windows 10/11):
# 1. Dateien aus dem Download freigeben (Windows sperrt Skripte aus dem Internet)
# 2. Node.js prüfen, bei Bedarf mit winget installieren (nach Rückfrage)
# 3. Verknüpfung „MathQuest“ auf dem Desktop anlegen
# Aufruf: Doppelklick auf Einrichten.cmd. Zum Testen: -Desktop <Ordner> legt die Verknüpfung dort an.
param([string]$Desktop = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Windows.Forms
function Ask([string]$text) { [System.Windows.Forms.MessageBox]::Show($text, 'MathQuest einrichten', 'YesNo', 'Question') -eq 'Yes' }
function Info([string]$text, [string]$icon = 'Information') { [System.Windows.Forms.MessageBox]::Show($text, 'MathQuest einrichten', 'OK', $icon) | Out-Null }

# 1. Download-Sperre entfernen
Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

# 2. Node.js 22 oder neuer
function Get-NodeMajor {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  try { return [int]((& $n.Source --version) -replace '^v(\d+).*', '$1') } catch { return 0 }
}
$major = Get-NodeMajor
if ($major -lt 22) {
  $was = if ($major) { "Node.js $major ist zu alt" } else { 'Node.js fehlt' }
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    if (Ask "$was. MathQuest braucht Node.js 22 oder neuer (kostenlos, von nodejs.org).`n`nJetzt mit winget installieren?") {
      & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
      $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
      $major = Get-NodeMajor
    }
  }
  if ($major -lt 22) {
    Info "$was. Bitte Node.js (LTS) von https://nodejs.org installieren und danach Einrichten.cmd noch einmal starten." 'Warning'
    exit 1
  }
}

# 3. Desktop-Verknüpfung
$lnk = Join-Path $Desktop 'MathQuest.lnk'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = Join-Path $root 'MathQuest.cmd'
$sh.WorkingDirectory = $root
$sh.IconLocation = (Join-Path $root 'tools\MathQuest.ico') + ',0'
$sh.WindowStyle = 7  # minimiert, damit kein schwarzes Fenster aufblitzt
$sh.Description = 'MathQuest starten'
$sh.Save()

Info "Fertig! Auf dem Desktop liegt jetzt „MathQuest“.`n`nBeim ersten Start legt ihr im Spiel die Profile an (wer spielt, wie ihr bedient). Anleitung: README.md im Ordner MathQuest."
