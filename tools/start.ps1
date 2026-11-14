# Startet MathQuest: lokalen Server und das Spiel als eigenes Browser-Fenster auf dem größten Bildschirm (dem TV).
# Mit Wii Remote (Einstellung „Zeigen: Wii Remote“) auch die Couch Workstation, mit Sprache auch Handy.
# Einstellungen: data/einstellungen.json (im Spiel unter „Einstellungen“; Abschnitt „start“ nur in der Datei, siehe README).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:8642/'
Add-Type -AssemblyName System.Windows.Forms

function Show-Message([string]$text) {
  [System.Windows.Forms.MessageBox]::Show($text, 'MathQuest', 'OK', 'Warning') | Out-Null
}

# Einstellungen lesen (fehlen sie, gilt: Maus und Tippen, kein Mikrofon umstellen)
$cfg = $null
$cfgFile = Join-Path $root 'data\einstellungen.json'
if (Test-Path $cfgFile) {
  try { $cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
}
$useWii = $cfg -and $cfg.bedienung -and $cfg.bedienung.zeigen -eq 'wii'
$useSpeech = $cfg -and $cfg.bedienung -and $cfg.bedienung.antworten -eq 'sprache'
$micName = if ($cfg -and $cfg.start -and $cfg.start.mikrofon) { [string]$cfg.start.mikrofon } else { '' }

# Couch Workstation: Pfad aus den Einstellungen, sonst neben dem MathQuest-Ordner suchen
function Find-CouchWorkstation {
  $cands = @()
  if ($cfg -and $cfg.start -and $cfg.start.couchWorkstation) { $cands += [string]$cfg.start.couchWorkstation }
  $parent = Split-Path -Parent $root
  $cands += @(
    (Join-Path $parent 'CouchWorkstation\CouchWorkstation.exe'),
    (Join-Path $parent 'CouchWorkstation\CouchWorkstation.cmd'),
    (Join-Path $parent 'Wii_Remote\CouchWorkstation.cmd'),
    (Join-Path $root 'CouchWorkstation\CouchWorkstation.exe')
  )
  foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# Browser: Chrome, sonst Edge (ist bei Windows dabei). Beide können ein Spiel als eigenes App-Fenster öffnen.
function Find-Browser {
  $cands = @(
    @{ exe = (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'); proc = 'chrome' },
    @{ exe = (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'); proc = 'chrome' },
    @{ exe = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'); proc = 'chrome' },
    @{ exe = (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'); proc = 'msedge' },
    @{ exe = (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'); proc = 'msedge' }
  )
  foreach ($c in $cands) { if ($c.exe -and (Test-Path $c.exe)) { return $c } }
  return $null
}
$browser = Find-Browser

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MqWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
}
"@
[MqWin]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null  # echte Pixel auf allen Bildschirmen

function Test-Server {
  try { (Invoke-WebRequest "${url}api/health" -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
}

# Fenster „MathQuest“ des Browsers suchen (nicht etwa ein Terminal mit demselben Namen)
function Find-GameWindow {
  $chromePids = @(Get-Process $browser.proc -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
  $script:found = [IntPtr]::Zero
  [MqWin]::EnumWindows({ param($h, $p)
    $sb = New-Object System.Text.StringBuilder 200
    [MqWin]::GetWindowText($h, $sb, 200) | Out-Null
    if ([MqWin]::IsWindowVisible($h) -and $sb.ToString() -eq 'MathQuest') {
      $wpid = [uint32]0
      [MqWin]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null
      if ($chromePids -contains $wpid) { $script:found = $h; return $false }
    }
    $true }, [IntPtr]::Zero) | Out-Null
  return $script:found
}

# 0. Mikrofon (Einstellung start.mikrofon, Teil des Gerätenamens, z. B. „USBAudio1.0“) als Windows-Standard, wenn es steckt.
#    Gedacht für ein Funkmikrofon: Handy steht auf „Standard“ und nimmt dann dieses, sonst das eingebaute.
#    Fest in Handy eingestellt fällt Handy beim Abziehen auf das eingebaute zurück und bleibt dabei.
#    Mit einem Funkmikrofon kam die Sprache bei uns deutlich zuverlässiger an als mit dem eingebauten Mikrofon.
#    Vor Schritt 1, weil die Couch Workstation Handy mitstartet.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MqMic {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator { }
  [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint n);
    [PreserveSig] int Item(uint i, out IMMDevice dev);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr o);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint n);
    [PreserveSig] int GetAt(uint i, out PropKey key);
    [PreserveSig] int GetValue(ref PropKey key, out PropVariant value);
  }
  // Nicht dokumentiert, seit Windows 7 unverändert; so setzen auch Tools wie SoundSwitch das Standardgerät
  [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicyConfig {
    void GetMixFormat(); void GetDeviceFormat(); void ResetDeviceFormat(); void SetDeviceFormat();
    void GetProcessingPeriod(); void SetProcessingPeriod(); void GetShareMode(); void SetShareMode();
    void GetPropertyValue(); void SetPropertyValue();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  }
  [StructLayout(LayoutKind.Sequential)] struct PropKey { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }

  static string Name(IMMDevice d) {
    IPropertyStore s;
    if (d.OpenPropertyStore(0, out s) != 0) return "";
    var key = new PropKey { fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid = 14 }; // PKEY_Device_FriendlyName
    PropVariant v;
    if (s.GetValue(ref key, out v) != 0 || v.vt != 31) return "";
    return Marshal.PtrToStringUni(v.p);
  }

  // Erstes aktives Aufnahmegerät, dessen Name namePart enthält, wird Windows-Standard (alle drei Rollen)
  public static string SetDefault(string namePart) {
    var en = (IMMDeviceEnumerator)new Enumerator();
    IMMDeviceCollection c; en.EnumAudioEndpoints(1, 1, out c);
    uint n; c.GetCount(out n);
    for (uint i = 0; i < n; i++) {
      IMMDevice d; c.Item(i, out d);
      string name = Name(d);
      if (name.IndexOf(namePart, StringComparison.OrdinalIgnoreCase) < 0) continue;
      string id; d.GetId(out id);
      IMMDevice def; string defId = "";
      if (en.GetDefaultAudioEndpoint(1, 0, out def) == 0) def.GetId(out defId);
      if (id == defId) return "schon Standard";
      var pc = (IPolicyConfig)new PolicyConfigClient();
      for (int role = 0; role < 3; role++) { int hr = pc.SetDefaultEndpoint(id, role); if (hr != 0) return "Fehler 0x" + hr.ToString("X8"); }
      return "Standard gesetzt";
    }
    return "nicht eingesteckt";
  }
}
'@
if ($micName) { try { [MqMic]::SetDefault($micName) | Out-Null } catch { } }

# 1. Couch Workstation (Wii Remote als Maus, B = Sprache), nur bei „Zeigen: Wii Remote“
if ($useWii -and -not (Get-Process CouchWorkstation -ErrorAction SilentlyContinue)) {
  $wii = Find-CouchWorkstation
  if ($wii) { Start-Process -FilePath $wii -WorkingDirectory (Split-Path $wii) -WindowStyle Hidden }
  else { Show-Message "Die Couch Workstation (für die Wii Remote) wurde nicht gefunden.`n`nLegt den Ordner „CouchWorkstation“ neben den MathQuest-Ordner oder tragt den Pfad in data\einstellungen.json unter start.couchWorkstation ein. Das Spiel startet trotzdem." }
}

# 1b. Handy (Spracherkennung), nur bei „Antworten: Sprechen“. Die Couch Workstation startet es nur bei ihrem
#     eigenen Start mit; läuft sie schon und Handy wurde beendet, kommt sonst bei B nichts an.
if ($useSpeech -and -not (Get-Process handy -ErrorAction SilentlyContinue)) {
  $handy = @((Join-Path $env:LOCALAPPDATA 'Handy\handy.exe'), (Join-Path $env:ProgramFiles 'Handy\handy.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($handy) { Start-Process -FilePath $handy -WorkingDirectory (Split-Path $handy) -WindowStyle Minimized }
}

# 2. Lokaler Server (braucht Node.js)
if (-not (Test-Server)) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-Message "Node.js fehlt. MathQuest braucht Node.js 22 oder neuer.`n`nInstallieren: https://nodejs.org (LTS) oder im Ordner MathQuest „Einrichten.cmd“ starten."
    exit 1
  }
  Start-Process -FilePath $node.Source -ArgumentList "`"$root\server\server.js`"" -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 40 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 250 }
  if (-not (Test-Server)) { Show-Message 'Der MathQuest-Server ist nicht gestartet. Ist Port 8642 belegt? Zum Prüfen im Ordner MathQuest „npm start“ ausführen.'; exit 1 }
}

# 3. Spiel-Fenster (vorhandenes wiederverwenden). Ohne Chrome und Edge: Standardbrowser, ohne Fenster-Steuerung.
if (-not $browser) { Start-Process $url; exit 0 }
$win = Find-GameWindow
if ($win -eq [IntPtr]::Zero) {
  Start-Process -FilePath $browser.exe -ArgumentList "--app=$url", '--new-window'
  for ($i = 0; $i -lt 40 -and $win -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $win = Find-GameWindow }
}
if ($win -eq [IntPtr]::Zero) { exit 1 }

# 4. Auf den größten Bildschirm (den TV) schieben und maximieren
$screen = [System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.Bounds.Width * $_.Bounds.Height } -Descending | Select-Object -First 1
$b = $screen.Bounds
[MqWin]::ShowWindow($win, 9) | Out-Null   # wiederherstellen
[MqWin]::SetWindowPos($win, [IntPtr]::Zero, $b.X + 100, $b.Y + 100, 1200, 800, 0x0040) | Out-Null
[MqWin]::ShowWindow($win, 3) | Out-Null   # maximieren
[MqWin]::SetForegroundWindow($win) | Out-Null
