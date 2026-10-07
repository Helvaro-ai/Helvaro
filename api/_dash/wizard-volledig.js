'use strict';
/*
 * Onboarding-wizard: alles wat een nieuwe dealer nodig heeft om live te gaan
 * (client-side).
 *
 * Wat hier staat, en waarom het niet in api/dashboard.js staat:
 *   - de stap 'meldingen': het nummer waar de dealer een seintje krijgt bij een
 *     nieuwe lead, en zijn werkuren. Beide velden bestaan al op "Je assistent"
 *     (notifyPhone, workingHours) en gaan via dezelfde config-save.
 *   - de voorraadbronnen op de stap 'koppelingen' en de WhatsApp-uitleg voor
 *     dealers, elk met een knop die de wizard sluit en naar Instellingen gaat.
 *   - de slotstap 'klaar': een echte checklist met per open onderdeel een knop
 *     naar de plek waar het opgelost wordt, plus een testbericht dat de dealer
 *     ZELF verstuurt (mode 'test-message', zoals sendTestMessage()).
 *
 * Hoe het erin komt: zoals api/_dash/agenda.js en integraties.js. De functie
 * hieronder wordt NOOIT op de server uitgevoerd; js() geeft de broncode van
 * haar romp terug en api/dashboard.js plakt die in het clientscript. Zo is dit
 * gewoon JavaScript, zonder dubbele escapes. De romp gebruikt de globale namen
 * van het dashboard (tr, escHtml, LOCALE, API_BASE, state, navigateTo,
 * wizardBewaar, wizardSluit, wizardGa, wizKnop, _wizardConfig, _wizStatus,
 * WIZARD_STAPPEN, _wizardStap). Geen backticks en geen dollar-accolade in deze
 * romp: het ding wordt in een template literal geplakt.
 *
 * Het telefoonveld is hetzelfde patroon als het leadformulier
 * (api/form-page.js, .tel-veld): vlag + landcode + nummer, en de nationale 0
 * valt weg behalve in de landen van ZONDER_NUL. De twee landlijsten staan in
 * tests/onboarding-volledig.test.js naast elkaar, zodat ze niet uit elkaar
 * lopen.
 */
