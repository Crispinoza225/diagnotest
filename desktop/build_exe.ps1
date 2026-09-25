# Compile desktop/diagnotest.py en un exécutable Windows autonome : dist/DiagnoTest.exe
# Utilisation (depuis la racine du dépôt) :  powershell -ExecutionPolicy Bypass -File desktop/build_exe.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
python -m pip install --quiet --upgrade pyinstaller -r "$root\desktop\requirements.txt"
python -m PyInstaller --onefile --console --clean --noconfirm --name DiagnoTest `
  --icon "$root\desktop\assets\diagnotest.ico" `
  --version-file "$root\desktop\version_info.txt" `
  --hidden-import psutil `
  --distpath "$root\dist" --workpath "$root\build" --specpath "$root\build" `
  "$root\desktop\diagnotest.py"
& "$root\dist\DiagnoTest.exe" --version