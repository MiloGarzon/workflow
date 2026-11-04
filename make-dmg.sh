#!/bin/zsh
# Packages build/FilmFlow Workflow.app into a drag-to-install DMG
set -e
cd "$(dirname "$0")"
VER=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "build/FilmFlow Workflow.app/Contents/Info.plist")
STAGE=build/dmg; rm -rf $STAGE; mkdir -p $STAGE
cp -R "build/FilmFlow Workflow.app" $STAGE/
ln -s /Applications $STAGE/Aplicaciones
cat > "$STAGE/LÉEME - Instalación.txt" <<TXT
FilmFlow Workflow $VER

1. Arrastra "FilmFlow Workflow" a la carpeta "Aplicaciones".
2. La primera vez, abre Aplicaciones, haz clic derecho sobre la app y elige "Abrir"
   (macOS pide confirmación porque la app no está publicada en la App Store).
   Si no aparece la opción: Ajustes del Sistema › Privacidad y seguridad › "Abrir igualmente".
3. Para traer tus proyectos: abre "Mis proyectos" › "Restaurar…" (desde iCloud Drive),
   o "Importar archivo…" con un .ffworkflow.

Requiere macOS 12 o superior. Funciona en Mac con Apple Silicon e Intel.
TXT
OUT="build/FilmFlow Workflow $VER.dmg"
rm -f "$OUT"
hdiutil create -volname "FilmFlow Workflow" -srcfolder $STAGE -ov -format UDZO "$OUT" >/dev/null
codesign --force -s - "$OUT" 2>/dev/null || true
rm -rf $STAGE
echo "$OUT"
