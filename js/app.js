/* DiagnoTest — diagnostic matériel dans le navigateur.
 * Aucun framework, aucune dépendance : tout tient dans ce fichier.
 * Chaque test enregistre son résultat via setResult(), utilisé par le résumé et le rapport. */
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n, d = 1) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtBytes = (b) => {
  if (b == null || isNaN(b)) return '—';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${fmt(b, i ? 1 : 0)} ${u[i]}`;
};
const fmtDur = (s) => {
  if (!isFinite(s) || s <= 0) return '—';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/* Pont natif de l'application Android (android/…/DiagnoBridge.java). Absent dans un navigateur :
 * chaque test garde alors son comportement web. */
const NATIVE = window.DiagnoAndroid || null;
const nativeCall = (fn, ...args) => {
  if (!NATIVE || typeof NATIVE[fn] !== 'function') return null;
  try {
    const r = NATIVE[fn](...args);
    return typeof r === 'string' && /^[[{]/.test(r) ? JSON.parse(r) : r;
  } catch { return null; }
};
let DEVICE; // infos appareil natives, lues une seule fois (la liste des capteurs coûte cher)
const device = () => (DEVICE === undefined ? (DEVICE = nativeCall('getDeviceInfo')) : DEVICE);
if (NATIVE) document.documentElement.classList.add('in-app');

/* ------------------------------------------------------------------ */
/* Résultats & résumé                                                  */
/* ------------------------------------------------------------------ */
const results = {};
const STATUS_LABEL = { ok: 'OK', ko: 'Défaut', warn: 'À surveiller', info: 'Info' };

function setResult(id, status, data = {}) {
  results[id] = { status, data: { ...(results[id]?.data || {}), ...data }, at: new Date().toISOString() };
  renderSummary();
  document.dispatchEvent(new CustomEvent('diag:result', { detail: { id, status } })); // écouté par design.js
}

function renderSummary() {
  const nav = $('#summary');
  nav.innerHTML = '';
  $$('.card[data-test]').forEach((card) => {
    const id = card.dataset.test;
    const r = results[id];
    const a = document.createElement('a');
    a.href = `#${card.id}`;
    a.innerHTML = `<span class="dot ${r ? r.status : ''}"></span>${card.dataset.title}`;
    a.title = r ? STATUS_LABEL[r.status] || '' : 'Non testé';
    nav.appendChild(a);
  });
}

function kv(el, obj) {
  el.innerHTML = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/* Boutons « Fonctionne / Défaut » pour les tests qui demandent l'avis de l'utilisateur */
function initVerdicts() {
  $$('.verdict').forEach((box) => {
    const id = box.dataset.for;
    box.innerHTML = '<span>Votre verdict :</span>';
    const ok = Object.assign(document.createElement('button'), { className: 'btn', textContent: '✓ Fonctionne' });
    const ko = Object.assign(document.createElement('button'), { className: 'btn', textContent: '✗ Défaut' });
    ok.onclick = () => { ok.classList.add('ok'); ko.classList.remove('ko'); setResult(id, 'ok', { verdict: 'Fonctionne (validé par l’utilisateur)' }); };
    ko.onclick = () => { ko.classList.add('ko'); ok.classList.remove('ok'); setResult(id, 'ko', { verdict: 'Défaut signalé par l’utilisateur' }); };
    box.append(ok, ko);
  });
}

/* ------------------------------------------------------------------ */
/* Informations système                                                */
/* ------------------------------------------------------------------ */
function detectOS(ua) {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android ([\d.]+)/.test(ua)) return `Android ${RegExp.$1}`;
  if (/iPhone|iPad|iPod/.test(ua)) return `iOS ${(ua.match(/OS ([\d_]+)/) || [, ''])[1].replace(/_/g, '.')}`;
  if (/Mac OS X/.test(ua)) return navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Inconnu';
}
function detectBrowser(ua) {
  const tests = [[/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'], [/Chrome\/([\d.]+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari']];
  for (const [re, name] of tests) { const m = ua.match(re); if (m) return `${name} ${m[1].split('.')[0]}`; }
  return 'Inconnu';
}
function gpuInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { renderer: 'WebGL indisponible' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webgl: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1',
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch { return { renderer: 'Erreur de détection' }; }
}

async function initSystem() {
  const ua = navigator.userAgent;
  const gpu = gpuInfo();
  const info = {
    'Système': detectOS(ua),
    'Navigateur': detectBrowser(ua),
    'Type d’appareil': /Mobi|Android|iPhone/.test(ua) ? 'Téléphone' : (navigator.maxTouchPoints > 1 && /Mac|iPad|Android/.test(ua) ? 'Tablette' : 'Ordinateur'),
    'Cœurs logiques': navigator.hardwareConcurrency || '—',
    'RAM (approx.)': navigator.deviceMemory ? `≥ ${navigator.deviceMemory} Go (valeur plafonnée par le navigateur)` : 'Non exposée',
    'GPU': gpu.renderer,
    'Fabricant GPU': gpu.vendor,
    'Écran': `${screen.width} × ${screen.height} (×${+window.devicePixelRatio.toFixed(2)})`,
    'Points tactiles': navigator.maxTouchPoints || 0,
    'Langue': navigator.language,
    'Fuseau horaire': Intl.DateTimeFormat().resolvedOptions().timeZone,
    'En ligne': navigator.onLine ? 'Oui' : 'Non',
  };
  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      const h = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'bitness', 'model']);
      if (h.platform === 'Windows') {
        const major = parseInt(h.platformVersion, 10);
        info['Système'] = major >= 13 ? 'Windows 11' : 'Windows 10';
      } else if (h.platform) info['Système'] = `${h.platform} ${h.platformVersion || ''}`;
      if (h.architecture) info['Architecture'] = `${h.architecture} ${h.bitness ? h.bitness + ' bits' : ''}`;
      if (h.model) info['Modèle'] = h.model;
    } catch { /* API refusée : on garde la détection par user-agent */ }
  }
  const dev = device();
  if (dev && !dev.error) {
    const FEATURES = { telephony: 'Téléphonie', wifi: 'Wi-Fi', bluetoothLe: 'Bluetooth LE', nfc: 'NFC', gps: 'GPS',
      fingerprint: 'Empreinte digitale', face: 'Reconnaissance faciale', flash: 'Flash', usbHost: 'USB OTG', ir: 'Infrarouge' };
    info['Système'] = `Android ${dev.android} (API ${dev.sdk})`;
    info['Moteur web'] = info['Navigateur'].replace('Chrome', 'WebView'); delete info['Navigateur'];
    info['Modèle'] = `${dev.manufacturer.charAt(0).toUpperCase()}${dev.manufacturer.slice(1)} ${dev.model}`;
    info['Puce'] = dev.socModel ? `${dev.socManufacturer} ${dev.socModel}` : dev.hardware;
    info['Cœurs logiques'] = `${dev.cores}${dev.cpuMaxMHz ? ` (jusqu’à ${fmt(dev.cpuMaxMHz / 1000, 2)} GHz)` : ''}`;
    delete info['RAM (approx.)'];
    info['RAM'] = `${fmtBytes(dev.ramTotal)} (${fmtBytes(dev.ramAvail)} disponibles)`;
    info['Stockage'] = `${fmtBytes(dev.storageFree)} libres sur ${fmtBytes(dev.storageTotal)}`;
    info['Architecture'] = dev.abis;
    info['Correctif de sécurité'] = dev.securityPatch;
    info['Équipements'] = Object.entries(FEATURES).filter(([k]) => dev.features?.[k]).map(([, v]) => v).join(', ');
  }
  kv($('#sysInfo'), info);
  setResult('system', 'info', info);
}

