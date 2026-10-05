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
var igState = { data: null, open: '', bezig: '', gekoppeld: false };

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
  if (!igState.gekoppeld) { lijst.addEventListener('click', igKlik); lijst.addEventListener('change', igBestand); igState.gekoppeld = true; }
  try {
    igState.data = await voorraadVraag('inventory-providers');
    tekenIntegraties();
  } catch (e) {
    lijst.innerHTML = '<div class="settings-row"><div class="settings-label-sub">' + escHtml(tr('ig.laadFout')) + '</div></div>';
  }
}

function igBadge(p) {
  var actief = p.status === 'ACTIVE' || (p.geconfigureerd && p.kanSyncen);
  return '<span class="conv-kanaal-tag' + (actief ? ' mens' : '') + '">' + escHtml(tr('ig.status.' + p.status)) + '</span>';
}

function igForm(p) {
  var id = escHtml(p.id);
  var velden = '';
  if (p.auth === 'basic') {
    velden = '<input type="text" class="mail-instructie" id="ig-gebruiker-' + id + '" maxlength="200" autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr('ig.veld.gebruiker')) + '" placeholder="' + escHtml(tr('ig.veld.gebruiker')) + '">'
      + '<input type="password" class="mail-instructie" id="ig-wachtwoord-' + id + '" maxlength="400" autocomplete="new-password" aria-label="' + escHtml(tr('ig.veld.wachtwoord')) + '" placeholder="' + escHtml(tr('ig.veld.wachtwoord')) + '">';
  } else if (p.auth === 'api_key') {
    velden = '<input type="password" class="mail-instructie" id="ig-sleutel-' + id + '" maxlength="400" autocomplete="new-password" aria-label="' + escHtml(tr('ig.veld.sleutel')) + '" placeholder="' + escHtml(tr('ig.veld.sleutel')) + '">';
  } else if (p.auth === 'customer_id') {
    velden = '<input type="text" class="mail-instructie" id="ig-klant-' + id + '" maxlength="40" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="' + escHtml(tr('ig.veld.klantnummer')) + '" placeholder="' + escHtml(tr('ig.veld.klantnummer')) + '" value="' + escHtml(p.klantnummer || '') + '">'
      + '<div class="mail-hint">' + escHtml(tr('ig.veld.klantnummer')) + '</div>';
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
    + '<button type="button" class="btn-icon mail-koppel" data-ig-actie="bewaar" data-ig="' + id + '">' + escHtml(tr('ig.knop.bewaar')) + '</button>'
    + '<button type="button" class="btn-icon" data-ig-actie="annuleer" data-ig="' + id + '">' + escHtml(tr('ig.knop.annuleer')) + '</button>'
    + '</div></div>';
}

function igKaart(p) {
  var id = escHtml(p.id);
  var sub = '';
  var knoppen = '';
  var open = igState.open === p.id;

  /* Een korte uitleg per platform (wat het is, wat het vraagt). */
  var uitleg = p.uitlegSleutel && igTekst(p.uitlegSleutel) ? '<div class="settings-label-sub">' + escHtml(igTekst(p.uitlegSleutel)) + '</div>' : '';
  if (p.status === 'COMING_SOON') {
    sub = '<div class="settings-label-sub">' + escHtml(tr('ig.binnenkort')) + '</div>' + uitleg;
  } else if (p.status === 'DISABLED') {
    sub = '<div class="settings-label-sub">' + escHtml(tr('ig.nietActief')) + '</div>';
  } else {
    var verbonden = p.geconfigureerd;
    sub = '<div><span class="mail-staat ' + (verbonden ? 'ok' : '') + '">' + escHtml(tr(verbonden ? 'ig.verbonden' : 'ig.nietVerbonden')) + '</span></div>' + uitleg;
    if (p.status === 'MANUAL' && !uitleg) sub += '<div class="settings-label-sub">' + escHtml(tr('ig.handmatig.uitleg')) + '</div>';
    if (verbonden && p.kanSyncen) {
      sub += '<div class="settings-label-sub">' + escHtml(tr('ig.laatst', { t: p.laatsteSync ? timeAgo(new Date(p.laatsteSync)) : tr('ig.nooit') })) + '</div>';
      if (p.aantal !== null) {
        sub += '<div class="inv-cijfers"><span>' + escHtml(tr('inv.aantal', { n: p.aantal })) + '</span><span>'
          + escHtml(tr('ig.tellingen', { nieuw: p.nieuw || 0, bijgewerkt: p.bijgewerkt || 0, verwijderd: p.verwijderd || 0 })) + '</span></div>';
      }
      if (p.foutSleutel) {
        var zin = igTekst(p.foutSleutel) || tr('ig.fout.UNKNOWN_ERROR');
        sub += '<div class="inv-fout" style="margin-top:8px">' + escHtml(tr('ig.laatsteFout', { fout: zin })) + '</div>';
      }
    }
    if (verbonden && p.status === 'FEED_REQUIRED') {
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
      knoppen += '<button type="button" class="btn-icon' + (verbonden ? '' : ' mail-koppel') + '" data-ig-actie="open" data-ig="' + id + '">' + escHtml(tr(verbonden ? 'ig.knop.wijzig' : 'ig.knop.verbind')) + '</button>';
      if (verbonden) knoppen += '<button type="button" class="btn-icon mail-ontkoppel" data-ig-actie="ontkoppel" data-ig="' + id + '">' + escHtml(tr('ig.knop.ontkoppel')) + '</button>';
    }
  }

  return '<div class="settings-row" data-ig-kaart="' + id + '" style="align-items:flex-start;flex-wrap:wrap;gap:10px">'
    + '<div style="flex:1;min-width:200px"><div class="settings-label">' + escHtml(p.label) + ' ' + igBadge(p) + '</div>' + sub + '</div>'
    + '<div class="mail-knoppen">' + knoppen + '</div>'
    + (open ? igForm(p) : '')
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
  var p = ((igState.data && igState.data.providers) || []).filter(function (x) { return x.id === id; })[0];
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
  } else {
    body.url = waarde(document.getElementById('ig-url-' + id));
  }
  igState.bezig = id;
  try {
    igState.data = Object.assign({}, igState.data, await voorraadVraag('inventory-provider-save', body));
    igState.open = '';
    /* Een wachtwoord blijft nergens in het scherm achter. */
    tekenIntegraties();
    toast(tr('ig.bewaard'), 'success');
    /* Een koppeling die kan lezen krijgt meteen een eerste synchronisatie. */
    if (p.kanSyncen) await igSync(id, true);
  } catch (e) {
    toast(igFoutZin(e), 'error');
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
    if (!stil) toast(tr('ig.gesynct'), 'success');
  } catch (e) {
    toast(igFoutZin(e), 'error');
  } finally {
    igState.bezig = '';
  }
  if (!stil) laadIntegraties();
}

