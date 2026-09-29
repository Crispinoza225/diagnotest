# 🛠️ Documentation technique

## Structure du projet

```
diagnotest/
├── index.html              # Page unique de la version web (une carte par test)
├── css/style.css           # Styles : thème clair ou sombre, grille responsive
├── js/app.js               # Toute la logique des tests (JavaScript natif, sans dépendance)
├── js/bilan.js             # Diagnostic express, note de santé, recommandations, certificat, historique, partage
├── js/design.js            # Couche visuelle : animations et formes SVG génératives
├── desktop/
│   ├── diagnotest.py       # Version PC en ligne de commande
│   ├── requirements.txt    # psutil
│   ├── build_exe.ps1       # Compilation en DiagnoTest.exe (PyInstaller)
│   ├── version_info.txt    # Métadonnées Windows de l'exécutable
│   └── assets/             # Icône de l'application
├── android/                # Application Android (WebView + pont natif Java, sans dépendance)
│   ├── app/build.gradle    # Copie le site dans les assets à chaque compilation
│   └── app/src/main/java/…/MainActivity.java, DiagnoBridge.java
├── ios/                    # Application iOS (Swift, WKWebView + pont natif, sans dépendance)
│   ├── project.yml         # Description du projet, générée en .xcodeproj par XcodeGen
│   ├── prepare.sh          # Copie le site dans ios/www puis lance XcodeGen
│   └── DiagnoTest/         # AppDelegate.swift, WebViewController.swift, Bridge.swift, icône
├── manifest.webmanifest, sw.js, icons/   # Application web installable (PWA, hors ligne)
├── docs/
│   ├── GUIDE.md            # Guide d'utilisation
│   └── TECHNIQUE.md        # Ce fichier
├── tests/
│   ├── e2e.cjs             # Tests de bout en bout de la version web (Playwright, Chromium sans écran)
│   └── test_desktop.py     # Tests unitaires de la version PC (note de santé, rapport HTML, analyse USB)
├── .github/workflows/tests.yml       # Lance tous les tests à chaque push et Pull Request
├── .github/workflows/pages.yml       # Déploiement automatique sur GitHub Pages
├── .github/workflows/build-exe.yml   # Compilation et publication de DiagnoTest.exe
├── .github/workflows/build-apk.yml   # Compilation et publication de DiagnoTest.apk
├── .github/workflows/build-ios.yml   # Compilation iOS, test dans le simulateur, .ipa non signé
├── LICENSE
└── README.md
```

La version web n'a **ni framework, ni étape de compilation, ni dépendance**. On l'ouvre et elle tourne. On peut donc l'héberger sur n'importe quel serveur statique.

## Architecture de `js/app.js`

- Chaque test a sa fonction `initXxx()`, appelée au chargement de la page (`DOMContentLoaded`).
- Les résultats sont centralisés dans l'objet `results` et passent tous par `setResult(id, status, data)` :
  - `id` est l'identifiant du test (attribut `data-test` de la carte HTML) ;
  - `status` vaut `ok`, `warn`, `ko` ou `info` ;
  - `data` est un objet clé → valeur, fusionné avec les données déjà présentes.
- `renderSummary()` redessine les pastilles, et `buildReport()` construit le rapport texte.
- L'overlay plein écran (`openOverlay` / `closeOverlay`) sert aux tests d'écran et du tactile.
- **Mode rapide** : avec `?rapide` dans l'adresse, `duree()` ramène les mesures longues (benchmarks, stress, décharge) à moins d'une seconde. Il ne sert qu'aux tests automatiques.

## Architecture de `js/bilan.js`

`bilan.js` est chargé juste après `app.js`. Les deux fichiers sont des scripts classiques : les constantes et fonctions de premier niveau d'`app.js` (`results`, `setResult`, `buildReport`, `download`, `nativeCall`…) sont donc directement visibles depuis `bilan.js`. `app.js` n'appelle `bilan.js` que si ses fonctions existent (`typeof calculerNote === 'function'`) : il fonctionne aussi seul.