/* ------------------------------------------------------------------ */
/* Batterie                                                            */
/* ------------------------------------------------------------------ */
const BAT_HEALTH = { 1: 'Inconnue', 2: 'Bonne', 3: 'Surchauffe', 4: 'Batterie morte', 5: 'Surtension', 6: 'Défaillance', 7: 'Trop froide' };
const BAT_PLUG = { 1: 'chargeur secteur', 2: 'USB', 4: 'sans fil', 8: 'dock' };

function showBatteryLevel(pct) {
  const fill = $('#batFill');
  fill.style.width = `${pct}%`;
  fill.style.background = pct <= 20 ? 'var(--ko)' : pct <= 40 ? 'var(--warn)' : 'var(--ok)';
  $('#batPct').textContent = `${pct} %`;
}

async function initBattery() {
  const out = $('#batInfo');
  let readState; // () => { level: 0..1, charging }
  let lastShown = '';
  const publish = (status, data) => {
    kv(out, data);
    const key = JSON.stringify(data) + status;
    if (key !== lastShown) { lastShown = key; setResult('battery', status, data); } // évite un flash toutes les 5 s
  };

  if (nativeCall('getBatteryInfo')) {
    // Application Android : mesures du système (santé, température, tension, courant, cycles, capacité).
    const read = () => nativeCall('getBatteryInfo');
    readState = () => { const b = read(); return { level: b.level / b.scale, charging: b.charging }; };
    const update = () => {
      const b = read();
      if (!b || b.error) return;
      const pct = Math.round((b.level / b.scale) * 100);
      showBatteryLevel(pct);
      let cur = b.currentNow || 0;
      if (cur && Math.abs(cur) < 10000) cur *= 1000; // certains constructeurs renvoient des mA au lieu de µA
      // Capacité actuelle estimée : compteur de charge (µAh) ramené à 100 %. Précision d'environ ±10 %.
      // Le compteur est parfois factice ou exprimé en mAh au lieu de µAh : on n'accepte qu'un résultat
      // plausible (30 à 130 % de la capacité d'origine), sinon on l'écarte plutôt que d'afficher un faux défaut.
      const design = b.designCapacity > 0 ? b.designCapacity : null;
      let fullMah = null, counterUnreliable = false;
      if (b.chargeCounter > 0 && pct >= 15) {
        const plausible = (mah) => !design || (mah / design >= 0.3 && mah / design <= 1.3);
        const asMicro = b.chargeCounter / 1000 / (pct / 100), asMilli = b.chargeCounter / (pct / 100);
        if (plausible(asMicro)) fullMah = asMicro;
        else if (plausible(asMilli)) fullMah = asMilli;
        else counterUnreliable = true;
      }
      const health = fullMah && design ? Math.min(100, (fullMah / design) * 100) : null;
      const temp = b.temperature / 10;
      const data = {
        'Niveau': `${pct} %`,
        'État': b.charging ? `En charge ⚡${BAT_PLUG[b.plugged] ? ` (${BAT_PLUG[b.plugged]})` : ''}` : 'Sur batterie',
        'Santé (système)': BAT_HEALTH[b.health] || 'Inconnue',
        'Température': `${fmt(temp)} °C`,
        'Tension': `${fmt(b.voltage / 1000, 2)} V`,
        'Courant': cur ? `${fmt(Math.abs(cur) / 1000, 0)} mA ${b.charging ? 'entrants' : 'consommés'}` : undefined,
        'Technologie': b.technology || undefined,
        'Cycles de charge': b.cycleCount > 0 ? b.cycleCount : undefined,
        'Capacité d’origine': design ? `${fmt(design, 0)} mAh` : undefined,
        'Capacité actuelle estimée': fullMah ? `≈ ${fmt(fullMah, 0)} mAh` : undefined,
        'Santé estimée': health ? `≈ ${fmt(health, 0)} % de la capacité d’origine`
          : counterUnreliable ? 'Non mesurable : compteur de charge incohérent sur cet appareil' : undefined,
      };
      let status = 'ok';
      if ([4, 6].includes(b.health) || (health && health < 60)) {
        status = 'ko'; data['Diagnostic'] = 'Batterie défaillante ou très usée : remplacement conseillé.';
      } else if ([3, 5, 7].includes(b.health) || temp >= 45 || (health && health < 80)) {
        status = 'warn';
        data['Diagnostic'] = temp >= 45 ? 'Batterie chaude : laissez refroidir l’appareil.' : 'Usure notable : autonomie réduite.';
      } else if (pct <= 20 && !b.charging) status = 'warn';
      publish(status, data);
    };
    update();
    setInterval(update, 5000);
  } else if (navigator.getBattery) {
    const battery = await navigator.getBattery();
    readState = () => ({ level: battery.level, charging: battery.charging });
    const update = () => {
      const pct = Math.round(battery.level * 100);
      showBatteryLevel(pct);
      const data = {
        'Niveau': `${pct} %`,
        'En charge': battery.charging ? 'Oui ⚡' : 'Non',
        'Temps avant charge complète': battery.charging ? (battery.chargingTime === Infinity ? 'Calcul en cours…' : fmtDur(battery.chargingTime)) : undefined,
        'Autonomie restante': !battery.charging ? (battery.dischargingTime === Infinity ? 'Calcul en cours…' : fmtDur(battery.dischargingTime)) : undefined,
      };
      // Sur un PC fixe sans batterie, les navigateurs renvoient 100 % + en charge + chargingTime 0.
      if (battery.charging && battery.level === 1 && battery.chargingTime === 0) data['Remarque'] = 'Batterie pleine, ou appareil sans batterie (PC fixe).';
      publish(pct <= 20 && !battery.charging ? 'warn' : 'ok', data);
    };
    ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => battery.addEventListener(e, update));
    update();
  } else {
    kv(out, { 'Statut': 'API Batterie non disponible sur ce navigateur (Firefox, Safari, iOS). Essayez Chrome/Edge, l’application Android ou la version PC.' });
    $('#batDrainBtn').disabled = true;
    setResult('battery', 'info', { note: 'API non disponible' });
    return;
  }

  $('#batDrainBtn').onclick = async () => {
    const btn = $('#batDrainBtn');
    if (readState().charging) { $('#batDrainOut').textContent = 'Débranchez le chargeur pour mesurer la décharge.'; return; }
    btn.disabled = true;
    const start = readState().level, t0 = Date.now(), DURATION = 5 * 60 * 1000;
    const timer = setInterval(() => {
      const el = Date.now() - t0;
      $('#batDrainOut').textContent = `Mesure en cours… ${Math.ceil((DURATION - el) / 1000)} s restantes (laissez l’appareil tel quel).`;
    }, 1000);
    await sleep(DURATION);
    clearInterval(timer);
    btn.disabled = false;
    const drop = (start - readState().level) * 100, hours = (Date.now() - t0) / 3.6e6;
    const perHour = drop / hours;
    const msg = drop <= 0
      ? 'Aucune baisse mesurable en 5 min (le niveau est arrondi au % près) : bon signe. Relancez pour plus de précision.'
      : `Décharge : ${fmt(perHour)} %/h → autonomie estimée de 100 % à 0 % : ${fmtDur((100 / perHour) * 3600)}.`;
    $('#batDrainOut').textContent = msg;
    setResult('battery', perHour > 30 ? 'warn' : results.battery.status, { 'Décharge mesurée': drop <= 0 ? '< 1 %/5 min' : `${fmt(perHour)} %/h` });
  };
}

