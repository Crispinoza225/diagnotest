# 🛠️ Documentation technique

## Structure du projet

```
diagnotest/
├── index.html              # Page unique de la version web (une carte par test)
├── css/style.css           # Styles : thème clair ou sombre, grille responsive
├── js/app.js               # Toute la logique des tests (JavaScript natif, sans dépendance)
├── js/design.js            # Couche visuelle : animations et formes SVG génératives
├── desktop/
│   ├── diagnotest.py       # Version PC en ligne de commande
│   ├── requirements.txt    # psutil
│   ├── build_exe.ps1       # Compilation en DiagnoTest.exe (PyInstaller)
│   ├── version_info.txt    # Métadonnées Windows de l'exécutable
│   └── assets/             # Icône de l'application
├── docs/
│   ├── GUIDE.md            # Guide d'utilisation
│   └── TECHNIQUE.md        # Ce fichier
├── .github/workflows/pages.yml       # Déploiement automatique sur GitHub Pages
├── .github/workflows/build-exe.yml   # Compilation et publication de DiagnoTest.exe
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

## Version PC : sources des données

| Donnée | Windows | Linux | macOS |
|---|---|---|---|
| Usure de la batterie | `powercfg /batteryreport /xml` | `/sys/class/power_supply/BAT*/energy_full(_design)` | `ioreg -r -c AppleSmartBattery` |
| Modèle du CPU | `Win32_Processor` | `/proc/cpuinfo` | `sysctl machdep.cpu.brand_string` |
| GPU | `Win32_VideoController` | `lspci` | `system_profiler SPDisplaysDataType` |
| Barrettes de RAM | `Win32_PhysicalMemory` | — | — |
| Santé des disques | `Get-PhysicalDisk` | `lsblk` (+ `smartctl` s'il est présent) | — |
| Température | `MSAcpi_ThermalZoneTemperature` (en administrateur) | `psutil.sensors_temperatures()` | — |

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

## Déploiement

Le workflow `.github/workflows/pages.yml` publie le site sur GitHub Pages à chaque push sur `main`. Pour un autre hébergeur (Netlify, Vercel, serveur Apache ou Nginx), il suffit de copier `index.html`, `css/` et `js/`.

## Confidentialité

- Aucune télémétrie, aucun cookie, et aucun résultat de test n'est envoyé. Les seules requêtes externes sont le chargement des polices depuis Google Fonts et, pendant le test réseau, le téléchargement de fichiers publics depuis `cdn.jsdelivr.net`. Le thème choisi est conservé dans le `localStorage`.
- Les coordonnées GPS sont affichées à l'écran mais ne figurent jamais dans le rapport.

## Contribuer

1. Forkez le dépôt et créez une branche : `git checkout -b mon-test`.
2. Testez sur au moins un navigateur de bureau et un téléphone. Pour tester sur téléphone en local, servez la page en HTTPS ou passez par le débogage USB : caméra, micro et capteurs exigent un contexte sécurisé.
3. Ouvrez une Pull Request qui décrit le test ajouté et les navigateurs vérifiés.
