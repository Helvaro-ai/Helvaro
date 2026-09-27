/* ============================================================================
   Helvaro — voorraad op de website van een dealer
   ============================================================================
   Plaatsen (de code staat klaar in het dashboard, Setup → Voorraad):

     <div id="helvaro-voorraad"></div>
     <script src="https://app.helvaro.pro/voorraad.js" data-dealer="CODE" async></script>

   Wat het doet:
     - leest de LIVE voorraad uit Helvaro (GET /api/inventory/CODE), dezelfde
       bron als de assistent en het dashboard. Helvaro zelf wordt gevoed door de
       voorraadbron van de dealer (AutoScout24-profiel of feed).
     - toont kaarten met foto, prijs en kenmerken, filters op merk, brandstof en
       maximumprijs, en een detailvenster met foto's en specificaties
     - "Stel een vraag over deze wagen" opent de websiteassistent met die wagen
       al gekozen (window.HelvaroAssistant.setVehicle), als die op de pagina staat;
       anders gaat de knop naar het aanvraagformulier van die wagen.

   Veiligheid: alle tekst via textContent, afbeeldingen alleen via https, alles
   in een eigen shadow DOM zodat de CSS van de site er niet aan komt en omgekeerd.
   ============================================================================ */
(function () {
  'use strict';
  var script = document.currentScript || document.querySelector('script[src*="voorraad.js"][data-dealer]');
  if (!script) return;
  var DEALER = String(script.getAttribute('data-dealer') || '').trim();
  if (!/^[A-Za-z0-9]{3,20}$/.test(DEALER)) { console.warn('[helvaro] ongeldige data-dealer'); return; }
  var API = (script.getAttribute('data-api') || 'https://app.helvaro.pro') + '/api/inventory/' + encodeURIComponent(DEALER);
  var doel = document.querySelector(script.getAttribute('data-target') || '#helvaro-voorraad');
  if (!doel) { doel = document.createElement('div'); script.parentNode.insertBefore(doel, script); }

  var TAAL = (document.documentElement.lang || navigator.language || 'nl').slice(0, 2).toLowerCase();
  var D = {
    nl: { laden: 'Voorraad laden…', leeg: 'Geen wagens gevonden met deze filters.', fout: 'De voorraad kon niet geladen worden. Probeer het later opnieuw.', merk: 'Alle merken', brandstof: 'Alle brandstoffen', prijs: 'Max. prijs', vraag: 'Stel een vraag over deze wagen', aanvraag: 'Plan een proefrit', sluit: 'Sluiten', km: 'km', pk: 'pk', gereserveerd: 'Gereserveerd', verkocht: 'Verkocht', aantal: '{n} wagens', foto: 'Foto' },
    fr: { laden: 'Chargement du stock…', leeg: 'Aucun véhicule avec ces filtres.', fout: 'Le stock n’a pas pu être chargé. Réessayez plus tard.', merk: 'Toutes les marques', brandstof: 'Tous les carburants', prijs: 'Prix max.', vraag: 'Poser une question sur ce véhicule', aanvraag: 'Planifier un essai', sluit: 'Fermer', km: 'km', pk: 'ch', gereserveerd: 'Réservé', verkocht: 'Vendu', aantal: '{n} véhicules', foto: 'Photo' },
    en: { laden: 'Loading stock…', leeg: 'No vehicles match these filters.', fout: 'The stock could not be loaded. Please try again later.', merk: 'All makes', brandstof: 'All fuels', prijs: 'Max. price', vraag: 'Ask about this car', aanvraag: 'Book a test drive', sluit: 'Close', km: 'km', pk: 'hp', gereserveerd: 'Reserved', verkocht: 'Sold', aantal: '{n} vehicles', foto: 'Photo' },
    de: { laden: 'Bestand wird geladen…', leeg: 'Keine Fahrzeuge mit diesen Filtern.', fout: 'Der Bestand konnte nicht geladen werden. Bitte später erneut versuchen.', merk: 'Alle Marken', brandstof: 'Alle Kraftstoffe', prijs: 'Max. Preis', vraag: 'Frage zu diesem Fahrzeug', aanvraag: 'Probefahrt planen', sluit: 'Schließen', km: 'km', pk: 'PS', gereserveerd: 'Reserviert', verkocht: 'Verkauft', aantal: '{n} Fahrzeuge', foto: 'Foto' },
  };
  var T = D[TAAL] || D.nl;
  var LOC = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB', de: 'de-DE' }[TAAL] || 'nl-BE';

  var root = doel.attachShadow ? doel.attachShadow({ mode: 'open' }) : doel;
  var css = [
    ':host{all:initial;display:block;font-family:inherit}',
    '*{box-sizing:border-box}',
    '.hv{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1a16}',
    '.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 16px}',
    '.filters select,.filters input{padding:10px 12px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;font-size:14px;color:inherit;min-height:42px}',
    '.aantal{margin-left:auto;font-size:13px;color:#6f665a}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}',
    '.kaart{display:flex;flex-direction:column;border:1px solid #e6ded1;border-radius:14px;overflow:hidden;background:#fff;cursor:pointer;text-align:left;padding:0;font:inherit;color:inherit}',
    '.kaart:focus-visible{outline:2px solid #B89D73;outline-offset:2px}',
    '.foto{aspect-ratio:4/3;background:#efe9df center/cover no-repeat;position:relative}',
    '.badge{position:absolute;left:10px;top:10px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#1d1a16;color:#fff}',
    '.inh{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px}',
    '.naam{font-size:16px;font-weight:700}',
    '.var{font-size:13px;color:#6f665a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.spec{font-size:13px;color:#4a443b}',
    '.prijs{font-size:20px;font-weight:800;margin-top:4px}',
    '.melding{padding:24px;border:1px dashed #d9d1c3;border-radius:14px;color:#6f665a;text-align:center}',
    '.over{position:fixed;inset:0;background:rgba(18,18,18,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147482000}',
    '.venster{background:#fff;border-radius:16px;max-width:880px;width:100%;max-height:92vh;overflow:auto;position:relative}',
    '.groot{aspect-ratio:16/10;background:#efe9df center/cover no-repeat}',
    '.duimen{display:flex;gap:6px;overflow-x:auto;padding:8px 16px}',
    '.duim{flex:none;width:84px;height:62px;border-radius:8px;background:#efe9df center/cover no-repeat;border:2px solid transparent;cursor:pointer;padding:0}',
    '.duim.aan{border-color:#B89D73}',
    '.det{padding:8px 20px 20px;display:grid;gap:12px}',
    '.tabel{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}',
    '.tabel div{background:#f6f2ea;border-radius:10px;padding:8px 10px;font-size:13px}',
    '.tabel b{display:block;font-size:11px;color:#6f665a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}',
    '.knoppen{display:flex;flex-wrap:wrap;gap:8px}',
    '.knop{padding:12px 18px;border-radius:10px;border:1px solid #1d1a16;background:#1d1a16;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}',
    '.knop.zacht{background:#fff;color:#1d1a16}',
    '.x{position:absolute;right:10px;top:10px;width:40px;height:40px;border-radius:999px;border:0;background:rgba(255,255,255,.9);font-size:22px;cursor:pointer}',
    '.oms{font-size:14px;line-height:1.55;color:#4a443b;white-space:pre-line}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; root.appendChild(st);
  var wrap = el('div', 'hv'); root.appendChild(wrap);

  function el(tag, cls, tekst) { var e = document.createElement(tag); if (cls) e.className = cls; if (tekst != null) e.textContent = tekst; return e; }
  function veiligeUrl(u) { return /^https:\/\/[^\s"'()]+$/i.test(String(u || '')) ? String(u) : ''; }
  function achtergrond(e, u) { var v = veiligeUrl(u); if (v) e.style.backgroundImage = 'url("' + v + '")'; }
  function prijs(p) { return p == null ? '' : new Intl.NumberFormat(LOC, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p); }
  function getal(n) { return n == null ? '' : new Intl.NumberFormat(LOC).format(n); }
  function specs(v) { return [v.mileage != null ? getal(v.mileage) + ' ' + T.km : '', v.firstRegistration, v.fuel, v.transmission].filter(Boolean).join(' · '); }

  var alle = [];
  var filter = { merk: '', brandstof: '', max: '' };
  var status = el('div', 'melding', T.laden); wrap.appendChild(status);

  function bouwFilters() {
    var f = el('div', 'filters');
    var merken = Array.from(new Set(alle.map(function (v) { return v.make; }).filter(Boolean))).sort();
    var brandstoffen = Array.from(new Set(alle.map(function (v) { return v.fuel; }).filter(Boolean))).sort();
    function keuze(label, opties, sleutel) {
      var s = el('select'); s.setAttribute('aria-label', label);
      var o = el('option', null, label); o.value = ''; s.appendChild(o);
      opties.forEach(function (x) { var op = el('option', null, x); op.value = x; s.appendChild(op); });
      s.addEventListener('change', function () { filter[sleutel] = s.value; teken(); });
      return s;
    }
    f.appendChild(keuze(T.merk, merken, 'merk'));
    f.appendChild(keuze(T.brandstof, brandstoffen, 'brandstof'));
    var max = el('input'); max.type = 'number'; max.inputMode = 'numeric'; max.min = '0'; max.step = '1000'; max.placeholder = T.prijs; max.setAttribute('aria-label', T.prijs);
    max.addEventListener('input', function () { filter.max = max.value; teken(); });
    f.appendChild(max);
    var aantal = el('span', 'aantal'); aantal.id = 'aantal'; f.appendChild(aantal);
    wrap.appendChild(f);
    return aantal;
  }
  var aantalEl, grid;

  function teken() {
    var lijst = alle.filter(function (v) {
      if (filter.merk && v.make !== filter.merk) return false;
      if (filter.brandstof && v.fuel !== filter.brandstof) return false;
      if (filter.max && v.price != null && v.price > Number(filter.max)) return false;
      return true;
    });
    aantalEl.textContent = T.aantal.replace('{n}', lijst.length);
    grid.textContent = '';
    if (!lijst.length) { grid.appendChild(el('div', 'melding', T.leeg)); return; }
    lijst.forEach(function (v) {
      var k = el('button', 'kaart'); k.type = 'button';
      var foto = el('div', 'foto'); achtergrond(foto, v.photos && v.photos[0]); foto.setAttribute('role', 'img'); foto.setAttribute('aria-label', (v.title || T.foto));
      if (v.status === 'reserved') foto.appendChild(el('span', 'badge', T.gereserveerd));
      k.appendChild(foto);
      var inh = el('div', 'inh');
      inh.appendChild(el('div', 'naam', [v.make, v.model].filter(Boolean).join(' ')));
      if (v.variant) inh.appendChild(el('div', 'var', v.variant));
      inh.appendChild(el('div', 'spec', specs(v)));
      inh.appendChild(el('div', 'prijs', prijs(v.price)));
      k.appendChild(inh);
      k.addEventListener('click', function () { detail(v); });
      grid.appendChild(k);
    });
  }

  function detail(v) {
    var over = el('div', 'over'); over.setAttribute('role', 'dialog'); over.setAttribute('aria-modal', 'true'); over.setAttribute('aria-label', v.title || '');
    var ven = el('div', 'venster');
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', T.sluit);
    var groot = el('div', 'groot'); achtergrond(groot, v.photos && v.photos[0]);
    ven.appendChild(x); ven.appendChild(groot);
    if (v.photos && v.photos.length > 1) {
      var duimen = el('div', 'duimen');
      v.photos.slice(0, 20).forEach(function (u, i) {
        var d = el('button', 'duim' + (i === 0 ? ' aan' : '')); d.type = 'button'; d.setAttribute('aria-label', T.foto + ' ' + (i + 1)); achtergrond(d, u);
        d.addEventListener('click', function () { achtergrond(groot, u); Array.prototype.forEach.call(duimen.children, function (c) { c.classList.remove('aan'); }); d.classList.add('aan'); });
        duimen.appendChild(d);
      });
      ven.appendChild(duimen);
    }
    var det = el('div', 'det');
    det.appendChild(el('div', 'naam', [v.make, v.model, v.variant].filter(Boolean).join(' ')));
    det.appendChild(el('div', 'prijs', prijs(v.price)));
    var tab = el('div', 'tabel');
    [['km', v.mileage != null ? getal(v.mileage) + ' ' + T.km : ''], ['1e inschr.', v.firstRegistration], ['', v.fuel], ['', v.transmission],
     ['kW', v.powerKw != null ? v.powerKw + ' kW' : ''], ['', v.body], ['', v.color]].forEach(function (r) {
      if (!r[1]) return; var c = el('div'); if (r[0]) c.appendChild(el('b', null, r[0])); c.appendChild(document.createTextNode(String(r[1]))); tab.appendChild(c);
    });
    det.appendChild(tab);
    if (v.description) det.appendChild(el('div', 'oms', String(v.description).slice(0, 2000)));
    var kn = el('div', 'knoppen');
    var vraag = el('button', 'knop', T.vraag); vraag.type = 'button';
    vraag.addEventListener('click', function () {
      var a = window.HelvaroAssistant;
      if (a && typeof a.setVehicle === 'function') { a.setVehicle(v.assistantVehicle || v.id); sluit(); if (typeof a.open === 'function') a.open(); }
      else if (veiligeUrl(v.enquiryUrl)) window.open(v.enquiryUrl, '_blank', 'noopener');
    });
    kn.appendChild(vraag);
    if (veiligeUrl(v.enquiryUrl)) { var aan = el('a', 'knop zacht', T.aanvraag); aan.href = v.enquiryUrl; aan.target = '_blank'; aan.rel = 'noopener'; kn.appendChild(aan); }
    det.appendChild(kn);
    ven.appendChild(det); over.appendChild(ven);
    function sluit() { over.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') sluit(); }
    x.addEventListener('click', sluit);
    over.addEventListener('click', function (e) { if (e.target === over) sluit(); });
    document.addEventListener('keydown', esc);
    root.appendChild(over); x.focus();
  }

  /* De feed geeft hooguit 200 per keer: doorbladeren tot alles binnen is
     (met een plafond, zodat een fout in 'total' geen eindeloze lus wordt). */
  function haalAlles(vanaf, verzameld) {
    return fetch(API + '?limit=200&offset=' + vanaf, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        var stuk = (d && d.vehicles) || [];
        verzameld = verzameld.concat(stuk);
        if (stuk.length && verzameld.length < Number(d.total || 0) && vanaf < 2000) return haalAlles(vanaf + stuk.length, verzameld);
        return verzameld;
      });
  }
  haalAlles(0, [])
    .then(function (lijst) {
      alle = lijst.filter(function (v) { return v && v.status !== 'sold'; });
      status.remove();
      aantalEl = bouwFilters();
      grid = el('div', 'grid'); wrap.appendChild(grid);
      teken();
    })
    .catch(function () { status.textContent = T.fout; });
})();