/* ------------------------------------------------------------------ */
/* CPU                                                                 */
/* ------------------------------------------------------------------ */
const WORKER_SRC = `
function chunk() {
  let x = 123456789, y = 0;
  for (let i = 1; i <= 200000; i++) {
    x = (x * 1103515245 + 12345) | 0;
    y += Math.sqrt(i) * ((x >>> 16) & 255);
  }
  return y;
}
onmessage = (e) => {
  const { cmd, ms } = e.data;
  const t0 = performance.now();
  let ops = 0, tickOps = 0, lastTick = t0, sink = 0;
  while (performance.now() - t0 < ms) {
    sink += chunk(); ops++; tickOps++;
    if (cmd === 'stress' && performance.now() - lastTick >= 1000) {
      postMessage({ tick: tickOps / ((performance.now() - lastTick) / 1000) });
      tickOps = 0; lastTick = performance.now();
    }
  }
  postMessage({ done: true, ops, secs: (performance.now() - t0) / 1000, sink });
};`;
const workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));

function runWorkers(n, ms, cmd = 'bench', onTick) {
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const w = new Worker(workerURL);
    w.onmessage = (e) => {
      if (e.data.tick !== undefined) { onTick && onTick(e.data.tick); return; }
      w.terminate();
      resolve(e.data.ops / e.data.secs);
    };
    w.onerror = (err) => { w.terminate(); reject(err); };
    w.postMessage({ cmd, ms });
  })));
}

function drawChart(canvas, values, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const max = Math.max(...values) * 1.1;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w, y = h - (v / max) * h;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function initCPU() {
  const cores = navigator.hardwareConcurrency || 4;
  const prog = $('#cpuProg');
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

  $('#cpuBenchBtn').onclick = async () => {
    const btns = [$('#cpuBenchBtn'), $('#cpuStressBtn')];
    btns.forEach((b) => (b.disabled = true));
    const out = $('#cpuOut');
    try {
      kv(out, { 'Étape': 'Mono-cœur (3 s)…' });
      prog.style.width = '25%';
      const [single] = await runWorkers(1, 3000);
      kv(out, { 'Mono-cœur': `${fmt(single, 0)} pts`, 'Étape': `Multi-cœurs sur ${cores} threads (3 s)…` });
      prog.style.width = '60%';
      const multiArr = await runWorkers(cores, 3000);
      const multi = multiArr.reduce((a, b) => a + b, 0);
      prog.style.width = '100%';
      const data = {
        'Threads': cores,
        'Score mono-cœur': `${fmt(single, 0)} pts`,
        'Score multi-cœurs': `${fmt(multi, 0)} pts`,
        'Efficacité multi-cœurs': `×${fmt(multi / single)} (idéal ×${cores})`,
      };
      kv(out, data);
      setResult('cpu', 'ok', data);
    } catch (e) {
      kv(out, { 'Erreur': e.message || String(e) });
      setResult('cpu', 'ko', { erreur: String(e.message || e) });
    }
    btns.forEach((b) => (b.disabled = false));
  };

  $('#cpuStressBtn').onclick = async () => {
    const dur = +$('#cpuStressDur').value;
    const btns = [$('#cpuBenchBtn'), $('#cpuStressBtn')];
    btns.forEach((b) => (b.disabled = true));
    const samples = [];
    let acc = 0, count = 0;
    const t0 = Date.now();
    // Chaque worker envoie son débit chaque seconde ; on agrège par seconde.
    const iv = setInterval(() => {
      if (count) { samples.push(acc); acc = 0; count = 0; }
      const el = (Date.now() - t0) / 1000;
      prog.style.width = `${Math.min(100, (el / dur) * 100)}%`;
      drawChart($('#cpuChart'), samples, accent());
      kv($('#cpuOut'), { 'Stress test': `${Math.round(el)} / ${dur} s sur ${cores} threads`, 'Débit actuel': samples.length ? `${fmt(samples.at(-1), 0)} pts/s` : '…' });
    }, 1000);
    await runWorkers(cores, dur * 1000, 'stress', (v) => { acc += v; count++; });
    clearInterval(iv);
    prog.style.width = '100%';
    const max = Math.max(...samples), last = samples.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, samples.length);
    const drop = (1 - last / max) * 100;
    const data = {
      'Stress test': `${dur} s sur ${cores} threads`,
      'Débit max': `${fmt(max, 0)} pts/s`,
      'Débit en fin de test': `${fmt(last, 0)} pts/s`,
      'Baisse de performance': `${fmt(drop)} %`,
      'Diagnostic': drop > 25 ? '⚠️ Forte baisse : probable surchauffe (throttling). Vérifiez ventilation / pâte thermique.' : drop > 10 ? 'Légère baisse, normale sur portable/téléphone.' : 'Performances stables ✓',
    };
    kv($('#cpuOut'), data);
    drawChart($('#cpuChart'), samples, accent());
    setResult('cpu', drop > 25 ? 'warn' : 'ok', data);
    btns.forEach((b) => (b.disabled = false));
  };
}

/* ------------------------------------------------------------------ */
/* RAM                                                                 */
/* ------------------------------------------------------------------ */
function initRAM() {
  const out = $('#ramOut');
  const base = {
    'RAM déclarée': navigator.deviceMemory ? `≥ ${navigator.deviceMemory} Go` : 'Non exposée par le navigateur',
    'Limite du tas JS': performance.memory ? fmtBytes(performance.memory.jsHeapSizeLimit) : undefined,
  };
  kv(out, base);

  $('#ramBtn').onclick = async () => {
    const btn = $('#ramBtn');
    btn.disabled = true;
    const targetMB = +$('#ramSize').value, CHUNK_MB = 32;
    const chunks = [];
    let errors = 0, writeT = 0, readT = 0, bytes = 0, allocFail = null;
    const prog = $('#ramProg');
    for (let i = 0; i < targetMB / CHUNK_MB; i++) {
      let arr;
      try { arr = new Uint32Array((CHUNK_MB * 1024 * 1024) / 4); } catch (e) { allocFail = e; break; }
      chunks.push(arr);
      // Deux passes avec motifs inverses (type « checkerboard ») pour détecter les bits collés.
      for (const pattern of [0xA5A5A5A5, 0x5A5A5A5A]) {
        let t = performance.now();
        for (let j = 0; j < arr.length; j++) arr[j] = (pattern ^ j) >>> 0;
        writeT += performance.now() - t;
        t = performance.now();
        for (let j = 0; j < arr.length; j++) if (arr[j] !== ((pattern ^ j) >>> 0)) errors++;
        readT += performance.now() - t;
        bytes += arr.byteLength;
      }
      prog.style.width = `${((i + 1) * CHUNK_MB / targetMB) * 100}%`;
      kv(out, { ...base, 'Progression': `${(i + 1) * CHUNK_MB} / ${targetMB} Mo` });
      await sleep(0);
    }
    const tested = chunks.length * CHUNK_MB;
    chunks.length = 0; // libère la mémoire
    const data = {
      ...base,
      'Mémoire testée': `${tested} Mo`,
      'Vitesse d’écriture': `${fmt(bytes / (writeT / 1000) / 1e9, 2)} Go/s`,
      'Vitesse de lecture + vérif.': `${fmt(bytes / (readT / 1000) / 1e9, 2)} Go/s`,
      'Erreurs détectées': errors,
      'Allocation': allocFail ? `Limite atteinte à ${tested} Mo (limite du navigateur, pas forcément un défaut)` : 'OK',
      'Diagnostic': errors ? '❌ Erreurs mémoire : barrette défectueuse probable. Lancez MemTest86 pour confirmer.' : 'Aucune erreur ✓',
    };
    kv(out, data);
    setResult('ram', errors ? 'ko' : 'ok', data);
    btn.disabled = false;
  };
}

