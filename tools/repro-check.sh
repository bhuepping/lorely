#!/bin/bash
# Reproduzierbarkeits-Probe ohne Docker: zwei frische Clones, zwei unsignierte Release-Builds
# (andere Zeitzone, umask, HOME, Pfad), danach cmp. Optional: Signatur-Vergleich mit einem signierten APK.
#   tools/repro-check.sh [REPO=.] [COMMIT=HEAD] [SIGNIERTES.apk]
# Umgebung (Standard in Klammern): JAVA_HOME (aus PATH), ANDROID_HOME (ANDROID_SDK_ROOT), GRADLE_USER_HOME ($HOME/.gradle),
#   ANDROID_USER_HOME ($HOME/.android), npm_config_cache ($HOME/.npm), APKSIGCOPIER (apksigcopier im PATH), KEEP=1 behält die Build-Ordner.
# Platz: ca. 1 GB je Lauf (node_modules, Gradle-Ausgabe); Dauer: kalt ~5 min, mit warmem Cache ~1 min.
# Letzte Zeile: "REPRO OK <sha256>" (Exit 0) oder "REPRO FAIL <Grund>" (Exit 1).
set -u
REPO=$(cd "${1:-.}" && pwd); COMMIT=${2:-HEAD}; SIGNED=${3:-}
export GRADLE_USER_HOME=${GRADLE_USER_HOME:-$HOME/.gradle}
export ANDROID_USER_HOME=${ANDROID_USER_HOME:-$HOME/.android}
export npm_config_cache=${npm_config_cache:-$HOME/.npm}
export ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/repro.XXXXXX")
cleanup() { [ "${KEEP:-}" = 1 ] && echo "Build-Ordner: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "REPRO FAIL $*"; exit 1; }

build() { # Name, Zeitzone, umask
  local n=$1 dir=$WORK/$1/quelle-$1
  mkdir -p "$WORK/$n/home" || return 1
  (
    export TZ=$2 HOME=$WORK/$n/home; umask "$3"
    git clone -q "$REPO" "$dir" && git -C "$dir" checkout -q "$COMMIT" || exit 1
    cd "$dir" && npm ci --silent --no-audit --no-fund && npm run build --silent && npx cap sync android >/dev/null || exit 1
    cd android && ./gradlew --no-daemon -q assembleRelease
  ) > "$WORK/$n.log" 2>&1 || { tail -n 15 "$WORK/$n.log" >&2; return 1; }
  cp "$WORK/$n/quelle-$n/android/app/build/outputs/apk/release/app-release-unsigned.apk" "$WORK/$n.apk"
}

command -v node >/dev/null && command -v java >/dev/null || fail "node oder java fehlt (PATH/JAVA_HOME)"
[ -n "$ANDROID_HOME" ] || fail "ANDROID_HOME nicht gesetzt"
build a Europe/Berlin 022 || fail "Build a fehlgeschlagen"
build b Pacific/Auckland 077 || fail "Build b fehlgeschlagen"

if ! cmp -s "$WORK/a.apk" "$WORK/b.apk"; then
  echo "Abweichende Dateien im APK:"
  python3 -I - "$WORK/a.apk" "$WORK/b.apk" <<'PY'
import sys, zipfile
a, b = (zipfile.ZipFile(p) for p in sys.argv[1:3])
na, nb = set(a.namelist()), set(b.namelist())
d = [f"nur a: {n}" for n in sorted(na - nb)] + [f"nur b: {n}" for n in sorted(nb - na)]
d += [f"anders: {n}" for n in sorted(na & nb) if a.read(n) != b.read(n)]
print("\n".join(d[:20]) or "Inhalte gleich, nur Zip-Metadaten (Zeit/Reihenfolge) verschieden")
PY
  fail "APKs verschieden"
fi
SHA=$(sha256sum "$WORK/a.apk" | cut -d' ' -f1)

if [ -n "$SIGNED" ]; then
  AS=${APKSIGCOPIER:-apksigcopier}
  BT=$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -n 1); [ -n "$BT" ] && export PATH="$BT:$PATH"   # apksigner
  command -v "$AS" >/dev/null || fail "apksigcopier fehlt (APKSIGCOPIER)"
  "$AS" compare "$SIGNED" --unsigned "$WORK/a.apk" || fail "Signiertes APK passt nicht zum Nachbau"
fi
echo "REPRO OK $SHA"