/* eslint-disable no-undef, no-unused-vars */
function client() {
/* ── Wizard: meldingen, uren, voorraadbronnen, klaar-checklist ──────────── */

var WIZ_LANDCODES = [['BE','32'],['NL','31'],['FR','33'],['DE','49'],['LU','352'],['GB','44'],['ES','34'],['IT','39'],['PT','351'],['AT','43'],['CH','41'],['IE','353'],
  ['PL','48'],['RO','40'],['BG','359'],['GR','30'],['HR','385'],['CZ','420'],['SK','421'],['HU','36'],['SI','386'],['DK','45'],['SE','46'],['NO','47'],['FI','358'],
  ['EE','372'],['LV','371'],['LT','370'],['UA','380'],['TR','90'],['MA','212'],['DZ','213'],['TN','216'],['EG','20'],['AE','971'],['SA','966'],['IN','91'],['CN','86'],
  ['US','1'],['CA','1'],['BR','55'],['AU','61'],['ZA','27'],['NG','234'],['AL','355'],['RS','381'],['BA','387'],['MK','389'],['XK','383']];
/* Landen zonder nationale 0: daar hoort een 0 vooraan bij het nummer zelf. */
var WIZ_ZONDER_NUL = ['IT', 'ES', 'PT', 'LU', 'GR', 'DK', 'NO', 'EE', 'LV', 'CZ', 'US', 'CA'];

/* Dezelfde controles als api/leads.js config-save. Wat daar niet door komt
   wordt stil genegeerd (het antwoord blijft ok), dus de wizard controleert
   zelf en zegt het hardop. NB: config-save kent EEN bereik ("ma-vr 9-18");
   "ma-vr 9-18, za 9-13" wordt daar stil weggegooid. */
var WIZ_UREN_RE = /^[a-zà-ü]{2,9}\s*[-–]\s*[a-zà-ü]{2,9}\s+\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?$/;
var WIZ_TEL_RE = /^[+]?[0-9][0-9\s\-().]{6,29}$/;

/* Landen waar een nummer thuis met 0 begint. Alleen voor het TONEN van een
   opgeslagen nummer (+32470.. wordt 0470..); bij het opslaan valt die 0 weg. */
var WIZ_MET_NUL = ['BE', 'NL', 'FR', 'DE', 'GB', 'AT', 'CH'];

/* Dagcodes die de backend leest: nl, fr en en. Andere talen krijgen de
   Engelse voorbeelden, net als op "Je assistent".

   LET OP, Nederlands: config-save eist 3 tot 9 letters per dag, dus "ma-vr
   9-18" (de vorm die "Je assistent" als voorbeeld toont) wordt DAAR stil
   weggegooid -- het antwoord blijft ok, er staat niets opgeslagen. De
   uurcontrole van de WhatsApp-assistent (api/whatsapp.js) kent wel de
   driedelige vormen maa/din/woe/don/vri/zat/zon. De wizard laat de dealer dus
   "ma-vr 9-18" typen, bewaart "maa-vri 9-18" en toont weer "ma-vr 9-18". */
var WIZ_UREN_VOORBEELDEN = {
  nl: ['ma-vr 9-18', 'ma-za 8-20', 'di-za 10-18'],
  fr: ['lun-ven 9-18', 'lun-sam 8-20', 'mar-sam 10-18'],
  en: ['mon-fri 9-18', 'mon-sat 8-20', 'tue-sat 10-18']
};

var WIZ_NL_DAG = { ma: 'maa', di: 'din', wo: 'woe', 'do': 'don', vr: 'vri', za: 'zat', zo: 'zon' };
var WIZ_NL_DAG_TERUG = { maa: 'ma', din: 'di', woe: 'wo', don: 'do', vri: 'vr', zat: 'za', zon: 'zo' };

/* Waar elke open regel van de checklist naartoe gaat. 'stap' = terug naar die
   stap van de wizard (en daarna meteen weer naar Klaar); 'sluit' = wizard
   sluiten en naar die pagina. */
var WIZ_FIX = {
  whatsapp: { stap: 'kanalen' },
  alerts:   { stap: 'meldingen' },
  uren:     { stap: 'meldingen' },
  agenda:   { stap: 'koppelingen' },
  voorraad: { sluit: 'panden' },
  email:    { stap: 'kanalen' },
  website:  { stap: 'kanalen' }
};

/* Hoort bij het testbericht op Klaar. Blijft staan als het scherm opnieuw
   getekend wordt (de statuscontrole tekent Klaar nog een keer). */
var wizTestState = { begonnen: false, land: '', nat: '', uit: '', soort: '', bezig: false };
/* Naam van de stap waar de dealer naartoe gestuurd is om iets op te lossen;
   na Volgende op die stap gaat hij direct terug naar Klaar. */
var wizTerugNaarKlaar = '';

function wizEl(id) { return document.getElementById(id); }

/* ── Telefoonnummers ───────────────────────────────────────────────────── */
function wizBelVoorLand(cc) {
  for (var i = 0; i < WIZ_LANDCODES.length; i++) if (WIZ_LANDCODES[i][0] === cc) return WIZ_LANDCODES[i][1];
  return '';
}

/* Het land van de dealer staat voorgeselecteerd; onbekend = Belgie. */
function wizLandStandaard() {
  var c = _wizardConfig || {};
  var cc = String(c.country || '').toUpperCase();
  return wizBelVoorLand(cc) ? cc : 'BE';
}

/* Een eerder opgeslagen nummer terug in land + nationaal deel. */
function wizSplitsTel(opgeslagen, standaard) {
  var ruw = String(opgeslagen || '').trim();
  if (!ruw) return { land: standaard, nationaal: '' };
  /* Achter de vaste landcode (+32) hoort het nummer zonder nationale 0, net als
     op het leadformulier: "+32 0466..." zag eruit als een fout. */
  var zonderNul = function (land, nr) { return WIZ_MET_NUL.indexOf(land) !== -1 ? String(nr).replace(/^0+/, '') : String(nr); };
  if (!/^(\+|00)/.test(ruw)) return { land: standaard, nationaal: zonderNul(standaard, ruw) };
  var cijfers = ruw.replace(/[^0-9]/g, '');
  if (ruw.charAt(0) !== '+') cijfers = cijfers.replace(/^00/, '');
  for (var len = 3; len >= 1; len--) {
    var kop = cijfers.slice(0, len);
    var gevonden = '';
    for (var i = 0; i < WIZ_LANDCODES.length; i++) {
      if (WIZ_LANDCODES[i][1] !== kop) continue;
      if (WIZ_LANDCODES[i][0] === standaard) { gevonden = standaard; break; }
      if (!gevonden) gevonden = WIZ_LANDCODES[i][0];
    }
    if (gevonden) {
      var rest = cijfers.slice(len);
      return { land: gevonden, nationaal: rest };
    }
  }
  return { land: standaard, nationaal: ruw };
}

/* Landcode + nummer samenstellen. Wie zelf +.. of 00.. typt bedoelt precies dat
   nummer; anders valt de nationale 0 weg (behalve in ZONDER_NUL-landen). */
function wizSamenstelTel(bel, houdNul, ruw) {
  ruw = String(ruw || '').trim();
  if (!ruw) return '';
  if (/^(\+|00)/.test(ruw)) {
    var c = ruw.replace(/[^0-9]/g, '');
    if (ruw.charAt(0) !== '+') c = c.replace(/^00/, '');
    return c ? '+' + c : '';
  }
  var nat = ruw.replace(/[^0-9]/g, '');
  if (!nat) return '';
  return '+' + bel + (houdNul ? nat : nat.replace(/^0+/, ''));
}

/* 8 tot 15 cijfers (ITU) EN het patroon dat config-save toelaat. */
function wizTelGeldig(e164) {
  var n = String(e164 || '').replace(/[^0-9]/g, '');
  return n.length >= 8 && n.length <= 15 && WIZ_TEL_RE.test(String(e164));
}

function wizLandNaam(namen, cc) {
  try { return (namen && namen.of(cc)) || cc; } catch (e) { return cc; }
}
function wizVlag(cc) {
  return String.fromCodePoint.apply(null, cc.split('').map(function (ch) { return 0x1F1E6 + ch.charCodeAt(0) - 65; }));
}

/* Het veld zelf: vlag + landcode + nummer, met een echte <select> onzichtbaar
   over de vlag (toetsenbord en schermlezer werken gewoon). pre = id-voorvoegsel;
   de aanroeper zet een label met id pre + '-lbl', dat het nummerveld benoemt. */
function wizTelHtml(pre, land, nat) {
  var namen = null;
  try { namen = new Intl.DisplayNames([LOCALE], { type: 'region' }); } catch (e) { namen = null; }
  var lijst = WIZ_LANDCODES.slice().sort(function (a, b) {
    if (a[0] === land) return -1;
    if (b[0] === land) return 1;
    return wizLandNaam(namen, a[0]).localeCompare(wizLandNaam(namen, b[0]), LOCALE);
  });
  var opties = lijst.map(function (x) {
    return '<option value="' + x[1] + '" data-land="' + x[0] + '"'
      + (WIZ_ZONDER_NUL.indexOf(x[0]) !== -1 ? ' data-houd-nul="1"' : '')
      + (x[0] === land ? ' selected' : '') + '>'
      + wizVlag(x[0]) + ' ' + escHtml(wizLandNaam(namen, x[0])) + ' (+' + x[1] + ')</option>';
  }).join('');
  return '<div class="wiz-tel">'
    + '<span class="wiz-tel-land">'
    +   '<span class="wiz-tel-vlag" id="' + pre + '-vlag" aria-hidden="true">' + wizVlag(land) + '</span>'
    +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
    +   '<select id="' + pre + '-land" aria-label="' + escHtml(tr('wiz.mel.land')) + '" autocomplete="tel-country-code">' + opties + '</select>'
    + '</span>'
    + '<span class="wiz-tel-prefix" id="' + pre + '-prefix" aria-hidden="true">+' + wizBelVoorLand(land) + '</span>'
    + '<input id="' + pre + '-nr" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="30" placeholder="0470 12 34 56" aria-labelledby="' + pre + '-lbl">'
    + '</div>';
}

/* Vlag en landcode volgen de gekozen optie; begint het nummer met + of 00 dan
   verdwijnt de vaste landcode. bijWijziging(landcode, nummertekst) is optioneel. */
function wizTelBind(pre, bijWijziging) {
  var sel = wizEl(pre + '-land'), vlag = wizEl(pre + '-vlag'), prefix = wizEl(pre + '-prefix'), nr = wizEl(pre + '-nr');
  if (!sel || !vlag || !prefix || !nr) return;
  function bij() {
    var o = sel.options[sel.selectedIndex];
    var eerste = (o ? o.textContent : '').split(' ')[0];
    if (eerste) vlag.textContent = eerste;
    prefix.textContent = '+' + sel.value;
    prefix.hidden = /^\s*(\+|00)/.test(nr.value);
    if (bijWijziging) bijWijziging(o ? o.getAttribute('data-land') : '', nr.value);
  }
  sel.addEventListener('change', function () { bij(); nr.focus(); });
  nr.addEventListener('input', bij);
  bij();
}

/* Wat er nu in het veld staat, als +<landcode><nummer>. Leeg = niets ingevuld. */
function wizTelLees(pre) {
  var sel = wizEl(pre + '-land'), nr = wizEl(pre + '-nr');
  if (!sel || !nr) return '';
  var o = sel.options[sel.selectedIndex];
  return wizSamenstelTel(sel.value, !!(o && o.getAttribute('data-houd-nul') === '1'), nr.value);
}

/* ── Stap 'meldingen': nummer voor seintjes + werkuren ──────────────────── */
function wizUrenTaal() {
  var c = _wizardConfig || {};
  var l = String(c.language || (typeof LOCALE === 'string' ? LOCALE : 'nl')).split(/[_-]/)[0].toLowerCase();
  return WIZ_UREN_VOORBEELDEN[l] ? l : 'en';
}

/* De eerste twee woorden van "ma-vr 9-18" door een kaart halen. */
function wizUrenDagen(tekst, kaart) {
  return String(tekst || '').trim().toLowerCase().replace(/^([a-z]+)(\s*[-\u2013]\s*)([a-z]+)(?=\s)/, function (m, a, mid, b) {
    var eigen = function (k) { return Object.prototype.hasOwnProperty.call(kaart, k) ? kaart[k] : k; };
    return eigen(a) + mid + eigen(b);
  });
}
/* Wat naar config-save gaat: de vorm die daar door de controle komt. */
/* Sinds de server ook 'ma-vr' bewaart, gaat de tekst zoals de dealer hem typte:
   anders stond er 'maa-vri' op het formulier dat de klant ziet. */
function wizUrenNaarOpslag(tekst) { return String(tekst || '').trim().toLowerCase(); }
/* Wat de dealer ziet: Nederlands weer als "ma-vr 9-18". */
function wizUrenNaarScherm(tekst) {
  return wizUrenTaal() === 'nl' ? wizUrenDagen(tekst, WIZ_NL_DAG_TERUG) : String(tekst || '');
}

function wizUrenGeldig(tekst) {
  var s = wizUrenNaarOpslag(tekst);
  return s === '' || (s.length <= 60 && WIZ_UREN_RE.test(s));
}

/* Precies de velden die "Je assistent" opslaat. Een nummer erin betekent dat
   de dealer seintjes WIL, dus de uit-schakelaar gaat ook mee uit. */
function wizMeldingenPayload(e164, uren) {
  var p = { notifyPhone: e164 || '', workingHours: wizUrenNaarOpslag(uren) };
  if (e164) p.waAlertOff = false;
  return p;
}

function wizMeldingenTeken(titel, sub, body) {
  var c = _wizardConfig || {};
  titel.textContent = tr('wiz.mel.t');
  sub.textContent = tr('wiz.mel.s');
  var gesplitst = wizSplitsTel(c.notifyPhone, wizLandStandaard());
  var voorbeelden = WIZ_UREN_VOORBEELDEN[wizUrenTaal()];
  var chips = voorbeelden.map(function (v) {
    return '<button type="button" class="wiz-chip" data-uren="' + escHtml(v) + '" aria-pressed="false">' + escHtml(v) + '</button>';
  }).join('');
  body.innerHTML =
      '<label id="wizard-mel-lbl" class="wiz-label">' + escHtml(tr('wiz.mel.tel')) + '</label>'
    + wizTelHtml('wizard-mel', gesplitst.land, gesplitst.nationaal)
    + '<p class="wiz-hint">' + escHtml(tr('wiz.mel.telHint')) + '</p>'
    + '<label for="wizard-uren" class="wiz-label wiz-label--na">' + escHtml(tr('wiz.mel.uren')) + '</label>'
    + '<input id="wizard-uren" class="wiz-veld" type="text" maxlength="60" autocomplete="off" placeholder="' + escHtml(voorbeelden[0]) + '">'
    + '<div class="wiz-chips" role="group" aria-label="' + escHtml(tr('wiz.mel.voorbeelden')) + '">' + chips + '</div>'
    + '<p class="wiz-hint">' + escHtml(tr('wiz.mel.urenHint', { vb: voorbeelden[0] })) + '</p>';

  var nr = wizEl('wizard-mel-nr');
  var uren = wizEl('wizard-uren');
  if (nr) nr.value = gesplitst.nationaal;
  if (uren) uren.value = wizUrenNaarScherm(c.workingHours || '');
  wizTelBind('wizard-mel');

  var knoppen = body.querySelectorAll('.wiz-chip');
  function markeer() {
    var huidig = uren ? uren.value.trim().toLowerCase() : '';
    for (var i = 0; i < knoppen.length; i++) {
      knoppen[i].setAttribute('aria-pressed', knoppen[i].getAttribute('data-uren') === huidig ? 'true' : 'false');
    }
  }
  for (var k = 0; k < knoppen.length; k++) {
    knoppen[k].onclick = function () {
      if (uren) { uren.value = this.getAttribute('data-uren'); uren.focus(); }
      markeer();
    };
  }
  if (uren) uren.addEventListener('input', markeer);
  markeer();
  setTimeout(function () { var el = wizEl('wizard-mel-nr'); if (el) el.focus(); }, 60);
}

/* true = door naar de volgende stap. Bij een fout blijft de dealer staan en
   leest hij waarom. */
async function wizMeldingenBewaar(knop, fout) {
  var tel = wizTelLees('wizard-mel');
  var urenEl = wizEl('wizard-uren');
  var uren = urenEl ? urenEl.value.trim().toLowerCase() : '';
  if (tel && !wizTelGeldig(tel)) {
    fout.textContent = tr('wiz.mel.telFout');
    var nrEl = wizEl('wizard-mel-nr'); if (nrEl) nrEl.focus();
    return false;
  }
  if (!wizUrenGeldig(uren)) {
    fout.textContent = tr('wiz.mel.urenFout', { vb: WIZ_UREN_VOORBEELDEN[wizUrenTaal()][0] });
    if (urenEl) urenEl.focus();
    return false;
  }
  knop.disabled = true; knop.textContent = tr('st.opslaanBezig');
  try {
    await wizardBewaar(wizMeldingenPayload(tel, uren));
    _wizardConfig = _wizardConfig || {};
    _wizardConfig.notifyPhone = tel;
    _wizardConfig.workingHours = wizUrenNaarOpslag(uren);
    if (tel) _wizardConfig.waAlertOff = false;
    wizTestState.begonnen = false;   // het testnummer volgt het nieuwe meldingsnummer
    return true;
  } catch (e) {
    fout.textContent = tr('tst.opslaanMis');
    knop.disabled = false; knop.textContent = tr('btn.volgende');
    return false;
  }
}

/* ── Naar Instellingen, en daar naar de juiste sectie scrollen ─────────── */
function wizNaarInstellingen(sectieId) {
  wizardSluit(false);
  navigateTo('instellingen');
  var pogingen = 0;
  (function zoek() {
    var el = wizEl(sectieId);
    if (el && el.offsetParent !== null) {
      if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (++pogingen < 8) setTimeout(zoek, 250);
  })();
}

/* Stap 'koppelingen', dealers: waar de voorraad vandaan kan komen. */
function wizKoppelingenExtra() {
  var extra = wizEl('wiz-voorraad-extra');
  if (!extra) return;
  extra.innerHTML = '<p class="wiz-kaart-uitleg">' + escHtml(tr('wiz.voorraad.bronnen')) + '</p>'
    + '<button type="button" id="wiz-bronnen-knop" class="wiz-kaart-knop">' + escHtml(tr('wiz.voorraad.bronnenKnop')) + '</button>';
  wizEl('wiz-bronnen-knop').onclick = function () { wizNaarInstellingen('set-integraties'); };
}

/* Stap 'kanalen', dealers: de uitleg staat al in de kaart, dit is de knop. */
function wizWaDealerKnop() {
  wizKnop('wa', tr('wiz.wa.dealer.knop'), function () { wizNaarInstellingen('set-wa'); });
}

/* ── Klaar: checklist ──────────────────────────────────────────────────── */
/* null = niet te weten (config niet geladen). Een nummer met de uit-schakelaar
   aan telt NIET als klaar: er komt geen seintje. */
function wizAlertsStatus() {
  var c = _wizardConfig;
  if (!c) return null;
  return !!(c.notifyPhone && c.waAlertOff !== true);
}
function wizUrenStatus() {
  var c = _wizardConfig;
  if (!c) return null;
  return !!(c.workingHours && String(c.workingHours).trim());
}

function wizKlaarRijen(dealer) {
  var c = _wizardConfig || {};
  var rijen = [
    { id: 'whatsapp', naam: 'WhatsApp', st: _wizStatus.whatsapp, fix: 'wiz.fix.bekijk' },
    { id: 'alerts', naam: tr('wiz.klaar.rij.alerts'), st: wizAlertsStatus(), fix: 'wiz.fix.invullen',
      detail: c.notifyPhone ? tr('wiz.klaar.alertsOp', { nr: c.notifyPhone }) : '' },
    { id: 'uren', naam: tr('wiz.klaar.rij.uren'), st: wizUrenStatus(), fix: 'wiz.fix.invullen', optioneel: true,
      detail: wizUrenNaarScherm(c.workingHours || '') },
    { id: 'agenda', naam: tr('set.gcal'), st: _wizStatus.agenda, fix: 'wiz.fix.koppel' }
  ];
  if (dealer) rijen.push({ id: 'voorraad', naam: tr('inv.titel'), st: _wizStatus.voorraad, fix: 'wiz.fix.voorraad' });
  rijen.push({ id: 'email', naam: tr('conv.kanaal.email'), st: _wizStatus.email, fix: 'wiz.fix.koppel', optioneel: true });
  rijen.push({ id: 'website', naam: tr('widget.titel'), st: _wizStatus.website, fix: 'wiz.fix.aanzetten', optioneel: true });
  return rijen;
}

function wizTestHtml() {
  var t = wizTestState;
  if (!t.begonnen) {
    var g = wizSplitsTel((_wizardConfig || {}).notifyPhone, wizLandStandaard());
    t.land = g.land; t.nat = g.nationaal; t.begonnen = true;
  }
  return '<div class="wiz-test">'
    + '<div class="wiz-kopje">' + escHtml(tr('wiz.test.t')) + '</div>'
    + '<p class="wiz-hint">' + escHtml(tr('wiz.test.s')) + '</p>'
    + '<label id="wizard-test-lbl" class="wiz-label wiz-label--na">' + escHtml(tr('wiz.test.nr')) + '</label>'
    + wizTelHtml('wizard-test', t.land, t.nat)
    + '<button type="button" id="wizard-test-knop" class="wiz-kaart-knop"' + (t.bezig ? ' disabled' : '') + '>'
    +   escHtml(tr(t.bezig ? 'tst.testBezig' : 'wiz.test.knop')) + '</button>'
    + '<div id="wizard-test-uit" class="wiz-test-uit' + (t.soort ? ' is-' + t.soort : '') + '" role="status" aria-live="polite">' + escHtml(t.uit) + '</div>'
    + '</div>';
}

/* Het hele lichaam van de slotstap. dealer = markt is autohandel; link = de
   formulierlink (mag leeg); volgende = de zin onderaan. */
function wizKlaarHtml(dealer, link, volgende) {
  wizTerugNaarKlaar = '';
  var open = 0;
  var lijst = wizKlaarRijen(dealer).map(function (r) {
    var ok = r.st === true;
    if (!ok && !r.optioneel) open++;
    var status = tr(ok ? 'wiz.klaar.aan' : (r.st === false ? 'wiz.klaar.later' : 'wiz.klaar.onbekend'));
    return '<li class="wiz-klaar-rij" data-wiz-rij="' + r.id + '">'
      + '<span aria-hidden="true" class="wiz-klaar-bol' + (ok ? ' is-aan' : '') + '"></span>'
      + '<span class="wiz-klaar-naam">' + escHtml(r.naam)
      +   (r.optioneel ? ' <span class="wiz-optioneel">' + escHtml(tr('wiz.optioneel')) + '</span>' : '')
      +   (ok && r.detail ? '<span class="wiz-klaar-detail">' + escHtml(r.detail) + '</span>' : '')
      + '</span>'
      + '<span class="wiz-klaar-status">' + escHtml(status) + '</span>'
      + (ok ? '' : '<button type="button" class="wiz-kaart-knop wiz-klaar-fix" data-wiz-fix="' + r.id + '" aria-label="'
          + escHtml(tr(r.fix) + ': ' + r.naam) + '">' + escHtml(tr(r.fix)) + '</button>')
      + '</li>';
  }).join('');
  return '<div class="wiz-link">' + (link ? escHtml(link) : escHtml(tr('wiz.klaar.link'))) + '</div>'
    + '<div class="wiz-kopje">' + escHtml(tr('wiz.klaar.lijst')) + '</div>'
    + '<ul class="wiz-klaar-lijst">' + lijst + '</ul>'
    + '<p class="wiz-hint" role="status">' + escHtml(open ? tr('wiz.klaar.open', { n: open }) : tr('wiz.klaar.alles')) + '</p>'
    + wizTestHtml()
    + '<p class="wiz-volgende">' + escHtml(volgende) + '</p>';
}

/* Na het tekenen: knoppen aan hun doel hangen. */
function wizKlaarBind(body) {
  var fixKnoppen = body.querySelectorAll('[data-wiz-fix]');
  for (var i = 0; i < fixKnoppen.length; i++) {
    fixKnoppen[i].onclick = function () { wizFixActie(this.getAttribute('data-wiz-fix')); };
  }
  /* Eerst de waarde terugzetten, dan pas luisteren: de eerste bij() van de
     binding leest het veld en zou anders een leeg veld in de staat schrijven. */
  var nr = wizEl('wizard-test-nr');
  if (nr) nr.value = wizTestState.nat;
  wizTelBind('wizard-test', function (land, tekst) { wizTestState.land = land || wizTestState.land; wizTestState.nat = tekst; });
  var tk = wizEl('wizard-test-knop');
  if (tk) tk.onclick = function () { wizTestVerstuur(); };
}

function wizFixActie(id) {
  var d = WIZ_FIX[id];
  if (!d) return;
  if (d.sluit) { wizardSluit(false); navigateTo(d.sluit); return; }
  wizTerugNaarKlaar = d.stap;
  wizardGa(WIZARD_STAPPEN.indexOf(d.stap) - _wizardStap);
}

/* Na het oplossen van een punt meteen terug naar Klaar, niet nog drie stappen
   doorklikken. */
function wizVolgendeDelta() {
  var klaar = WIZARD_STAPPEN.indexOf('klaar');
  if (wizTerugNaarKlaar && WIZARD_STAPPEN[_wizardStap] === wizTerugNaarKlaar) return klaar - _wizardStap;
  return 1;
}

/* ── Klaar: testbericht ────────────────────────────────────────────────── */
function wizTestToon(soort, tekst) {
  wizTestState.soort = soort;
  wizTestState.uit = tekst;
  var uit = wizEl('wizard-test-uit');
  if (uit) { uit.className = 'wiz-test-uit' + (soort ? ' is-' + soort : ''); uit.textContent = tekst; }
}

/* Het welkomstbericht met dezelfde invulling als het voorbeeld op "Je
   assistent". */
function wizTestBericht() {
  var c = _wizardConfig || {};
  var ai = c.aiName || 'Faro';
  var sjabloon = String(c.autoReplyTpl || '').trim();
  if (!sjabloon) return tr('wiz.test.fallback', { ai: ai });
  return sjabloon
    .replace(/\{naam\}/g, 'Jan')
    .replace(/\{bedrijf\}/g, c.clientName || (typeof state === 'object' && state.clientName) || 'Bedrijf')
    .replace(/\{ai\}/g, ai)
    .replace(/\{project\}/g, '')
    .replace(/\{bron\}/g, 'Website');
}

/* Alleen na een klik op de knop. Zelfde aanroep als sendTestMessage() op "Je
   assistent": mode 'test-message', en de server beslist of het vrij kan of als
   goedgekeurd sjabloon moet (buiten het 24-uursvenster). */
async function wizTestVerstuur() {
  var t = wizTestState;
  if (t.bezig) return;
  var tel = wizTelLees('wizard-test');
  if (!tel) { wizTestToon('fout', tr('tst.testNummer')); return; }
  if (!wizTelGeldig(tel)) { wizTestToon('fout', tr('wiz.mel.telFout')); return; }
  var knop = wizEl('wizard-test-knop');
  t.bezig = true;
  if (knop) { knop.disabled = true; knop.textContent = tr('tst.testBezig'); }
  wizTestToon('', '');
  try {
    var r = await fetch(API_BASE + '/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'test-message', phone: tel, message: wizTestBericht() })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      wizTestToon('fout', '' + (d.message || d.error || tr('tst.testMislukt')));
    } else {
      /* Buiten het 24-uursvenster stuurt de server de goedgekeurde begroeting
         in plaats van de eigen tekst; de klant hoort dat te weten. */
      wizTestToon('ok', tr(d.via === 'template' ? 'tst.testTemplate' : 'tst.testVerzonden').replace('{nr}', d.sentTo));
    }
  } catch (e) {
    wizTestToon('fout', tr('tst.ietsMis'));
  } finally {
    t.bezig = false;
    var k2 = wizEl('wizard-test-knop');
    if (k2) { k2.disabled = false; k2.textContent = tr('wiz.test.knop'); }
  }
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
