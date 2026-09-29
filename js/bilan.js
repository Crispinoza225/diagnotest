/* DiagnoTest — bilan de santé.
 * Diagnostic express, note sur 100, recommandations, certificat imprimable (PDF), historique, comparaison
 * de deux diagnostics et lien de partage. Chargé juste après app.js, dont il utilise les fonctions globales
 * (results, setResult, buildReport, download, nativeCall…). Aucune donnée ne quitte l'appareil : le lien de
 * partage contient le rapport lui-même, compressé dans l'adresse, et n'est envoyé à aucun serveur. */
'use strict';

const VERSION = '1.3.0';
const SITE = 'https://crispinoza225.github.io/diagnotest/';

/* ------------------------------------------------------------------ */
/* Note de santé                                                       */
/* ------------------------------------------------------------------ */
// Poids de chaque test dans la note : les pièces chères ou gênantes à réparer comptent davantage.
const POIDS = { battery: 3, ram: 3, screen: 3, touch: 3, storage: 2, cpu: 2, keyboard: 2, audio: 2, mic: 2, camera: 2,
  sensors: 1, network: 1, gpu: 1, gamepad: 1 };
const VALEUR = { ok: 100, warn: 60, ko: 0 };
const MENTIONS = [[90, 'Excellent'], [75, 'Bon'], [50, 'Moyen'], [0, 'Mauvais']];

function calculerNote(res = results) {
  let somme = 0, poids = 0;
  const evalues = [];
  for (const [id, r] of Object.entries(res)) {
    if (!POIDS[id] || !(r.status in VALEUR)) continue; // « Info » : mesure sans jugement, hors de la note
    somme += VALEUR[r.status] * POIDS[id];
    poids += POIDS[id];
    evalues.push(id);
  }
  const total = Object.keys(POIDS).length;
  if (!poids) return { note: null, mention: 'Pas encore de résultat', evalues: 0, total, defauts: [] };
  let note = Math.round(somme / poids);
  const defauts = evalues.filter((id) => res[id].status === 'ko');
  // Un défaut matériel interdit les mentions « Bon » et « Excellent ». Une absence de réseau n'est pas une panne.
  if (defauts.some((id) => id !== 'network')) note = Math.min(note, 69);
  return { note, mention: MENTIONS.find(([seuil]) => note >= seuil)[1], evalues: evalues.length, total, defauts };
}

/* ------------------------------------------------------------------ */
/* Recommandations                                                     */
/* ------------------------------------------------------------------ */
const CONSEILS = {
  battery: { ko: 'Batterie défaillante ou très usée : prévoyez son remplacement.',
    warn: 'Batterie à surveiller : autonomie réduite ou appareil chaud. Évitez de le laisser en charge au soleil.' },
  cpu: { ko: 'Le test du processeur a échoué : relancez-le ; si l’échec se répète, l’appareil est instable.',
    warn: 'Le processeur ralentit sous la charge (surchauffe) : nettoyez les aérations et le ventilateur ; sur un ordinateur ancien, faites changer la pâte thermique.' },
  ram: { ko: 'Erreurs mémoire : barrette défectueuse probable. Confirmez avec MemTest86 avant de la remplacer.' },
  screen: { ko: 'Défaut d’écran signalé (pixels morts, taches, fuite de lumière) : faites chiffrer le remplacement de la dalle.',
    warn: 'Écran à surveiller : refaites les mires dans une pièce sombre.' },
  touch: { ko: 'Défaut tactile signalé : la dalle tactile est probablement à remplacer.',
    warn: 'Des zones tactiles n’ont pas réagi : refaites le test lentement ; si elles restent mortes, la dalle tactile est abîmée.' },
  keyboard: { ko: 'Touches défectueuses : essayez un nettoyage à l’air sec, sinon remplacez le clavier.' },
  audio: { ko: 'Haut-parleur défectueux (grésillement ou côté muet) : faites vérifier le haut-parleur.' },
  mic: { ko: 'Micro défectueux ou refusé : vérifiez l’autorisation, puis nettoyez délicatement la grille du micro.',
    warn: 'Bruit de fond élevé : refaites le test dans une pièce calme ; s’il persiste, le micro souffle.' },
  camera: { ko: 'Caméra inaccessible : vérifiez l’autorisation ; si l’image reste noire, le module caméra est à remplacer.' },
  sensors: { ko: 'Capteur défaillant signalé : un redémarrage peut suffire, sinon le composant est à faire vérifier.' },
  network: { ko: 'Aucune connexion pendant le test : vérifiez le Wi-Fi ou les données mobiles, puis relancez-le.',
    warn: 'Connexion lente ou instable : rapprochez-vous du routeur ou essayez un autre réseau pour savoir si l’appareil est en cause.' },
  storage: { ko: 'Erreurs d’intégrité du stockage : sauvegardez vos données sans attendre et vérifiez le disque (version PC).',
    warn: 'Le stockage du navigateur est limité : libérez de l’espace.' },
  gpu: { ko: 'Accélération graphique indisponible : mettez à jour le pilote graphique ou le navigateur.' },
  gamepad: { ko: 'Manette défectueuse signalée.', warn: 'Joystick qui dérive : un nettoyage peut suffire, sinon remplacez le module du joystick.' },
};

