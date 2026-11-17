# Architektur

TypeScript, Vite, three.js. Die Fahrphysik ist selbst gebaut (keine Physikbibliothek). Das Spiel kennt keine Webseite
drumherum: `dist/rennspiel.js|css` haben feste Namen und laufen im Browser wie in der Capacitor-App.

## Schichten und Datenfluss
```
Level-JSON / TS-Level -> level.ts (Course) -> session.ts (Szene, Auto, Lauf) -> game.ts (Schleife, Kamera) <- input.ts
                                                                                  |-> hud.ts, menu.ts, minimap.ts
```
- `src/physics/` (ohne three, headless testbar): `vehicle.ts` Starrkörper mit vier Raycast-Rädern und vereinfachter Reifenkurve,
  `params.ts` Fahrzeugdaten (Kompakt, Buggy, Rallye, Jeep), `terrain.ts` Untergründe und Höhenraster, `obstacles.ts`/`props.ts` Kollisionen.
- `src/level.ts`: Streckenformat (`LevelDef`) und Streckenlogik: baut aus der Definition einen `Course` (Straße als Spline,
  Gelände, Objekte, Zonen). Ohne three. Planungsmodule daneben, ebenfalls ohne three: `net.ts` (Straßennetz), `suburb.ts`/`netsub.ts`
  (Bebauung), `town.ts`, `rail.ts`, `features.ts` (Schanzen, Furten, Tunnel), `traffic.ts`/`nettraffic.ts`/`movers.ts` (Verkehr, Bewegtes),
  `signals.ts` (Ampeln), `ideal.ts` (Ideallinie, auf der die Sterne liegen), `edge.ts` (Rand der Welt).
- Planung und Mesh sind getrennt: jede `*mesh.ts` (`netmesh`, `suburbmesh`, `townmesh`, `offroadmesh`, `featuremesh`, `trafficmesh`, `cpmesh`)
  baut aus den Planungsdaten ein einziges three-Mesh (Vertexfarben, unbeleuchtet, wenige Draw Calls). `src/world/` zeichnet die Szene je Welt
  (Gelände, Wald, Auto, Stadt, Brücke, Rhein, Strand); `fx.ts`, `rain.ts`, `sky.ts` Effekte und Himmel.
- `src/session.ts`: Level + Auto -> Welt, Fahrzeug, Lauf, Szene. Kennt weder Oberfläche noch Schleife.
- `src/game.ts`: Schleife (120-Hz-Physik, entkoppelt gerendert), Kamera, Zusammenspiel von Menü, Fahrt, Pause, Endkarte, Android-Zurücktaste.
- `src/hud.ts`, `src/menu.ts`, `src/minimap.ts`, `src/pixel.ts`: Oberfläche. Alle Texte und Symbole sind selbst gezeichnete Pixelschrift
  (`px()`), keine Bild- oder Schriftdateien. `mapphoto.ts` rendert die Szene einmal von oben als Kartenbild.
- `src/input.ts`: liefert nur `{steer, throttle, brake, handbrake}` aus Tastatur, Touch-Tasten oder Neigen.
- `src/run.ts` (Zeitfahren und Sammeln, Checkpoints, Ziel; reine Logik) und `src/save.ts` (Bestwerte je Strecke und Auto in localStorage).
- `src/i18n.ts`: Deutsch und Englisch, alle sichtbaren Texte und Namen; `src/native.ts`, `src/toast.ts`, `src/fullscreen.ts`: Plattformanbindung.
- `src/debuglog.ts`: optionales Fahrprotokoll (aus, bis es im Zahnrad-Feld eingeschaltet wird; nichts wird gesendet).

