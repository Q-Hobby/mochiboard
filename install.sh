#!/bin/bash
# Mochiboard installer: builds the app, puts it in ~/Applications and opens it.
#   ./install.sh            build + install + open
#   ./install.sh --update   get the newest version from GitHub first
set -e
cd "$(dirname "$0")"
APP="$HOME/Applications/Mochiboard.app"
CERT="Mochi Local Signing"
[ "${1:-}" = "--update" ] && { echo "  Getting the newest Mochiboard…"; git pull --ff-only; }

echo ""
echo "  🫧  Building Mochiboard… (about 30 seconds)"
if ! command -v swiftc >/dev/null; then
  echo "  Mochiboard needs Apple's command line tools. Installing them now (a window will pop up)…"
  xcode-select --install || true; echo "  When that finishes, run ./install.sh again."; exit 1
fi
rm -rf build && mkdir -p build/Mochiboard.app/Contents/MacOS build/Mochiboard.app/Contents/Resources
if ! swiftc -O Sources/Mochiboard.swift -o build/Mochiboard.app/Contents/MacOS/Mochiboard 2> build/errors.txt; then
  # some Command Line Tools versions ship a duplicate Swift module map; build around it if so
  if grep -q "redefinition of module" build/errors.txt; then
    printf '' > build/empty.modulemap
    printf '{ "version": 0, "case-sensitive": "false", "roots": [ { "type": "file", "name": "/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap", "external-contents": "%s/build/empty.modulemap" } ] }' "$PWD" > build/overlay.yaml
    swiftc -O -vfsoverlay build/overlay.yaml Sources/Mochiboard.swift -o build/Mochiboard.app/Contents/MacOS/Mochiboard
  else cat build/errors.txt; exit 1; fi
fi
cp -R web build/Mochiboard.app/Contents/Resources/web
cp assets/Mochiboard.icns build/Mochiboard.app/Contents/Resources/Mochiboard.icns
cat > build/Mochiboard.app/Contents/Info.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Mochiboard</string>
  <key>CFBundleDisplayName</key><string>Mochiboard</string>
  <key>CFBundleIdentifier</key><string>io.github.jessawolfe-ux.mochiboard</string>
  <key>CFBundleExecutable</key><string>Mochiboard</string>
  <key>CFBundleIconFile</key><string>Mochiboard</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$(cat VERSION 2>/dev/null || echo 1.0.0)</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>MBRepo</key><string>$PWD</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Mochiboard records voice memos onto your board.</string>
  <key>NSCameraUsageDescription</key><string>Mochiboard records videos of you onto your board, only when you press Start recording.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>Mochi writes out your voice memos on your Mac, so you can search and sort them.</string>
</dict></plist>
PLIST
# sign with a local certificate (made once, kept in your login keychain) so macOS treats every rebuild as the same app
if ! security find-certificate -c "$CERT" >/dev/null 2>&1; then
  T="$(mktemp -d)"
  printf '[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = %s\n[ext]\nbasicConstraints = critical,CA:false\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = critical,codeSigning\n' "$CERT" > "$T/cert.cnf"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/key.pem" -out "$T/cert.pem" -days 3650 -config "$T/cert.cnf" >/dev/null 2>&1
  openssl pkcs12 -export -inkey "$T/key.pem" -in "$T/cert.pem" -name "$CERT" -out "$T/c.p12" -passout pass:mochi >/dev/null 2>&1
  security import "$T/c.p12" -k "$HOME/Library/Keychains/login.keychain-db" -P mochi -T /usr/bin/codesign >/dev/null 2>&1 || true
  rm -rf "$T"
fi
codesign --force --deep --sign "$CERT" build/Mochiboard.app >/dev/null 2>&1 || codesign --force --deep --sign - build/Mochiboard.app >/dev/null 2>&1 || true
pkill -x Mochiboard 2>/dev/null && sleep 1.5 || true   # let the old one finish quitting before opening the new one
mkdir -p "$HOME/Applications" && rm -rf "$APP" && cp -R build/Mochiboard.app "$APP"
open "$APP"
echo "  ✓ Mochiboard is in ~/Applications and open."
command -v claude >/dev/null || [ -x "$HOME/.claude/local/claude" ] || echo "  (Mochi thinks with Claude Code. Install it from claude.com/claude-code so she can help on your boards.)"
echo ""
