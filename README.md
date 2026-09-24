# 🩺 DiagnoTest

**Testez le matériel d'un ordinateur ou d'un téléphone en quelques minutes : batterie, processeur, mémoire, écran, clavier, tactile, audio, caméra, capteurs, réseau, stockage et carte graphique.**

DiagnoTest se présente en deux parties :

| | 🌐 **Version web** | 🖥️ **Version PC (Python)** |
|---|---|---|
| Fonctionne sur | Téléphone, tablette, ordinateur (tout navigateur récent) | Windows, Linux, macOS |
| Installation | Aucune : on ouvre une page web | Python 3.8+ (et `psutil`, recommandé) |
| Points forts | Écran, tactile, clavier, audio, micro, caméra, capteurs, GPU | Usure réelle de la batterie, santé des disques, températures, modèles exacts |

👉 **Lancer la version web :** https://crispinoza225.github.io/diagnotest/

> Aucun résultat de test ne quitte l'appareil : tout s'exécute localement, et le rapport n'est enregistré que si vous le téléchargez. La page charge seulement ses polices depuis Google Fonts, et le test réseau télécharge des fichiers publics depuis jsDelivr.

---

## ✨ Fonctionnalités

### Version web

| Test | Contenu |
|---|---|
| 💻 **Système** | OS, navigateur, type d'appareil, cœurs, RAM approximative, GPU, écran, architecture, modèle |
| 🔋 **Batterie** | Niveau, charge, temps restant, **mesure de la décharge sur 5 min** avec estimation de l'autonomie |
| ⚙️ **CPU** | Benchmark mono-cœur et multi-cœurs (Web Workers), **stress test** avec courbe et détection de surchauffe (throttling) |
| 🧠 **RAM** | Allocation de 128 Mo à 2 Go, écriture et vérification de motifs, débit en lecture et en écriture, erreurs détectées |
| 🖥️ **Écran** | Pixels morts (9 couleurs plein écran), dégradés et bandes, damier 1 px, fuite de lumière, **réparation de pixel bloqué**, mesure de la **fréquence (Hz)**, résolution, HDR et gamut |
| 👆 **Tactile & souris** | Grille à balayer pour trouver les zones mortes, **multi-touch** (nombre de doigts), boutons de souris, molette, double-clic |
| ⌨️ **Clavier** | Clavier virtuel AZERTY ou QWERTY qui s'allume touche par touche, pavé numérique et touches spéciales ajoutés automatiquement |
| 🔊 **Haut-parleurs** | Gauche, droite ou les deux, balayage de fréquence de 20 Hz à 20 kHz |
| 🎤 **Micro** | Vumètre, forme d'onde, enregistrement de 5 s avec réécoute |
| 📷 **Caméra** | Toutes les caméras (avant et arrière), résolution maximale, images par seconde |
| 🧭 **Capteurs** | Gyroscope (niveau à bulle), accéléromètre, **vibreur**, **GPS** |
| 🌐 **Réseau** | Type de connexion, latence, gigue, débit descendant |
| 💾 **Stockage** | Quota, débit IndexedDB, vérification d'intégrité |
| 🎮 **GPU** | Modèle, WebGL, benchmark fractal de 10 s (FPS moyen et minimum) |
| 📄 **Rapport** | Résumé coloré, export `.txt` / `.json`, copie dans le presse-papiers |

### Version PC (`desktop/diagnotest.py`)

- **Batterie** : capacité d'origine et capacité actuelle, **pourcentage d'usure**, nombre de cycles (via `powercfg` sur Windows, `/sys` sur Linux, `ioreg` sur macOS)
- **CPU** : modèle exact, cœurs, fréquences, benchmark, **stress test avec températures** et détection du throttling
- **RAM** : barrettes installées (taille, fréquence, fabricant, référence), test de motifs, débit
- **Disques** : modèle, type SSD ou HDD, **état de santé**, remplissage des partitions, **vitesse d'écriture et de lecture**
- **Réseau** : interfaces actives, latence, DNS
- **Système** : fabricant, modèle, n° de série, BIOS, cartes graphiques et pilotes
- Rapport enregistré en `.txt` et `.json`

---

## 🎨 Design

L'interface s'inspire de [Manus](https://manus.im) et [motion-primitives](https://motion-primitives.com) pour le thème clair, de [Watermelon UI](https://ui.watermelon.sh) pour le thème sombre, et de [Haikei](https://haikei.app) pour les formes SVG génératives. Tout est réimplémenté en CSS et JavaScript natifs, sans dépendance : voir [docs/TECHNIQUE.md](docs/TECHNIQUE.md#design).

---

## 🚀 Démarrage rapide

### Sur un téléphone ou un ordinateur (version web)

1. Ouvrez **https://crispinoza225.github.io/diagnotest/** dans Chrome, Edge, Firefox ou Safari.
2. Lancez les tests un par un. Les pastilles en haut de la page passent au vert, à l'orange ou au rouge.
3. Cliquez sur **📄 Rapport** pour obtenir le bilan.

Pour l'utiliser hors ligne, téléchargez le dépôt et ouvrez `index.html` au travers d'un petit serveur local :

```bash
python -m http.server 8000
```

Ouvrez ensuite http://localhost:8000 dans le navigateur.

### Sur PC (version Python)

```bash
pip install psutil
```

```bash
python desktop/diagnotest.py
```

Options utiles :

```bash
python desktop/diagnotest.py --quick
```

```bash
python desktop/diagnotest.py --only battery disk
```

```bash
python desktop/diagnotest.py --stress 300 --ram-mb 4096
```

> 💡 Sous Windows, lancez le terminal **en administrateur** pour lire la température du processeur.

---

## 📚 Documentation

- [Guide d'utilisation](docs/GUIDE.md) : comment faire chaque test et interpréter les résultats
- [Documentation technique](docs/TECHNIQUE.md) : architecture, API utilisées, compatibilité, contribution

## 🧭 Compatibilité (version web)

| Fonction | Chrome / Edge (PC, Android) | Firefox | Safari (Mac, iPhone) |
|---|:-:|:-:|:-:|
| Batterie | ✅ | ❌ | ❌ |
| CPU, RAM, écran, clavier, GPU | ✅ | ✅ | ✅ |
| Vibreur | ✅ Android | ✅ Android | ❌ |
| Gyroscope / accéléromètre | ✅ | ✅ | ✅ (autorisation demandée) |
| Micro, caméra, GPS | ✅ HTTPS | ✅ HTTPS | ✅ HTTPS |

## ⚠️ Avertissements

- Le mode **Réparer pixel bloqué** fait clignoter l'écran. Ne l'utilisez pas si vous êtes sensible à l'épilepsie photosensible.
- Les tests de RAM et de stockage faits dans le navigateur restent limités par celui-ci. Pour un diagnostic poussé, utilisez la version PC, [MemTest86](https://www.memtest86.com/) ou [CrystalDiskInfo](https://crystalmark.info/).
- Les scores CPU et GPU servent à comparer des appareils entre eux avec DiagnoTest. Ce ne sont pas des scores standardisés comme ceux de Geekbench.

## 📄 Licence

[MIT](LICENSE) : libre d'utilisation, de modification et de redistribution.