function recommandations(res = results) {
  const liste = [];
  for (const id of Object.keys(POIDS)) {
    const r = res[id];
    if (!r || !['ko', 'warn'].includes(r.status)) continue;
    let texte = CONSEILS[id]?.[r.status] || CONSEILS[id]?.ko;
    const d = r.data || {};
    // Précisions tirées des mesures, quand elles expliquent mieux le problème.
    if (id === 'battery' && r.status === 'warn') {
      if (/lente|Aucune progression/.test(d['Chargeur'] || '')) texte = 'Charge lente : essayez un autre câble et un autre chargeur, puis nettoyez le port de charge.';
      else if (/Usure/.test(d['Diagnostic'] || '')) texte = 'Batterie usée : l’autonomie a baissé, son remplacement améliorera nettement l’appareil.';
      else if (/chaud/.test(d['Diagnostic'] || '')) texte = 'Appareil chaud : laissez-le refroidir, puis refaites le test.';
      else if (d['Décharge mesurée']) texte = 'Décharge rapide : fermez les applications en arrière-plan et baissez la luminosité, puis refaites la mesure.';
    }
    if (id === 'gpu' && r.status === 'warn') texte = 'Performances graphiques faibles pour cet appareil : mettez à jour le pilote graphique.';
    if (texte) liste.push({ niveau: r.status, id, texte });
  }
  return liste.sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === 'ko' ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Instantané d'un diagnostic (historique, partage, certificat)        */
/* ------------------------------------------------------------------ */
const TITRES = () => Object.fromEntries($$('.card[data-test]').map((c) => [c.dataset.test, c.dataset.title]));
const texteBrut = (v) => String(v).replace(/<[^>]+>/g, '');
const esc = (v) => texteBrut(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nomAppareil(res = results) {
  const s = res.system?.data || {};
  return s['Modèle'] || [s['Système'], s['Navigateur'] || s['Moteur web'], s['Type d’appareil']].filter(Boolean).join(' · ') || 'Appareil inconnu';
}

function instantane() {
  const n = calculerNote();
  const resultats = {};
  for (const [id, r] of Object.entries(results)) {
    const data = {};
    for (const [k, v] of Object.entries(r.data || {})) if (v !== undefined && v !== null && v !== '') data[k] = texteBrut(v);
    resultats[id] = { status: r.status, data };
  }
  return { app: 'DiagnoTest', version: VERSION, date: new Date().toISOString(), appareil: nomAppareil(), note: n.note, mention: n.mention,
    evalues: n.evalues, total: n.total, resultats };
}

// Code du rapport : empreinte SHA-256 du contenu. Identique sur le certificat et sur le lien de partage,
// il permet de vérifier que les deux décrivent exactement les mêmes résultats.
async function codeRapport(inst) {
  const { code, ...contenu } = inst;
  const octets = new TextEncoder().encode(JSON.stringify(contenu));
  let hex;
  if (crypto?.subtle) {
    hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', octets)), (b) => b.toString(16).padStart(2, '0')).join('');
  } else { // contexte non sécurisé : empreinte FNV-1a, moins robuste mais stable
    let h = 0x811c9dc5;
    for (const b of octets) h = Math.imul(h ^ b, 16777619) >>> 0;
    hex = h.toString(16).padStart(8, '0').repeat(2);
  }
  return hex.slice(0, 12).toUpperCase().match(/.{4}/g).join('-');
}

// Convertit un fichier .json de DiagnoTest (format actuel ou ancien export `results`) en instantané.
function versInstantane(obj) {
  if (obj?.resultats && obj.app === 'DiagnoTest') return obj;
  if (obj?.results) {
    const resultats = Object.fromEntries(Object.entries(obj.results).map(([id, r]) => [id, { status: r.status, data: r.data || {} }]));
    const n = calculerNote(resultats);
    return { app: 'DiagnoTest', version: obj.version || '?', date: obj.date || new Date().toISOString(), appareil: nomAppareil(resultats),
      note: n.note, mention: n.mention, evalues: n.evalues, total: n.total, resultats };
  }
  throw new Error('Ce fichier n’est pas un rapport DiagnoTest.');
}

/* ------------------------------------------------------------------ */
/* Lien de partage : le rapport compressé dans l'adresse               */
/* ------------------------------------------------------------------ */
const versBase64url = (octets) => {
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const depuisBase64url = (texte) => Uint8Array.from(atob(texte.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const compressionDisponible = (() => { try { new CompressionStream('deflate-raw'); return true; } catch { return false; } })();

async function encoderRapport(inst) {
  const octets = new TextEncoder().encode(JSON.stringify(inst));
  if (!compressionDisponible) return `j${versBase64url(octets)}`;
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return `z${versBase64url(new Uint8Array(await new Response(flux).arrayBuffer()))}`;
}

async function decoderRapport(code) {
  let octets = depuisBase64url(code.slice(1));
  if (code[0] === 'z') {
    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    octets = new Uint8Array(await new Response(flux).arrayBuffer());
  } else if (code[0] !== 'j') throw new Error('Lien de rapport invalide.');
  return versInstantane(JSON.parse(new TextDecoder().decode(octets)));
}

function adresseSite() {
  // Dans les applications, la page est servie localement : le lien pointe alors vers le site public.
  const local = !/^https?:$/.test(location.protocol) || /androidplatform\.net$/.test(location.hostname);
  return local ? SITE : location.origin + location.pathname;
}

/* ------------------------------------------------------------------ */
/* Certificat (HTML autonome, imprimable en PDF)                       */
/* ------------------------------------------------------------------ */
const STATUT = { ok: ['OK', '#16a34a'], warn: ['À surveiller', '#d97706'], ko: ['Défaut', '#dc2626'], info: ['Mesuré', '#6d4aff'] };
const CLES_APPAREIL = ['Système', 'Modèle', 'Puce', 'Navigateur', 'Moteur web', 'Cœurs logiques', 'RAM', 'RAM (approx.)', 'Stockage', 'GPU', 'Écran'];

function corpsCertificat(inst) {
  const titres = TITRES();
  const sys = inst.resultats.system?.data || {};
  const appareil = CLES_APPAREIL.filter((k) => sys[k]).map((k) => `<tr><th>${esc(k)}</th><td>${esc(sys[k])}</td></tr>`).join('');
  const lignes = Object.keys(titres).filter((id) => id !== 'system').map((id) => {
    const r = inst.resultats[id];
    if (!r) return `<tr class="nt"><td>${esc(titres[id])}</td><td>Non testé</td><td></td></tr>`;
    const [txt, coul] = STATUT[r.status] || [r.status, '#555'];
    const details = Object.entries(r.data).filter(([k]) => k !== 'note').slice(0, 4)
      .map(([k, v]) => `${esc(k)} : ${esc(v)}`).join('<br>');
    return `<tr><td>${esc(titres[id])}</td><td><b style="color:${coul}">${txt}</b></td><td>${details}</td></tr>`;
  }).join('');
  const conseils = recommandations(inst.resultats);
  const note = inst.note == null ? '—' : inst.note;
  return `
  <header><div><b class="marque">DiagnoTest</b><h1>Certificat de diagnostic</h1>
    <p>${esc(new Date(inst.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }))} · version ${esc(inst.version)}</p></div>
    <div class="note"><b>${note}</b><span>/ 100</span><em>${esc(inst.mention)}</em></div></header>
  <p class="couv">${inst.evalues} test${inst.evalues > 1 ? 's' : ''} évalué${inst.evalues > 1 ? 's' : ''} sur ${inst.total} · Appareil : <b>${esc(inst.appareil)}</b></p>
  ${appareil ? `<h2>Appareil</h2><table class="kv">${appareil}</table>` : ''}
  <h2>Résultats</h2><table class="res"><thead><tr><th>Test</th><th>Résultat</th><th>Mesures</th></tr></thead><tbody>${lignes}</tbody></table>
  <h2>Recommandations</h2>${conseils.length
    ? `<ul>${conseils.map((c) => `<li class="${c.niveau}">${esc(c.texte)}</li>`).join('')}</ul>`
    : '<p>Aucun problème détecté sur les tests effectués.</p>'}
  <footer>Code du rapport : <b>${esc(inst.code || '')}</b> — identique sur le certificat et sur le lien de partage d'un même diagnostic.<br>
    Généré localement par DiagnoTest (${SITE}). Ce certificat décrit l'état constaté au moment du test ; il ne remplace pas l'avis d'un réparateur.</footer>`;
}

const STYLE_CERTIFICAT = `
  *{box-sizing:border-box}body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a19;margin:0;padding:28px;max-width:860px}
  header{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:2px solid #1a1a19;padding-bottom:14px}
  .marque{font:600 12px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6d4aff}
  h1{font:400 30px/1.1 Georgia,"Times New Roman",serif;margin:6px 0 4px}header p{margin:0;color:#6b6a66}
  .note{text-align:center;border:2px solid #1a1a19;border-radius:18px;padding:10px 18px;min-width:120px}
  .note b{font:400 44px/1 Georgia,serif;display:block}.note span{color:#6b6a66}.note em{display:block;font-style:normal;font-weight:600;margin-top:4px}
  .couv{color:#6b6a66;margin:12px 0 0}h2{font:400 20px/1.2 Georgia,serif;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #e5e4e0}
  .kv th{width:34%;color:#6b6a66;font-weight:500}.res thead th{font:600 11px/1 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#6b6a66}
  .res td:first-child{font-weight:600;width:24%}.res td:nth-child(2){width:14%}.res td:last-child{color:#444;font-size:12px}.nt td{color:#9a9994}
  ul{padding-left:18px}li{margin:4px 0}li.ko{color:#b91c1c}li.warn{color:#92400e}
  footer{margin-top:26px;padding-top:12px;border-top:1px solid #e5e4e0;color:#6b6a66;font-size:11.5px}
  @media print{body{padding:0}@page{margin:14mm}}`;

function certificatHTML(inst) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificat DiagnoTest — ${esc(inst.appareil)}</title><style>${STYLE_CERTIFICAT}</style></head><body>${corpsCertificat(inst)}</body></html>`;
}

async function imprimerCertificat() {
  const inst = instantane();
  inst.code = await codeRapport(inst);
  enregistrerHistorique(inst);
  const html = certificatHTML(inst);
  const nom = `certificat-diagnotest-${inst.date.slice(0, 10)}.html`;
  // Les applications Android et iOS n'impriment pas depuis la WebView : on y enregistre le certificat.
  if (NATIVE) { download(nom, html, 'text/html'); return; }
  const cadre = document.createElement('iframe');
  cadre.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  cadre.srcdoc = html;
  cadre.onload = () => {
    try { cadre.contentWindow.focus(); cadre.contentWindow.print(); } catch { download(nom, html, 'text/html'); }
    setTimeout(() => cadre.remove(), 60000);
  };
  document.body.appendChild(cadre);
}

/* ------------------------------------------------------------------ */
/* Historique (stocké uniquement dans ce navigateur)                   */
/* ------------------------------------------------------------------ */
const CLE_HISTORIQUE = 'dt-historique';
const lireHistorique = () => { try { return JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; } catch { return []; } };
const ecrireHistorique = (h) => { try { localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(h.slice(0, 30))); return true; } catch { return false; } };

function enregistrerHistorique(inst) {
  if (inst.note == null) return;
  const h = lireHistorique().filter((e) => e.code !== inst.code);
  h.unshift(inst);
  ecrireHistorique(h);
}

/* ------------------------------------------------------------------ */
/* Comparaison de deux diagnostics                                     */
/* ------------------------------------------------------------------ */
// [test, clé de la mesure, plus c'est grand mieux c'est ?]
const METRIQUES = [
  ['cpu', 'Score mono-cœur', true], ['cpu', 'Score multi-cœurs', true], ['cpu', 'Baisse de performance', false],
  ['ram', 'Vitesse d’écriture', true], ['ram', 'Vitesse de lecture + vérif.', true],
  ['gpu', 'Images/s moyennes', true], ['gpu', 'Score', true],
  ['storage', 'Écriture IndexedDB', true], ['storage', 'Lecture IndexedDB', true],
  ['battery', 'Santé estimée', true], ['battery', 'Cycles de charge', false], ['battery', 'Vitesse de charge', true],
  ['network', 'Latence', false], ['network', 'Débit descendant', true], ['screen', 'Fréquence mesurée', true],
];
const nombre = (v) => {
  const m = String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

function tableComparaison(a, b) {
  const titres = TITRES();
  const cellule = (v) => `<td>${v == null || v === '' ? '<span class="vide">—</span>' : esc(v)}</td>`;
  const ligne = (titre, va, vb, plusGrand) => {
    const na = nombre(va), nb = nombre(vb);
    let ca = '', cb = '';
    if (plusGrand !== undefined && na != null && nb != null && na !== nb) {
      const aMieux = plusGrand ? na > nb : na < nb;
      [ca, cb] = aMieux ? [' class="mieux"', ''] : ['', ' class="mieux"'];
    }
    return `<tr><th>${esc(titre)}</th>${cellule(va).replace('<td>', `<td${ca}>`)}${cellule(vb).replace('<td>', `<td${cb}>`)}</tr>`;
  };
  const statut = (inst, id) => (inst.resultats[id] ? (STATUT[inst.resultats[id].status] || [inst.resultats[id].status])[0] : null);
  let html = `<table class="comparaison"><thead><tr><th></th><th>${esc(a.appareil)}<small>${esc(new Date(a.date).toLocaleString('fr-FR'))}</small></th>
    <th>${esc(b.appareil)}<small>${esc(new Date(b.date).toLocaleString('fr-FR'))}</small></th></tr></thead><tbody>`;
  html += ligne('Note de santé', a.note == null ? null : `${a.note}/100 (${a.mention})`, b.note == null ? null : `${b.note}/100 (${b.mention})`, true);
  html += '<tr class="sep"><th colspan="3">Mesures</th></tr>';
  METRIQUES.forEach(([id, cle, plusGrand]) => {
    const va = a.resultats[id]?.data?.[cle], vb = b.resultats[id]?.data?.[cle];
    if (va != null || vb != null) html += ligne(`${titres[id] || id} — ${cle}`, va, vb, plusGrand);
  });
  html += '<tr class="sep"><th colspan="3">Résultats</th></tr>';
  Object.keys(titres).filter((id) => id !== 'system').forEach((id) => {
    if (a.resultats[id] || b.resultats[id]) html += ligne(titres[id], statut(a, id), statut(b, id));
  });
  return `${html}</tbody></table><p class="small">En vert : la meilleure valeur des deux. Les scores servent à comparer des appareils testés avec DiagnoTest.</p>`;
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */
function afficherBilan() {
  const n = calculerNote();
  const titres = TITRES();
  $('#noteValeur').textContent = n.note == null ? '—' : n.note;
  $('#noteMention').textContent = n.note == null ? 'Lancez le diagnostic' : n.mention;
  $('#bilan').dataset.niveau = n.note == null ? '' : n.note >= 75 ? 'ok' : n.note >= 50 ? 'warn' : 'ko';
  const anneau = $('#anneau'), perimetre = 2 * Math.PI * 52;
  anneau.style.strokeDasharray = `${perimetre}`;
  anneau.style.strokeDashoffset = `${perimetre * (1 - (n.note || 0) / 100)}`;
  $('#noteCouverture').textContent = n.note == null
    ? 'Le diagnostic express mesure automatiquement le système, la batterie, le processeur, la mémoire, le stockage, le réseau, la carte graphique et l’écran, en une minute environ.'
    : `${n.evalues} test${n.evalues > 1 ? 's' : ''} évalué${n.evalues > 1 ? 's' : ''} sur ${n.total}${n.evalues < n.total ? ' : complétez les tests manuels pour une note plus fiable.' : '.'}`;
  const conseils = recommandations();
  $('#conseils').innerHTML = conseils.length
    ? conseils.map((c) => `<li class="${c.niveau}"><a href="#t-${c.id}">${esc(titres[c.id])}</a> — ${esc(c.texte)}</li>`).join('')
    : `<li class="ok">${n.note == null ? 'Les conseils apparaîtront après les premiers tests.' : 'Aucun problème détecté sur les tests effectués ✓'}</li>`;
  const restants = Object.keys(POIDS).filter((id) => !['ok', 'warn', 'ko'].includes(results[id]?.status));
  $('#aFaire').innerHTML = restants.length
    ? restants.map((id) => `<a class="puce" href="#t-${id}">${esc(titres[id] || id)}</a>`).join('')
    : '<span class="small">Tous les tests ont été faits ✓</span>';
}

// Diagnostic express : les tests qui ne demandent aucune action, lancés l'un après l'autre.
const ETAPES_EXPRESS = [
  { id: 'system', nom: 'Système' },
  { id: 'battery', nom: 'Batterie' },
  { id: 'cpu', nom: 'Processeur', bouton: '#cpuBenchBtn' },
  { id: 'ram', nom: 'Mémoire', bouton: '#ramBtn', avant: () => { if (+$('#ramSize').value > 512) $('#ramSize').value = '256'; } },
  { id: 'storage', nom: 'Stockage', bouton: '#stoBtn' },
  { id: 'network', nom: 'Réseau', bouton: '#netBtn' },
  { id: 'gpu', nom: 'Carte graphique', bouton: '#gpuBtn' },
  { id: 'screen', nom: 'Fréquence de l’écran', bouton: '#hzBtn' },
];
let expressEnCours = false, expressAnnule = false;

async function attendreResultat(id, depuis, limiteMs) {
  const fin = Date.now() + limiteMs;
  while (!(results[id]?.at >= depuis)) {
    if (expressAnnule || Date.now() > fin) return false;
    await sleep(150);
  }
  return true;
}

async function diagnosticExpress() {
  if (expressEnCours) { expressAnnule = true; return; }
  expressEnCours = true;
  expressAnnule = false;
  const liste = $('#expressEtapes'), btn = $('#expressBtn');
  btn.textContent = 'Arrêter';
  $('#bilan').scrollIntoView({ behavior: 'smooth', block: 'start' });
  liste.hidden = false;
  liste.innerHTML = ETAPES_EXPRESS.map((e) => `<li data-etape="${e.id}"><span class="dot"></span>${esc(e.nom)}<em></em></li>`).join('');
  const t0 = Date.now();
  for (const e of ETAPES_EXPRESS) {
    if (expressAnnule) break;
    const li = liste.querySelector(`[data-etape="${e.id}"]`);
    li.classList.add('encours');
    let ok = true;
    if (e.bouton) {
      const bouton = $(e.bouton);
      for (let k = 0; bouton.disabled && k < 800 && !expressAnnule; k++) await sleep(150); // test déjà lancé à la main
      const depuis = new Date().toISOString();
      e.avant?.();
      bouton.click();
      ok = await attendreResultat(e.id, depuis, 120000);
    } else ok = await attendreResultat(e.id, new Date(0).toISOString(), 3000);
    li.classList.remove('encours');
    const r = results[e.id];
    li.querySelector('.dot').className = `dot ${r?.status || ''}`;
    li.querySelector('em').textContent = !ok ? (expressAnnule ? 'arrêté' : 'non disponible') : STATUS_LABEL[r.status] || '';
  }
  expressEnCours = false;
  btn.textContent = 'Relancer le diagnostic express';
  if (!expressAnnule) {
    const inst = instantane();
    inst.code = await codeRapport(inst);
    enregistrerHistorique(inst);
    const duree = Math.round((Date.now() - t0) / 1000);
    liste.insertAdjacentHTML('beforeend', `<li class="fin">Terminé en ${duree} s — enregistré dans l’historique.</li>`);
  }
  document.dispatchEvent(new CustomEvent('diag:express', { detail: { annule: expressAnnule } }));
}

function ouvrirHistorique() {
  const h = lireHistorique();
  const actuel = instantane();
  const entrees = [{ ...actuel, courant: true }, ...h];
  const liste = $('#histListe');
  liste.innerHTML = entrees.map((e, i) => `
    <label class="hist ${e.courant ? 'courant' : ''}">
      <input type="checkbox" data-i="${i}">
      <span class="hist-note ${e.note == null ? '' : e.note >= 75 ? 'ok' : e.note >= 50 ? 'warn' : 'ko'}">${e.note ?? '—'}</span>
      <span class="hist-texte"><b>${esc(e.appareil)}</b><small>${e.courant ? 'Diagnostic en cours' : esc(new Date(e.date).toLocaleString('fr-FR'))} · ${esc(e.mention)}</small></span>
      ${e.courant ? '' : `<button class="btn ghost" data-voir="${i}">Voir</button><button class="btn ghost" data-suppr="${i}" aria-label="Supprimer">✕</button>`}
    </label>`).join('') + (h.length ? '' : '<p class="small">Aucun diagnostic enregistré pour l’instant : le diagnostic express et le certificat les enregistrent automatiquement.</p>');
  const majBouton = () => {
    const n = liste.querySelectorAll('input:checked').length;
    $('#histComparer').disabled = n !== 2;
    $('#histComparer').textContent = n === 2 ? 'Comparer les deux' : 'Cochez deux diagnostics à comparer';
  };
  liste.querySelectorAll('input').forEach((c) => (c.onchange = majBouton));
  liste.querySelectorAll('[data-voir]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); afficherRecu(entrees[+b.dataset.voir], false); }));
  liste.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = (ev) => {
    ev.preventDefault();
    ecrireHistorique(h.filter((_, k) => k !== +b.dataset.suppr - 1));
    ouvrirHistorique();
  }));
  $('#histComparer').onclick = () => {
    const [a, b] = Array.from(liste.querySelectorAll('input:checked')).map((c) => entrees[+c.dataset.i]);
    comparer(a, b);
  };
  majBouton();
  if (!$('#histDlg').open) $('#histDlg').showModal();
}

function comparer(a, b) {
  $('#compTable').innerHTML = tableComparaison(a, b);
  $('#compDlg').showModal();
}

let recuCourant = null;
async function afficherRecu(inst, depuisLien) {
  recuCourant = inst;
  $('#recuTitre').textContent = depuisLien ? 'Rapport reçu par lien' : 'Diagnostic enregistré';
  let verif = '';
  if (inst.code) {
    const attendu = await codeRapport(inst);
    verif = attendu === inst.code
      ? `<p class="verif ok">Code du rapport ${esc(inst.code)} : le contenu correspond au code ✓</p>`
      : '<p class="verif ko">Le contenu de ce rapport ne correspond pas à son code : il a été modifié.</p>';
  }
  // Le certificat s'affiche dans un cadre isolé : ses styles ne touchent pas la page.
  $('#recuContenu').innerHTML = `${verif}<iframe class="certif-cadre" title="Rapport"></iframe>`;
  $('#recuContenu iframe').srcdoc = certificatHTML(inst);
  if (!$('#recuDlg').open) $('#recuDlg').showModal();
}

async function partagerLien() {
  const inst = instantane();
  inst.code = await codeRapport(inst);
  enregistrerHistorique(inst);
  const lien = `${adresseSite()}#rapport=${await encoderRapport(inst)}`;
  $('#partageLien').value = lien;
  $('#partageAide').textContent = `Ce lien contient le rapport complet (${Math.round(lien.length / 1024 * 10) / 10} Ko), compressé dans l’adresse : il n’est stocké sur aucun serveur. `
    + `Envoyez-le à un acheteur ou à un réparateur. Code du rapport : ${inst.code}.`;
  $('#partageCopier').textContent = 'Copier le lien';
  $('#partageDlg').showModal();
}

function initBilan() {
  afficherBilan();
  document.addEventListener('diag:result', afficherBilan);
  $('#expressBtn').onclick = diagnosticExpress;
  $('#expressHero').onclick = diagnosticExpress;
  $('#certifBtn').onclick = imprimerCertificat;
  $('#repCertif').onclick = imprimerCertificat;
  $('#histBtn').onclick = ouvrirHistorique;
  $('#repHist').onclick = ouvrirHistorique;
  $('#repLien').onclick = partagerLien;
  $('#histFermer').onclick = () => $('#histDlg').close();
  $('#compFermer').onclick = () => $('#compDlg').close();
  $('#recuFermer').onclick = () => $('#recuDlg').close();
  $('#partageFermer').onclick = () => $('#partageDlg').close();
  $('#recuComparer').onclick = () => comparer(recuCourant, instantane());
  $('#partageCopier').onclick = async () => {
    const lien = $('#partageLien').value;
    try {
      if (NATIVE?.shareText) nativeCall('shareText', 'Rapport DiagnoTest', lien);
      else await navigator.clipboard.writeText(lien);
      $('#partageCopier').textContent = NATIVE?.shareText ? 'Partagé ✓' : 'Copié ✓';
    } catch { $('#partageLien').select(); $('#partageCopier').textContent = 'Copiez le lien sélectionné'; }
  };
  $('#histImport').onchange = async (e) => {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    try {
      const inst = versInstantane(JSON.parse(await fichier.text()));
      inst.code ||= await codeRapport(inst);
      enregistrerHistorique(inst);
      ouvrirHistorique();
    } catch (err) { alert(err.message || 'Fichier illisible.'); }
  };
  // Rapport reçu par lien : #rapport=… dans l'adresse.
  const ouvrirLien = async () => {
    const m = location.hash.match(/^#rapport=([jz][\w-]+)$/);
    if (!m) return;
    try { await afficherRecu(await decoderRapport(m[1]), true); } catch (err) { alert(`Lien de rapport illisible : ${err.message}`); }
  };
  addEventListener('hashchange', ouvrirLien);
  ouvrirLien();
}

document.addEventListener('DOMContentLoaded', initBilan);
