/* DiagnoTest — couche visuelle.
 * Réimplémentation en JavaScript natif d'effets inspirés de :
 *  - Haikei           : blobs SVG génératifs et vagues superposées (« layered waves »)
 *  - motion-primitives: TextEffect, Spotlight, BorderTrail, AnimatedNumber, InView, Magnetic
 *  - Watermelon UI    : coins « + », labels mono, badges d'état
 * Ce fichier ne contient aucune logique de test : il réagit à l'événement « diag:result » d'app.js. */
'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------------- Icônes (tracés dans l'esprit de Lucide) ---------------- */
  const ICONS = {
    system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
    battery: '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    ram: '<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M6 10v3M10 10v3M14 10v3M18 10v3"/>',
    screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    touch: '<path d="M9 11V5a2 2 0 0 1 4 0v5"/><path d="M13 9.5a2 2 0 0 1 4 0V11a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1.2a7 7 0 0 1-5.6-2.8L4.6 16a2 2 0 0 1 3.1-2.5L9 15"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10"/>',
    audio: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    sensors: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    network: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    storage: '<path d="M22 12H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/><path d="M6 16h.01M10 16h.01"/>',
    gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="15.5" cy="12" r="2.5"/>',
  };
  const svgIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  const STATUS_TXT = { ok: 'OK', ko: 'Défaut', warn: 'À surveiller', info: 'Info' };

  /* ---------------- En-têtes des cartes, coins, badges ---------------- */
  const cards = $$('.card[data-test]');
  cards.forEach((card) => {
    const h2 = $('h2', card);
    if (!h2) return;
    h2.textContent = h2.textContent.replace(/^[^\p{L}]+/u, ''); // retire l'émoji de tête
    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `<span class="ic">${svgIcon(card.dataset.test)}</span>`;
    h2.replaceWith(head);
    head.appendChild(h2);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'Non testé';
    head.appendChild(badge);
    ['tl', 'tr', 'bl', 'br'].forEach((p) => card.insertAdjacentHTML('beforeend', `<span class="corner c-${p}" aria-hidden="true"></span>`));
  });

  /* ---------------- Spotlight : halo qui suit le pointeur ---------------- */
  cards.forEach((card) => card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  /* ---------------- BorderTrail : bordure animée pendant un test ----------------
   * Un test est « en cours » tant que le bouton qui l'a lancé reste désactivé. */
  cards.forEach((card) => card.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    setTimeout(() => {
      if (!btn.disabled) return;
      card.classList.add('running');
      const mo = new MutationObserver(() => {
        if (btn.disabled) return;
        mo.disconnect();
        card.classList.remove('running');
      });
      mo.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    }, 60);
  }));

  /* ---------------- Résultats : badge, flash, progression globale ---------------- */
  const done = new Set();
  document.addEventListener('diag:result', (e) => {
    const { id, status } = e.detail;
    const card = $(`.card[data-test="${id}"]`);
    if (!card) return;
    const badge = $('.badge', card);
    badge.className = `badge ${status}`;
    badge.textContent = STATUS_TXT[status] || status;
    if (!reduceMotion) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
    done.add(id);
    $('#doneCount').textContent = `${done.size} / ${cards.length} tests effectués`;
    $('#doneBar').style.width = `${(done.size / cards.length) * 100}%`;
  });

  /* ---------------- TextEffect : mots en fondu flouté ---------------- */
  $$('.text-effect').forEach((el) => {
    let i = 0;
    const split = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            const s = document.createElement('span');
            s.className = 'te-word'; s.style.setProperty('--i', i++); s.textContent = w;
            frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else split(child);
      });
    };
    el.setAttribute('aria-label', el.textContent);
    split(el);
  });

  /* ---------------- InView : apparition au défilement ---------------- */
  cards.forEach((c, i) => { c.classList.add('reveal'); c.style.setProperty('--d', `${(i % 3) * 80}ms`); });
  const countUp = (el) => {
    const target = +el.dataset.count, suffix = el.dataset.suffix || '', t0 = performance.now(), D = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / D), eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    reduceMotion ? (el.textContent = target + suffix) : requestAnimationFrame(tick);
  };
  setTimeout(() => $$('.hero [data-count]').forEach(countUp), 900); // compteurs du hero, visibles dès le chargement
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      $$('[data-count]', en.target).forEach(countUp);
      io.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
    // Filet de sécurité : si l'observateur ne se déclenche pas (onglet en arrière-plan, webview), on affiche tout.
    setTimeout(() => $$('.reveal:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }), 1500);
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'));
    $$('[data-count]').forEach(countUp);
  }

  /* ---------------- Magnetic : le bouton est attiré par le pointeur ---------------- */
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25, y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
        setTimeout(() => (el.style.transition = ''), 500);
      });
    });
  }

  /* ---------------- Barre de tests collante ---------------- */
  const wrap = $('#summaryWrap');
  const onScroll = () => wrap.classList.toggle('stuck', wrap.getBoundingClientRect().top <= 0);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ================= Haikei : formes SVG génératives ================= */
  // Générateur pseudo-aléatoire à graine : mêmes formes à chaque visite.
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Catmull-Rom → Bézier cubique : courbe lisse passant par tous les points.
  const smoothPath = (pts, closed) => {
    const n = pts.length;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return closed ? d + 'Z' : d;
  };

  // Vagues superposées : la couche de devant a la couleur de la section suivante.
  const layeredWaves = (svg, layers, seed) => {
    if (!svg) return;
    const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
    const rand = rng(seed);
    svg.innerHTML = '';
    layers.forEach((fill, i) => {
      const base = H * (0.15 + (i / layers.length) * 0.6);
      const pts = [];
      const steps = 6;
      for (let k = 0; k <= steps; k++) pts.push([(k / steps) * W, base + (rand() - 0.5) * H * 0.35]);
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', `${smoothPath(pts, false)} L${W},${H} L0,${H} Z`);
      path.style.fill = fill;
      svg.appendChild(path);
    });
  };
  layeredWaves($('#heroWaves'), [
    'color-mix(in srgb, var(--accent) 22%, var(--bg))',
    'color-mix(in srgb, var(--accent-2) 16%, var(--bg))',
    'color-mix(in srgb, var(--accent) 8%, var(--bg))',
    'var(--bg)',
  ], 7);
  layeredWaves($('#footWaves'), [
    'color-mix(in srgb, var(--accent) 12%, var(--bg))',
    'color-mix(in srgb, var(--accent) 8%, var(--bg))',
    'color-mix(in srgb, var(--accent) 4%, var(--bg))',
    'var(--bg)',
  ], 21);
  const foot = $('.foot');
  if (foot) foot.style.background = 'color-mix(in srgb, var(--accent) 14%, var(--bg))';

  // Blobs organiques qui ondulent lentement derrière le titre.
  const blobSvg = $('#heroBlobs');
  if (blobSvg) {
    const W = 1200, H = 700;
    blobSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const rand = rng(42);
    const blobs = [
      { cx: 260, cy: 250, r: 210, fill: 'var(--accent)' },
      { cx: 930, cy: 210, r: 230, fill: 'var(--accent-2)' },
      { cx: 620, cy: 520, r: 190, fill: 'var(--accent-3)' },
    ].map((b) => {
      const path = document.createElementNS(SVGNS, 'path');
      path.style.fill = b.fill;
      blobSvg.appendChild(path);
      const N = 8;
      return { ...b, path, N, phases: Array.from({ length: N }, () => rand() * Math.PI * 2), amps: Array.from({ length: N }, () => 0.12 + rand() * 0.18) };
    });
    const draw = (t) => {
      blobs.forEach((b, j) => {
        const pts = [];
        for (let k = 0; k < b.N; k++) {
          const a = (k / b.N) * Math.PI * 2;
          const r = b.r * (1 + b.amps[k] * Math.sin(t * 0.0006 * (1 + j * 0.2) + b.phases[k]));
          pts.push([b.cx + Math.cos(a) * r + Math.sin(t * 0.0002 + j) * 40, b.cy + Math.sin(a) * r + Math.cos(t * 0.00025 + j) * 30]);
        }
        b.path.setAttribute('d', smoothPath(pts, true));
      });
    };
    draw(0);
    if (!reduceMotion) {
      let last = 0, visible = true;
      new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(blobSvg);
      const loop = (t) => {
        if (visible && !document.hidden && t - last > 50) { draw(t); last = t; } // ~20 i/s suffisent
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  /* ---------------- PWA : mode hors ligne et invitation à l'installation sur iPhone ---------------- */
  const inNativeApp = !!(window.DiagnoAndroid || window.DiagnoNative);
  if ('serviceWorker' in navigator && !inNativeApp && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible, le site fonctionne quand même */ });
  }
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('dt-ios-install') === 'no'; } catch { /* stockage bloqué */ }
  if (isIOS && !standalone && !inNativeApp && !dismissed) {
    $('#iosInstall').hidden = false;
    $('#iosInstallClose').onclick = () => {
      $('#iosInstall').hidden = true;
      try { localStorage.setItem('dt-ios-install', 'no'); } catch { /* ignoré */ }
    };
  }

  /* ---------------- Couleur de la barre du navigateur mobile selon le thème ---------------- */
  const syncThemeColor = () => {
    const meta = $('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta) meta.content = bg;
    try { (window.DiagnoNative || window.DiagnoAndroid)?.setSystemBarColor?.(bg); } catch { /* hors application */ }
  };
  new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncThemeColor();
})();