| Fonction | Rôle |
|---|---|
| `calculerNote(res)` | Note sur 100 : moyenne pondérée par `POIDS` (OK = 100, à surveiller = 60, défaut = 0, info ignorée). Un défaut matériel (hors réseau) plafonne la note à 69. |
| `recommandations(res)` | Un conseil par test en défaut ou à surveiller (`CONSEILS`), précisé par les mesures quand c'est utile (charge lente, usure…). Les défauts d'abord. |
| `diagnosticExpress()` | Clique tour à tour les boutons des tests automatiques (`ETAPES_EXPRESS`) et attend que `results[id].at` change. Émet `diag:express` à la fin. |
| `instantane()` | Copie autonome du diagnostic (textes sans HTML) : base de l'historique, du certificat, du lien et de l'export `.json`. |
| `codeRapport(inst)` | Empreinte SHA-256 de l'instantané (12 caractères hexadécimaux), affichée sur le certificat et vérifiée à l'ouverture d'un lien. |
| `encoderRapport` / `decoderRapport` | Instantané → JSON → `CompressionStream('deflate-raw')` → base64url, placé après `#rapport=` dans l'adresse (préfixe `z`, ou `j` sans compression). |
| `certificatHTML(inst)` | Page HTML autonome (styles intégrés, données échappées), imprimée depuis un `iframe` ou enregistrée en `.html` dans les applications. |
| `enregistrerHistorique`, `tableComparaison` | Historique dans `localStorage` (`dt-historique`, 30 entrées) ; comparaison des mesures de `METRIQUES`, la meilleure valeur en vert. |

## Tests automatiques

```bash
npm install --no-save playwright
npx playwright install chromium
node tests/e2e.cjs
```

```bash
python -m unittest discover -s tests
```

`e2e.cjs` sert lui-même le site, l'ouvre avec `?rapide` et vérifie : le diagnostic express de bout en bout, les calculs de note et de recommandations, le rapport, le certificat (données échappées, code), l'aller-retour du lien de partage et la détection d'une modification, l'historique et la comparaison, l'affichage sur téléphone et l'absence d'erreur JavaScript. Le workflow `.github/workflows/tests.yml` lance ces tests, et ceux de la version PC sous Linux et Windows, à chaque push et Pull Request.

### Ajouter un test

1. Dans `index.html`, ajoutez une carte :
   ```html
   <section class="card" id="t-montest" data-test="montest" data-title="Mon test">
     <h2>🔧 Mon test</h2>
     <button class="btn primary" id="monBtn">Lancer</button>
     <dl class="kv" id="monOut"></dl>
     <div class="verdict" data-for="montest"></div> <!-- facultatif : verdict manuel -->
   </section>
   ```
2. Dans `js/app.js`, écrivez la fonction :
   ```js
   function initMonTest() {
     $('#monBtn').onclick = async () => {
       const data = { 'Mesure': '42' };
       kv($('#monOut'), data);
       setResult('montest', 'ok', data);
     };
   }
   ```
3. Ajoutez l'appel `initMonTest();` dans le bloc `DOMContentLoaded`.

Le test apparaît alors automatiquement dans le résumé et dans le rapport.

## Design

L'interface s'inspire de quatre sources, réimplémentées en CSS et JavaScript natifs (aucune dépendance) :

