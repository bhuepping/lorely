# Bauen und testen

## Web
Node >= 20 (Vite 8 verlangt 20.19 oder 22.12+).
```sh
npm ci
npm run dev        # Entwicklungsserver
npm run build      # tsc --noEmit + Vite-Build nach dist/ (feste Dateinamen rennspiel.js|css)
npm run preview    # dist/ ausliefern (Port 4173)
```

## Tests
```sh
npx vitest run     # Logik, Physik, Bot-Fahrten (tests/ und tools/; Werkzeuge laufen nur mit ihrem Env-Schalter)
npm run test:smoke # Browser-Test über den echten Spielweg (Playwright, braucht vorherigen Build)
npm run test:layout# Oberflächen-Layout in mehreren Viewports
npm test           # alles nacheinander
npm run quick      # schnelle Stufe (~2 min)
```
Umgebungsvariablen für die Browser-Tests und -Werkzeuge:
- `PLAYWRIGHT_BROWSERS_PATH`: Ordner mit der Playwright-Installation (`chromium_headless_shell-*`); Standard `~/.cache/ms-playwright`.
- `PORT`: Port des lokalen Servers (Standard je Skript); `VP=360x740` begrenzt das Layout auf Viewports; `ONLY=kern,auswahl` wählt Smoke-Abschnitte.
- `SC=<ordner>` oder `SHOT_DIR`: Ausgabeordner der Screenshot-Werkzeuge unter `tools/`.
- `PIGALLERY`: Zielordner für `sync-pigallery.sh` (Standard `../piGallery`; kopiert den Build als Webseite dorthin).
- Liegen Node oder npm-Cache nicht im Standardpfad, `PATH` und `npm_config_cache` in der eigenen Umgebung setzen.

## Android (Capacitor 6)
Der Vite-Build (`dist/`) steckt in einer Capacitor-App (`android/`). Keine Berechtigungen, keine Netzzugriffe.
appId `de.huepping.lorely`, Version 0.1 / Code 1 (`android/app/build.gradle`). Voraussetzung: JDK 17, Android SDK 34.
```sh
npm ci && npm run build && npx cap sync android     # dist/ -> android/app/src/main/assets/public
cd android
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk (zum Installieren per Hand)
./gradlew assembleRelease    # app/build/outputs/apk/release/
```
Icons neu erzeugen: `node tools/icon.mjs` (schreibt auch das Fastlane-Icon und die mipmap-Ordner).

### Signierung
`keystore.properties` im Repo-Root (nicht eingecheckt) enthält `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
Ohne die Datei entsteht ein unsigniertes Release. Den Keystore sicher aufbewahren: er ist die Identität der App.

### App-Verhalten
Vollbild immersiv, Ausschnitt-Ränder (Notch) per `viewport-fit=cover` und `--sat/--sal/--sar`, Bildschirm bleibt an,
Gesten-Ausschluss an den unteren Ecken. Die Zurück-Taste (`src/native.ts`, Handler in `game.ts`) geht Endkarte → Menü,
Karte zu, Pause → weiter, Rennen → Pause, Menü → App beenden. Vollbild-Knopf und Zahnrad-Schalter entfallen nativ.

## F-Droid
Rezept-Entwurf: `docs/fdroid-metadata-de.huepping.lorely.yml` (für das Repo fdroiddata). Beschreibungen, Changelogs und Icon
liegen unter `fastlane/metadata/android/`. Screenshots können unter `<sprache>/images/phoneScreenshots/` ergänzt werden.
