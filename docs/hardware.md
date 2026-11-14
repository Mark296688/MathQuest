# Hardware und Zusatzprogramme

MathQuest läuft mit Maus und Tastatur auf jedem Windows-Rechner. Alles hier ist **optional**: Damit spielen die Kinder vom Sofa aus am Fernseher, zeigen mit einer Wii Remote und sagen die Ergebnisse.

```
Wii Remote ──Bluetooth──► DolphinBar (USB, Infrarot-LEDs) ──► Couch Workstation ──► Mauszeiger, Klick (A)
                                                                     │
                                                    B gehalten ──────┴──► Handy (Spracherkennung) ──► Text ins Spiel
Mikrofon (eingebaut oder Funkmikrofon) ─────────────────────────────────────► Handy
Laptop ──HDMI──► Fernseher (MathQuest im Vollbild)
```

## Einkaufsliste

| Teil | Wofür | Hinweise |
|---|---|---|
| **Nintendo Wii Remote** (oder Wii Remote Plus) | Zeiger, Klick, Sprechtaste | Original von Nintendo, gebraucht günstig. Nachbauten melden sich oft anders und funktionieren nicht immer. 2 AA-Akkus. Ein Nunchuk wird nicht gebraucht. |
| **Mayflash DolphinBar** (Modell W010) | Infrarot-Leiste und Bluetooth-Empfänger in einem, per USB | Ersetzt die Sensorleiste der Wii. Bluetooth am Laptop wird nicht gebraucht. Die Leiste mittig unter oder über den Fernseher legen. |
| Fernseher mit HDMI | Bildschirm | Laptop per HDMI anschließen, Windows auf „Erweitern“ oder „Nur zweiter Bildschirm“ |
| Mikrofon | Spracheingabe | Das eingebaute Laptop-Mikrofon geht. Ein **Funk-Ansteckmikrofon mit USB-Empfänger** ist aus 3 m Abstand deutlich zuverlässiger (bei uns: KUKIHO, der Empfänger heißt in Windows „Mikrofon (USBAudio1.0)“). |

## Zusatzprogramme

