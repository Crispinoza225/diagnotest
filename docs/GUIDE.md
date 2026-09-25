# 📖 Guide d'utilisation de DiagnoTest

Ce guide explique comment faire chaque test et comment lire les résultats. Si vous achetez un appareil d'occasion, faites **tous** les tests : il suffit d'une dizaine de minutes.

- [Avant de commencer](#avant-de-commencer)
- [Tests de la version web](#tests-de-la-version-web)
- [Application Android](#application-android)
- [iPhone et iPad](#iphone-et-ipad)
- [Version PC (Python)](#version-pc-python)
- [Le rapport](#le-rapport)
- [Questions fréquentes](#questions-fréquentes)
- [Check-list pour un achat d'occasion](#check-list-pour-un-achat-doccasion)

---

## Avant de commencer

- Utilisez de préférence **Chrome** ou **Edge** : ce sont eux qui exposent le plus d'informations, la batterie notamment.
- Pour la caméra, le micro et le GPS, le navigateur demande une **autorisation**. Acceptez-la : les données restent sur l'appareil.
- Ces trois fonctions ne marchent qu'en **HTTPS** (c'est le cas de GitHub Pages) ou sur `localhost`.
- Fermez les applications lourdes avant les benchmarks, sinon les scores seront faussés.

**Les pastilles de couleur en haut de la page :**

| Couleur | Signification |
|---|---|
| ⚪ Gris | Pas encore testé |
| 🔵 Bleu | Information seulement, pas de verdict |
| 🟢 Vert | OK |
| 🟠 Orange | À surveiller |
| 🔴 Rouge | Défaut détecté |

Les tests qui dépendent de vos yeux ou de vos oreilles (écran, son, clavier…) ont des boutons **✓ Fonctionne** et **✗ Défaut** : c'est vous qui donnez le verdict.

---

## Tests de la version web

### 💻 Informations système
Ces informations s'affichent automatiquement. Comparez-les avec l'annonce ou la fiche technique : nombre de cœurs, carte graphique, résolution d'écran.

> La RAM indiquée par le navigateur est **plafonnée** (par exemple « ≥ 8 Go » alors qu'il y en a 32) pour des raisons de vie privée. La valeur exacte est donnée par la version PC.

### 🔋 Batterie
- **Niveau, charge, autonomie** : lus en direct.
- **Mesurer la décharge (5 min)** : débranchez le chargeur, lancez le test et utilisez l'appareil normalement. DiagnoTest calcule la décharge en %/heure et en déduit l'autonomie totale.
  - Téléphone au repos : moins de 10 %/h, c'est bien.
  - Ordinateur portable en bureautique : de 10 à 25 %/h, c'est normal.
  - Plus de 30 %/h : batterie usée, ou un programme qui tourne en arrière-plan.
- Pour connaître **l'usure réelle** (capacité actuelle comparée à celle d'origine) :
  - sur PC, utilisez la version Python ;
  - sur iPhone : *Réglages → Batterie → État de la batterie* ;
  - sur Android : composez `*#*#4636#*#*` sur certains modèles, ou passez par l'application AccuBattery.

### ⚙️ Processeur (CPU)
- **Benchmark** : 3 s sur un seul cœur, puis 3 s sur tous les cœurs.
  - *Efficacité multi-cœurs* : un processeur à 8 threads donne en général ×4 à ×7. Beaucoup moins que ça peut indiquer un problème de refroidissement ou un mode économie d'énergie actif.
- **Stress test** : charge tous les cœurs pendant 30 s, 1 min ou 5 min et trace une courbe.
  - Une courbe **plate** signifie que le refroidissement est bon.
  - Une courbe **qui chute de plus de 25 %** indique une surchauffe (*throttling*) : ventilateur encrassé ou pâte thermique sèche.
  - Branchez le chargeur pour tester les performances maximales.

### 🧠 Mémoire (RAM)
Choisissez une taille, puis **Tester la RAM**. DiagnoTest écrit des motifs alternés dans la mémoire et relit chaque valeur.
- **0 erreur** est le seul résultat normal.
- **Plus de 0 erreur** : la mémoire est défectueuse. Confirmez avec MemTest86.
- « Limite atteinte » veut seulement dire que le navigateur refuse d'allouer davantage. Ce n'est pas une panne.

### 🖥️ Écran
Tous ces tests s'ouvrent en **plein écran**. Pour avancer, cliquez, touchez l'écran ou appuyez sur la flèche droite. Pour quitter, appuyez sur **Échap** ou sur **✕ Quitter**.

| Test | Ce qu'il faut chercher |
|---|---|
| **Pixels morts** | Sur chaque couleur, un point qui ne change pas : noir sur fond blanc = pixel mort, point coloré sur fond noir = pixel bloqué. |
| **Dégradés / bandes** | 1) Les dégradés doivent être lisses. 2) Les 32 bandes de gris doivent **toutes** être distinguables. 3) Le damier fin doit paraître gris uniforme, sans moiré. |
| **Fuite de lumière** | Dans une pièce sombre, sur l'écran noir : des halos clairs dans les coins signalent une fuite de rétroéclairage (écrans LCD). Un écran OLED doit être parfaitement noir. |
| **Réparer pixel bloqué** ⚠️ | Placez le carré clignotant sur le pixel bloqué pendant 10 à 30 min. Cela marche parfois sur un pixel *bloqué* (coloré), jamais sur un pixel *mort* (noir). |
| **Fréquence (Hz)** | Doit correspondre à la fiche technique (60, 90, 120, 144 Hz…). Si la valeur est plus basse, vérifiez les paramètres d'affichage ou le mode économie d'énergie. |

Sur OLED (téléphones récents), regardez aussi le **gris 50 %** : des formes fantômes à cet endroit trahissent un *burn-in* (marquage).

### 👆 Tactile & pointeur
- **Test de la dalle tactile** : balayez toutes les cases avec le doigt. Les cases qui restent grises alors que vous passez dessus sont des **zones mortes**.
- Posez plusieurs doigts en même temps : le nombre maximal de points s'affiche (5 ou 10 sur la plupart des écrans).
- **Zone souris** : cliquez avec chaque bouton, faites tourner la molette et double-cliquez. Chaque action réussie passe au vert.

### ⌨️ Clavier
1. Choisissez **AZERTY** ou **QWERTY**.
2. **Cliquez dans la zone du clavier** : cela empêche les touches comme Tab ou F5 d'agir sur la page.
3. Appuyez sur toutes les touches une par une. Chaque touche qui répond passe au vert.
4. Les touches qui ne figurent pas sur le schéma (pavé numérique, touches multimédia) s'ajoutent automatiquement en dessous.

> Certaines touches sont interceptées par le système et ne peuvent pas être détectées par une page web : **Fn**, **Win + …**, **Alt + Tab**, **Ctrl + Alt + Suppr**, ainsi que certaines touches de luminosité et de volume.

Sur téléphone, tapez dans le champ texte pour vérifier le clavier virtuel.

### 🔊 Haut-parleurs
- **◀ Gauche / Droite ▶** : le bip doit venir du bon côté. S'il vient des deux côtés, l'appareil est en mono, ce qui est normal sur beaucoup de téléphones.
- **Balayage de 20 Hz à 20 kHz** : le son monte du grave vers l'aigu. Un grésillement ou un bourdonnement à une fréquence précise indique une membrane abîmée. Les petits haut-parleurs ne restituent pas les très basses fréquences : c'est normal.

### 🎤 Microphone
Démarrez le micro, parlez : la jauge et la courbe doivent réagir. Ensuite, **Enregistrer 5 s et réécouter** : le son doit être clair, sans souffle ni coupure.

### 📷 Caméra
Choisissez une caméra dans la liste (avant, arrière, webcam), puis **Démarrer**. Vérifiez la netteté (mise au point), l'absence de taches (poussière derrière la lentille) et de lignes. La résolution maximale obtenue s'affiche.

### 🧭 Capteurs & vibreur
- **Activer les capteurs** : inclinez l'appareil, la bulle doit bouger. Sur iPhone, il faut autoriser l'accès.
- **Tester le vibreur** : l'appareil doit vibrer trois fois. Sur iPhone, les navigateurs ne permettent pas ce test.
- **Tester le GPS** : la position et sa précision s'affichent. À l'extérieur, une précision inférieure à 20 m est bonne. Les coordonnées ne sont **jamais** incluses dans le rapport.

### 🌐 Réseau
Mesure la **latence** (délai de réponse), la **gigue** (stabilité) et le **débit descendant** en téléchargeant des fichiers publics depuis le CDN jsDelivr.
- Latence : moins de 30 ms, excellent ; de 30 à 100 ms, correct ; plus de 150 ms, lent.
- Pour une mesure plus complète, montant compris, utilisez un service dédié.

### 💾 Stockage
Affiche l'espace que le navigateur accorde au site et teste l'écriture puis la lecture de 32 Mo dans la base IndexedDB. La vitesse obtenue est **très inférieure** à celle du disque : pour tester le disque lui-même, utilisez la version PC.

### 🎮 Carte graphique (GPU)
Affiche une fractale animée très coûteuse à calculer pendant 10 s.
- Le **FPS moyen** et le **score en Mpix/s** permettent de comparer des appareils entre eux.
- Si le **FPS minimum** est très inférieur à la moyenne, il y a des saccades : surchauffe ou pilote graphique en cause.
- Des artefacts visuels (carrés, lignes, couleurs aberrantes) peuvent indiquer une carte graphique défaillante.

---

## Application Android

L'application contient tout le site, et elle fonctionne donc hors ligne, à l'exception du test réseau. Elle ajoute des mesures qu'un navigateur ne peut pas lire.

### Installation
1. Sur le téléphone, téléchargez [DiagnoTest.apk](https://github.com/Crispinoza225/diagnotest/releases/latest/download/DiagnoTest.apk).
2. Ouvrez le fichier. Android demande d'autoriser le navigateur à « installer des applications inconnues » : acceptez pour ce navigateur seulement. Vous pourrez retirer l'autorisation ensuite.
3. Play Protect peut signaler une application inconnue : choisissez **Installer quand même**.

### Ce qui change par rapport au site
| Carte | Informations en plus |
|---|---|
| Informations système | Modèle exact, puce (SoC), fréquence maximale du processeur, **RAM exacte**, stockage libre et total, correctif de sécurité, équipements (NFC, empreinte, téléphonie, infrarouge…) |
| Batterie | Santé selon Android, **température**, **tension**, **courant** consommé ou reçu, technologie, **nombre de cycles** (Android 14 et plus), capacité d'origine, **capacité actuelle estimée** |
| Écran | Résolution physique, diagonale, fréquence maximale de la dalle, HDR |
| Capteurs | Liste de tous les capteurs matériels déclarés par le téléphone |
| Rapport | Enregistré dans **Téléchargements/DiagnoTest**, bouton **Partager** (e-mail, messagerie…) |

### Lire la batterie
| Mesure | Interprétation |
|---|---|
| Température | Normale en dessous de 40 °C. À partir de 45 °C, laissez refroidir le téléphone. |
| Santé estimée | Compteur de charge ramené à 100 %, comparé à la capacité d'origine. ≥ 80 % : bon ; 60 à 80 % : usure notable ; < 60 % : à remplacer. |
| Cycles | Une batterie de téléphone perd en général 20 % de capacité vers 500 à 800 cycles. |

> La capacité estimée est approximative (±10 %). Elle est plus fiable entre 50 et 100 % de charge. Certains constructeurs fournissent un compteur incohérent : l'application le détecte et affiche « Non mesurable » plutôt qu'un faux diagnostic.

---

## iPhone et iPad

Deux possibilités, selon ce que vous voulez.

### 1. L'application web installable (recommandée)
Aucun compte ni téléchargement : c'est le site, installé comme une app.
1. Ouvrez **https://crispinoza225.github.io/diagnotest/** dans **Safari**. Dans Chrome sur iPhone, utilisez le menu **Partager** de la même façon.
2. Touchez **Partager** (le carré avec une flèche vers le haut).
3. Faites défiler, puis touchez **Sur l'écran d'accueil** et **Ajouter**.

DiagnoTest s'ouvre ensuite en plein écran, sans barre de Safari, et fonctionne **hors ligne**, sauf le test réseau. Le site affiche lui-même ces instructions quand vous l'ouvrez dans Safari.

### 2. L'application native (.ipa)
Elle ajoute des mesures natives : modèle exact et puce, RAM, stockage, résolution native et fréquence maximale de l'écran (120 Hz sur les modèles Pro), état thermique, mode économie d'énergie, **vraies vibrations** (Core Haptics), et partage du rapport vers Fichiers, Mail, AirDrop…

Apple n'autorise pas l'installation directe d'un fichier `.ipa`. Il faut le faire signer :
- **Avec AltStore ou Sideloadly** (gratuit) : installez l'outil sur votre ordinateur, branchez l'iPhone, puis ouvrez [DiagnoTest-iOS-non-signe.ipa](https://github.com/Crispinoza225/diagnotest/releases/latest/download/DiagnoTest-iOS-non-signe.ipa) avec l'outil et connectez-vous avec votre identifiant Apple. Avec un compte gratuit, l'app doit être re-signée **tous les 7 jours**, ce qu'AltStore fait automatiquement.
- **Avec un compte Apple Developer** (99 $/an) : distribution par TestFlight ou l'App Store. Voir la [documentation technique](TECHNIQUE.md#application-ios).

### Ce qu'iOS ne permet pas de mesurer
| Mesure | Où la trouver sur iPhone |
|---|---|
| Santé et capacité maximale de la batterie | *Réglages → Batterie → État de la batterie et recharge* |
| Nombre de cycles (iPhone 15 et plus) | *Réglages → Général → Informations* |
| Température de la batterie | Non accessible. En cas de surchauffe, l'état thermique de l'app passe à « Élevé » ou « Critique ». |
| Vibreur depuis Safari | Seule l'app native peut faire vibrer l'iPhone. |

---

## Version PC (Python)

### Le plus simple sous Windows : DiagnoTest.exe
1. Téléchargez [DiagnoTest.exe](https://github.com/Crispinoza225/diagnotest/releases/latest/download/DiagnoTest.exe).
2. Double-cliquez dessus. Si SmartScreen s'affiche, cliquez sur **Informations complémentaires → Exécuter quand même** (l'exécutable n'est pas signé).
3. Lisez les résultats, puis appuyez sur Entrée pour fermer. Le rapport `.txt` / `.json` est enregistré dans le dossier de l'exécutable.
4. Pour lire la température du processeur : clic droit sur l'exécutable → **Exécuter en tant qu'administrateur**.

Toutes les options ci-dessous fonctionnent aussi avec l'exécutable, depuis un terminal : `DiagnoTest.exe --quick`.

### Installation avec Python (Windows, Linux, macOS)
1. Installez [Python 3.8 ou plus récent](https://www.python.org/downloads/). Sous Windows, cochez « Add Python to PATH ».
2. Téléchargez le dépôt : bouton **Code → Download ZIP** sur GitHub, puis décompressez-le.
3. Ouvrez un terminal dans le dossier et installez la dépendance :
   ```bash
   pip install -r desktop/requirements.txt
   ```

### Lancement
```bash
python desktop/diagnotest.py
```

| Option | Effet |
|---|---|
| `--quick` | Test rapide, sans stress ni benchmark disque (environ 20 s) |
| `--only cpu ram` | Lance seulement certains tests : `system`, `battery`, `cpu`, `ram`, `disk`, `network` |
| `--stress 300` | Stress CPU de 300 s (60 par défaut, 0 pour le désactiver) |
| `--ram-mb 4096` | Quantité de RAM à tester, plafonnée à 50 % de la mémoire libre |
| `--disk-mb 1024` | Taille du fichier de test disque |
| `--output rapports` | Dossier où enregistrer le rapport |

### Lire les résultats

**Batterie : santé (usure)**

| Santé | Interprétation |
|---|---|
| ≥ 80 % | 🟢 Bonne |
| 60 – 80 % | 🟠 Usure notable, autonomie réduite |
| < 60 % | 🔴 À remplacer |

Pour comparaison, une batterie de portable perd en général de 10 à 20 % de sa capacité en 300 à 500 cycles.

**Températures CPU sous stress**

| Température | Interprétation |
|---|---|
| < 85 °C | 🟢 Normal |
| 85 – 95 °C | 🟠 Chaud : nettoyage conseillé |
| ≥ 95 °C | 🔴 Surchauffe |

> Sous Windows, la température n'est lisible qu'**en administrateur**, et pas sur toutes les cartes mères. Si elle reste illisible, utilisez [HWiNFO](https://www.hwinfo.com/).

**Disques**
- *Santé : Healthy*, c'est bon. *Warning* ou *Unhealthy* : sauvegardez vos données sans attendre.
- Vitesse d'écriture indicative : disque dur de 80 à 200 Mo/s, SSD SATA de 300 à 550 Mo/s, SSD NVMe de 1 000 Mo/s et plus.
- Pour les attributs SMART détaillés, utilisez CrystalDiskInfo (Windows) ou `smartctl` (Linux et macOS).

---

## Le rapport

Le bouton **📄 Rapport** (version web) rassemble tous les résultats :
- **Télécharger .txt** : lisible par tout le monde, pratique pour une annonce ou un acheteur ;
- **Télécharger .json** : données structurées, pour archiver ou comparer ;
- **Copier** : à coller dans un message.

La version PC enregistre automatiquement `diagnotest-<machine>-<date>.txt` et `.json`.

> Le rapport PC contient le **numéro de série** de la machine. Retirez-le avant de publier le rapport si vous ne souhaitez pas le communiquer.

---

## Questions fréquentes

**La version PC indique « Connexion bloquée pour ce programme ».**
Un pare-feu ou un antivirus empêche DiagnoTest d'ouvrir une connexion : le Wi-Fi et la carte réseau ne sont pas en cause. Autorisez le programme dans votre pare-feu si vous voulez mesurer la latence.

**La batterie affiche « API non disponible ».**
Firefox et Safari ne fournissent pas cette information. Utilisez Chrome ou Edge, ou la version PC.

**La batterie indique 100 % et « en charge » sur mon PC fixe.**
C'est normal : sans batterie, les navigateurs renvoient ces valeurs par défaut.

**Le score CPU varie d'un essai à l'autre.**
La fréquence du processeur varie avec la température, le mode d'alimentation et les programmes ouverts. Branchez le chargeur, fermez les applications et gardez le meilleur de 2 ou 3 essais.

**La caméra ou le micro ne démarre pas.**
Vérifiez que la page est en HTTPS, que l'autorisation n'a pas été refusée (icône 🔒 dans la barre d'adresse) et qu'aucune autre application n'utilise déjà la caméra.

**Le test d'écran ne passe pas en plein écran sur iPhone.**
Safari sur iPhone limite le plein écran. Ajoutez la page à l'écran d'accueil (Partager → Sur l'écran d'accueil) pour obtenir un affichage sans barre.

---

## Check-list pour un achat d'occasion

- [ ] Système : les caractéristiques correspondent à l'annonce
- [ ] Batterie : santé ≥ 80 % (version PC, ou réglages du téléphone)
- [ ] CPU : stress test de 5 min sans chute importante
- [ ] RAM : 0 erreur
- [ ] Écran : aucun pixel mort, pas de fuite de lumière, pas de burn-in, bonne fréquence
- [ ] Tactile : 100 % de couverture, multi-touch OK
- [ ] Clavier : toutes les touches répondent
- [ ] Haut-parleurs gauche et droite, micro, caméras avant et arrière
- [ ] Capteurs, vibreur, GPS (téléphone)
- [ ] Wi-Fi fonctionnel
- [ ] Disques : santé « Healthy » (version PC)