| Source | Ce qui est repris | Où |
|---|---|---|
| [Manus](https://manus.im) | Fond blanc cassé, titres serif (*Instrument Serif*), boutons pilule noirs, sobriété | `css/style.css` (thème clair) |
| [motion-primitives](https://motion-primitives.com) | *TextEffect* (mots en fondu flouté), *TextShimmer*, *Spotlight* (halo sous le pointeur), *BorderTrail* (bordure animée pendant un test), *AnimatedNumber*, *InView*, *Magnetic* | `js/design.js` |
| [Watermelon UI](https://ui.watermelon.sh) | Thème sombre quasi noir avec accent vert citron, labels en police mono majuscule, coins « + », grille technique | `css/style.css` (thème sombre) |
| [Haikei](https://haikei.app) | Blobs organiques flous et vagues superposées, générés en SVG à partir d'une graine | `js/design.js` (`smoothPath`, `layeredWaves`) |

- Les couleurs sont des variables CSS (`--bg`, `--ink`, `--accent`…) redéfinies pour le thème sombre : les formes SVG les utilisent directement et suivent donc le changement de thème.
- `app.js` émet l'événement `diag:result` à chaque résultat ; `design.js` l'écoute pour mettre à jour les badges et la progression globale. Les deux fichiers restent indépendants.
- Toutes les animations sont désactivées quand `prefers-reduced-motion` est actif.

## API web utilisées

| Test | API | Remarque |
|---|---|---|
| Système | `navigator.userAgentData.getHighEntropyValues`, `hardwareConcurrency`, `deviceMemory`, `WEBGL_debug_renderer_info` | `deviceMemory` est plafonné (8 Go sur la plupart des navigateurs) |
| Batterie | `navigator.getBattery()` | Chromium seulement |
| CPU | `Web Workers`, lancés depuis un Blob URL | Charge mixte : entiers (générateur congruentiel) et flottants (`sqrt`) |
| RAM | `Uint32Array`, par blocs de 32 Mo | Deux motifs inverses (`0xA5A5A5A5 ^ i`, `0x5A5A5A5A ^ i`) |
| Écran | Fullscreen API, `requestAnimationFrame`, media queries `color-gamut` et `dynamic-range` | La fréquence est la médiane des intervalles entre frames |
| Tactile | Pointer Events, `getCoalescedEvents()` | Cases de 44 px |
| Clavier | `KeyboardEvent.code` (position physique de la touche) | Indépendant de la disposition du clavier |
| Audio | Web Audio : `OscillatorNode`, `StereoPannerNode` | |
| Micro | `getUserMedia`, `AnalyserNode`, `MediaRecorder` | Traitements audio désactivés pour tester le micro brut |
| Caméra | `getUserMedia` avec `ideal` 4096×2160, `enumerateDevices` | |
| Capteurs | `DeviceOrientationEvent`, `DeviceMotionEvent`, `navigator.vibrate`, Geolocation | `requestPermission()` sur iOS |
| Réseau | Network Information API, `fetch` vers jsDelivr | Latence = médiane de 5 requêtes (la 1re, avec DNS et TLS, est écartée) |
| Stockage | `navigator.storage.estimate()`, IndexedDB | |
| GPU | WebGL : shader de Mandelbrot, 256 itérations, 4 passes par frame | |
| Chargeur | `getBattery()` (progression du niveau) ; `currentNow` du pont Android (courant en mA) | Sous 80 % de charge, pour éviter le ralentissement de fin de charge |
| Flou de mouvement | `requestAnimationFrame`, blocs à 240, 480 et 960 px/s | Jugement visuel du *ghosting* |
| Bruit du micro | `AnalyserNode`, niveau RMS converti en dBFS, médiane sur 3 s | |
| Photo, lampe | `ImageCapture.takePhoto()` (repli : image du flux vidéo), contrainte `torch` | La lampe n'apparaît que si `getCapabilities().torch` existe |
| Boussole, luminosité | `deviceorientationabsolute`, `webkitCompassHeading` (iOS), `AmbientLightSensor` | |
| Manettes | Gamepad API (`getGamepads`, `vibrationActuator.playEffect`) | Dérive : écart maximal des axes au repos pendant 3 s, seuil 0,1 |
| Ports USB | WebUSB (`navigator.usb.requestDevice`, `getDevices`, événement `disconnect`), repli WebHID | Noms d'appareils insérés en `textContent` (données venues du matériel) |
| Faux contact USB | `getBattery().charging` ou `charging` du pont natif, lu toutes les 200 ms | Chaque passage de « en charge » à « pas en charge » compte une coupure |
| Bluetooth | `navigator.bluetooth.getAvailability()` | Chromium seulement |
| Partage | `CompressionStream`, `crypto.subtle.digest` | Repli sans compression ou empreinte FNV-1a si indisponibles |

## Version PC : sources des données

| Donnée | Windows | Linux | macOS |
|---|---|---|---|
| Usure de la batterie | `powercfg /batteryreport /xml` | `/sys/class/power_supply/BAT*/energy_full(_design)` | `ioreg -r -c AppleSmartBattery` |
| Modèle du CPU | `Win32_Processor` | `/proc/cpuinfo` | `sysctl machdep.cpu.brand_string` |
| GPU | `Win32_VideoController` | `lspci` | `system_profiler SPDisplaysDataType` |
| Barrettes de RAM | `Win32_PhysicalMemory` | — | — |
| Santé des disques | `Get-PhysicalDisk` | `lsblk` (+ `smartctl` s'il est présent) | — |
| Appareils USB | `Get-PnpDevice -PresentOnly` (statut et code de problème) | `lsusb` ou `/sys/bus/usb/devices`, erreurs de `dmesg` | `system_profiler SPUSBDataType -json` |
| Réparation USB | `powercfg` (suspension sélective), `pnputil /scan-devices` et `/restart-device` | `/sys/module/usbcore/parameters/autosuspend`, `power/control` | — |
| Température | `MSAcpi_ThermalZoneTemperature` (en administrateur) | `psutil.sensors_temperatures()` | — |

La version PC calcule la même note de santé que la version web (`note_sante`, `recommandations`, poids propres à ses six tests) et enregistre, en plus du `.txt` et du `.json`, un rapport `.html` imprimable.

Le benchmark CPU utilise `multiprocessing` (un processus par thread logique) pour contourner le GIL de Python.

### Exécutable Windows (.exe)

Il est compilé avec PyInstaller en un seul fichier qui embarque Python et `psutil`, avec l'icône `desktop/assets/diagnotest.ico` et les métadonnées de `desktop/version_info.txt`.

**Compilation locale :**

```bash
powershell -ExecutionPolicy Bypass -File desktop/build_exe.ps1
```

Le résultat se trouve dans `dist/DiagnoTest.exe`.

**Publication d'une version :** le workflow `.github/workflows/build-exe.yml` compile l'exécutable sur un runner Windows propre, le teste, calcule son empreinte SHA-256, puis le joint à une Release GitHub. Il suffit de pousser une étiquette :

```bash
git tag v1.0.1
```

```bash
git push origin v1.0.1
```

Pensez à changer `__version__` dans `diagnotest.py` et les numéros dans `version_info.txt`.

Détails propres à l'exécutable :
- l'appel `mp.freeze_support()` permet à `multiprocessing` (benchmark CPU) de fonctionner une fois compilé ;
- lancé par double-clic, sans argument, il attend Entrée avant de se fermer pour qu'on puisse lire les résultats ;
- il n'est pas signé : Windows SmartScreen affiche donc un avertissement au premier lancement.

## Application Android

### Architecture
- `MainActivity` affiche le site dans une WebView. Les fichiers sont servis depuis les assets sous `https://appassets.androidplatform.net/www/`, un domaine réservé à cet usage. La page est ainsi un **contexte sécurisé**, ce qui est indispensable pour `getUserMedia` (caméra, micro) et la géolocalisation.
- `app/build.gradle` copie `index.html`, `css/` et `js/` dans les assets à chaque compilation : le site et l'application ont **une seule source**.
- `MainActivity` gère aussi les permissions Android (caméra, micro, localisation, demandées seulement au moment du test), le plein écran des tests d'écran (`onShowCustomView`), le bouton retour (`OnBackInvokedCallback` sur Android 13 et plus), l'affichage bord à bord et l'ouverture des liens externes dans le navigateur.
- `DiagnoBridge` est exposé à la page sous `window.DiagnoAndroid` :

| Méthode | Renvoie |
|---|---|
| `getDeviceInfo()` | JSON : modèle, SoC, ABI, cœurs, fréquence max, RAM (`ActivityManager`), stockage (`StatFs`), écran (`Display`), capteurs (`SensorManager`), équipements (`PackageManager`) |
| `getBatteryInfo()` | JSON : `ACTION_BATTERY_CHANGED` (niveau, santé, température, tension, cycles), `BatteryManager` (compteur de charge, courant), capacité d'origine (`PowerProfile`, sinon `/sys`) |
| `vibrate(motif)` | `true` si le vibreur a été actionné |
| `saveFile(nom, contenu, type)` | Emplacement du fichier enregistré dans Téléchargements/DiagnoTest (`MediaStore`) |
| `shareText(titre, texte)` | Ouvre le menu de partage Android |
| `setSystemBarColor(couleur)` | Accorde les barres système au thème de la page |

- Dans `js/app.js`, `nativeCall()` appelle ces méthodes quand elles existent. Sans le pont, dans un navigateur, chaque test garde son comportement web.

### Compilation locale
Prérequis : Android Studio, ou un JDK 17+ avec le SDK Android 36.

`ash
cd android
`

`ash
./gradlew assembleRelease
`

L'APK se trouve dans `android/app/build/outputs/apk/release/app-release.apk`. Une compilation debug (`assembleDebug`) active l'inspection de la WebView dans `chrome://inspect`.

### Signature
La clé n'est **jamais** dans le dépôt. `app/build.gradle` lit `~/.diagnotest/keystore.properties` (ou le chemin indiqué dans `DIAGNOTEST_KEYSTORE_PROPERTIES`) :

`properties
storeFile=C:/Users/<vous>/.diagnotest/diagnotest-release.jks
storePassword=…
keyAlias=diagnotest
keyPassword=…
`

Sans ce fichier, l'APK est signé avec la clé de debug, ce qui convient pour les tests. **Gardez une sauvegarde de la clé** : sans elle, impossible de publier une mise à jour installable par-dessus la version existante.

Pour que GitHub Actions signe et publie l'APK à chaque étiquette `v*`, ajoutez deux secrets au dépôt (*Settings → Secrets and variables → Actions*) : `ANDROID_KEYSTORE_B64` (la clé encodée en base64) et `ANDROID_KEYSTORE_PASSWORD`. Sans ces secrets, le workflow compile quand même un APK de test, mais ne le publie pas dans la release.

## Application iOS

*(voir aussi « Application web installable » ci-dessous)*

### Architecture
- `WebViewController` affiche le site dans un `WKWebView`, chargé en `file://` depuis le dossier `www` du bundle. WebKit considère `file://` comme un contexte sécurisé, ce qui permet caméra, micro et géolocalisation.
- `Bridge.swift` injecte au démarrage de la page un script qui expose `window.DiagnoNative`, avec **la même interface que le pont Android**. `js/app.js` n'a donc qu'un seul chemin de code : `const NATIVE = window.DiagnoNative || window.DiagnoAndroid`.
- Les messages WebKit sont asynchrones. Les lectures (`getDeviceInfo`, `getBatteryInfo`) sont donc servies depuis `window.__diagIOS`, que Swift remplit à l'injection puis met à jour à chaque notification (niveau, état de charge, état thermique, économie d'énergie). Les actions (`vibrate`, `saveFile`, `shareText`, `setSystemBarColor`, `setImmersive`) sont envoyées à Swift via `webkit.messageHandlers.diag`.
- Mesures natives : identifiant du modèle (`uname`) et table nom/puce, `ProcessInfo` (RAM, cœurs, état thermique, économie d'énergie), capacité du volume, `UIScreen` (résolution native, `maximumFramesPerSecond`, EDR), CoreMotion (accéléromètre, gyroscope, magnétomètre, baromètre, podomètre), `LAContext` (Face ID / Touch ID), vibrations Core Haptics (repli sur la vibration système).
- **Limite d'iOS** : aucune API publique ne donne la santé, la température, la tension ou les cycles de la batterie.
- `setImmersive` masque la barre d'état et l'indicateur d'accueil pendant les mires d'écran, et étend la WebView sous les zones sûres.

### Compiler sur un Mac
```bash
brew install xcodegen
```

```bash
bash ios/prepare.sh
```

```bash
open ios/DiagnoTest.xcodeproj
```

Dans Xcode, choisissez votre équipe dans *Signing & Capabilities*, puis lancez l'app sur un iPhone branché. Une compilation Debug rend la WebView inspectable depuis Safari (*Développement*).

### Intégration continue
`.github/workflows/build-ios.yml` s'exécute sur un Mac de GitHub :
1. il génère le projet ;
2. il compile pour le simulateur ;
3. il lance l'app dans un simulateur d'iPhone et enregistre des captures de l'accueil, du système, de la batterie, de l'écran et des capteurs (artefact `captures-simulateur-ios`) ;
4. il remonte les erreurs JavaScript captées par l'app ;
5. il compile pour iPhone sans signature et produit `DiagnoTest-iOS-non-signe.ipa`, joint à la release à chaque étiquette `v*`.

### Publier sur l'App Store ou TestFlight
Il faut un compte Apple Developer. Il faut aussi un Mac, ou ajouter au workflow un certificat de distribution et un profil de provisionnement dans les secrets du dépôt. Ensuite : *Product → Archive* dans Xcode, puis *Distribute App*. L'app ne collecte aucune donnée, ce qui simplifie la fiche de confidentialité de l'App Store.

## Application web installable (PWA)
- `manifest.webmanifest` : nom, icônes (dont une icône *maskable* pour Android) et affichage `standalone`.
- `sw.js` : le service worker met le site en cache. Pour les fichiers du site, le réseau passe d'abord (mises à jour immédiates) et le cache sert en secours. Pour les polices, le cache passe d'abord. Le test réseau n'est jamais mis en cache, sinon il mesurerait le cache. Changez `CACHE` à chaque version.
- Le service worker n'est enregistré ni dans les applications Android et iOS, ni hors HTTPS.
- Sur iPhone, `design.js` affiche une bannière « Sur l'écran d'accueil » dans Safari, sauf si l'app est déjà installée ou si l'utilisateur a fermé la bannière.

## Déploiement

Le workflow `.github/workflows/pages.yml` publie le site sur GitHub Pages à chaque push sur `main`. Pour un autre hébergeur (Netlify, Vercel, serveur Apache ou Nginx), il suffit de copier `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest` et `sw.js`.

## Confidentialité

- Aucune télémétrie, aucun cookie, et aucun résultat de test n'est envoyé. Les seules requêtes externes sont le chargement des polices depuis Google Fonts et, pendant le test réseau, le téléchargement de fichiers publics depuis `cdn.jsdelivr.net`. Le thème choisi et l'historique des diagnostics sont conservés dans le `localStorage` de l'appareil.
- Le lien de partage contient le rapport dans la partie `#…` de l'adresse, que les navigateurs n'envoient jamais au serveur.
- Les coordonnées GPS sont affichées à l'écran mais ne figurent jamais dans le rapport.

## Contribuer

1. Forkez le dépôt et créez une branche : `git checkout -b mon-test`.
2. Testez sur au moins un navigateur de bureau et un téléphone. Pour tester sur téléphone en local, servez la page en HTTPS ou passez par le débogage USB : caméra, micro et capteurs exigent un contexte sécurisé.
3. Ouvrez une Pull Request qui décrit le test ajouté et les navigateurs vérifiés.
