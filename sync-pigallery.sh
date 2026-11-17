#!/usr/bin/env bash
# Baut das Spiel und kopiert es nach piGallery/static/rennspiel/ (feste Dateinamen, keine Hashes).
# Ein Codestand: piGallery bekommt exakt den Build dieses Repos, nichts wird von Hand gepatcht.
#   PIGALLERY=pfad/zu/piGallery bash sync-pigallery.sh   (Standard: ../piGallery)
set -euo pipefail
cd "$(dirname "$0")"
PG="${PIGALLERY:-${1:-../piGallery}}"
[ -d "$PG/static" ] || { echo "piGallery nicht gefunden: $PG" >&2; exit 1; }
npm run build
DEST="$PG/static/rennspiel"
rm -rf "$DEST"; mkdir -p "$DEST"
cp dist/rennspiel.js dist/rennspiel.css "$DEST/"
echo "-> $DEST ($(ls "$DEST" | tr '\n' ' '))"