/* ------------------------------------------------------------------ */
/* Overlay plein écran (écran & tactile)                               */
/* ------------------------------------------------------------------ */
const overlay = $('#overlay');
let overlayCleanup = null;
const closeBtn = Object.assign(document.createElement('button'), { className: 'btn overlay-close', textContent: '✕ Quitter' });
overlay.appendChild(closeBtn);

function openOverlay(hint, onKey, onTap) {
  overlay.hidden = false;
  overlay.style.background = '#000';
  const h = $('#overlayHint');
  h.textContent = hint; h.style.opacity = 1;
  setTimeout(() => (h.style.opacity = 0), 3000);
  overlay.requestFullscreen?.().catch(() => {});
  const keyH = (e) => {
    if (e.key === 'Escape') { closeOverlay(); return; }
    onKey && onKey(e);
  };
  const tapH = (e) => { if (e.target !== closeBtn) onTap && onTap(e); };
  document.addEventListener('keydown', keyH);
  overlay.addEventListener('click', tapH);
  const fsH = () => { if (!document.fullscreenElement && !overlay.hidden && overlay.dataset.fs) closeOverlay(); };
  document.addEventListener('fullscreenchange', fsH);
  setTimeout(() => { overlay.dataset.fs = document.fullscreenElement ? '1' : ''; }, 500);
  overlayCleanup = () => {
    document.removeEventListener('keydown', keyH);
    overlay.removeEventListener('click', tapH);
    document.removeEventListener('fullscreenchange', fsH);
  };
}
function closeOverlay() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  overlay.dataset.fs = '';
  overlayCleanup && overlayCleanup();
  overlayCleanup = null;
  const c = $('#touchCanvas'); c.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  overlay.dispatchEvent(new Event('closed'));
}
closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(); };

/* ------------------------------------------------------------------ */
/* Écran                                                               */
/* ------------------------------------------------------------------ */
function initScreen() {
  const COLORS = [['#ff0000', 'Rouge'], ['#00ff00', 'Vert'], ['#0000ff', 'Bleu'], ['#ffffff', 'Blanc'],
    ['#000000', 'Noir'], ['#808080', 'Gris 50 %'], ['#00ffff', 'Cyan'], ['#ff00ff', 'Magenta'], ['#ffff00', 'Jaune']];

  const info = () => {
    const dpr = window.devicePixelRatio || 1;
    const mq = (q) => window.matchMedia(q).matches;
    kv($('#scrInfo'), {
      'Résolution physique': `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)} px`,
      'Résolution CSS': `${screen.width} × ${screen.height}`,
      'Densité (DPR)': +dpr.toFixed(2),
      'Profondeur de couleur': `${screen.colorDepth} bits`,
      'Gamut': mq('(color-gamut: rec2020)') ? 'Rec.2020' : mq('(color-gamut: p3)') ? 'Display P3' : 'sRGB',
      'HDR': mq('(dynamic-range: high)') ? 'Oui' : 'Non',
      'Orientation': screen.orientation?.type || '—',
      // Application Android : caractéristiques physiques exactes de la dalle
      ...(device()?.screenWidth ? {
        'Résolution physique': `${device().screenWidth} × ${device().screenHeight} px (${device().densityDpi} dpi)`,
        'Diagonale': `≈ ${fmt(device().screenInches)} pouces`,
        'Fréquence max de la dalle': `${device().maxRefreshRate} Hz`,
        'HDR': device().hdr ? 'Oui' : 'Non',
      } : {}),
    });
  };
  info();
  window.addEventListener('resize', info);

  $('#scrColorsBtn').onclick = () => {
    let i = 0;
    const show = () => {
      overlay.style.background = COLORS[i][0];
      const h = $('#overlayHint');
      h.textContent = `${COLORS[i][1]} (${i + 1}/${COLORS.length}) — cherchez les points de couleur différente`;
      h.style.opacity = 1; clearTimeout(show.t); show.t = setTimeout(() => (h.style.opacity = 0), 1500);
    };
    const next = (d = 1) => { i += d; if (i >= COLORS.length) return closeOverlay(); if (i < 0) i = 0; show(); };
    openOverlay('', (e) => {
      if (['ArrowRight', ' ', 'Enter'].includes(e.key)) next(1);
      if (e.key === 'ArrowLeft') next(-1);
    }, () => next(1));
    show();
  };

  const canvasMode = (hint, draw) => {
    const c = $('#touchCanvas');
    c.hidden = false;
    let step = 0;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = innerWidth * dpr; c.height = innerHeight * dpr;
      const ctx = c.getContext('2d');
      if (!draw(ctx, c.width, c.height, step)) closeOverlay();
    };
    openOverlay(hint, (e) => { if (['ArrowRight', ' ', 'Enter'].includes(e.key)) { step++; render(); } }, () => { step++; render(); });
    requestAnimationFrame(render);
  };

  $('#scrGradBtn').onclick = () => canvasMode('Dégradés : ils doivent être lisses, sans bandes marquées. Touchez pour la mire suivante.', (ctx, w, h, step) => {
    if (step === 0) {
      [['#000', '#fff'], ['#000', '#f00'], ['#000', '#0f0'], ['#000', '#00f']].forEach(([a, b], k) => {
        const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, a); g.addColorStop(1, b);
        ctx.fillStyle = g; ctx.fillRect(0, (k * h) / 4, w, h / 4);
      });
    } else if (step === 1) {
      // 32 niveaux de gris : chaque bande doit être distincte (test de la plage dynamique)
      for (let k = 0; k < 32; k++) { const v = Math.round((k * 255) / 31); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect((k * w) / 32, 0, w / 32 + 1, h); }
    } else if (step === 2) {
      // Damier fin 1 px : révèle le flou, le ghosting et les problèmes de mise à l'échelle
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (x + y) & 1 ? 255 : 0; const p = (y * w + x) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    } else return false;
    return true;
  });

  $('#scrBleedBtn').onclick = () => {
    openOverlay('Écran noir : baissez la lumière de la pièce et cherchez des halos clairs sur les bords (fuite de lumière).', null, () => closeOverlay());
  };

  $('#scrFixBtn').onclick = () => {
    if (!confirm('⚠️ Ce mode fait clignoter l’écran très rapidement.\nNe l’utilisez PAS si vous êtes sensible à l’épilepsie photosensible.\n\nPlacez la zone clignotante sur le pixel bloqué pendant 10 à 30 minutes. Continuer ?')) return;
    const c = $('#touchCanvas');
    c.hidden = false;
    let running = true, px = innerWidth / 2, py = innerHeight / 2;
    const size = 120;
    const ctx = c.getContext('2d');
    const loop = () => {
      if (!running) return;
      c.width = innerWidth; c.height = innerHeight;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
      for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = ['#f00', '#0f0', '#00f', '#fff', '#000'][(Math.random() * 5) | 0];
        ctx.fillRect(px - size / 2 + x, py - size / 2 + y, 4, 4);
      }
      requestAnimationFrame(loop);
    };
    const move = (e) => { px = e.clientX; py = e.clientY; };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('closed', () => { running = false; overlay.removeEventListener('pointermove', move); }, { once: true });
    openOverlay('Déplacez le carré sur le pixel bloqué. Échap ou « Quitter » pour arrêter.');
    loop();
  };

  $('#hzBtn').onclick = () => {
    const deltas = [];
    let last = performance.now();
    const t0 = last;
    $('#hzOut').textContent = 'Mesure (2 s)…';
    const frame = (t) => {
      deltas.push(t - last); last = t;
      if (t - t0 < 2000) return requestAnimationFrame(frame);
      deltas.sort((a, b) => a - b);
      const med = deltas[Math.floor(deltas.length / 2)];
      const hz = 1000 / med;
      const common = [30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240, 360];
      const nearest = common.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
      $('#hzOut').textContent = `≈ ${fmt(hz)} Hz (probablement ${nearest} Hz)`;
      setResult('screen', results.screen?.status || 'info', { 'Fréquence mesurée': `${nearest} Hz` });
    };
    requestAnimationFrame(frame);
  };
}

