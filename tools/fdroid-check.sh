#!/bin/bash
# Gegenprobe mit dem offiziellen F-Droid-Buildserver-Image (Docker/Podman, NICHT in der Sandbox):
# baut das Rezept aus einem lokalen Clone (nichts muss gepusht sein) und vergleicht mit unserem signierten APK.
#   tools/fdroid-check.sh CLONE_PFAD SIGNIERTES.apk
# Umgebung: DOCKER (docker), DOCKER_HOST wird vom Docker-Client beachtet, IMAGE (offizielles buildserver-Image).
# Platz: Image ca. 4-5 GB, Build ca. 3 GB (Android-SDK, Gradle-Cache im Container, danach weg). Dauer: 10-20 min.
# Letzte Zeile: "FDROID OK <sha256>" (Exit 0) oder "FDROID FAIL <Grund>" (Exit 1).
set -u
CLONE=$(cd "${1:?CLONE_PFAD}" && pwd); SIGNED=$(realpath "${2:?SIGNIERTES.apk}")
DOCKER=${DOCKER:-docker}; IMAGE=${IMAGE:-registry.gitlab.com/fdroid/fdroidserver:buildserver}
HERE=$(cd "$(dirname "$0")/.." && pwd); ID=de.huepping.lorely
WORK=$(mktemp -d "${TMPDIR:-/tmp}/fdroid.XXXXXX"); trap 'rm -rf "$WORK"' EXIT
fail() { echo "FDROID FAIL $*"; exit 1; }

COMMIT=$(git -C "$CLONE" rev-parse HEAD) || fail "kein Git-Clone"
[ -z "$(git -C "$CLONE" status --porcelain)" ] || echo "Hinweis: Clone hat ungespeicherte Änderungen, gebaut wird nur Commit ${COMMIT:0:12}"
mkdir -p "$WORK/metadata" "$WORK/build" "$WORK/unsigned"
# Rezept: Quelle = lokaler Clone, Stand = dessen Commit; Binaries entfällt (Vergleich macht dieses Skript)
sed -e "s#^Repo: .*#Repo: file:///src#" -e "s#commit: v0.1#commit: $COMMIT#" -e '/^Binaries:/d' -e '/^AllowedAPKSigningKeys:/d' \
  "$HERE/docs/fdroid-metadata-de.huepping.lorely.yml" > "$WORK/metadata/$ID.yml"
cp "$SIGNED" "$WORK/signed.apk"
$DOCKER pull -q "$IMAGE" >/dev/null || fail "Image nicht ladbar"

$DOCKER run --rm -v "$CLONE":/src:ro -v "$WORK":/repo "$IMAGE" bash -ec '
  trap "chmod -R a+rwX /repo" EXIT
  git config --global --add safe.directory "*"
  cd /repo && : > config.yml
  fdroid build --no-tarball -l "'$ID':1"
  apk=$(ls unsigned/*.apk | head -n 1)
  apksigcopier compare /repo/signed.apk --unsigned "$apk"
  sha256sum "$apk" | cut -d" " -f1 > /repo/sha.txt' || fail "Build oder Vergleich fehlgeschlagen (Log oben)"
echo "FDROID OK $(cat "$WORK/sha.txt")"