| Programm | Wofür | Bezug |
|---|---|---|
| **Couch Workstation** | Macht die Wii Remote zum Mauszeiger: A = Klick, B = Spracheingabe, + / − = Ja / Nein im Spiel | [github.com/Mark296688/CouchWorkstation](https://github.com/Mark296688/CouchWorkstation), unter „Releases“ als fertige `.exe` (ohne Installation, ohne .NET) |
| **Handy** | Lokale Spracherkennung, fügt den erkannten Text ins Spiel ein. Kein Mobiltelefon: Das Programm heißt so. | [github.com/cjpais/Handy](https://github.com/cjpais/Handy), kostenlos. Bei uns Version 0.10. |

### Couch Workstation einrichten

1. Aus „Releases“ die ZIP-Datei laden und als Ordner **`CouchWorkstation`** **neben** den MathQuest-Ordner entpacken, z. B. `Dokumente\MathQuest` und `Dokumente\CouchWorkstation`. Dann findet der MathQuest-Starter sie von selbst. Liegt sie woanders: Pfad in `data\einstellungen.json` unter `start.couchWorkstation` eintragen (siehe README).
2. DolphinBar per USB anschließen und mit der Mode-Taste auf **Modus 4** stellen (LED 4 leuchtet). Nur in Modus 4 kommen alle Tasten und die Infrarot-Daten an.
3. Wii Remote koppeln: **1 + 2 gleichzeitig** drücken (oder roten Sync-Knopf im Batteriefach). Die Kopplung bleibt in der DolphinBar gespeichert; später reicht ein Tastendruck.
4. In MathQuest unter **Einstellungen → Zeigen und klicken: Wii Remote** wählen. Ab dann startet der MathQuest-Starter die Couch Workstation mit.
5. Beim ersten Verbinden kalibrieren (erscheint von selbst auf dem Fernseher): auf das Kreuz in der Mitte zeigen und A drücken, dann auf das Kreuz unten links und A drücken.

Die Couch Workstation zeigt auf dem größten Bildschirm, der nicht der Hauptbildschirm ist (also dem Fernseher). Ein anderer Bildschirm lässt sich im Statusfenster wählen.

| Taste | im Spiel |
|---|---|
| Zeigen | Mauszeiger |
| A | Klicken |
| B (halten) | Sprechen: halten, Zahl sagen, loslassen |
| + | „Ja“ bei der Rückfrage, was verstanden wurde |
| − | „Nein, nochmal“ |
| 1 | Zeiger-Messung (nur zur Fehlersuche) |
| Home | Kalibrierung abbrechen |

### Handy einrichten

1. Handy installieren (Standard-Ordner `%LOCALAPPDATA%\Handy`; dann startet der MathQuest-Starter es mit).
2. In Handy einstellen:
   - Sprache: **Deutsch**
   - Modell: ein Modell mit Deutsch; bei uns „Nemotron 3.5 ASR Streaming 0.6B“
   - Auslösen: **Push-to-Talk** (halten zum Sprechen), Tastenkürzel Strg+Leertaste
   - Automatisch absenden (Enter): **aus**
   - Zwischenablage: **nicht verändern**, Einfügen mit Strg+V
   - Modell geladen lassen: 1 Stunde (sonst dauert das erste Wort nach einer Pause länger)
   - Mikrofon: **Standard** (dann gilt das Windows-Standardgerät, siehe unten)
3. In MathQuest unter **Einstellungen → Antworten: Sprechen** wählen.

Ohne Wii Remote: Am Laptop das Tastenkürzel von Handy halten, Zahl sagen, loslassen. Die Couch Workstation liest das Tastenkürzel aus Handy und hält es, solange B gedrückt ist.

**Funkmikrofon:** Steht Handy auf „Standard“, nimmt es das Windows-Standardmikrofon. Damit das Funkmikrofon Standard wird, wenn es steckt, und sonst das eingebaute gilt, in `data\einstellungen.json` unter `start.mikrofon` einen Teil seines Gerätenamens eintragen (Windows → Sound → Eingabe). Fest in Handy eingestellt fällt Handy beim Abziehen auf das eingebaute Mikrofon zurück und bleibt dabei.

Tipps zum Sprechen: B lieber etwas länger halten und in ganzen Sätzen sprechen („Das Ergebnis ist zweiundvierzig“). Sehr kurze Aufnahmen kommen öfter leer an. Kommt nichts an, zeigt das Spiel „Nicht gehört“.

## Fernseher

- Bildmodus **Spiel** (kürzere Verzögerung), 60 Hz (Windows → Anzeige → Erweiterte Anzeige)
- Bei 4K-Fernsehern Skalierung 300 % (Windows-Standard), MathQuest passt sich an
- Das Spielfenster öffnet der Starter auf dem größten Bildschirm und maximiert es.

## Unser Aufbau

Zum Vergleich, damit läuft es flüssig:

| | |
|---|---|
| Laptop | Lenovo ThinkPad X1 Yoga Gen 6: Intel Core i7-1185G7, Intel Iris Xe, 16 GB RAM, Windows 11 |
| Fernseher | 65 Zoll, 3840 × 2160, 60 Hz, Skalierung 300 %, Abstand zum Sofa ca. 3 m |
| Zeiger | Wii Remote, Mayflash DolphinBar unter dem Fernseher |
| Sprache | Handy 0.10 mit Nemotron 3.5 ASR Streaming 0.6B, Funk-Ansteckmikrofon. Vom Loslassen von B bis zum Text im Spiel: ca. 0,5–0,6 s |

## Fehlersuche

| Problem | Lösung |
|---|---|
| Zeiger bewegt sich nicht | Taste an der Wii Remote drücken (weckt sie auf). DolphinBar auf Modus 4? Sonst neu koppeln (1 + 2). Läuft die Couch Workstation (Statusfenster)? |
| Zeiger zittert oder erreicht den Rand nicht | Neu kalibrieren (Statusfenster), dabei ganz natürlich auf die Mitte zielen. Nichts verdeckt die DolphinBar, keine Sonne oder Halogenlampe direkt dahinter. |
| B tut nichts, „Nicht gehört“ | Läuft Handy? Stimmt das Mikrofon (Windows → Sound → Eingabe, Pegel)? B länger halten. |
| Falsche Zahl verstanden | „Nein, nochmal“ (Taste −) oder „Ziffern tippen“. Ganze Sätze helfen. |
| „Der MathQuest-Server läuft nicht“ | Über die Verknüpfung „MathQuest“ starten, nicht die HTML-Datei direkt öffnen. Node.js installiert? `Einrichten.cmd` prüft das. |
| Spiel öffnet im falschen Bildschirm | Fernseher ist kleiner als der Laptop-Bildschirm? Dann das Fenster einmal hinüberziehen und mit F11 auf Vollbild. |
