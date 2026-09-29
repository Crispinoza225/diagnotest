/* Tests de bout en bout de la version web de DiagnoTest, dans Chromium sans écran.
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tests/e2e.cjs
 *
 * Le script sert lui-même le site (aucun serveur à lancer) et l'ouvre avec ?rapide, qui raccourcit les
 * mesures longues. Il vérifie le diagnostic express, la note de santé, les recommandations, le certificat,
 * l'historique, la comparaison, le lien de partage et l'absence d'erreur JavaScript. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = path.join(RACINE, chemin.endsWith('/') ? `${chemin}index.html` : chemin);
  if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
  fs.createReadStream(fichier).pipe(res);
});

let echecs = 0;
const results_ok = (r) => r && r.status === 'ok';
const verifier = (condition, message) => {
  console.log(`${condition ? '  ✓' : '  ✗'} ${message}`);
  if (!condition) echecs++;
};

(async () => {
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${serveur.address().port}/`;
  const navigateur = await chromium.launch();
  const erreurs = [];
  const ouvrir = async (options = {}, script = null) => {
    const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, ...options });
    if (script) await ctx.addInitScript(script);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => {
      // Les ressources externes (polices, fichiers du test réseau) peuvent être bloquées : ce n'est pas un bogue.
      if (m.type() === 'error' && !/Failed to load resource|net::ERR|fonts\.g/.test(m.text())) erreurs.push(m.text());
    });
    page.on('dialog', (d) => d.dismiss());
    return page;
  };

  try {
    console.log('Chargement de la page');
    const page = await ouvrir();
    await page.goto(`${base}?rapide`);
    await page.waitForFunction(() => results.system);
    verifier(await page.locator('.card[data-test]').count() === 16, '16 cartes de test');
    verifier(await page.textContent('#padZone').then((t) => t.includes('Aucune manette')), 'la carte Manettes s’affiche sans manette');

    console.log('Note de santé et recommandations (calculs)');
    const calculs = await page.evaluate(() => {
      const tout = Object.fromEntries(Object.keys(POIDS).map((id) => [id, { status: 'ok', data: {} }]));
      const parfait = calculerNote(tout);
      const avecDefaut = calculerNote({ ...tout, ram: { status: 'ko', data: {} } });
      const partiel = calculerNote({ cpu: { status: 'warn', data: {} }, system: { status: 'info', data: {} } });
      const conseils = recommandations({ ram: { status: 'ko', data: {} }, battery: { status: 'warn', data: { Chargeur: 'Charge lente : …' } } });
      return { parfait, avecDefaut, partiel, conseils };
    });
    verifier(calculs.parfait.note === 100 && calculs.parfait.mention === 'Excellent', 'tout OK : 100/100, Excellent');
    verifier(calculs.avecDefaut.note <= 69 && calculs.avecDefaut.defauts.includes('ram'), 'un défaut plafonne la note à 69');
    verifier(await page.evaluate(() => calculerNote({ battery: { status: 'ok' }, network: { status: 'ko' } }).note) > 69, 'une absence de réseau ne plafonne pas la note');
    verifier(calculs.partiel.note === 60 && calculs.partiel.evalues === 1, 'les résultats « Info » ne comptent pas');
    verifier(calculs.conseils[0].id === 'ram' && /MemTest86/.test(calculs.conseils[0].texte), 'les défauts passent avant les avertissements');
    verifier(/câble/.test(calculs.conseils[1].texte), 'conseil précis pour une charge lente');

    console.log('Diagnostic express');
    const fin = page.evaluate(() => new Promise((r) => document.addEventListener('diag:express', (e) => r(e.detail), { once: true })));
    await page.click('#expressBtn');
    const detail = await Promise.race([fin, new Promise((_, rej) => setTimeout(() => rej(new Error('diagnostic express trop long')), 150000))]);
    verifier(!detail.annule, 'le diagnostic express va jusqu’au bout');
    const apres = await page.evaluate(() => ({
      statuts: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status])),
      note: calculerNote(), etapes: $$('#expressEtapes li[data-etape] em').map((e) => e.textContent),
      affiche: $('#noteValeur').textContent, historique: lireHistorique().length,
    }));
    for (const id of ['cpu', 'ram', 'storage', 'gpu']) verifier(['ok', 'warn'].includes(apres.statuts[id]), `${id} mesuré (${apres.statuts[id]})`);
    verifier('network' in apres.statuts, `réseau testé (${apres.statuts.network}, dépend de l’accès à internet)`);
    verifier(apres.statuts.screen !== undefined, 'fréquence de l’écran mesurée');
    verifier(typeof apres.note.note === 'number' && apres.affiche === String(apres.note.note), `note affichée : ${apres.affiche}/100 (${apres.note.mention})`);
    verifier(apres.etapes.every((t) => t && t !== 'non disponible'), `toutes les étapes ont un résultat : ${apres.etapes.join(', ')}`);
    verifier(apres.historique === 1, 'le diagnostic est enregistré dans l’historique');

    console.log('Rapport');
    await page.click('#reportBtn');
    const rapport = await page.textContent('#reportText');
    verifier(/Note de santé : \d+\/100/.test(rapport), 'le rapport texte contient la note');
    await page.click('#closeRep');

    console.log('Certificat');
    const certificat = await page.evaluate(async () => {
      const inst = instantane();
      inst.resultats.system.data['Modèle'] = '<script>alert(1)</script>';
      inst.appareil = '<img src=x onerror=alert(2)>Piège';
      inst.code = await codeRapport(inst);
      return certificatHTML(inst);
    });
    verifier(certificat.includes('Certificat de diagnostic') && /\d+<\/b><span>\/ 100/.test(certificat), 'le certificat contient la note');
    verifier(!certificat.includes('<script>') && !certificat.includes('<img') && certificat.includes('Piège'), 'aucune balise des données ne passe dans le certificat');
    verifier(/Code du rapport : <b>[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}<\/b>/.test(certificat), 'le certificat porte un code de rapport');

    console.log('Lien de partage');
    const partage = await page.evaluate(async () => {
      const inst = instantane();
      inst.code = await codeRapport(inst);
      const code = await encoderRapport(inst);
      const retour = await decoderRapport(code);
      const modifie = { ...retour, note: (retour.note || 0) + 1 };
      return { code, identique: JSON.stringify(retour) === JSON.stringify(inst), codeStable: (await codeRapport(retour)) === inst.code,
        detecte: (await codeRapport(modifie)) !== inst.code };
    });
    verifier(partage.identique, `aller-retour du rapport identique (lien de ${partage.code.length} caractères)`);
    verifier(partage.codeStable && partage.detecte, 'le code détecte une modification du rapport');
    const lecteur = await ouvrir();
    await lecteur.goto(`${base}#rapport=${partage.code}`);
    await lecteur.waitForSelector('#recuDlg[open]');
    verifier(/correspond au code/.test(await lecteur.textContent('#recuContenu')), 'un lien reçu s’ouvre et son code est vérifié');
    await lecteur.click('#recuFermer');
    await lecteur.goto(`${base}#rapport=${partage.code.slice(0, -8)}AAAAAAAA`);
    await lecteur.waitForTimeout(500);
    verifier(!(await lecteur.locator('#recuDlg[open]').count()) || !/correspond au code/.test(await lecteur.textContent('#recuContenu')), 'un lien abîmé n’est pas présenté comme valide');
    await lecteur.close();

    console.log('Historique et comparaison');
    await page.evaluate(() => {
      const autre = { ...instantane(), date: '2025-01-01T10:00:00.000Z', appareil: 'Ancien téléphone', note: 42, mention: 'Mauvais', code: 'AAAA-BBBB-CCCC' };
      autre.resultats = { ...autre.resultats, cpu: { status: 'warn', data: { 'Score mono-cœur': '1 000 pts' } } };
      enregistrerHistorique(autre);
    });
    await page.click('#histBtn');
    await page.waitForSelector('#histDlg[open]');
    verifier(await page.locator('#histListe .hist').count() === 3, 'l’historique liste le diagnostic en cours et les deux enregistrés');
    await page.locator('#histListe input').nth(0).check();
    await page.locator('#histListe input').nth(1).check(); // le plus récent enregistré : l'« ancien téléphone »
    await page.click('#histComparer');
    await page.waitForSelector('#compDlg[open]');
    const table = await page.textContent('#compTable');
    verifier(table.includes('Ancien téléphone') && table.includes('Score mono-cœur'), 'la comparaison affiche les deux appareils et leurs mesures');
    verifier(await page.locator('#compTable td.mieux').count() > 0, 'la meilleure valeur est mise en évidence');

    console.log('Ports USB');
    // Faux WebUSB et fausse batterie : un appareil au nom piégé, et une charge qui se coupe par intermittence.
    const usb = await ouvrir({}, () => {
      const appareil = { manufacturerName: '<img src=x onerror=alert(3)>', productName: 'Clé', vendorId: 0x0781, productId: 0x5581, usbVersionMajor: 3, usbVersionMinor: 2 };
      let choisi = false;
      const faux = { requestDevice: async () => { choisi = true; return appareil; }, getDevices: async () => (choisi ? [appareil] : []),
        addEventListener() {}, removeEventListener() {} };
      Object.defineProperty(Navigator.prototype, 'usb', { get: () => faux });
      window.coupe = false;
      let lectures = 0; // une lecture sur trois voit la charge coupée
      Navigator.prototype.getBattery = async () => ({ level: 0.5, addEventListener() {}, get charging() { return !window.coupe || ++lectures % 3 !== 0; } });
    });
    await usb.goto(`${base}?rapide`);
    await usb.waitForFunction(() => results.system);
    await usb.click('#usbDetectBtn');
    await usb.waitForFunction(() => results.usb);
    const liste = await usb.innerHTML('#usbListe');
    verifier(results_ok(await usb.evaluate(() => results.usb)) && liste.includes('&lt;img') && !liste.includes('<img'), 'l’appareil USB branché est détecté, son nom affiché comme du texte');
    verifier(/USB 3\.2/.test(liste), 'la norme USB de l’appareil est indiquée');
    await usb.click('#usbWiggleBtn');
    await usb.waitForFunction(() => /Aucune coupure/.test(results.usb?.data['Faux contact'] || ''));
    verifier(true, 'connexion stable : aucune coupure');
    await usb.evaluate(() => { window.coupe = true; });
    await usb.click('#usbWiggleBtn');
    await usb.waitForFunction(() => results.usb?.status === 'ko');
    verifier(/coupure/.test(await usb.evaluate(() => results.usb.data['Faux contact'])) && await usb.isVisible('#usbRepa'), 'un faux contact est détecté et ouvre l’assistant de réparation');
    const etapes = await usb.evaluate(() => ({ win: etapesUSB('Windows 10/11').map((e) => e[0]), ios: etapesUSB('iOS 17').map((e) => e[0]) }));
    verifier(etapes.win.includes('Gestionnaire de périphériques') && etapes.ios.includes('Autoriser les accessoires') && etapes.win.at(-1) === 'Réparation matérielle', 'l’assistant adapte les étapes au système');
    await usb.click('#usbRepa [data-r=suite]');
    await usb.click('#usbRepa [data-r=ok]');
    verifier(await usb.evaluate(() => results.usb.status === 'ok' && /Nettoyer le port/.test(results.usb.data['Réparation'])), '« C’est réglé » à l’étape 2 valide le port');
    await usb.click('#usbRepairBtn');
    let n = 0;
    while (await usb.locator('#usbRepa [data-r=suite]').count() && n++ < 20) await usb.click('#usbRepa [data-r=suite]');
    verifier(await usb.evaluate(() => results.usb.status === 'ko' && /matérielle/.test(results.usb.data['Réparation'])), 'toutes les étapes épuisées : réparation matérielle conseillée');
    verifier(await usb.evaluate(() => recommandations().some((c) => c.id === 'usb')), 'le bilan recommande de réparer le port');
    await usb.close();

    console.log('Téléphone (390 px)');
    const mobile = await ouvrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(`${base}?rapide`);
    await mobile.waitForFunction(() => results.system);
    verifier(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'aucun débordement horizontal sur téléphone');
    await mobile.close();

    verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` : ${erreurs.join(' | ')}` : ''}`);
    if (process.env.CAPTURES) {
      await page.keyboard.press('Escape');
      await page.evaluate(() => $('#bilan').scrollIntoView());
      await page.screenshot({ path: path.join(process.env.CAPTURES, 'bilan.png') });
    }
  } catch (e) {
    console.error(e);
    echecs++;
  } finally {
    await navigateur.close();
    serveur.close();
  }
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les tests passent ✓');
  process.exit(echecs ? 1 : 0);
})();
