#!/bin/sh
# Arma el .exe portable de Windows desde Linux.  Uso: ./build_win.sh [naser|bitty]
set -e
export WINEPREFIX="${WINEPREFIX:-/tmp/wp}"
cd "$(dirname "$0")"
PROFILE="${1:-naser}"
VERSION=$(node -p "require('./package.json').version")
if [ "$PROFILE" = "bitty" ]; then
  CFG="--config build/bitty.json"; OUT=dist-bitty; EXE="Pick Helper Bitty.exe"; NAME="Pick Helper Bitty"; ICON=build/icon_bitty.ico
  cp renderer/icon.png /tmp/icon_naser_backup.png; cp build/icon_bitty.png renderer/icon.png
else
  CFG=""; OUT=dist; EXE="Pick Helper.exe"; NAME="Pick Helper"; ICON=build/icon.ico
fi
echo "{ \"id\": \"$PROFILE\" }" > data/profile.json
restore() { echo '{ "id": "naser" }' > data/profile.json; [ -f /tmp/icon_naser_backup.png ] && mv /tmp/icon_naser_backup.png renderer/icon.png || true; }
trap restore EXIT
rm -rf "$OUT"
npx electron-builder --win dir --x64 $CFG
RC=$(ls ~/.cache/electron-builder/winCodeSign/*/rcedit-x64.exe | head -1)
WINEDEBUG=-all wine "$RC" "$OUT/win-unpacked/$EXE" --set-icon "$ICON" \
  --set-version-string ProductName "$NAME" --set-version-string FileDescription "$NAME" \
  --set-file-version "$VERSION" --set-product-version "$VERSION"
npx electron-builder --win portable --x64 $CFG --prepackaged "$OUT/win-unpacked"
