/* ============================================================
   HELVARO — Motion & Signature Animations
   v1 — Leadlijn, per-line reveals, frosted nav, grain overlay
   ============================================================ */

(function() {
  'use strict';

  /* ── Reduced motion check ───────────────────────────────────────────────── */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function() {
    initLeadlijn();
    initLineReveal();
    initFrostedNav();
    initPhoneFloat();
    initGrainOverlay();
    initSheenButtons();
  });

  /* ============================================================
     LEADLIJN — the signature sand path between columns
     ============================================================ */
  function initLeadlijn() {
    var diagram = document.querySelector('.stroom-diagram');
    if (!diagram) return;
    var kolommen = diagram.querySelectorAll('.stroom-kolom');
    var steps = diagram.querySelectorAll('.stroom-stappen li');
    if (kolommen.length < 3 || !steps.length) return;

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'leadlijn-svg');
    svg.setAttribute('aria-hidden', 'true');
    diagram.style.position = 'relative';
    diagram.classList.add('leadlijn-aan');
    diagram.appendChild(svg);

    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML =
      '<filter id="leadlijn-glow" x="-100%" y="-100%" width="300%" height="300%">' +
        '<feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>' +
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>';
    svg.appendChild(defs);

    /* Twee lijnen: klant -> Helvaro, en Helvaro -> werkplaats. De stip loopt
       nooit door de kaart met de vijf stappen heen; daar gaat hij naar binnen,
       lichten de stappen een voor een op, en komt hij er rechts weer uit. */
    var segA = document.createElementNS(NS, 'path');
    var segB = document.createElementNS(NS, 'path');
    [segA, segB].forEach(function (el) {
      el.setAttribute('class', 'leadlijn-path');
      el.setAttribute('fill', 'none');
      svg.appendChild(el);
    });
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'leadlijn-dot');
    dot.setAttribute('r', '5');
    dot.setAttribute('filter', 'url(#leadlijn-glow)');
    svg.appendChild(dot);

    var kern = kolommen[1];
    var isVisible = false, animFrame = null, startTime = null;

    function updatePath() {
      var rect = diagram.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
      svg.style.width = rect.width + 'px';
      svg.style.height = rect.height + 'px';
      var b = kolommen[0].getBoundingClientRect();
      var k = kern.getBoundingClientRect();
      var d = kolommen[2].getBoundingClientRect();
      var vertical = k.top >= b.bottom - 1;
      var pad = 6;
      if (vertical) {
        var cx = k.left + k.width / 2 - rect.left;
        segA.setAttribute('d', 'M' + cx + ',' + (b.bottom - rect.top + pad) + ' L' + cx + ',' + (k.top - rect.top - pad));
        segB.setAttribute('d', 'M' + cx + ',' + (k.bottom - rect.top + pad) + ' L' + cx + ',' + (d.top - rect.top - pad));
      } else {
        var y = k.top + k.height / 2 - rect.top;
        segA.setAttribute('d', 'M' + (b.right - rect.left + pad) + ',' + y + ' L' + (k.left - rect.left - pad) + ',' + y);
        segB.setAttribute('d', 'M' + (k.right - rect.left + pad) + ',' + y + ' L' + (d.left - rect.left - pad) + ',' + y);
      }
    }

    /* Eén ronde: 0-0.22 onderweg naar Helvaro, 0.22-0.70 binnen (stappen),
       0.70-0.92 onderweg naar de werkplaats, daarna even rust. */
    var DUUR = 9000;
    function frame(time) {
      if (!isVisible) return;
      if (!startTime) startTime = time;
      var p = ((time - startTime) % DUUR) / DUUR;
      var pt, seg;
      if (p < 0.22) {
        seg = segA; pt = seg.getPointAtLength((p / 0.22) * seg.getTotalLength());
        dot.style.opacity = 1;
      } else if (p < 0.70) {
        dot.style.opacity = 0;
      } else if (p < 0.92) {
        seg = segB; pt = seg.getPointAtLength(((p - 0.70) / 0.22) * seg.getTotalLength());
        dot.style.opacity = 1;
      } else {
        dot.style.opacity = 0;
      }
      if (pt) { dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); }

      var binnen = p >= 0.22 && p < 0.70;
      kern.classList.toggle('leadlijn-binnen', binnen);
      var actief = binnen ? Math.floor(((p - 0.22) / 0.48) * steps.length) : (p >= 0.70 && p < 0.92 ? steps.length - 1 : -1);
      steps.forEach(function (s, i) { s.classList.toggle('leadlijn-active', i <= actief); });
      kolommen[2].classList.toggle('leadlijn-binnen', p >= 0.90 && p < 0.97);
      animFrame = requestAnimationFrame(frame);
    }

    function showStatic() {
      updatePath();
      steps.forEach(function (s) { s.classList.add('leadlijn-active'); });
      dot.style.opacity = 0;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          updatePath();
          if (reducedMotion) { showStatic(); return; }
          startTime = null;
          animFrame = requestAnimationFrame(frame);
        } else if (animFrame) {
          cancelAnimationFrame(animFrame); animFrame = null;
        }
      });
    }, { threshold: 0.3 });
    observer.observe(diagram);

    var resizeTimeout;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updatePath, 100);
    });
  }

  /* ============================================================
     LINE REVEAL — per-line clipped rise reveal for headings
     ============================================================ */
  function initLineReveal() {
    if (reducedMotion) return;

    // Wait for fonts
    document.fonts.ready.then(function() {
      var heroTitle = document.querySelector('.hero-title');
      if (!heroTitle) return;

      // The hero title may have been processed by word-anim already
      // We add a line-reveal class to enable the CSS animation
      heroTitle.classList.add('line-reveal-ready');

      // Find section titles for lighter reveal
      document.querySelectorAll('.section-title').forEach(function(el) {
        el.classList.add('line-reveal-ready');
      });
    });
  }

  /* ============================================================
     FROSTED NAV — glass effect on scroll
     ============================================================ */
  function initFrostedNav() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var scrollThreshold = 40;
    var lastScroll = 0;
    var ticking = false;

    function updateNav() {
      var scrollY = window.scrollY || window.pageYOffset;

      if (scrollY > scrollThreshold) {
        nav.classList.add('frosted');
      } else {
        nav.classList.remove('frosted');
      }

      ticking = false;
    }

    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(updateNav);
        ticking = true;
      }
    }, { passive: true });

    updateNav();
  }

  /* ============================================================
     PHONE FLOAT — gentle float + cursor tilt
     ============================================================ */
  function initPhoneFloat() {
    var phone = document.querySelector('.phone-wrap');
    if (!phone || reducedMotion) return;

    // Add float animation class
    phone.classList.add('phone-floating');

    // Cursor tilt on desktop
    if (window.matchMedia('(hover: hover)').matches) {
      var hero = document.querySelector('.hero');
      if (!hero) return;

      hero.addEventListener('mousemove', function(e) {
        var rect = hero.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;

        var deltaX = (e.clientX - centerX) / rect.width;
        var deltaY = (e.clientY - centerY) / rect.height;

        var rotateY = deltaX * 2; // max 2 degrees
        var rotateX = -deltaY * 1.5; // max 1.5 degrees

        phone.style.transform = 'rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)';
      });

      hero.addEventListener('mouseleave', function() {
        phone.style.transform = '';
      });
    }
  }

  /* ============================================================
     GRAIN OVERLAY — subtle noise texture
     ============================================================ */
  function initGrainOverlay() {
    // Create grain SVG filter
    var grainSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    grainSvg.setAttribute('class', 'grain-svg');
    grainSvg.setAttribute('aria-hidden', 'true');
    grainSvg.innerHTML =
      '<defs>' +
        '<filter id="grain-filter" x="0%" y="0%" width="100%" height="100%">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" result="noise"/>' +
          '<feColorMatrix type="saturate" values="0" in="noise" result="mono"/>' +
          '<feBlend in="SourceGraphic" in2="mono" mode="multiply"/>' +
        '</filter>' +
      '</defs>';
    document.body.appendChild(grainSvg);

    // Create grain overlay div
    var grainDiv = document.createElement('div');
    grainDiv.className = 'grain-overlay';
    grainDiv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grainDiv);
  }

  /* ============================================================
     SHEEN BUTTONS — sand sheen sweep on hover
     ============================================================ */
  function initSheenButtons() {
    if (reducedMotion) return;

    document.querySelectorAll('.btn:not(.btn-ghost)').forEach(function(btn) {
      // Create sheen element
      var sheen = document.createElement('span');
      sheen.className = 'btn-sheen';
      btn.appendChild(sheen);

      btn.addEventListener('mouseenter', function() {
        sheen.classList.add('active');
      });

      btn.addEventListener('mouseleave', function() {
        sheen.classList.remove('active');
      });
    });
  }

})();
