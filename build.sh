#!/bin/zsh
# Builds "FilmFlow Workflow.app" into ./build
set -e
cd "$(dirname "$0")"
APP="build/FilmFlow Workflow.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/tmp
swiftc -O -swift-version 5 -target arm64-apple-macos12 Sources/main.swift -o build/tmp/ff-arm64
swiftc -O -swift-version 5 -target x86_64-apple-macos12 Sources/main.swift -o build/tmp/ff-x86 2>/dev/null && \
  lipo -create build/tmp/ff-arm64 build/tmp/ff-x86 -output "$APP/Contents/MacOS/FilmFlowWorkflow" || \
  cp build/tmp/ff-arm64 "$APP/Contents/MacOS/FilmFlowWorkflow"
cp -R web "$APP/Contents/Resources/web"
# icon: full logo for large sizes, the mark alone for 16/32 px
if [ ! -f build/tmp/AppIcon.icns ] || [ tools/icon.swift -nt build/tmp/AppIcon.icns ] || [ assets/logo-full.png -nt build/tmp/AppIcon.icns ]; then
  swiftc -O tools/icon.swift -o build/tmp/icon
  build/tmp/icon assets/logo-full.png build/tmp/icon-full.png 1024 0.5
  build/tmp/icon assets/logo-mark.png build/tmp/icon-mark.png 1024 0.5
  ICS=build/tmp/AppIcon.iconset; rm -rf $ICS; mkdir -p $ICS
  for s in 16 32 128 256 512; do
    SRC=build/tmp/icon-full.png; [ $s -le 32 ] && SRC=build/tmp/icon-mark.png
    sips -z $s $s $SRC --out $ICS/icon_${s}x${s}.png >/dev/null
    sips -z $((s*2)) $((s*2)) $SRC --out $ICS/icon_${s}x${s}@2x.png >/dev/null
  done
  iconutil -c icns $ICS -o build/tmp/AppIcon.icns
  sips -z 128 128 build/tmp/icon-mark.png --out web/brand-icon.png >/dev/null
  sips -z 180 180 build/tmp/icon-full.png --out web/apple-touch-icon.png >/dev/null
fi
cp build/tmp/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>FilmFlow Workflow</string>
  <key>CFBundleDisplayName</key><string>FilmFlow Workflow</string>
  <key>CFBundleIdentifier</key><string>com.filmflowtv.workflow</string>
  <key>CFBundleExecutable</key><string>FilmFlowWorkflow</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.2</string>
  <key>CFBundleVersion</key><string>3</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHumanReadableCopyright</key><string>FilmFlow</string>
  <key>CFBundleDocumentTypes</key><array><dict>
    <key>CFBundleTypeName</key><string>Proyecto FilmFlow Workflow</string>
    <key>CFBundleTypeRole</key><string>Editor</string>
    <key>LSHandlerRank</key><string>Owner</string>
    <key>LSItemContentTypes</key><array><string>com.filmflowtv.workflow.project</string></array>
  </dict></array>
  <key>UTExportedTypeDeclarations</key><array><dict>
    <key>UTTypeIdentifier</key><string>com.filmflowtv.workflow.project</string>
    <key>UTTypeDescription</key><string>Proyecto FilmFlow Workflow</string>
    <key>UTTypeConformsTo</key><array><string>public.json</string></array>
    <key>UTTypeTagSpecification</key><dict><key>public.filename-extension</key><array><string>ffworkflow</string></array></dict>
  </dict></array>
</dict></plist>
PLIST
xattr -cr "$APP"  # iCloud Drive adds Finder metadata that breaks signing
codesign --force --deep -s - "$APP"
echo "Built: $APP"
