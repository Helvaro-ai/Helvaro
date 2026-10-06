'use strict';
/*
 * Integraties: automotive -- het blok in Instellingen (client-side).
 *
 * Een kaart per platform uit het register (api/_voorraad-providers/): naam,
 * status, laatste synchronisatie, wat er veranderde, de laatste fout in gewone
 * woorden, en de actie die bij het soort koppeling past: een adres voor een
 * feed of verkopersprofiel, inloggegevens voor een API-koppeling die op
 * activatie wacht, niets voor een platform dat er nog niet is.
 *
 * Wat dit scherm NIET doet: inloggegevens terugtonen. De server geeft alleen
 * "ingesteld: ja/nee"; een veld voor een wachtwoord is altijd leeg.
 *
 * Hoe het erin komt: zoals api/_dash/agenda.js. De functie hieronder wordt
 * NOOIT op de server uitgevoerd; js() geeft de broncode van haar romp terug en
 * api/dashboard.js plakt die in het clientscript. Zo is dit gewoon JavaScript,
 * zonder dubbele escapes. De romp gebruikt de globale namen van het dashboard
 * (tr, T_DICT, escHtml, toast, timeAgo, showConfirmModal, voorraadVraag, isDealer).
 *
 * Klikken lopen via data-attributen en een luisteraar op het blok, niet via
 * onclick in de HTML: het kaartje wordt bij elke wijziging opnieuw getekend.
 */
