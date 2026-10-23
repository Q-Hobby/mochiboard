#!/bin/bash
# Builds the downloadable Mochiboard.zip (Apple chip + Intel) and publishes it as a GitHub Release.
#   ./make-release.sh          build + publish the version in VERSION
#   ./make-release.sh --dry    build the zip only
# People download it from https://github.com/jessawolfe-ux/mochiboard/releases/latest/download/Mochiboard.zip
set -e
cd "$(dirname "$0")"
V="$(cat VERSION)"; OUT=build/release; APP="$OUT/Mochiboard.app"
rm -rf "$OUT" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
echo "  Building Mochiboard $V for Apple chip and Intel Macs…"
build() { swiftc -O -target "$1-apple-macos13" Sources/Mochiboard.swift -o "$OUT/bin-$1" 2>/dev/null || {
  printf '' > build/empty.modulemap
  printf '{ "version": 0, "case-sensitive": "false", "roots": [ { "type": "file", "name": "/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap", "external-contents": "%s/build/empty.modulemap" } ] }' "$PWD" > build/overlay.yaml
  swiftc -O -target "$1-apple-macos13" -vfsoverlay build/overlay.yaml Sources/Mochiboard.swift -o "$OUT/bin-$1"; }; }
build arm64; build x86_64
lipo -create "$OUT/bin-arm64" "$OUT/bin-x86_64" -output "$APP/Contents/MacOS/Mochiboard"
cp -R web "$APP/Contents/Resources/web"; find "$APP" -name .DS_Store -delete
cp assets/Mochiboard.icns "$APP/Contents/Resources/Mochiboard.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Mochiboard</string>
  <key>CFBundleDisplayName</key><string>Mochiboard</string>
  <key>CFBundleIdentifier</key><string>io.github.jessawolfe-ux.mochiboard</string>
  <key>CFBundleExecutable</key><string>Mochiboard</string>
  <key>CFBundleIconFile</key><string>Mochiboard</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$V</string>
  <key>CFBundleVersion</key><string>$V</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Mochiboard records voice memos onto your board.</string>
  <key>NSCameraUsageDescription</key><string>Mochiboard records videos of you onto your board, only when you press Start recording.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>Mochi writes out your voice memos on your Mac, so you can search and sort them.</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"   # ad-hoc: no Apple Developer account, so the first open is right-click → Open
( cd "$OUT" && /usr/bin/ditto -c -k --keepParent Mochiboard.app Mochiboard.zip )
echo "  ✓ $OUT/Mochiboard.zip ($(du -h "$OUT/Mochiboard.zip" | cut -f1))"
[ "${1:-}" = "--dry" ] && exit 0
# release notes: the newest section of WHATSNEW.md
NOTES="$(awk '/^## /{n++} n==1 && /^- /' WHATSNEW.md)"
gh release create "v$V" "$OUT/Mochiboard.zip" --title "Mochiboard $V" --notes "$NOTES

**Download:** Mochiboard.zip below. Unzip it, drag Mochiboard into Applications, then right-click it and choose **Open** the first time (it isn't from the App Store, so your Mac asks once)."
echo "  ✓ Published v$V"
