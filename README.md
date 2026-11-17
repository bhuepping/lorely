# LoReLy – Low Res Rally

Ein minimalistisches 3D-Rallyspiel im Retro-Pixel-Look: Fahrgefühl vor Grafik. Vier Autos mit eigener Fahrphysik,
Untergründe wie Eis, Sand, Matsch, Schotter und Kopfstein verändern den Grip. Läuft im Browser und als Android-App, komplett offline,
ohne Konto, Werbung oder Tracking. Alles (Geometrie, Schrift, Klang) entsteht im Code, es gibt keine Bild- oder Audiodateien.

## Spielen
- Browser: `npm install`, dann `npm run dev` und die angezeigte Adresse öffnen (Node >= 20).
- Android: APK aus den Releases installieren oder selbst bauen, siehe [docs/build.md](docs/build.md).

## Steuerung
- Tastatur: Pfeile oder WASD fahren, Leertaste Handbremse, R zurücksetzen, P oder Esc Pause, F Vollbild.
- Touch: Tasten am Rand (mehrere Finger gleichzeitig); `⟲` lenkt durch Neigen des Geräts, `▦` ändert die Auflösung.

## Welten und Modi
Schnee, City, Strand, Rhein, Vorstadt und Offroad mit je mehreren Strecken. Zeitfahren (Uhr, Bestzeit je Auto) oder Sammeln (Sterne).

## Autos
Kompakt (Frontantrieb), Buggy (Viscokupplung, leicht), Rallye 4x4 (Allrad) und Jeep (offen, Sperre, viel Bodenfreiheit, im Gelände der beste).

## Befehle
```sh
npm run dev      # Entwicklungsserver
npm run build    # Typprüfung + Build nach dist/
npx vitest run   # Logik- und Bot-Tests
npm test         # alles inklusive Browser-Smoke und Layout (braucht Playwright)
```

## Projektaufbau
`src/` Spiel, `src/physics/` Fahrphysik ohne three, `src/levels/` Strecken, `tests/` und `tools/` Tests und Werkzeuge,
`android/` Capacitor-Projekt, `fastlane/` Store-Texte. Ausführlich: [docs/architecture.md](docs/architecture.md).
Bauen und Testen: [docs/build.md](docs/build.md).

## Mitmachen
Issues mit Fehlern oder Ideen sind willkommen. Bitte keine Kartendaten und keine fremden Assets einreichen:
alle Strecken sind von Hand entworfen, Bauten und Fahrzeuge aus eigenen Blockmodellen.

## Lizenz und Credits
MIT, siehe [LICENSE](LICENSE). Verwendete Bibliotheken und ihre Lizenzen: [THIRD_PARTY.md](THIRD_PARTY.md) (three.js, Capacitor).
Entwickelt zusammen mit Claude Code (Anthropic).