/* ------------------------------------------------------------------ */
/* Tactile & souris                                                    */
/* ------------------------------------------------------------------ */
function initTouch() {
  let maxPts = 0;
  $('#touchBtn').onclick = () => {
    const c = $('#touchCanvas');
    c.hidden = false;
    const CELL = 44;
    let cols, rows, hit, remaining;
    const ctx = c.getContext('2d');
    const active = new Map();
    const setup = () => {
      c.width = innerWidth; c.height = innerHeight;
      cols = Math.ceil(innerWidth / CELL); rows = Math.ceil(innerHeight / CELL);
      hit = new Uint8Array(cols * rows); remaining = cols * rows;
      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#334155';
      for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, c.height); ctx.stroke(); }
      for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(c.width, y * CELL); ctx.stroke(); }
    };
    const mark = (x, y) => {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      const k = cy * cols + cx;
      if (hit[k]) return;
      hit[k] = 1; remaining--;
      ctx.fillStyle = '#16a34a'; ctx.fillRect(cx * CELL + 1, cy * CELL + 1, CELL - 2, CELL - 2);
      if (remaining === 0) finish();
    };
    const down = (e) => { active.set(e.pointerId, true); maxPts = Math.max(maxPts, active.size); $('#touchPts').textContent = `Points simultanés max : ${maxPts}`; mark(e.clientX, e.clientY); };
    const move = (e) => { if (e.buttons || e.pointerType === 'touch') { (e.getCoalescedEvents?.() || [e]).forEach((p) => mark(p.clientX, p.clientY)); } };
    const up = (e) => active.delete(e.pointerId);
    const finish = () => {
      const covered = ((cols * rows - remaining) / (cols * rows)) * 100;
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
      closeOverlay();
      const data = { 'Couverture': `${fmt(covered, 0)} %`, 'Points simultanés max': maxPts, 'Cases non touchées': remaining };
      setResult('touch', remaining === 0 ? 'ok' : 'warn', data);
      $('#touchPts').textContent = `Couverture ${fmt(covered, 0)} % — points simultanés max : ${maxPts}`;
    };
    setup();
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    overlay.addEventListener('closed', () => { if (remaining) finish(); }, { once: true });
    openOverlay('Balayez toutes les cases. Posez plusieurs doigts pour tester le multi-touch.');
  };

  // Souris
  const zone = $('#mouseZone');
  const hitSet = new Set();
  const hitBtn = (id) => { $(id).classList.add('hit'); hitSet.add(id); if (hitSet.size === 5) setResult('touch', results.touch?.status || 'ok', { 'Souris / pavé tactile': 'Tous les boutons fonctionnent' }); };
  zone.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button <= 2) { hitBtn(`#mb${e.button}`); $(`#mb${e.button}`).classList.add('down'); } });
  zone.addEventListener('pointerup', (e) => { if (e.button <= 2) $(`#mb${e.button}`)?.classList.remove('down'); });
  zone.addEventListener('contextmenu', (e) => e.preventDefault());
  zone.addEventListener('wheel', (e) => { e.preventDefault(); hitBtn('#mbW'); }, { passive: false });
  zone.addEventListener('dblclick', () => hitBtn('#mbD'));
  zone.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // évite l'auto-scroll
}

/* ------------------------------------------------------------------ */
/* Clavier                                                             */
/* ------------------------------------------------------------------ */
const KB_ROWS = [
  [['Escape', 'Échap'], null, 'F1', 'F2', 'F3', 'F4', null, 'F5', 'F6', 'F7', 'F8', null, 'F9', 'F10', 'F11', 'F12', null, ['PrintScreen', 'Impr'], ['ScrollLock', 'Défil'], ['Pause', 'Pause']],
  [['Backquote'], ['Digit1'], ['Digit2'], ['Digit3'], ['Digit4'], ['Digit5'], ['Digit6'], ['Digit7'], ['Digit8'], ['Digit9'], ['Digit0'], ['Minus'], ['Equal'], ['Backspace', '⌫ Retour', 2], null, ['Insert', 'Inser'], ['Home', 'Début'], ['PageUp', 'Pg ↑']],
  [['Tab', 'Tab ↹', 1.5], ['KeyQ'], ['KeyW'], ['KeyE'], ['KeyR'], ['KeyT'], ['KeyY'], ['KeyU'], ['KeyI'], ['KeyO'], ['KeyP'], ['BracketLeft'], ['BracketRight'], ['Enter', 'Entrée ↵', 1.5], null, ['Delete', 'Suppr'], ['End', 'Fin'], ['PageDown', 'Pg ↓']],
  [['CapsLock', 'Verr. Maj', 1.75], ['KeyA'], ['KeyS'], ['KeyD'], ['KeyF'], ['KeyG'], ['KeyH'], ['KeyJ'], ['KeyK'], ['KeyL'], ['Semicolon'], ['Quote'], ['Backslash'], null, null, null, null, null],
  [['ShiftLeft', '⇧ Maj', 1.25], ['IntlBackslash'], ['KeyZ'], ['KeyX'], ['KeyC'], ['KeyV'], ['KeyB'], ['KeyN'], ['KeyM'], ['Comma'], ['Period'], ['Slash'], ['ShiftRight', '⇧ Maj', 2.75], null, null, ['ArrowUp', '↑'], null],
  [['ControlLeft', 'Ctrl', 1.5], ['MetaLeft', '⊞ Win'], ['AltLeft', 'Alt'], ['Space', 'Espace', 6], ['AltRight', 'Alt Gr'], ['ContextMenu', '☰'], ['ControlRight', 'Ctrl', 1.5], null, ['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']],
];
const LABELS = {
  qwerty: {
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backslash: '\\', IntlBackslash: '\\', Comma: ',', Period: '.', Slash: '/',
  },
  azerty: {
    Backquote: '²', Digit1: '& 1', Digit2: 'é 2', Digit3: '" 3', Digit4: "' 4", Digit5: '( 5', Digit6: '- 6', Digit7: 'è 7',
    Digit8: '_ 8', Digit9: 'ç 9', Digit0: 'à 0', Minus: ') °', Equal: '= +', KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W',
    KeyM: ', ?', Semicolon: 'M', Quote: 'ù', Backslash: '*', BracketLeft: '^', BracketRight: '$', IntlBackslash: '<',
    Comma: '; .', Period: ': /', Slash: '! §',
  },
};

