#!/usr/bin/env bash
# Prépare le projet Xcode : copie le site (index.html, css/, js/) dans ios/www,
# puis génère DiagnoTest.xcodeproj avec XcodeGen (brew install xcodegen).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www
mkdir -p www
cp -R ../index.html ../css ../js www/
xcodegen generate