## Streckenformat
Eine Strecke ist ein `LevelDef` (Typ in `src/level.ts`), als JSON unter `src/levels/*.json` oder als TS-Funktion (`src/levels/*.ts`,
prozedural, z. B. die Offroad-Level). Registriert wird sie in `src/levels/index.ts` (Welten und ihre Level).
Wichtige Felder:
- `id`, `name`, `world`, `seed`, `v` (Fassung; ab 2 ein neuer Speicherschlüssel `id#v`).
- `palette`, `fog`, `sun`: Farben je Untergrund, Himmel, Nebel, Sonnenrichtung.
- `time`: Zeitkonto (eine Zahl oder je Auto) und Sternbonus; `src/levels/budgets.json` hält die berechneten Konten.
- `terrain`: Raster (`n`, `cell`), Hügelhöhe, Wellenlänge; `road`: Breite, Untergrund, Randstreifen, `points` (Mittellinie).
- `zones`: Untergrundwechsel entlang der Straße oder im Kreis; `sea`, `river`, `bridge`: Wasser und Brücken.
- `objects`: `stars` (Strecke, seitlich), `posts`, `trees`, `rocks`, `vines`, `castles`, `reef` (Felskette), `marks` (Randpfähle).
- `jumps`, `fords`, `tunnels`, `movers`, `traffic`, `bays`: Schanzen, Furten, Tunnel, Bewegtes (Züge, Pflug), Verkehr.
- `net` + `suburb` + `bridges`: Straßennetz mit Bebauung (Vorstadt); `town`, `city`: Altstadt und Hochhäuser.
- `hints`: Wegweiser (feste Checkpoints, Richtungspfeile); `edge`/`edgeBox`: Rand der Welt; `jeepLine`: Sternenlinie des Jeeps.

## Werkzeuge (`tools/`)
Aufruf jeweils aus dem Repo-Root; Kopfzeile jeder Datei nennt die Parameter.
- Generatoren (Python 3): `gen_p.py` (Strecken per Turtle aus Gerade/Kurve/Kreis, schreibt `src/levels/*.json`; Definitionen in `gen_p_levels.py`),
  `gen_rhein.py`, `gen_etappen.py` (lange Etappen), `gen_vorstadt.py` (Straßennetz der Vorstadt, Plan mit `vorstadt_plan.py`).
  Nach jedem Lauf: `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts` setzt die Sterne auf die Ideallinie.
- `budgets.test.ts`: berechnet Zeitkonten aus Bot-Fahrten (`BUDGETS=1 WRITE=1 npx vitest run tools/budgets.test.ts`); `calibrate.test.ts`, `bot.ts` der Fahrer.
- Messen und prüfen (jeweils mit eigenem Env-Schalter): `stress.test.ts` (Extremlagen, Invarianten), `profile.test.ts`, `relief.test.ts`,
  `detour.test.ts` (kürzester befahrbarer Weg), `bbmap.py` (Karten- und Höhenbericht), `loadtime.mjs`, `leak.mjs`.
- `*shots.mjs`: Screenshots aus dem gebauten Spiel (Playwright), z. B. `SC=out node tools/shots.mjs`. `icon.mjs`: App-Icons.

## Tests
- `tests/*.test.ts` (vitest): Physik, Strecken, Bot-Fahrten über alle Level und Autos, Verkehr, Speicherstand, Texte. Prüfen den Nutzerweg
  (Gas geben, fahren, ins Ziel kommen), nicht Zwischenwerte. `npx vitest run`.
- `tests/smoke.mjs`: Browser-Test über den echten Weg (Menü, Start, Fahren, Karte, Pause, Endkarte, Touch, Sprache). `ONLY=...` wählt Abschnitte.
- `tests/layout.mjs`: prüft die Oberfläche in sieben Viewports auf Überlappung, Mindestgrößen, Kontrast und Textkürzung.
- `tests/quick.mjs`: schnelle Stufe aus Logik, Build, Browser-Kern und Layout. Details und Umgebungsvariablen: `docs/build.md`.

## Konventionen
- Koordinaten wie three: x rechts, y oben, −z vorwärts; SI-Einheiten; Strecke `s` in Metern entlang der Straße, `lat` seitlich.
- Deterministisch: Level entstehen aus einem Seed, Bewegtes und Verkehr laufen auf der Summe der Physikschritte. Dadurch sind Bot-Fahrten reproduzierbar.
- Keine externen Dateien zur Laufzeit: Geometrie, Texturen, Schrift und Klang entstehen im Code; kein Netzzugriff.