function initKeyboard() {
  const kb = $('#keyboard');
  const tested = new Set();
  const label = (code, layout) => LABELS[layout][code] || code.replace(/^Key|^Digit/, '');
  const build = () => {
    const layout = $('#kbLayout').value;
    kb.innerHTML = '';
    KB_ROWS.forEach((row) => {
      const r = document.createElement('div'); r.className = 'kb-row';
      row.forEach((k) => {
        const el = document.createElement('div');
        if (!k) { el.className = 'key gap'; r.appendChild(el); return; }
        const [code, text, w] = Array.isArray(k) ? k : [k];
        el.className = 'key' + (tested.has(code) ? ' hit' : '');
        el.dataset.code = code;
        el.textContent = text || label(code, layout);
        if (w) el.style.setProperty('--w', w);
        r.appendChild(el);
      });
      kb.appendChild(r);
    });
    const extra = document.createElement('div'); extra.className = 'kb-row'; extra.id = 'kbExtra'; kb.appendChild(extra);
    tested.forEach((c) => { if (!kb.querySelector(`[data-code="${c}"]`)) addExtra(c); });
  };
  const addExtra = (code) => {
    const el = document.createElement('div');
    el.className = 'key hit'; el.dataset.code = code; el.textContent = code.replace(/^Numpad/, 'Pavé '); el.style.setProperty('--w', 1.6);
    $('#kbExtra').appendChild(el);
    return el;
  };
  const save = () => setResult('keyboard', results.keyboard?.status === 'ko' ? 'ko' : 'info', { 'Touches testées': tested.size });

  const onDown = (e) => {
    if (e.target.matches?.('input, select, textarea')) return;
    if (document.activeElement === kb) e.preventDefault();
    const code = e.code || e.key;
    if (!code) return;
    let el = kb.querySelector(`[data-code="${code}"]`);
    if (!el) el = addExtra(code);
    el.classList.add('hit', 'down');
    if (!tested.has(code)) { tested.add(code); $('#kbCount').textContent = tested.size; save(); }
    $('#kbLast').textContent = `Dernière touche : ${e.key === ' ' ? 'Espace' : e.key} (code ${code})`;
  };
  const onUp = (e) => {
    const code = e.code || e.key;
    const el = kb.querySelector(`[data-code="${code}"]`);
    el?.classList.remove('down');
    // Certaines touches (Impr. écran) n'émettent que keyup
    if (code === 'PrintScreen' && !tested.has(code)) onDown(e);
  };
  document.addEventListener('keydown', onDown);
  document.addEventListener('keyup', onUp);
  window.addEventListener('blur', () => kb.querySelectorAll('.down').forEach((k) => k.classList.remove('down')));
  $('#kbLayout').onchange = build;
  $('#kbReset').onclick = () => { tested.clear(); $('#kbCount').textContent = 0; build(); };
  $('#kbMobile').addEventListener('input', (e) => { $('#kbLast').textContent = `Saisi : « ${e.target.value.slice(-20)} »`; });

  // Disposition par défaut selon la langue
  if (/^fr|^be/.test(navigator.language)) $('#kbLayout').value = 'azerty'; else $('#kbLayout').value = 'qwerty';
  build();
}

/* ------------------------------------------------------------------ */
/* Haut-parleurs                                                       */
/* ------------------------------------------------------------------ */
let audioCtx = null;
const getAudio = () => (audioCtx ||= new (window.AudioContext || window.webkitAudioContext)());

function initAudio() {
  $$('[data-pan]').forEach((b) => (b.onclick = () => {
    const ctx = getAudio();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    let node = osc.connect(gain);
    if (pan) { pan.pan.value = +b.dataset.pan; node = node.connect(pan); }
    node.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.25);
    $('#audioOut').textContent = `Bip 440 Hz — ${b.textContent.trim()}. L’entendez-vous du bon côté ?`;
  }));

  $('#sweepBtn').onclick = () => {
    const ctx = getAudio();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const D = 10;
    osc.frequency.setValueAtTime(20, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20000, ctx.currentTime + D);
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + D);
    const t0 = ctx.currentTime;
    const iv = setInterval(() => {
      const el = ctx.currentTime - t0;
      if (el >= D) { clearInterval(iv); $('#audioOut').textContent = 'Balayage terminé. Un grésillement à une fréquence précise peut indiquer un haut-parleur abîmé.'; return; }
      $('#audioOut').textContent = `Fréquence : ${fmt(20 * Math.pow(1000, el / D), 0)} Hz — notez quand le son disparaît / grésille.`;
    }, 100);
  };
}

/* ------------------------------------------------------------------ */
/* Microphone                                                          */
/* ------------------------------------------------------------------ */
function initMic() {
  let stream = null, peak = 0;
  $('#micBtn').onclick = async () => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; $('#micBtn').textContent = 'Démarrer le micro'; $('#micRecBtn').disabled = true; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      $('#micOut').textContent = `Accès refusé ou aucun micro : ${e.message}`;
      setResult('mic', 'ko', { erreur: e.message });
      return;
    }
    $('#micBtn').textContent = 'Arrêter le micro';
    $('#micRecBtn').disabled = !window.MediaRecorder;
    const track = stream.getAudioTracks()[0];
    $('#micOut').textContent = `Micro : ${track.label || 'par défaut'} — parlez ou tapez des mains.`;
    const ctx = getAudio();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const cv = $('#micWave');
    const draw = () => {
      if (!stream) { $('#micLevel').style.width = '0'; return; }
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      $('#micLevel').style.width = `${Math.min(100, rms * 400)}%`;
      if (rms > peak) peak = rms;
      if (peak > 0.02 && results.mic?.status !== 'ok' && results.mic?.status !== 'ko') setResult('mic', 'ok', { 'Micro': track.label || 'par défaut', 'Signal': 'Détecté ✓' });
      const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const g = cv.getContext('2d'); g.scale(dpr, dpr);
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ok'); g.lineWidth = 1.5; g.beginPath();
      for (let i = 0; i < buf.length; i++) { const x = (i / buf.length) * w, y = h / 2 + buf[i] * h * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      requestAnimationFrame(draw);
    };
    draw();
  };
  $('#micRecBtn').onclick = async () => {
    if (!stream) return;
    const rec = new MediaRecorder(stream), parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = () => {
      const a = $('#micPlayback');
      a.src = URL.createObjectURL(new Blob(parts, { type: rec.mimeType }));
      a.hidden = false; a.play().catch(() => {});
      $('#micOut').textContent = 'Écoute de l’enregistrement : le son doit être clair, sans grésillement.';
    };
    rec.start();
    $('#micRecBtn').disabled = true;
    for (let s = 5; s > 0; s--) { $('#micOut').textContent = `Enregistrement… ${s} s`; await sleep(1000); }
    rec.stop();
    $('#micRecBtn').disabled = false;
  };
}

