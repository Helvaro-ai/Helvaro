/* Spatiecontrole voor het dashboard. Plakken in de console, dan spatieVeeg().
   Zie scripts/spatie-check.md voor waarom elke regel hieronder er staat --
   met name de vier manieren waarop een rechthoek hier gelogen heeft. */
(function () {
  'use strict';

  /* Animaties uit. Staat het venster verborgen, dan lopen ze niet en blijft
     alles wat met opacity:0 begint daar staan -- dan meet je een pagina die er
     niet zo uitziet. */
  function meetstandAan() {
    var s = document.getElementById('spatie-meetstijl');
    if (!s) { s = document.createElement('style'); s.id = 'spatie-meetstijl'; document.head.appendChild(s); }
    s.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}'
      + '.page.active,.stat-card,tbody tr,.pd-card,.conv-item,.pipeline-card{opacity:1 !important;transform:none !important}';
  }
  function meetstandUit() {
    var s = document.getElementById('spatie-meetstijl'); if (s) s.remove();
  }

  function zichtbaar(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    var r = el.getBoundingClientRect(); if (r.width < 3 || r.height < 3) return false;
    var p = el.parentElement;
    while (p && p !== document.body) {
      var pcs = getComputedStyle(p);
      if (pcs.display === 'none' || pcs.visibility === 'hidden' || Number(pcs.opacity) < 0.05) return false;
      /* Een dichte <details> houdt zijn dozen. */
      if (p.tagName === 'DETAILS' && !p.open && !el.closest('summary')) return false;
      if (/hidden|clip/.test(pcs.overflow + pcs.overflowY)) {
        if (p.clientHeight <= 4) return false;                       // dichtgeklapt paneel
        if (!(p.scrollHeight > p.clientHeight + 2)) {                // vast, dus echt afgeknipt
          var pr = p.getBoundingClientRect();
          if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) return false;
        }
      }
      p = p.parentElement;
    }
    return true;
  }

  /* De ZICHTBARE doos: de Range, bijgesneden tot elke afknippende voorouder.
     Zonder dit meet je bij text-overflow:ellipsis de volledige tekst. */
  function zichtbareDoos(rect, el) {
    var l = rect.left, t = rect.top, r = rect.right, b = rect.bottom, p = el;
    while (p && p !== document.body) {
      var cs = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY + cs.overflow)) {
        var pr = p.getBoundingClientRect();
        l = Math.max(l, pr.left); t = Math.max(t, pr.top);
        r = Math.min(r, pr.right); b = Math.min(b, pr.bottom);
      }
      p = p.parentElement;
    }
    return { left: l, top: t, right: r, bottom: b, width: Math.max(0, r - l), height: Math.max(0, b - t) };
  }

  function meet(scope) {
    var root = document.querySelector(scope); if (!root) return null;
    var stukken = [];
    (function loop(el) {
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3 && n.textContent.trim().length > 1 && zichtbaar(el)) {
          var rg = document.createRange(); rg.selectNodeContents(n);
          var r = zichtbareDoos(rg.getBoundingClientRect(), el);
          /* De REGELVAKKEN apart bewaren. getBoundingClientRect() geeft bij
             tekst die over meerdere regels loopt de UNIE van die regels, en
             die unie beslaat ook de witruimte links van regel 2 en rechts van
             regel 1 -- ruimte waar helemaal geen letters staan.

             Twee inline spans die elkaar netjes opvolgen krijgen daardoor
             overlappende uniedozen zonder dat er iets over elkaar staat. Dat
             leverde op het instellingenscherm drie 'overlappen' op die bij
             nameten alle drie niet bestonden. Vergelijken op regelvak lost dat
             op: dat is de doos waar de letters echt in staan. */
          var lijnen = [];
          var rl = rg.getClientRects();
          for (var q = 0; q < rl.length; q++) {
            var d = zichtbareDoos(rl[q], el);
            if (d.width > 1 && d.height > 1) lijnen.push(d);
          }
          if (r.width > 3 && r.height > 3) stukken.push({ el: el, r: r, lijnen: lijnen, t: n.textContent.trim() });
        } else if (n.nodeType === 1) loop(n);
      }
    })(root);

    var buiten = [];
    stukken.forEach(function (s) {
      var cs = getComputedStyle(s.el);
      if (/auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY + cs.overflow)) return;
      var b = s.el.getBoundingClientRect();
      var over = s.r.right - (b.right - parseFloat(cs.paddingRight || 0));
      if (over > 2) buiten.push({ tekst: s.t.slice(0, 40), klasse: String(s.el.className).slice(0, 30), px: Math.round(over) });
    });

    var overlap = [];
    for (var i = 0; i < stukken.length; i++) for (var j = i + 1; j < stukken.length; j++) {
      var A = stukken[i], B = stukken[j];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      /* Regelvak tegen regelvak, niet unie tegen unie -- zie de toelichting
         hierboven. De grootste overlap tussen twee regels telt. */
      var ov = 0, kleinste = 0;
      var La = (A.lijnen && A.lijnen.length) ? A.lijnen : [A.r];
      var Lb = (B.lijnen && B.lijnen.length) ? B.lijnen : [B.r];
      for (var x = 0; x < La.length; x++) for (var y = 0; y < Lb.length; y++) {
        var a = La[x], b = Lb[y];
        var o = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
              * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (o > ov) { ov = o; kleinste = Math.min(a.width * a.height, b.width * b.height); }
      }
      if (ov <= 1) continue;
      if (kleinste > 0 && ov / kleinste > 0.15) {
        overlap.push({ a: A.t.slice(0, 30), b: B.t.slice(0, 30), dekking: Math.round(100 * ov / kleinste) });
      }
    }
    return { buiten: buiten, overlap: overlap, gemeten: stukken.length };
  }

  var PAGINAS = ['dashboard', 'pipeline', 'gesprekken', 'panden', 'kalender', 'resultaten',
                 'analyse', 'activiteit', 'exports', 'formulier', 'ai-persona', 'ai-beeld',
                 'instellingen', 'facturatie'];

  window.spatieVeeg = function () {
    meetstandAan();
    var uit = {}, totB = 0, totO = 0, gemeten = 0;
    PAGINAS.forEach(function (p) {
      try { navigateTo(p); } catch (e) { return; }
      var g = meet('#page-' + p); if (!g) return;
      gemeten += g.gemeten; totB += g.buiten.length; totO += g.overlap.length;
      if (g.buiten.length || g.overlap.length) uit[p] = { buiten: g.buiten, overlap: g.overlap.slice(0, 5) };
    });
    meetstandUit();
    var uitkomst = { breedte: innerWidth, tekstGemeten: gemeten, buiten: totB, overlap: totO, problemen: uit };
    console.log(uitkomst.buiten === 0 && uitkomst.overlap === 0
      ? '✓ ' + innerWidth + 'px: niets buiten zijn blok, niets over elkaar (' + gemeten + ' stukken tekst)'
      : '✗ ' + innerWidth + 'px: ' + totB + ' buiten, ' + totO + ' overlap');
    return uitkomst;
  };

  console.log('spatieVeeg() staat klaar. Draai hem op 1440, 768 en 390 pixels breed.');
})();