function igOntkoppel(id) {
  showConfirmModal({
    title: tr('ig.knop.ontkoppel'), message: tr('ig.vraag.ontkoppel'),
    confirmText: tr('ig.knop.ontkoppel'), cancelText: tr('ig.knop.annuleer'), danger: true,
    onConfirm: async function () {
      try {
        await voorraadVraag('inventory-provider-save', { provider: id, verwijder: true });
        toast(tr('ig.bewaard'), 'success');
      } catch (e) { toast(igFoutZin(e), 'error'); }
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
  if (f.size > 2 * 1024 * 1024) { toast(tr('ig.err.bestand_te_groot'), 'error'); return; }
  var lezer = new FileReader();
  lezer.onload = function () { igUpload(id, String(lezer.result || ''), false); };
  lezer.onerror = function () { toast(tr('ig.err.bestand_onleesbaar'), 'error'); };
  lezer.readAsText(f);
}

async function igUpload(id, tekst, bevestig) {
  igState.bezig = id;
  tekenIntegraties();
  var klaar = true;
  try {
    var d = await voorraadVraag('inventory-upload', { provider: id, csv: tekst, bevestigDaling: bevestig === true });
    var u = (d && d.upload) || {};
    if (u.dalingGeblokkeerd && !bevestig) {
      klaar = false;
      showConfirmModal({
        title: tr('inv.daling.knop'), message: tr('ig.upload.daling', { n: u.verdwenenAantal || 0, dagen: d.bewaarDagen || 14 }),
        confirmText: tr('inv.daling.knop'), cancelText: tr('ig.knop.annuleer'), danger: true,
        onConfirm: function () { igUpload(id, tekst, true); }
      });
    } else if (u.ok === false) {
      toast(igTekst(u.foutSleutel) || tr('ig.fout.UNKNOWN_ERROR'), 'error');
    } else {
      toast(tr('ig.upload.klaar', { aantal: u.aantal || 0, nieuw: u.aangemaakt || 0, verkocht: u.verkocht || 0 }), 'success');
    }
  } catch (e) {
    toast(igFoutZin(e), 'error');
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
  var namen = { feed: 'Website', autoscout24: 'AutoScout24', autoscout24_api: 'AutoScout24', mobile_de: 'mobile.de', gocar: 'Gocar.be' };
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
  else if (actie === 'dagen') igDagen();
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