/* ------------------------------------------------------------------ */
/* Caméra                                                              */
/* ------------------------------------------------------------------ */
function initCamera() {
  let stream = null;
  const sel = $('#camSelect');
  const listCams = async () => {
    const devs = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
    const cams = devs.filter((d) => d.kind === 'videoinput');
    const cur = sel.value;
    sel.innerHTML = cams.map((c, i) => `<option value="${c.deviceId}">${c.label || `Caméra ${i + 1}`}</option>`).join('') || '<option value="">Caméra par défaut</option>';
    if (cur) sel.value = cur;
    return cams.length;
  };
  listCams();
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; $('#camVideo').srcObject = null; };
  $('#camStop').onclick = stop;
  $('#camBtn').onclick = async () => {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: sel.value ? { deviceId: { exact: sel.value }, width: { ideal: 4096 }, height: { ideal: 2160 } } : { width: { ideal: 4096 }, height: { ideal: 2160 } },
      });
    } catch (e) {
      $('#camOut').textContent = `Accès refusé ou aucune caméra : ${e.message}`;
      setResult('camera', 'ko', { erreur: e.message });
      return;
    }
    const v = $('#camVideo');
    v.srcObject = stream;
    const n = await listCams();
    const s = stream.getVideoTracks()[0].getSettings();
    const data = { 'Caméra': stream.getVideoTracks()[0].label, 'Résolution max obtenue': `${s.width} × ${s.height}`, 'Images/s': s.frameRate ? fmt(s.frameRate, 0) : '—', 'Caméras détectées': n };
    $('#camOut').textContent = `${data['Résolution max obtenue']} @ ${data['Images/s']} i/s — ${n} caméra(s) détectée(s)`;
    setResult('camera', 'ok', data);
  };
}

/* ------------------------------------------------------------------ */
/* Capteurs, vibreur, GPS                                              */
/* ------------------------------------------------------------------ */
function initSensors() {
  const state = {};
  const render = () => kv($('#sensOut'), state);
  // Application Android : liste des capteurs matériels déclarés par le système.
  const sensors = device()?.sensors;
  if (sensors?.length) {
    const NAMES = { accelerometer: 'Accéléromètre', gyroscope: 'Gyroscope', magnetic_field: 'Boussole', light: 'Luminosité',
      proximity: 'Proximité', pressure: 'Baromètre', step_counter: 'Podomètre', ambient_temperature: 'Température',
      relative_humidity: 'Humidité', heart_rate: 'Cardio', gravity: 'Gravité', rotation_vector: 'Rotation' };
    const found = [...new Set(sensors.map((s) => NAMES[(s.type || '').replace('android.sensor.', '')]).filter(Boolean))];
    state['Capteurs détectés'] = `${sensors.length} au total : ${found.join(', ')}`;
    render();
  }
  $('#sensBtn').onclick = async () => {
    try {
      // iOS 13+ exige une autorisation explicite
      if (typeof DeviceOrientationEvent?.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
      if (typeof DeviceMotionEvent?.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
    } catch (e) { state['Autorisation'] = `Refusée : ${e.message}`; render(); }
    let gotOri = false, gotMot = false;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null) return;
      gotOri = true;
      state['Gyroscope / orientation'] = `α ${fmt(e.alpha ?? 0, 0)}° · β ${fmt(e.beta, 0)}° · γ ${fmt(e.gamma ?? 0, 0)}°`;
      const x = Math.max(-45, Math.min(45, e.gamma || 0)), y = Math.max(-45, Math.min(45, e.beta || 0));
      $('#bubble').style.transform = `translate(${x}px, ${y}px)`;
      render();
    });
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      gotMot = true;
      state['Accéléromètre'] = `x ${fmt(a.x)} · y ${fmt(a.y)} · z ${fmt(a.z)} m/s²`;
      render();
    });
    state['Statut'] = 'Écoute des capteurs… bougez l’appareil.';
    render();
    await sleep(2500);
    state['Statut'] = gotOri || gotMot ? 'Capteurs actifs ✓' : 'Aucun capteur de mouvement détecté (normal sur un PC).';
    render();
    setResult('sensors', gotOri || gotMot ? 'ok' : 'info', { 'Orientation': gotOri ? 'OK' : 'Absent', 'Accéléromètre': gotMot ? 'OK' : 'Absent' });
  };
  $('#vibBtn').onclick = () => {
    const pattern = [300, 150, 300, 150, 600];
    const ok = NATIVE ? nativeCall('vibrate', JSON.stringify(pattern)) : navigator.vibrate ? navigator.vibrate(pattern) : false;
    state['Vibreur'] = ok ? 'Commande envoyée : l’appareil a-t-il vibré ?' : 'Non pris en charge (PC, iPhone ou mode silencieux)';
    render();
  };
  $('#geoBtn').onclick = () => {
    if (!navigator.geolocation) { state['GPS'] = 'Non disponible'; render(); return; }
    state['GPS'] = 'Recherche de position…'; render();
    const t0 = Date.now();
    navigator.geolocation.getCurrentPosition((p) => {
      // Les coordonnées restent affichées localement et ne sont jamais mises dans le rapport.
      state['GPS'] = `${fmt(p.coords.latitude, 4)}, ${fmt(p.coords.longitude, 4)} (précision ±${fmt(p.coords.accuracy, 0)} m, ${fmt((Date.now() - t0) / 1000)} s)`;
      render();
      setResult('sensors', results.sensors?.status === 'ko' ? 'ko' : 'ok', { 'GPS': `Position obtenue, précision ±${fmt(p.coords.accuracy, 0)} m` });
    }, (e) => { state['GPS'] = `Échec : ${e.message}`; render(); }, { enableHighAccuracy: true, timeout: 20000 });
  };
}

/* ------------------------------------------------------------------ */
/* Réseau                                                              */
/* ------------------------------------------------------------------ */
function initNetwork() {
  const base = () => {
    const c = navigator.connection || {};
    return {
      'Connexion': navigator.onLine ? 'En ligne' : 'Hors ligne',
      'Type': c.type,
      'Qualité estimée': c.effectiveType?.toUpperCase(),
      'Débit estimé (navigateur)': c.downlink ? `${c.downlink} Mbit/s` : undefined,
      'RTT estimé': c.rtt ? `${c.rtt} ms` : undefined,
      'Économiseur de données': c.saveData ? 'Activé' : undefined,
    };
  };
  kv($('#netOut'), base());
  window.addEventListener('online', () => kv($('#netOut'), base()));
  window.addEventListener('offline', () => kv($('#netOut'), base()));

  $('#netBtn').onclick = async () => {
    const btn = $('#netBtn');
    btn.disabled = true;
    const out = $('#netOut');
    const PING_URL = 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/package.json';
    const DL_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
    try {
      kv(out, { ...base(), 'Latence': 'Mesure…' });
      const pings = [];
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        await fetch(`${PING_URL}?r=${Math.random()}`, { cache: 'no-store' });
        pings.push(performance.now() - t);
      }
      pings.shift(); // la 1re requête inclut DNS + TLS
      pings.sort((a, b) => a - b);
      const lat = pings[Math.floor(pings.length / 2)];
      const jitter = pings.at(-1) - pings[0];
      kv(out, { ...base(), 'Latence': `${fmt(lat, 0)} ms`, 'Gigue': `${fmt(jitter, 0)} ms`, 'Débit descendant': 'Mesure…' });
      let bytes = 0; const t0 = performance.now();
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`${DL_URL}?r=${Math.random()}`, { cache: 'no-store' });
        bytes += (await r.arrayBuffer()).byteLength;
      }
      const mbps = (bytes * 8) / ((performance.now() - t0) / 1000) / 1e6;
      const data = { ...base(), 'Latence': `${fmt(lat, 0)} ms`, 'Gigue': `${fmt(jitter, 0)} ms`, 'Débit descendant': `${fmt(mbps)} Mbit/s (fichiers de ${fmtBytes(bytes / 3)})` };
      kv(out, data);
      setResult('network', lat > 150 || mbps < 5 ? 'warn' : 'ok', data);
    } catch (e) {
      kv(out, { ...base(), 'Erreur': `Test impossible : ${e.message}` });
      setResult('network', 'ko', { erreur: e.message });
    }
    btn.disabled = false;
  };
}