/* eslint-disable no-undef, no-unused-vars */
function client() {
/* ── Integraties: automotive (Instellingen) ─────────────────────────────── */
var igState = { data: null, open: '', bezig: '', gekoppeld: false, meldingen: {}, gids: {} };

/* "1 voertuig" / "5 voertuigen": enkelvoud en meervoud in elke taal. */
function invAantal(n) {
  n = Number(n) || 0;
  return n === 1 ? tr('inv.aantal.een') : tr('inv.aantal', { n: n });
}

/* Een melding blijft in de kaart staan (naast de toast): een toast verdwijnt
   en kan gemist worden, een foutzin bij de kaart zelf niet. */
function igMeld(id, type, tekst) { igState.meldingen[id] = { type: type, tekst: tekst }; }
function igMeldHtml(id) {
  var m = igState.meldingen[id];
  if (!m) return '';
  return '<div class="' + (m.type === 'error' ? 'inv-fout' : 'inv-let') + '" role="' + (m.type === 'error' ? 'alert' : 'status') + '" data-ig-melding="' + escHtml(id) + '" style="margin-top:8px;width:100%">' + escHtml(m.tekst) + '</div>';
}
function igFout(id, e) {
  var z = igFoutZin(e);
  igMeld(id, 'error', z);
  toast(z, 'error');
}
function igKlaar(id, tekst) {
  igMeld(id, 'success', tekst);
  toast(tekst, 'success');
}
function igKaartVan(id) {
  return ((igState.data && igState.data.providers) || []).filter(function (x) { return x.id === id; })[0];
}

function igTekst(sleutel, vars) {
  return T_DICT[sleutel] !== undefined ? tr(sleutel, vars) : '';
}

/* De reden van de server of een mislukte aanroep, als zin voor de dealer. */
function igFoutZin(e) {
  var s = 'ig.err.' + ((e && e.code) || '');
  return T_DICT[s] !== undefined ? tr(s) : tr('ig.err.algemeen');
}

async function laadIntegraties() {
  var sectie = document.getElementById('set-integraties');
  if (!sectie) return;
  if (typeof isDealer !== 'function' || !isDealer()) { sectie.style.display = 'none'; return; }
  sectie.style.display = '';
  var lijst = document.getElementById('ig-lijst');
  if (!igState.gekoppeld) { lijst.addEventListener('click', igKlik); lijst.addEventListener('change', igBestand); lijst.addEventListener('toggle', igGidsToggle, true); igState.gekoppeld = true; }
  try {
    igState.data = await voorraadVraag('inventory-providers');
    tekenIntegraties();
  } catch (e) {
    lijst.innerHTML = '<div class="settings-row"><div class="settings-label-sub">' + escHtml(tr('ig.laadFout')) + '</div></div>';
  }
}

function igBadge(p) {
  /* Een publiceerkanaal (Meta) is pas actief als de feed gebouwd kan worden. */
  if (p.alleenPubliceren) return '<span class="conv-kanaal-tag' + (p.geconfigureerd ? ' mens' : '') + '">' + escHtml(tr(p.geconfigureerd ? 'ig.status.ACTIVE' : 'ig.status.TE_DOEN')) + '</span>';
  var actief = p.status === 'ACTIVE' || (p.geconfigureerd && p.kanSyncen);
  return '<span class="conv-kanaal-tag' + (actief ? ' mens' : '') + '">' + escHtml(tr('ig.status.' + p.status)) + '</span>';
}

/* De uitleg "Zo koppel je dit": genummerde stappen, per platform, inklapbaar. */
function igGids(p) {
  var tekst = igTekst('ig.gids.' + p.id);
  if (!tekst) return '';
  var stappen = tekst.split('\n').map(function (z) { return '<li>' + escHtml(z) + '</li>'; }).join('');
  return '<details class="ig-gids" data-ig-gids="' + escHtml(p.id) + '"' + (igState.gids[p.id] ? ' open' : '') + ' style="width:100%;margin-top:8px">'
    + '<summary style="cursor:pointer;font-weight:600">' + escHtml(tr('ig.gids.titel')) + '</summary>'
    + '<ol class="settings-label-sub" style="margin:8px 0 0 18px;padding:0;display:grid;gap:4px">' + stappen + '</ol></details>';
}

/* Meta: adres en coordinaten van de showroom. */
function igMetaForm(p) {
  var id = escHtml(p.id), m = p.meta || {};
  var veld = function (sleutel, type, extra) {
    var w = m[sleutel] === null || m[sleutel] === undefined ? '' : String(m[sleutel]);
    return '<input type="' + type + '" class="mail-instructie" id="ig-meta-' + sleutel + '-' + id + '" ' + (extra || '') + ' autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr('ig.meta.veld.' + sleutel)) + '" placeholder="' + escHtml(tr('ig.meta.veld.' + sleutel)) + '" value="' + escHtml(w) + '">';
  };
  return '<div class="su-bron-invoer" style="width:100%;margin-top:8px">'
    + '<div class="settings-label-sub">' + escHtml(tr('ig.meta.titelAdres')) + '</div>'
    + veld('addr1', 'text', 'maxlength="120"') + veld('postalCode', 'text', 'maxlength="20"') + veld('city', 'text', 'maxlength="80"')
    + veld('region', 'text', 'maxlength="80"') + veld('country', 'text', 'maxlength="60"')
    + veld('lat', 'number', 'step="any" min="-90" max="90" inputmode="decimal"') + veld('lng', 'number', 'step="any" min="-180" max="180" inputmode="decimal"')
    + veld('phone', 'text', 'maxlength="30" inputmode="tel"') + veld('fbPageId', 'text', 'maxlength="20" inputmode="numeric"')
    + '<div class="mail-knoppen" style="justify-content:flex-start">'
    + '<button type="button" class="btn-icon mail-koppel" data-ig-actie="bewaar" data-ig="' + id + '">' + escHtml(tr('ig.knop.bewaar')) + '</button>'
    + '<button type="button" class="btn-icon" data-ig-actie="annuleer" data-ig="' + id + '">' + escHtml(tr('ig.knop.annuleer')) + '</button>'
    + '</div></div>';
}

/* Meta: wat er ontbreekt, of het feedadres met kopieerknop en de tellingen. */
function igMetaStatus(p) {
  var h = '';
  if (!p.geconfigureerd) {
    var mist = ((p.meta && p.meta.ontbreekt) || ['addr1', 'city', 'region', 'postalCode', 'lat', 'lng']).map(function (k) { return tr('ig.meta.mist.' + k); }).join(', ');
    return '<div class="inv-let" style="margin-top:8px">' + escHtml(tr('ig.meta.mist', { lijst: mist })) + '</div>';
  }
  h += '<div style="margin-top:8px"><div class="settings-label-sub">' + escHtml(tr('ig.meta.feedUrl')) + '</div>'
    + '<div class="mail-instructie-rij" style="max-width:100%"><input type="text" class="mail-instructie" readonly id="ig-feedurl" value="' + escHtml(p.feedUrl || '') + '" aria-label="' + escHtml(tr('ig.meta.feedUrl')) + '" onfocus="this.select()">'
    + '<button type="button" class="inv-sync" data-ig-actie="kopieer" data-ig="' + escHtml(p.id) + '">' + escHtml(tr('ig.kopieer')) + '</button></div></div>';
  var t = p.feedTelling;
  if (t) {
    h += '<div class="inv-cijfers"><span>' + escHtml(tr(t.inFeed === 1 ? 'ig.meta.tellingen.een' : 'ig.meta.tellingen', { n: t.inFeed, w: t.weggelaten })) + '</span></div>';
    var redenen = Object.keys(t.redenen || {});
    if (redenen.length) {
      h += '<div class="settings-label-sub">' + escHtml(tr('ig.meta.weglaatTitel')) + ' '
        + escHtml(redenen.map(function (r) { return (T_DICT['ig.meta.reden.' + r] !== undefined ? tr('ig.meta.reden.' + r) : r) + ': ' + t.redenen[r]; }).join(' · ')) + '</div>';
    }
    if (t.gereserveerd) h += '<div class="settings-label-sub">' + escHtml(tr('ig.meta.gereserveerd', { n: t.gereserveerd })) + '</div>';
    /* Welke wagens eruit vallen, met een knop naar het bestaande bewerkvenster:
       zo vult de dealer bv. de kleur aan die het AutoScout24-profiel niet meegeeft. */
    var lijst = Array.isArray(t.ontbrekend) ? t.ontbrekend : [];
    if (lijst.length) {
      h += '<details class="ig-gids" style="margin-top:6px"><summary>' + escHtml(tr('ig.meta.aanvullen', { n: t.weggelaten })) + '</summary><div style="margin-top:6px">';
      lijst.forEach(function (w) {
        var reden = T_DICT['ig.meta.reden.' + w.reden] !== undefined ? tr('ig.meta.reden.' + w.reden) : w.reden;
        h += '<div class="settings-row" style="padding:4px 0"><div class="settings-label-sub">' + escHtml(w.code + ' · ' + (w.naam || '') + ' · ' + reden) + '</div>'
          + '<button type="button" class="inv-sync" data-ig-actie="bewerk" data-ig="' + escHtml(w.code) + '">' + escHtml(tr('btn.bewerken')) + '</button></div>';
      });
      h += '</div></details>';
    }
  }
  return h;
}

function igForm(p) {
  var id = escHtml(p.id);
  if (p.auth === 'catalog_feed') return igMetaForm(p);
  var wacht = p.status === 'FEED_REQUIRED';
  var velden = '';
  if (p.auth === 'basic') {
    velden = '<input type="text" class="mail-instructie" id="ig-gebruiker-' + id + '" maxlength="200" autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr('ig.veld.gebruiker')) + '" placeholder="' + escHtml(tr('ig.veld.gebruiker')) + '">'
      + '<input type="password" class="mail-instructie" id="ig-wachtwoord-' + id + '" maxlength="400" autocomplete="new-password" aria-label="' + escHtml(tr('ig.veld.wachtwoord')) + '" placeholder="' + escHtml(tr('ig.veld.wachtwoord')) + '">';
  } else if (p.auth === 'api_key') {
    velden = '<input type="password" class="mail-instructie" id="ig-sleutel-' + id + '" maxlength="400" autocomplete="new-password" aria-label="' + escHtml(tr('ig.veld.sleutel')) + '" placeholder="' + escHtml(tr('ig.veld.sleutel')) + '">';
  } else if (p.auth === 'customer_id') {
    velden = '<input type="text" class="mail-instructie" id="ig-klant-' + id + '" maxlength="40" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr(wacht ? 'ig.veld.klantnummerLater' : 'ig.veld.klantnummer')) + '" placeholder="' + escHtml(tr('ig.veld.klantnummer')) + '" value="' + escHtml(p.klantnummer || '') + '">'
      + '<div class="mail-hint">' + escHtml(tr(wacht ? 'ig.veld.klantnummerLater' : 'ig.veld.klantnummer')) + '</div>';
  } else if (p.auth === 'feed_url' || p.auth === 'csv') {
    var label = tr(p.adresSoort === 'profiel' ? 'ig.veld.profiel' : 'ig.veld.feed');
    velden = '<input type="url" class="mail-instructie" id="ig-url-' + id + '" maxlength="1000" inputmode="url" autocomplete="off" spellcheck="false" aria-label="' + escHtml(label) + '" placeholder="https://…" value="' + escHtml(p.url || '') + '">'
      + '<div class="mail-hint">' + escHtml(label) + '</div>';
  }
  if (p.auth === 'basic' && p.adresSoort === 'verkoper') {
    velden += '<input type="text" class="mail-instructie" id="ig-verkoper-' + id + '" maxlength="40" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr('ig.veld.verkoper')) + '" placeholder="' + escHtml(tr('ig.veld.verkoper')) + '" value="' + escHtml(p.verkoperId || '') + '">'
      + '<div class="mail-hint">' + escHtml(tr('ig.veld.verkoper')) + '</div>';
  }
  if (p.auth === 'basic' || p.auth === 'api_key') velden += '<div class="mail-hint">' + escHtml(tr('ig.cred.uitleg')) + '</div>';
  return '<div class="su-bron-invoer" style="width:100%;margin-top:8px">' + velden
    + '<div class="mail-knoppen" style="justify-content:flex-start">'
    + '<button type="button" class="btn-icon mail-koppel" data-ig-actie="bewaar" data-ig="' + id + '">' + escHtml(tr(wacht ? 'ig.knop.bewaarLater' : 'ig.knop.bewaar')) + '</button>'
    + '<button type="button" class="btn-icon" data-ig-actie="annuleer" data-ig="' + id + '">' + escHtml(tr('ig.knop.annuleer')) + '</button>'
    + '</div></div>';
}

function igKaart(p) {
  var id = escHtml(p.id);
  var sub = '';
  var knoppen = '';
  var open = igState.open === p.id;

  /* Een korte uitleg per platform (wat het is, wat het vraagt). De algemene
     regels "Binnenkort" en "Niet beschikbaar" staan er alleen als er geen eigen
     uitleg is: nooit twee keer hetzelfde. Een platform dat op activatie wacht
     zegt dat eerst. */
  var uitlegTekst = p.status === 'FEED_REQUIRED' && igTekst('ig.pending.' + p.id) ? igTekst('ig.pending.' + p.id)
    : (p.uitlegSleutel && igTekst(p.uitlegSleutel)) || igTekst('ig.uitleg.' + p.id);
  var uitleg = uitlegTekst ? '<div class="settings-label-sub">' + escHtml(uitlegTekst) + '</div>' : '';
  var gids = igGids(p);
  if (p.status === 'COMING_SOON') {
    sub = (uitleg || '<div class="settings-label-sub">' + escHtml(tr('ig.binnenkort')) + '</div>');
  } else if (p.status === 'DISABLED') {
    sub = (uitleg || '<div class="settings-label-sub">' + escHtml(tr('ig.nietActief')) + '</div>');
  } else {
    var verbonden = p.geconfigureerd;
    var wachtOpActivatie = verbonden && p.status === 'FEED_REQUIRED';
    var staatTekst = p.alleenPubliceren ? (verbonden ? 'ig.verbonden' : 'ig.nietVerbonden') : wachtOpActivatie ? 'ig.opgeslagen' : verbonden ? 'ig.verbonden' : 'ig.nietVerbonden';
    sub = '<div><span class="mail-staat ' + (verbonden && !wachtOpActivatie ? 'ok' : '') + '">' + escHtml(tr(staatTekst)) + '</span></div>' + uitleg;
    if (p.alleenPubliceren) sub += igMetaStatus(p);
    if (p.status === 'MANUAL' && !uitleg) sub += '<div class="settings-label-sub">' + escHtml(tr('ig.handmatig.uitleg')) + '</div>';
    if (verbonden && p.kanSyncen) {
      sub += '<div class="settings-label-sub">' + escHtml(tr('ig.laatst', { t: p.laatsteSync ? timeAgo(new Date(p.laatsteSync)) : tr('ig.nooit') })) + '</div>';
      if (p.aantal !== null) {
        sub += '<div class="inv-cijfers"><span>' + escHtml(invAantal(p.aantal)) + '</span><span>'
          + escHtml(tr('ig.tellingen', { nieuw: p.nieuw || 0, bijgewerkt: p.bijgewerkt || 0, verwijderd: p.verwijderd || 0 })) + '</span></div>';
      }
      if (p.foutSleutel) {
        var zin = igTekst(p.foutSleutel) || tr('ig.fout.UNKNOWN_ERROR');
        sub += '<div class="inv-fout" style="margin-top:8px">' + escHtml(tr('ig.laatsteFout', { fout: zin })) + '</div>';
      }
    }
    if (wachtOpActivatie) {
      sub += '<div class="inv-let" style="margin-top:8px">' + escHtml(igTekst(p.wachtSleutel) || tr('ig.wacht')) + '</div>';
      if (p.heeftCredentials) sub += '<div class="settings-label-sub">' + escHtml(tr('ig.cred.bewaard')) + '</div>';
    }
    if (verbonden && p.heeftCredentials && p.status !== 'FEED_REQUIRED') sub += '<div class="settings-label-sub">' + escHtml(tr('ig.cred.bewaard')) + '</div>';

    if (!open) {
      if (p.kanUploaden) {
        knoppen += '<button type="button" class="btn-icon" data-ig-actie="upload" data-ig="' + id + '"' + (igState.bezig === p.id ? ' disabled' : '') + '>' + escHtml(tr('ig.upload.knop')) + '</button>'
          + '<input type="file" id="ig-bestand-' + id + '" data-ig-bestand="' + id + '" accept=".csv,.json,.xml,text/csv,application/json,text/xml" style="display:none">';
      }
      if (verbonden && p.kanSyncen && !p.uploadBron) knoppen += '<button type="button" class="btn-icon" data-ig-actie="sync" data-ig="' + id + '"' + (igState.bezig === p.id ? ' disabled' : '') + '>' + escHtml(tr('ig.knop.sync')) + '</button>';
      knoppen += '<button type="button" class="btn-icon' + (verbonden ? '' : ' mail-koppel') + '" data-ig-actie="open" data-ig="' + id + '">' + escHtml(tr(verbonden ? 'ig.knop.wijzig' : (p.status === 'FEED_REQUIRED' ? 'ig.knop.bewaarLater' : 'ig.knop.verbind'))) + '</button>';
      if (verbonden) knoppen += '<button type="button" class="btn-icon mail-ontkoppel" data-ig-actie="ontkoppel" data-ig="' + id + '">' + escHtml(tr('ig.knop.ontkoppel')) + '</button>';
    }
  }

  return '<div class="settings-row" data-ig-kaart="' + id + '" style="align-items:flex-start;flex-wrap:wrap;gap:10px">'
    + '<div style="flex:1;min-width:200px"><div class="settings-label">' + escHtml(p.label) + ' ' + igBadge(p) + '</div>' + sub + '</div>'
    + '<div class="mail-knoppen">' + knoppen + '</div>'
    + (open ? igForm(p) : '')
    + igMeldHtml(p.id)
    + gids
    + '</div>';
}

function tekenIntegraties() {
  var d = igState.data;
  var lijst = document.getElementById('ig-lijst');
  if (!d || !lijst) return;
  var html = (d.providers || []).map(igKaart).join('');
  var dagen = d.bewaarDagen || 14;
  html += '<div class="settings-row" style="align-items:flex-start;flex-wrap:wrap;gap:10px"><div style="flex:1;min-width:200px">'
    + '<div class="settings-label">' + escHtml(tr('ig.bewaar.titel')) + '</div>'
    + '<div class="settings-label-sub">' + escHtml(tr('ig.bewaar.sub')) + '</div></div>'
    + '<div class="mail-instructie-rij" style="max-width:220px">'
    + '<input type="number" class="mail-instructie" id="ig-bewaardagen" min="1" max="365" step="1" value="' + escHtml(String(dagen)) + '" aria-label="' + escHtml(tr('ig.bewaar.titel')) + '">'
    + '<button type="button" class="inv-sync" data-ig-actie="dagen">' + escHtml(tr('ig.knop.bewaar')) + '</button></div></div>';
  lijst.innerHTML = html;
}

async function igOpslaan(id) {
  var p = igKaartVan(id);
  if (!p) return;
  var body = { provider: id };
  var waarde = function (el) { return el ? el.value.trim() : ''; };
  if (p.auth === 'basic') {
    var wachtwoord = document.getElementById('ig-wachtwoord-' + id);
    var gebruiker = waarde(document.getElementById('ig-gebruiker-' + id));
    var geheim = wachtwoord ? wachtwoord.value : '';
    /* Staan er al versleutelde gegevens en vult de dealer niets in, dan blijven ze zoals ze zijn. */
    if (gebruiker || geheim || !p.heeftCredentials) body.credentials = { username: gebruiker, password: geheim };
    if (p.adresSoort === 'verkoper') body.mobileSellerId = waarde(document.getElementById('ig-verkoper-' + id));
  } else if (p.auth === 'api_key') {
    body.credentials = { apiKey: waarde(document.getElementById('ig-sleutel-' + id)) };
  } else if (p.auth === 'customer_id') {
    body.customerId = waarde(document.getElementById('ig-klant-' + id));
  } else if (p.auth === 'catalog_feed') {
    body.meta = {};
    ['addr1', 'postalCode', 'city', 'region', 'country', 'lat', 'lng', 'phone', 'fbPageId'].forEach(function (k) { body.meta[k] = waarde(document.getElementById('ig-meta-' + k + '-' + id)); });
  } else {
    body.url = waarde(document.getElementById('ig-url-' + id));
  }
  igState.bezig = id;
  try {
    igState.data = Object.assign({}, igState.data, await voorraadVraag('inventory-provider-save', body));
    igState.open = '';
    igState.meldingen[id] = null;
    /* Een wachtwoord blijft nergens in het scherm achter. */
    tekenIntegraties();
    igKlaar(id, tr('ig.bewaard'));
    /* Een koppeling die kan lezen krijgt meteen een eerste synchronisatie. */
    if (p.kanSyncen) await igSync(id, true);
  } catch (e) {
    igFout(id, e);
  } finally {
    igState.bezig = '';
  }
  laadIntegraties();
}

async function igSync(id, stil) {
  igState.bezig = id;
  tekenIntegraties();
  try {
    await voorraadVraag('inventory-sync');
    if (!stil) igKlaar(id, tr('ig.gesynct'));
  } catch (e) {
    igFout(id, e);
  } finally {
    igState.bezig = '';
  }
  /* Ook na een fout opnieuw laden: de kaart houdt zijn melding (igState.meldingen). */
  if (!stil) laadIntegraties();
}

/* De bevestiging noemt WELK platform er losgaat en hoeveel wagens er bij het
   laatste lezen van kwamen: wie op de verkeerde kaart klikte, ziet het hier. */
function igOntkoppel(id) {
  var p = igKaartVan(id) || { id: id, label: id, aantal: null };
  var bericht = tr(p.alleenPubliceren ? 'ig.ontkoppel.meta' : 'ig.ontkoppel.vraag', { platform: p.label });
  if (!p.alleenPubliceren && p.aantal !== null && p.aantal !== undefined) {
    bericht += ' ' + tr(Number(p.aantal) === 1 ? 'ig.ontkoppel.aantal.een' : 'ig.ontkoppel.aantal', { n: p.aantal });
  }
  showConfirmModal({
    title: tr('ig.ontkoppel.titel', { platform: p.label }), message: bericht,
    confirmText: tr('ig.knop.ontkoppel') + ' ' + p.label, cancelText: tr('ig.knop.annuleer'), danger: true,
    onConfirm: async function () {
      try {
        await voorraadVraag('inventory-provider-save', { provider: id, verwijder: true });
        igState.meldingen[id] = null;
        toast(tr('ig.bewaard'), 'success');
      } catch (e) { igFout(id, e); }
      igState.open = '';
      laadIntegraties();
    }
  });
}

/* Een exportbestand als bron (mode 'inventory-upload'). Het bestand wordt in het
   geheugen gelezen en blijft daar tot het klaar is: valt er meer dan de helft
   van de wagens uit weg, dan vraagt de server om bevestiging en sturen we
   hetzelfde bestand nog eens mee. De grens (2 MB) is die van de server. */
function igUploadKies(id) {
  var el = document.getElementById('ig-bestand-' + id);
  if (el) { el.value = ''; el.click(); }
}

function igBestand(ev) {
  var el = ev.target;
  if (!el || !el.getAttribute || el.getAttribute('data-ig-bestand') === null) return;
  var id = el.getAttribute('data-ig-bestand');
  var f = el.files && el.files[0];
  if (!f) return;
  /* De invoer meteen leegmaken: dezelfde bestandsnaam twee keer kiezen geeft
     anders geen change-gebeurtenis, en de tweede poging deed dan niets. */
  var kiesNogmaals = function () { try { el.value = ''; } catch (e) {} };
  if (f.size > 2 * 1024 * 1024) { kiesNogmaals(); igMeld(id, 'error', tr('ig.err.bestand_te_groot')); toast(tr('ig.err.bestand_te_groot'), 'error'); tekenIntegraties(); return; }
  var lezer = new FileReader();
  lezer.onload = function () { kiesNogmaals(); igUpload(id, String(lezer.result || ''), false); };
  lezer.onerror = function () { kiesNogmaals(); igMeld(id, 'error', tr('ig.err.bestand_onleesbaar')); toast(tr('ig.err.bestand_onleesbaar'), 'error'); tekenIntegraties(); };
  lezer.readAsText(f);
}

async function igUpload(id, tekst, bevestig) {
  igState.bezig = id;
  igState.meldingen[id] = null;
  tekenIntegraties();
  var klaar = true;
  var kaart = igKaartVan(id) || { label: id };
  try {
    var d = await voorraadVraag('inventory-upload', { provider: id, csv: tekst, bevestigDaling: bevestig === true });
    var u = (d && d.upload) || {};
    if (u.dalingGeblokkeerd && !bevestig) {
      klaar = false;
      showConfirmModal({
        title: tr('ig.upload.dalingTitel', { platform: kaart.label }), message: tr('ig.upload.daling', { n: u.verdwenenAantal || 0, dagen: d.bewaarDagen || 14 }),
        confirmText: tr('inv.daling.knop'), cancelText: tr('ig.knop.annuleer'), danger: true,
        onConfirm: function () { igUpload(id, tekst, true); }
      });
    } else if (u.ok === false) {
      var z = igTekst(u.foutSleutel) || tr('ig.fout.UNKNOWN_ERROR');
      igMeld(id, 'error', z);
      toast(z, 'error');
    } else {
      var klaarTekst = tr(Number(u.aantal) === 1 ? 'ig.upload.klaar.een' : 'ig.upload.klaar', { aantal: u.aantal || 0, nieuw: u.aangemaakt || 0, verkocht: u.verkocht || 0 });
      if (Number(u.overgeslagen) > 0) klaarTekst += ' ' + tr('ig.upload.overgeslagen', { n: u.overgeslagen });
      igKlaar(id, klaarTekst);
    }
  } catch (e) {
    igFout(id, e);
  } finally {
    igState.bezig = '';
  }
  if (klaar) laadIntegraties(); else tekenIntegraties();
}

/* Een advertentie op de lead (Listing Provider en Listing ID, gezet door
   WhatsApp als het gesprek een advertentie noemde): klein, alleen lezen. Staat
   hier omdat deze module al per platform de namen kent. */
function dealerAdvertentieKaart(lead) {
  if (!lead || !lead.listingProvider) return '';
  var namen = { feed: 'Website', meta: 'Meta', autoscout24: 'AutoScout24', autoscout24_api: 'AutoScout24', mobile_de: 'mobile.de', gocar: 'Gocar.be' };
  var naam = namen[lead.listingProvider] || lead.listingProvider;
  return '<div class="panel-section"><div class="panel-section-title">' + escHtml(tr('lead.listing.titel')) + '</div>'
    + '<div class="settings-label-sub">' + escHtml(tr('lead.listing.regel', { platform: naam, id: lead.listingId || '–' })) + '</div></div>';
}

async function igDagen() {
  var el = document.getElementById('ig-bewaardagen');
  if (!el) return;
  try {
    var d = await voorraadVraag('inventory-provider-save', { bewaarDagen: Number(el.value) });
    igState.data = Object.assign({}, igState.data, { bewaarDagen: d.bewaarDagen });
    toast(tr('ig.bewaard'), 'success');
  } catch (e) { toast(igFoutZin(e), 'error'); }
}

/* Een wagen uit de Meta-lijst aanvullen in het bestaande bewerkvenster. Dat
   venster zoekt de wagen in de lijst van de Voertuigen-pagina, en die is nog
   niet geladen als de dealer op Instellingen staat: zonder dit opende het een
   LEEG "Voertuig toevoegen" en maakte bewaren een dubbele wagen. Daarom eerst
   de lijst verversen, en alleen openen als de wagen er echt in staat. Na het
   sluiten de kaart opnieuw laden, zodat de tellingen kloppen. */
async function igBewerk(code) {
  try {
    if (typeof loadPanden === 'function') await loadPanden(true);
  } catch (_) { /* hieronder: niet gevonden */ }
  var gevonden = typeof pandState !== 'undefined' && (pandState.panden || []).some(function (p) { return p.code === code; });
  if (!gevonden || typeof openPandModal !== 'function') { toast(tr('ig.err.voertuigWeg'), 'error'); return; }
  openPandModal(code);
  var modal = document.getElementById('pd-overlay');
  var wacht = setInterval(function () {
    if (!modal || !modal.classList.contains('open')) { clearInterval(wacht); laadIntegraties(); }
  }, 700);
}

function igKlik(ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-ig-actie]') : null;
  if (!el) return;
  var actie = el.getAttribute('data-ig-actie');
  var id = el.getAttribute('data-ig');
  if (actie === 'open') { igState.open = id; tekenIntegraties(); }
  else if (actie === 'annuleer') { igState.open = ''; tekenIntegraties(); }
  else if (actie === 'bewaar') igOpslaan(id);
  else if (actie === 'sync') igSync(id, false);
  else if (actie === 'upload') igUploadKies(id);
  else if (actie === 'ontkoppel') igOntkoppel(id);
  else if (actie === 'bewerk') igBewerk(id);
  else if (actie === 'dagen') igDagen();
  else if (actie === 'kopieer') igKopieer();
}

function igKopieer() {
  var el = document.getElementById('ig-feedurl');
  if (!el) return;
  var klaar = function () { toast(tr('ig.gekopieerd'), 'success'); };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(el.value).then(klaar, function () { el.select(); }); return; }
  } catch (e) {}
  el.select();
  try { if (document.execCommand('copy')) klaar(); } catch (e) {}
}

/* Open of dicht van een uitleg onthouden we, want de kaart wordt opnieuw getekend. */
function igGidsToggle(ev) {
  var d = ev.target;
  if (d && d.getAttribute && d.getAttribute('data-ig-gids') !== null) igState.gids[d.getAttribute('data-ig-gids')] = d.open;
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
