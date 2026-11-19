#!/bin/bash
# Gegenprobe mit dem offiziellen F-Droid-Buildserver-Image (Docker/Podman, NICHT in der Sandbox),
# aufgebaut wie der Job "fdroid build" in der CI von fdroiddata: fdroidserver frisch klonen,
# als Nutzer vagrant mit --on-server bauen, dann mit unserem signierten APK vergleichen.
#   tools/fdroid-check.sh [CLONE_PFAD] [SIGNIERTES.apk] [COMMIT]
# Standard: dieses Repo, LoReLy-*-test.apk im Repo-Root, COMMIT aus <apk>.commit (sonst HEAD).
# Das Commit-Datum steckt im Build, ein anderer Commit ergibt also ein anderes APK.
# Umgebung: DOCKER (Standard docker, ohne Rechte am Socket automatisch "sudo docker"), IMAGE.
# Die ganze Ausgabe landet zusätzlich in fdroid-check.log im Repo-Root (nicht eingecheckt).
# Platz: Image ca. 5 GB, Build ca. 3 GB (danach weg). Dauer: 15-30 min.
# Letzte Zeile: "FDROID OK <sha256>" (Exit 0) oder "FDROID FAIL <Grund>" (Exit 1).
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd); ID=de.huepping.lorely
if [ -z "${FDROID_LOGGED:-}" ]; then
  FDROID_LOGGED=1 "$0" "$@" 2>&1 | tee "$HERE/fdroid-check.log"; exit "${PIPESTATUS[0]}"
fi
CLONE=$(cd "${1:-$HERE}" && pwd)
DEF_APK=$(ls "$HERE"/LoReLy-*-test.apk 2>/dev/null | head -n 1)
SIGNED=$(realpath "${2:-${DEF_APK:?kein LoReLy-*-test.apk im Repo-Root}}")
REV=${3:-$(cat "$SIGNED.commit" 2>/dev/null || echo HEAD)}
IMAGE=${IMAGE:-registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie}
if [ -z "${DOCKER:-}" ]; then
  if docker info >/dev/null 2>&1; then DOCKER=docker; else DOCKER="sudo docker"; fi
fi
WORK=$(mktemp -d "${TMPDIR:-/tmp}/fdroid.XXXXXX"); chmod 777 "$WORK"; trap 'rm -rf "$WORK"' EXIT
fail() { echo "FDROID FAIL $*"; exit 1; }

COMMIT=$(git -C "$CLONE" rev-parse "$REV^{commit}") || fail "Commit nicht gefunden"
VC=$(sed -n 's/^ *versionCode: *//p' "$HERE/docs/fdroid-metadata-de.huepping.lorely.yml" | head -n 1)
# Rezept: Quelle = lokaler Clone, Stand = COMMIT; Binaries entfällt (Vergleich macht dieses Skript)
sed -e "s#^Repo: .*#Repo: file:///src#" -e "s#^\( *commit:\).*#\1 $COMMIT#" -e '/^Binaries:/d' -e '/^AllowedAPKSigningKeys:/d' \
  "$HERE/docs/fdroid-metadata-de.huepping.lorely.yml" > "$WORK/$ID.yml"
cp "$SIGNED" "$WORK/signed.apk"
echo "Baue $ID:$VC aus ${COMMIT:0:12} im Image $IMAGE"
$DOCKER pull -q "$IMAGE" >/dev/null || fail "Image nicht ladbar"

$DOCKER run --rm -e ID="$ID" -e VC="$VC" -e ANDROID_HOME=/opt/android-sdk \
  -v "$CLONE":/src:ro -v "$WORK":/out "$IMAGE" bash -ec '
  trap "chmod -R a+rwX /out" EXIT
  source /etc/profile.d/bsenv.sh
  export fdroidserver=/tmp/fdroidserver
  apt-get -qq update >/dev/null
  apt-get -qy install sudo apksigcopier >/dev/null
  git clone -q --depth 1 https://gitlab.com/fdroid/fdroidserver.git $fdroidserver
  mkdir -p $home_vagrant/metadata $home_vagrant/unsigned
  cp /out/$ID.yml $home_vagrant/metadata/
  cd $home_vagrant && : > config.yml && chown -R vagrant $home_vagrant
  sudo -u vagrant -H git config --global --add safe.directory "*"
  sudo --preserve-env --user vagrant env PATH=$fdroidserver:$PATH PYTHONPATH=$fdroidserver:$fdroidserver/examples \
    PYTHONUNBUFFERED=true HOME=$home_vagrant fdroid build --verbose --on-server --no-tarball $ID:$VC
  apk=$home_vagrant/unsigned/${ID}_${VC}.apk
  cp "$apk" /out/unsigned.apk
  apksigcopier compare /out/signed.apk --unsigned "$apk"
  sha256sum "$apk" | cut -d" " -f1 > /out/sha.txt' || fail "Build oder Vergleich fehlgeschlagen (Log oben)"
echo "FDROID OK $(cat "$WORK/sha.txt")"