/* ------------------------------------------------------------------ */
/* Stockage                                                            */
/* ------------------------------------------------------------------ */
function idb(fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('diagnotest', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('s');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('s', 'readwrite');
      const req = fn(tx.objectStore('s'));
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function initStorage() {
  $('#stoBtn').onclick = async () => {
    const btn = $('#stoBtn');
    btn.disabled = true;
    const data = {};
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        data['Quota navigateur'] = fmtBytes(est.quota);
        data['Utilisé par ce site'] = fmtBytes(est.usage);
      }
      let lsOk = false;
      try { localStorage.setItem('_dt', '1'); lsOk = localStorage.getItem('_dt') === '1'; localStorage.removeItem('_dt'); } catch { /* bloqué */ }
      data['localStorage'] = lsOk ? 'OK' : 'Indisponible';
      if (window.indexedDB) {
        const SIZE = 32 * 1024 * 1024;
        const buf = new Uint8Array(SIZE);
        for (let i = 0; i < SIZE; i += 4096) buf[i] = i & 255;
        let t = performance.now();
        await idb((s) => s.put(buf.buffer, 'bench'));
        const w = performance.now() - t;
        t = performance.now();
        const back = await idb((s) => s.get('bench'));
        const r = performance.now() - t;
        const view = new Uint8Array(back);
        let bad = 0; for (let i = 0; i < SIZE; i += 4096) if (view[i] !== (i & 255)) bad++;
        await idb((s) => s.delete('bench'));
        data['Écriture IndexedDB'] = `${fmt(SIZE / 1048576 / (w / 1000), 0)} Mo/s`;
        data['Lecture IndexedDB'] = `${fmt(SIZE / 1048576 / (r / 1000), 0)} Mo/s`;
        data['Intégrité'] = bad ? `❌ ${bad} erreurs` : 'Données identiques ✓';
        data['Remarque'] = 'Débits limités par le navigateur, bien en dessous de la vitesse réelle du disque. Utilisez le script Python pour un vrai test disque.';
        setResult('storage', bad ? 'ko' : 'ok', data);
      } else setResult('storage', 'info', data);
    } catch (e) {
      data['Erreur'] = e.message;
      setResult('storage', 'warn', data);
    }
    kv($('#stoOut'), data);
    btn.disabled = false;
  };
}

/* ------------------------------------------------------------------ */
/* GPU                                                                 */
/* ------------------------------------------------------------------ */
function initGPU() {
  const info = gpuInfo();
  kv($('#gpuOut'), { 'GPU': info.renderer, 'API': info.webgl, 'Texture max': info.maxTexture ? `${info.maxTexture} px` : undefined });

  $('#gpuBtn').onclick = () => {
    const c = $('#gpuCanvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    const gl = c.getContext('webgl', { antialias: false });
    if (!gl) { kv($('#gpuOut'), { 'Erreur': 'WebGL indisponible' }); setResult('gpu', 'ko', { erreur: 'WebGL indisponible' }); return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    // Fractale de Mandelbrot animée : charge de calcul élevée et constante par pixel
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;uniform vec2 r;uniform float t;
      void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float z0=1.5+sin(t*.3);vec2 c=vec2(-.745,.186)+uv*.02*z0;vec2 z=vec2(0.);float n=0.;
      for(int i=0;i<256;i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;if(dot(z,z)>4.)break;n+=1.;}
      float v=n/256.;gl_FragColor=vec4(.5+.5*cos(6.28*(v+vec3(0.,.33,.67)+t*.05)),1.);}`));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');
    gl.viewport(0, 0, c.width, c.height);
    const btn = $('#gpuBtn'); btn.disabled = true;
    const t0 = performance.now();
    let frames = 0, last = t0, minFps = Infinity;
    const frame = (now) => {
      gl.uniform2f(uR, c.width, c.height); gl.uniform1f(uT, (now - t0) / 1000);
      for (let k = 0; k < 4; k++) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // 4 passes pour charger le GPU
      frames++;
      const dt = now - last; last = now;
      if (now - t0 > 1000 && dt > 0) minFps = Math.min(minFps, 1000 / dt);
      if (now - t0 < 10000) { requestAnimationFrame(frame); return; }
      const fps = frames / ((now - t0) / 1000);
      const mpix = (c.width * c.height * 4 * fps) / 1e6;
      const data = { 'GPU': info.renderer, 'Images/s moyennes': fmt(fps), 'Images/s minimum': fmt(minFps), 'Score': `${fmt(mpix, 0)} Mpix/s`, 'Résolution de rendu': `${c.width} × ${c.height}` };
      kv($('#gpuOut'), data);
      setResult('gpu', 'ok', data);
      btn.disabled = false;
    };
    requestAnimationFrame(frame);
  };
}

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */
function buildReport() {
  const lines = ['RAPPORT DIAGNOTEST', `Date : ${new Date().toLocaleString('fr-FR')}`, `Navigateur : ${navigator.userAgent}`, ''];
  $$('.card[data-test]').forEach((card) => {
    const r = results[card.dataset.test];
    lines.push(`■ ${card.dataset.title.toUpperCase()} — ${r ? STATUS_LABEL[r.status] : 'Non testé'}`);
    if (r) Object.entries(r.data).filter(([, v]) => v !== undefined && v !== null && v !== '').forEach(([k, v]) => lines.push(`    ${k} : ${String(v).replace(/<[^>]+>/g, '')}`));
    lines.push('');
  });
  const counts = Object.values(results).reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  lines.push(`Bilan : ${counts.ok || 0} OK · ${counts.warn || 0} à surveiller · ${counts.ko || 0} défaut(s)`);
  return lines.join('\n');
}
function download(name, content, type) {
  if (NATIVE && nativeCall('saveFile', name, content, type)) return; // Android : Téléchargements/DiagnoTest
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function initReport() {
  const dlg = $('#reportDlg');
  $('#reportBtn').onclick = () => { $('#reportText').textContent = buildReport(); dlg.showModal(); };
  $('#closeRep').onclick = () => dlg.close();
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  $('#dlTxt').onclick = () => download(`diagnotest-${stamp()}.txt`, buildReport(), 'text/plain');
  $('#dlJson').onclick = () => download(`diagnotest-${stamp()}.json`, JSON.stringify({ date: new Date().toISOString(), userAgent: navigator.userAgent, results }, null, 2), 'application/json');
  $('#copyRep').onclick = async () => { try { await navigator.clipboard.writeText(buildReport()); $('#copyRep').textContent = 'Copié ✓'; } catch { $('#copyRep').textContent = 'Échec'; } };
  if (NATIVE?.shareText) {
    const share = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Partager' });
    share.onclick = () => nativeCall('shareText', 'Rapport DiagnoTest', buildReport());
    $('#copyRep').after(share);
  }
}

/* ------------------------------------------------------------------ */
/* Thème                                                               */
/* ------------------------------------------------------------------ */
function initTheme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem('dt-theme'); if (t) root.dataset.theme = t; } catch { /* stockage bloqué */ }
  $('#themeBtn').onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('dt-theme', root.dataset.theme); } catch { /* ignoré */ }
  };
}

/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initVerdicts();
  renderSummary();
  initSystem();
  initBattery();
  initCPU();
  initRAM();
  initScreen();
  initTouch();
  initKeyboard();
  initAudio();
  initMic();
  initCamera();
  initSensors();
  initNetwork();
  initStorage();
  initGPU();
  initReport();
});
