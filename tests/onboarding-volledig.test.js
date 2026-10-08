/*
 * De onboarding-wizard "volledig": alles wat een nieuwe dealer nodig heeft om
 * live te gaan, en eerlijk over wat klaar is.
 *
 * Wat hier bewaakt wordt:
 *   1. de stap 'meldingen' (nummer voor seintjes + werkuren) staat in de lijst,
 *      heeft prefill, een telefoonveld zoals het leadformulier, en slaat precies
 *      op wat "Je assistent" opslaat (config-save: notifyPhone, workingHours);
 *   2. de werkuren worden gecontroleerd met DEZELFDE regex als config-save --
 *      want die gooit een ongeldige waarde stil weg en antwoordt toch ok;
 *   3. de knoppen op Klaar en Koppelingen gaan naar de goede plek;
 *   4. het testbericht gaat alleen na een klik, met de payload van
 *      sendTestMessage(), en toont wat de server antwoordt;
 *   5. alles in nl/fr/en/de, en dashboard.js blijft onder de regelgrens.
 *
 * De clientcode staat in api/_dash/wizard-volledig.js en draait hier in een
 * vm met een nep-document: zo test je de echte functies, niet een kopie.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.FARO_WORKSPACE_ENABLED = '1';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};
const ROOT = path.join(__dirname, '..');
const lees = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const i18n = require('../api/_i18n');
const modul = require('../api/_dash/wizard-volledig');
const modulWa = require('../api/_dash/wizard-whatsapp');
const regio = require('../api/_regio');
const TALEN = ['nl', 'fr', 'en', 'de'];

/* ── De pagina, zoals de wizard-test hem ook rendert ─────────────────────── */
delete require.cache[require.resolve('../api/dashboard.js')];
const dash = require('../api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

/* ── De clientcode in een vm met nep-document ────────────────────────────── */
function bouw(opt) {
  opt = opt || {};
  const taal = opt.taal || 'nl';
  const log = { bewaard: [], sluit: 0, nav: [], fetch: [], scroll: [], ga: [], toast: [], listeners: [], knop: [] };
  const els = {};
  const mkEl = (p) => Object.assign({
    style: {}, value: '', textContent: '', className: '', disabled: false, hidden: false, innerHTML: '',
    options: [], selectedIndex: 0, offsetParent: {},
    attrs: {},
    addEventListener() {}, focus() {}, scrollIntoView(o) { log.scroll.push(o); },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    querySelectorAll() { return []; },
  }, p || {});
  const opts = (lijst) => lijst.map((x) => ({
    value: x[1], textContent: x[0], getAttribute(k) { return k === 'data-land' ? x[0] : (k === 'data-houd-nul' && x[2] ? '1' : null); },
  }));
  /* Een telefoonveld: land (index in lijst) + het getypte nummer. */
  const telVeld = (pre, land, nr) => {
    const lijst = [['BE', '32'], ['NL', '31'], ['IT', '39', true], ['GB', '44']];
    const i = Math.max(0, lijst.findIndex((x) => x[0] === land));
    els[pre + '-land'] = mkEl({ options: opts(lijst), selectedIndex: i, value: lijst[i][1] });
    els[pre + '-vlag'] = mkEl();
    els[pre + '-prefix'] = mkEl();
    els[pre + '-nr'] = mkEl({ value: nr || '' });
  };
  const ctx = vm.createContext({
    console, JSON, Intl, Object, String, Number, Math, Date, Array, RegExp, Promise,
    LOCALE: taal === 'nl' ? 'nl-BE' : taal, API_BASE: '/api', state: { apiKey: 'sleutel', clientName: 'Teljo' },
    document: { getElementById: (id) => els[id] || null },
    window: { FB: opt.FB, addEventListener: (t, f) => { log.listeners.push(f); } },
    setTimeout: (f) => { f(); return 0; },
    escHtml: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    tr: (k, v) => {
      let s = i18n.t(taal, k);
      if (s === k) throw new Error('onbekende sleutel ' + k);
      if (v) for (const x in v) s = s.split('{' + x + '}').join(String(v[x]));
      return s;
    },
    fetch: async (url, o) => {
      log.fetch.push({ url, o, body: JSON.parse(o.body) });
      return opt.fetchAntwoord ? opt.fetchAntwoord(JSON.parse(o.body)) : { ok: true, json: async () => ({ ok: true, sentTo: '32470123456', via: 'vrij' }) };
    },
    navigateTo: (p) => log.nav.push(p),
    wizardSluit: () => { log.sluit++; },
    wizardBewaar: async (v) => { if (opt.bewaarFout) throw new Error('mis'); log.bewaard.push(v); return {}; },
    wizKnop: () => {},
    toast: (m, t) => { log.toast.push([t, m]); },
    wizardTaalNaam: (c) => String(c || ''),
    laadWaes: () => {},
  });
  vm.runInContext(
    "var WIZARD_STAPPEN = ['intro','regio','markt','bedrijf','ai','meldingen','kanalen','koppelingen','klaar'];"
    + 'var _wizardStap = 0;'
    + 'var _wizardConfig = ' + JSON.stringify(opt.config === undefined ? { country: 'BE', language: taal } : opt.config) + ';'
    + "var _wizStatus = { whatsapp: null, eigenNr: null, email: null, website: null, agenda: null, voorraad: null, meta: null };"
    + 'function wizardGa(d) { var doel = _wizardStap + d; if (doel < 0 || doel >= WIZARD_STAPPEN.length) return; _wizardStap = doel; __ga.push(doel); }'
    + 'var __ga = [];',
    ctx);
  /* De kaart-helpers die in dashboard.js staan (wizBadge/wizUitleg), en een wizKnop die onthoudt wat hij kreeg. */
  vm.runInContext(
    "function wizBadge(id, t, k) { var b = document.getElementById('wiz-' + id + '-badge'); if (b) { b.textContent = t; b.style.color = k || ''; } }"
    + "function wizUitleg(id, t) { var u = document.getElementById('wiz-' + id + '-uitleg'); if (u) u.textContent = t; }"
    + "function wizKnop(id, t, f) { var k = document.getElementById('wiz-' + id + '-knop'); if (!k) return; k.textContent = t; k.style.display = ''; k.onclick = f; }",
    ctx);
  vm.runInContext(modul.js(), ctx);
  vm.runInContext(modulWa.js(), ctx);
  return { ctx, log, els, mkEl, telVeld, run: (s) => vm.runInContext(s, ctx) };
}
const kloon = (x) => JSON.parse(JSON.stringify(x));

/* ══ 1. De stappenlijst ═════════════════════════════════════════════════════ */
console.log('\n— de stappenlijst —');
const STAPPEN = ((html.match(/WIZARD_STAPPEN = \[([^\]]+)\]/) || [])[1] || '')
  .split(',').map((x) => x.trim().replace(/'/g, ''));
ck('negen stappen', STAPPEN.length === 9, STAPPEN);
ck("'meldingen' staat tussen 'ai' en 'kanalen'",
  STAPPEN.indexOf('meldingen') === STAPPEN.indexOf('ai') + 1 && STAPPEN.indexOf('kanalen') === STAPPEN.indexOf('meldingen') + 1, STAPPEN);
ck("'klaar' is de laatste stap en 'intro' de eerste", STAPPEN[8] === 'klaar' && STAPPEN[0] === 'intro', STAPPEN);
ck('de stap heeft een mascotte', /WIZARD_MASCOTTE = \{[\s\S]*?meldingen:\s*'\/faro\//.test(html), null);
ck('de testversie van de stappenlijst is dezelfde als die van de pagina',
  JSON.stringify(STAPPEN) === JSON.stringify(['intro', 'regio', 'markt', 'bedrijf', 'ai', 'meldingen', 'kanalen', 'koppelingen', 'klaar']), STAPPEN);
ck('de pagina bevat de module', /function wizMeldingenTeken\(/.test(html) && /function wizKlaarHtml\(/.test(html), null);
ck('de module verwijst nergens naar een backtick of dollar-accolade (hij wordt in een template literal geplakt)',
  !/`/.test(modul.js()) && !/\$\{/.test(modul.js()), null);
{
  const src = lees('api/dashboard.js');
  ck('dashboard.js haalt de module binnen en plakt hem in', /require\('\.\/_dash\/wizard-volledig'\)/.test(src) && /\$\{_wizardVol\.js\(\)\}/.test(src), null);
  ck('wizardVolgende bewaart de stap en gaat via wizVolgendeDelta()',
    /stap === 'meldingen' && !\(await wizMeldingenBewaar\(knop, fout\)\)/.test(src) && /wizardGa\(wizVolgendeDelta\(\)\)/.test(src), null);
  ck('wizardTeken tekent de stap, de bronnen en de checklist via de module',
    /wizMeldingenTeken\(titel, sub, body\)/.test(src) && /wizKoppelingenExtra\(\)/.test(src) && /wizKlaarHtml\(dealer, link, volgende\)/.test(src), null);
  ck('de kanalenstap tekent de WhatsApp-kaart via de module (voor dealers en andere markten) en zet de platformzin op de e-mailkaart voor dealers',
    /var dealerWa = \(typeof isDealer === 'function'\) && isDealer\(\);\s*wizWaKaart\(dealerWa\);\s*if \(dealerWa\) wizMailDealerZin\(\);/.test(src), null);
  ck('dashboard.js haalt ook de WhatsApp-module binnen en plakt hem in', /require\('\.\/_dash\/wizard-whatsapp'\)/.test(src) && /\$\{_wizardWa\.js\(\)\}/.test(src), null);
  ck('de WhatsApp-module verwijst nergens naar een backtick of dollar-accolade', !/`/.test(modulWa.js()) && !/\$\{/.test(modulWa.js()), null);
  ck('de koppelingenstap tekent de Meta-kaart en laadt de status', /kaartHtml\('meta', tr\('wiz\.meta\.t'\), true\)/.test(src) && /wizMetaStatus\(\);/.test(src), null);
  const regels = src.split('\n').length;
  ck('api/dashboard.js blijft onder de 22.000 regels (' + regels + ')', regels < 22000, regels);
}

/* ══ 2. Vier talen ══════════════════════════════════════════════════════════ */
console.log('\n— vier talen —');
{
  const bron = modul.js();
  const sleutels = new Set((bron.match(/tr\('(wiz\.[A-Za-z.]+|tst\.[A-Za-z]+|st\.[A-Za-z]+|btn\.[A-Za-z]+|set\.gcal|inv\.titel|conv\.kanaal\.email|widget\.titel)'/g) || [])
    .map((x) => x.slice(4, -1)));
  /* Sleutels die via een variabele gaan (r.fix, tr(t.bezig ? ..)) staan hier expliciet bij. */
  ['wiz.fix.bekijk', 'wiz.fix.invullen', 'wiz.fix.koppel', 'wiz.fix.aanzetten', 'wiz.fix.voorraad',
    'wiz.rail.meldingen', 'wiz.gids.meldingen', 'wiz.klaar.aan', 'wiz.klaar.later', 'wiz.klaar.onbekend',
    'wiz.voorraad.bronnen', 'wiz.voorraad.bronnenKnop', 'wiz.wa.dealer', 'wiz.wa.dealer.badge', 'wiz.wa.dealer.knop']
    .forEach((k) => sleutels.add(k));
  ck('de module gebruikt een flinke set sleutels (' + sleutels.size + ')', sleutels.size >= 35, sleutels.size);
  const ontbreekt = [];
  const gelijk = [];
  const stukVars = [];
  const vars = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const k of sleutels) {
    for (const t of TALEN) {
      const v = i18n.t(t, k);
      if (typeof v !== 'string' || !v.length || v === k) ontbreekt.push(t + ':' + k);
    }
    if (TALEN.some((t) => vars(i18n.t(t, k)) !== vars(i18n.t('nl', k)))) stukVars.push(k);
    /* "Bestaat" is niet genoeg: fr en de moeten echt vertaald zijn (behalve merknamen/gelijke woorden). */
    const niet = ['set.gcal', 'inv.titel', 'widget.titel', 'conv.kanaal.email'];
    if (!niet.includes(k) && (i18n.t('fr', k) === i18n.t('nl', k) || i18n.t('de', k) === i18n.t('nl', k))) gelijk.push(k);
  }
  ck('elke sleutel bestaat in nl, fr, en, de', ontbreekt.length === 0, ontbreekt);
  ck('plaatshouders ({n}, {nr}, {vb}, {ai}) zijn in elke taal dezelfde', stukVars.length === 0, stukVars);
  ck('fr en de zijn echt vertaald, niet gekopieerd uit nl', gelijk.length === 0, gelijk);
  ck('de hint noemt de plaatshouder {vb} (het voorbeeld volgt de taal van de assistent)',
    TALEN.every((t) => /\{vb\}/.test(i18n.t(t, 'wiz.mel.urenHint')) && /\{vb\}/.test(i18n.t(t, 'wiz.mel.urenFout'))), null);
  ck('de dealer-WhatsApp-uitleg noemt AutoScout24 en Instellingen → WhatsApp in elke taal',
    TALEN.every((t) => /AutoScout24/.test(i18n.t(t, 'wiz.wa.dealer')) && /WhatsApp/.test(i18n.t(t, 'wiz.wa.dealer'))), null);
  ck('de oude "Niets in te stellen" is weg (het was niet de hele waarheid)',
    TALEN.every((t) => !/Niets in te stellen|Nothing to set up|Rien à configurer|Nichts einzurichten/.test(i18n.t(t, 'wiz.wa.dealer.badge'))), null);
  ck('de bronnenlijst noemt alle vijf de bronnen in elke taal',
    TALEN.every((t) => ['AutoScout24', 'mobile.de', '2dehands/Marktplaats'].every((w) => i18n.t(t, 'wiz.voorraad.bronnen').indexOf(w) !== -1)
      && /feed|flux/i.test(i18n.t(t, 'wiz.voorraad.bronnen'))), null);
  /* De rail kent elke stap; geen stap zonder label (zelfde eis als welkom-wizard.test.js). */
  ck('elke stap heeft een raillabel en een gidszin in vier talen',
    STAPPEN.every((st) => TALEN.every((t) => i18n.t(t, 'wiz.rail.' + st) !== 'wiz.rail.' + st && i18n.t(t, 'wiz.gids.' + st) !== 'wiz.gids.' + st)), null);
}

/* ══ 3. Telefoonnummers ═════════════════════════════════════════════════════ */
console.log('\n— telefoonnummers: samenstellen, splitsen, prefill —');
{
  const w = bouw();
  const c = w.ctx;
  ck('0470 12 34 56 in Belgie wordt +32470123456', c.wizSamenstelTel('32', false, '0470 12 34 56') === '+32470123456', c.wizSamenstelTel('32', false, '0470 12 34 56'));
  ck('een Italiaans nummer houdt zijn 0 (ZONDER_NUL)', c.wizSamenstelTel('39', true, '06 1234 5678') === '+390612345678', c.wizSamenstelTel('39', true, '06 1234 5678'));
  ck('+.. is precies dat nummer', c.wizSamenstelTel('32', false, '+44 20 7946 0958') === '+442079460958', null);
  ck('00.. is ook precies dat nummer', c.wizSamenstelTel('32', false, '0044 20 7946 0958') === '+442079460958', null);
  ck('haakjes en streepjes vallen weg', c.wizSamenstelTel('1', true, '(415) 555-0100') === '+14155550100', c.wizSamenstelTel('1', true, '(415) 555-0100'));
  ck('leeg blijft leeg', c.wizSamenstelTel('32', false, '   ') === '' && c.wizSamenstelTel('32', false, 'abc') === '', null);
  ck('8 tot 15 cijfers is geldig, anders niet',
    c.wizTelGeldig('+32470123456') && !c.wizTelGeldig('+3247') && !c.wizTelGeldig('+3247012345678901') && !c.wizTelGeldig('abc'), null);

  /* Dezelfde landlijsten als het leadformulier. */
  const form = lees('api/form-page.js');
  const lijstForm = new Function('return ' + form.match(/const LANDCODES = (\[\[[\s\S]*?\]\]);/)[1])();
  const nulForm = new Function('return ' + form.match(/const ZONDER_NUL = (\[[^\]]*\]);/)[1])();
  ck('de landcodes zijn die van het leadformulier (api/form-page.js)', JSON.stringify(kloon(c.WIZ_LANDCODES)) === JSON.stringify(lijstForm), null);
  ck('de ZONDER_NUL-landen ook', JSON.stringify(kloon(c.WIZ_ZONDER_NUL)) === JSON.stringify(nulForm), null);

  /* Prefill: een opgeslagen nummer terug in land + nationaal deel. */
  const s1 = kloon(c.wizSplitsTel('+32470123456', 'BE'));
  ck('+32470123456 -> BE + 470123456 (zonder 0, achter de vaste +32)', s1.land === 'BE' && s1.nationaal === '470123456', s1);
  const s2 = kloon(c.wizSplitsTel('+31612345678', 'BE'));
  ck('+31.. -> NL', s2.land === 'NL' && s2.nationaal === '612345678', s2);
  const s3 = kloon(c.wizSplitsTel('+390612345678', 'BE'));
  ck('+39.. -> IT zonder erbij verzonnen 0', s3.land === 'IT' && s3.nationaal === '0612345678', s3);
  const s4 = kloon(c.wizSplitsTel('0032 470 12 34 56', 'NL'));
  ck('0032.. wordt ook herkend', s4.land === 'BE' && s4.nationaal === '470123456', s4);
  const s5 = kloon(c.wizSplitsTel('+1 415 555 0100', 'CA'));
  ck('+1 kiest het land van de dealer als dat +1 heeft', s5.land === 'CA', s5);
  const s6 = kloon(c.wizSplitsTel('0470 12 34 56', 'NL'));
  ck('een nummer zonder + komt in het land van de dealer, zonder nationale 0', s6.land === 'NL' && s6.nationaal === '470 12 34 56', s6);
  ck('leeg -> leeg veld in het land van de dealer', JSON.stringify(kloon(c.wizSplitsTel('', 'BE'))) === JSON.stringify({ land: 'BE', nationaal: '' }), null);
  ck('splitsen en weer samenstellen geeft hetzelfde nummer',
    ['+32470123456', '+31612345678', '+390612345678', '+442079460958', '+14155550100'].every((n) => {
      const s = kloon(c.wizSplitsTel(n, 'BE'));
      const bel = c.WIZ_LANDCODES.find((x) => x[0] === s.land)[1];
      return c.wizSamenstelTel(bel, c.WIZ_ZONDER_NUL.indexOf(s.land) !== -1, s.nationaal) === n;
    }), null);
  ck('het land van de dealer komt uit zijn config, onbekend = BE',
    bouw({ config: { country: 'NL' } }).ctx.wizLandStandaard() === 'NL' && bouw({ config: { country: 'ZZ' } }).ctx.wizLandStandaard() === 'BE'
      && bouw({ config: null }).ctx.wizLandStandaard() === 'BE', null);

  /* Het veld zelf: vlag-knop, landcode, nummer; het land van de dealer staat bovenaan en geselecteerd. */
  const veld = c.wizTelHtml('wizard-mel', 'NL', '0612345678');
  ck('het veld heeft vlag, <select> met label, landcode en nummer',
    /class="wiz-tel-vlag"/.test(veld) && /<select id="wizard-mel-land" aria-label="[^"]+"/.test(veld) && /id="wizard-mel-prefix"[^>]*>\+31</.test(veld)
      && /<input id="wizard-mel-nr" type="tel"/.test(veld) && /aria-labelledby="wizard-mel-lbl"/.test(veld), veld.slice(0, 300));
  ck('het land van de dealer staat eerst en is geselecteerd', /<select[^>]*><option value="31" data-land="NL" selected>/.test(veld), veld.slice(0, 500));
  ck('Italie draagt data-houd-nul, Belgie niet',
    /data-land="IT" data-houd-nul="1"/.test(veld) && !/data-land="BE" data-houd-nul/.test(veld), null);
}

/* ══ 4. De stap 'meldingen': prefill, validatie, payload ════════════════════ */
console.log('\n— de stap meldingen: prefill, validatie, wat er opgeslagen wordt —');
{
  /* Prefill uit bestaande config (zoals "Je assistent" hem opsloeg). */
  const w = bouw({ taal: 'nl', config: { country: 'BE', language: 'nl', notifyPhone: '+32470123456', workingHours: 'maa-vri 9-18' } });
  const body = w.mkEl(); const titel = w.mkEl(); const sub = w.mkEl();
  /* De nep-DOM kent de velden pas als wizMeldingenTeken ze geschreven heeft; we registreren ze net voor de prefill-stap. */
  w.telVeld('wizard-mel', 'BE', '');
  w.els['wizard-uren'] = w.mkEl();
  w.ctx.wizMeldingenTeken(titel, sub, body);
  ck('titel en subtitel komen uit de vertaling', titel.textContent === i18n.t('nl', 'wiz.mel.t') && sub.textContent === i18n.t('nl', 'wiz.mel.s'), titel.textContent);
  ck('het nummer is voorgevuld, zonder 0 achter de vaste +32 (zoals op het leadformulier)', w.els['wizard-mel-nr'].value === '470123456', w.els['wizard-mel-nr'].value);
  ck('de werkuren zijn voorgevuld, Nederlands weer als ma-vr', w.els['wizard-uren'].value === 'ma-vr 9-18', w.els['wizard-uren'].value);
  ck('de HTML bevat het telefoonveld, het uren-veld en de voorbeeld-chips',
    /id="wizard-mel-nr"/.test(body.innerHTML) && /id="wizard-uren"/.test(body.innerHTML)
      && (body.innerHTML.match(/class="wiz-chip"/g) || []).length === 3, body.innerHTML.slice(0, 200));
  ck('de chips zijn knoppen met aria-pressed (toetsenbord en schermlezer)', /<button type="button" class="wiz-chip" data-uren="ma-vr 9-18" aria-pressed="false">/.test(body.innerHTML), null);
  ck('het land van de nummer-keuze heeft een naam voor schermlezers', /<select id="wizard-mel-land" aria-label="[^"]{3,}"/.test(body.innerHTML), null);

  /* Chips per taal: de backend leest nl/fr/en; de rest krijgt Engels (zoals "Je assistent"). */
  const chipsVoor = (taal) => { const x = bouw({ taal, config: { country: 'BE', language: taal } }); const b = x.mkEl(); x.telVeld('wizard-mel', 'BE'); x.els['wizard-uren'] = x.mkEl(); x.ctx.wizMeldingenTeken(x.mkEl(), x.mkEl(), b); return (b.innerHTML.match(/data-uren="([^"]+)"/g) || []).join('|'); };
  ck('fr: lun-ven', /lun-ven 9-18/.test(chipsVoor('fr')), chipsVoor('fr'));
  ck('en: mon-fri', /mon-fri 9-18/.test(chipsVoor('en')), chipsVoor('en'));
  ck('de: Engelse voorbeelden (de backend kent geen Duitse dagcodes)', /mon-fri 9-18/.test(chipsVoor('de')), chipsVoor('de'));

  /* De regex van config-save, rechtstreeks uit de bron. */
  const leads = lees('api/leads.js');
  const m = leads.match(/v === '' \|\| (\/\^\[a-zà-ü\]\{2,9\}[^\n]*?\$\/)\.test\(v\)/);
  ck('de uren-regex van config-save is gevonden', !!m, null);
  const serverRe = m ? new Function('return ' + m[1])() : /x^/;
  ck('de wizard gebruikt precies die regex', w.ctx.WIZ_UREN_RE.source === serverRe.source, [w.ctx.WIZ_UREN_RE.source, serverRe.source]);
  const telRe = leads.match(/const v = String\(body\.notifyPhone\)[\s\S]{0,200}?(\/\^\[\+\]\?\[0-9\][^\n]*?\$\/)\.test\(v\)/);
  ck('en voor het nummer', !!telRe && w.ctx.WIZ_TEL_RE.source === new Function('return ' + telRe[1])().source, null);

  /* Wat de server stil weggooit, laat de wizard niet door. */
  const geldig = (t) => w.ctx.wizUrenGeldig(t);
  ck('ma-vr 9-18 (nl) is geldig, ook voor config-save', geldig('ma-vr 9-18') && serverRe.test('ma-vr 9-18'), null);
  ck('"ma-vr 9-18" gaat nu wel door config-save (de stille weigering is weg)', serverRe.test('ma-vr 9-18') && serverRe.test('lun-ven 9-18') && serverRe.test('mon-fri 9:30-18'));
  ck('lun-ven 9-18 en mon-fri 9:30-18 zijn geldig', geldig('lun-ven 9-18') && geldig('mon-fri 9:30-18'), null);
  ck('leeg is geldig (optioneel)', geldig('') && geldig('   '), null);
  ck('twee bereiken (ma-vr 9-18, za 9-13) worden geweigerd, niet stil weggegooid', !geldig('ma-vr 9-18, za 9-13'), null);
  ck('een losse dag (za 9-13) wordt geweigerd', !geldig('za 9-13'), null);
  ck('onzin en te lange tekst worden geweigerd', !geldig('altijd open') && !geldig('maandag-vrijdag 9-18 en dan nog een heel verhaal erachter'), null);
  const presetsOk = [].concat(kloon(w.ctx.WIZ_UREN_VOORBEELDEN.nl), kloon(w.ctx.WIZ_UREN_VOORBEELDEN.fr), kloon(w.ctx.WIZ_UREN_VOORBEELDEN.en))
    .filter((p) => !serverRe.test(w.ctx.wizUrenNaarOpslag(p)));
  ck('elke voorbeeld-chip komt, na omzetting, door de regex van config-save', presetsOk.length === 0, presetsOk);

  /* Een opgeslagen waarde moet ook echt gelezen worden door de uurcontrole. */
  const regioBE = regio.land('BE');
  const dinsdag10 = new Date('2026-10-06T08:00:00Z'), zaterdag10 = new Date('2026-10-10T08:00:00Z'), dinsdag22 = new Date('2026-10-06T20:30:00Z');
  const opslag = w.ctx.wizUrenNaarOpslag('ma-vr 9-18');
  ck('ma-vr 9-18 wordt bewaard zoals getypt', opslag === 'ma-vr 9-18', opslag);
  ck('de uurcontrole leest die opslagvorm: dinsdag 10u open, zaterdag en dinsdag 22u dicht',
    regio.binnenWerkuren(opslag, regioBE, dinsdag10) === true && regio.binnenWerkuren(opslag, regioBE, zaterdag10) === false
      && regio.binnenWerkuren(opslag, regioBE, dinsdag22) === false, null);
  ck('en terug: wat de dealer ziet is weer ma-vr 9-18', w.ctx.wizUrenNaarScherm('maa-vri 9-18') === 'ma-vr 9-18', null);
  ck('Frans en Engels blijven onaangeroerd', w.ctx.wizUrenNaarOpslag('lun-ven 9-18') === 'lun-ven 9-18' && w.ctx.wizUrenNaarOpslag('mon-fri 9-18') === 'mon-fri 9-18', null);
  ck('een woord als "constructor" breekt de omzetting niet', w.ctx.wizUrenNaarScherm('constructor-vr 9-18').indexOf('constructor') === 0, w.ctx.wizUrenNaarScherm('constructor-vr 9-18'));

  /* De payload, en wat er mis kan gaan. */
  ck('payload met nummer en uren: precies de config-save-velden, en seintjes aan',
    JSON.stringify(kloon(w.ctx.wizMeldingenPayload('+32470123456', 'ma-vr 9-18'))) === JSON.stringify({ notifyPhone: '+32470123456', workingHours: 'ma-vr 9-18', waAlertOff: false }),
    kloon(w.ctx.wizMeldingenPayload('+32470123456', 'ma-vr 9-18')));
  ck('zonder nummer geen waAlertOff-wijziging', !('waAlertOff' in kloon(w.ctx.wizMeldingenPayload('', 'ma-vr 9-18'))), null);

  const bewaar = async (taal, config, nr, land, uren, opt2) => {
    const x = bouw(Object.assign({ taal, config }, opt2 || {}));
    x.telVeld('wizard-mel', land, nr); x.els['wizard-uren'] = x.mkEl({ value: uren });
    const knop = x.mkEl(); const fout = x.mkEl();
    const ok = await x.ctx.wizMeldingenBewaar(knop, fout);
    return { ok, knop, fout, log: x.log, cfg: kloon(x.ctx._wizardConfig), x };
  };
  (async () => {
    const r = await bewaar('nl', { country: 'BE', language: 'nl' }, '0470 12 34 56', 'BE', 'ma-vr 9-18');
    ck('opslaan: door naar de volgende stap', r.ok === true && r.fout.textContent === '', r.fout.textContent);
    ck('opslaan: precies een config-save met nummer, uren en waAlertOff=false',
      r.log.bewaard.length === 1 && JSON.stringify(r.log.bewaard[0]) === JSON.stringify({ notifyPhone: '+32470123456', workingHours: 'ma-vr 9-18', waAlertOff: false }), r.log.bewaard);
    ck('opslaan: de lokale config volgt (testnummer en checklist lezen die)',
      r.cfg.notifyPhone === '+32470123456' && r.cfg.workingHours === 'ma-vr 9-18' && r.cfg.waAlertOff === false, r.cfg);

    const r2 = await bewaar('nl', { country: 'BE', language: 'nl' }, '0470 12', 'BE', '');
    ck('een te kort nummer: blijft staan met een foutmelding, er wordt niets verstuurd',
      r2.ok === false && r2.fout.textContent === i18n.t('nl', 'wiz.mel.telFout') && r2.log.bewaard.length === 0, r2.fout.textContent);
    const r3 = await bewaar('nl', { country: 'BE', language: 'nl' }, '0470 12 34 56', 'BE', 'ma-vr 9-18, za 9-13');
    ck('twee bereiken: blijft staan met de uitleg (met een voorbeeld in de eigen taal)',
      r3.ok === false && /ma-vr 9-18/.test(r3.fout.textContent) && r3.log.bewaard.length === 0, r3.fout.textContent);
    const r3b = await bewaar('en', { country: 'BE', language: 'en' }, '0470 12 34 56', 'BE', 'za 9-13');
    ck('en: het voorbeeld in de fout is mon-fri 9-18', /mon-fri 9-18/.test(r3b.fout.textContent), r3b.fout.textContent);
    const r4 = await bewaar('nl', { country: 'BE', language: 'nl' }, '', 'BE', '');
    ck('beide leeg mag: er wordt leeg opgeslagen en de wizard gaat door',
      r4.ok === true && JSON.stringify(r4.log.bewaard[0]) === JSON.stringify({ notifyPhone: '', workingHours: '' }), r4.log.bewaard);
    const r5 = await bewaar('nl', { country: 'BE', language: 'nl' }, '0470 12 34 56', 'BE', '', { bewaarFout: true });
    ck('een opslagfout: foutmelding, knop weer vrij, niet verder',
      r5.ok === false && r5.fout.textContent === i18n.t('nl', 'tst.opslaanMis') && r5.knop.disabled === false, r5.fout.textContent);
    const r6 = await bewaar('nl', { country: 'NL', language: 'nl' }, '06 12345678', 'NL', 'ma-za 8-20');
    ck('Nederlands nummer: +31612345678', r6.log.bewaard[0] && r6.log.bewaard[0].notifyPhone === '+31612345678', r6.log.bewaard);
    const r7 = await bewaar('nl', { country: 'BE', language: 'nl' }, '+44 20 7946 0958', 'BE', '');
    ck('een buitenlands nummer met + blijft dat nummer', r7.log.bewaard[0] && r7.log.bewaard[0].notifyPhone === '+442079460958', r7.log.bewaard);

    await rest();
  })();
}

/* ══ 5. Navigatie: bronnen, WhatsApp, checklist ═════════════════════════════ */
async function rest() {
  console.log('\n— navigatie: waar de knoppen heen gaan —');
  const src = lees('api/dashboard.js');
  ck("de bronnen-knop gaat naar #set-integraties", /wizNaarInstellingen\('set-integraties'\)/.test(modul.js()), null);
  ck("de WhatsApp-knop gaat naar #set-wa", /wizNaarInstellingen\('set-wa'\)/.test(modul.js()), null);
  ck('die secties en pagina\'s bestaan in de pagina',
    /id="set-integraties"/.test(html) && /id="set-wa"/.test(html) && /id="page-instellingen"/.test(html) && /id="page-panden"/.test(html), null);
  {
    const w = bouw();
    w.els['set-integraties'] = w.mkEl();
    w.ctx.wizNaarInstellingen('set-integraties');
    ck('instellingen: wizard dicht, navigateTo(instellingen), en scrollen naar de sectie',
      w.log.sluit === 1 && w.log.nav.join() === 'instellingen' && w.log.scroll.length === 1, [w.log.sluit, w.log.nav, w.log.scroll.length]);
    ck('de wizard sluit eerst (zoals de bestaande voorraadknop), dan pas navigeren', /wizardSluit\(false\);\s*navigateTo\('instellingen'\)/.test(modul.js()), null);
  }
  {
    const w = bouw();
    ck('de checklist verwijst elke regel naar een plek',
      JSON.stringify(kloon(w.ctx.WIZ_FIX)) === JSON.stringify({
        whatsapp: { stap: 'kanalen' }, eigennr: { stap: 'kanalen' }, meta: { instel: 'set-integraties' },
        alerts: { stap: 'meldingen' }, uren: { stap: 'meldingen' }, agenda: { stap: 'koppelingen' },
        voorraad: { sluit: 'panden' }, email: { stap: 'kanalen' }, website: { stap: 'kanalen' } }), kloon(w.ctx.WIZ_FIX));
    ck('elke doelstap bestaat in de stappenlijst', Object.values(kloon(w.ctx.WIZ_FIX)).every((d) => !d.stap || STAPPEN.indexOf(d.stap) !== -1), null);
    {
      const wm = bouw(); wm.els['set-integraties'] = wm.mkEl(); wm.ctx.wizFixActie('meta');
      ck('de Meta-regel sluit de wizard en gaat naar Instellingen \u2192 Integraties', wm.log.sluit === 1 && wm.log.nav.join() === 'instellingen' && wm.log.scroll.length === 1, [wm.log.sluit, wm.log.nav]);
      const we2 = bouw(); we2.run("_wizardStap = WIZARD_STAPPEN.indexOf('klaar');"); we2.ctx.wizFixActie('eigennr');
      ck('de eigen-nummerregel gaat terug naar kanalen en daarna meteen weer naar Klaar',
        we2.ctx.WIZARD_STAPPEN[we2.ctx._wizardStap] === 'kanalen' && we2.ctx.wizVolgendeDelta() === STAPPEN.indexOf('klaar') - STAPPEN.indexOf('kanalen'), null);
    }

    w.run("_wizardStap = WIZARD_STAPPEN.indexOf('klaar');");
    w.ctx.wizFixActie('alerts');
    ck('alerts: terug naar de stap meldingen', w.ctx.WIZARD_STAPPEN[w.ctx._wizardStap] === 'meldingen', w.ctx._wizardStap);
    ck('na Volgende op die stap gaat hij meteen terug naar Klaar (niet drie stappen doorklikken)',
      w.ctx.wizVolgendeDelta() === w.ctx.WIZARD_STAPPEN.indexOf('klaar') - w.ctx._wizardStap, w.ctx.wizVolgendeDelta());
    w.run("_wizardStap = WIZARD_STAPPEN.indexOf('ai');");
    ck('maar op een andere stap blijft Volgende gewoon +1', w.ctx.wizVolgendeDelta() === 1, w.ctx.wizVolgendeDelta());
    w.run("_wizardStap = WIZARD_STAPPEN.indexOf('klaar');"); w.ctx.wizFixActie('agenda');
    ck('agenda: naar koppelingen', w.ctx.WIZARD_STAPPEN[w.ctx._wizardStap] === 'koppelingen', null);
    w.run("_wizardStap = WIZARD_STAPPEN.indexOf('klaar');"); w.ctx.wizFixActie('website');
    ck('website/e-mail/WhatsApp: naar kanalen', w.ctx.WIZARD_STAPPEN[w.ctx._wizardStap] === 'kanalen', null);
    const w2 = bouw(); w2.ctx.wizFixActie('voorraad');
    ck('voorraad: wizard dicht en naar de pagina panden (zoals de bestaande knop)', w2.log.sluit === 1 && w2.log.nav.join() === 'panden', [w2.log.sluit, w2.log.nav]);
    const w3 = bouw(); w3.ctx.wizFixActie('bestaat-niet');
    ck('een onbekende regel doet niets', w3.log.sluit === 0 && w3.log.nav.length === 0, null);
  }

  console.log('\n— de checklist op Klaar leest echte status —');
  {
    const w = bouw({ taal: 'nl', config: { country: 'BE', language: 'nl', notifyPhone: '+32470123456', workingHours: 'maa-vri 9-18', aiName: 'Faro', autoReplyTpl: 'Hallo {naam}' } });
    w.run("_wizStatus = { whatsapp: true, eigenNr: null, email: false, website: null, agenda: false, voorraad: true, meta: true };");
    const h = w.ctx.wizKlaarHtml(true, 'https://app.helvaro.pro/start/X', 'volgende zin');
    const rijen = (h.match(/data-wiz-rij="([a-z]+)"/g) || []).map((x) => x.slice(14, -1));
    ck('dealer: acht regels in de gevraagde volgorde (geen eigen-nummerregel zolang Embedded Signup niet bekend is)', rijen.join() === 'whatsapp,alerts,uren,agenda,voorraad,meta,email,website', rijen);
    const fix = (h.match(/data-wiz-fix="([a-z]+)"/g) || []).map((x) => x.slice(14, -1));
    ck('alleen open regels hebben een knop (agenda, e-mail, website)', fix.join() === 'agenda,email,website', fix);
    ck('elke knop heeft een naam voor schermlezers (actie + onderdeel)', (h.match(/<button type="button" class="wiz-kaart-knop wiz-klaar-fix" data-wiz-fix="[a-z]+" aria-label="[^"]{6,}">/g) || []).length === 3, null);
    ck('de status staat als tekst, niet alleen als kleur', /klaar<\/span>/.test(h) && /later<\/span>/.test(h) && /nog niet gecontroleerd<\/span>/.test(h), null);
    ck('klaar-regels tonen wat er staat (nummer, uren in leesbare vorm)', /Op \+32470123456/.test(h) && /ma-vr 9-18/.test(h), null);
    ck('"Nog open" telt alleen wat nodig is (agenda), niet de optionele regels', /Nog open: 1\./.test(h), h.match(/Nog open[^<]*/));
    ck('het testbericht-blok staat erin, met knop en live-regio',
      /id="wizard-test-knop"/.test(h) && /id="wizard-test-uit"[^>]*role="status"[^>]*aria-live="polite"/.test(h), null);

    w.run("_wizStatus = { whatsapp: true, eigenNr: true, email: true, website: true, agenda: true, voorraad: true, meta: true };");
    const h2 = w.ctx.wizKlaarHtml(true, '', 'v');
    ck('alles groen: geen knoppen en de zin zegt dat alles klaarstaat', !/data-wiz-fix=/.test(h2) && /Alles wat nodig is staat klaar/.test(h2), null);

    const w3 = bouw({ taal: 'nl', config: { country: 'BE', language: 'nl', notifyPhone: '+32470123456', waAlertOff: true, workingHours: '' } });
    w3.run("_wizStatus = { whatsapp: true, eigenNr: null, email: true, website: true, agenda: true, voorraad: null, meta: null };");
    const h3 = w3.ctx.wizKlaarHtml(false, '', 'v');
    ck('een nummer met seintjes UIT telt niet als klaar', /data-wiz-fix="alerts"/.test(h3), null);
    ck('geen werkuren: open maar optioneel (telt niet mee: alleen de seintjes staan open)', /data-wiz-fix="uren"/.test(h3) && /Nog open: 1\./.test(h3), h3.match(/Nog open[^<]*/));
    ck('een niet-dealer heeft geen voorraadregel', !/data-wiz-rij="voorraad"/.test(h3), null);
    const w4 = bouw({ taal: 'nl', config: null });
    const h4 = w4.ctx.wizKlaarHtml(false, '', 'v');
    ck('config niet geladen: "nog niet gecontroleerd", niet "klaar"', /data-wiz-rij="alerts"[\s\S]{0,400}nog niet gecontroleerd/.test(h4), null);
    ck('de checklist draait in elke taal', TALEN.every((t) => { const x = bouw({ taal: t, config: { country: 'BE', language: t } }); return x.ctx.wizKlaarHtml(true, '', 'v').length > 800; }), null);
    ck('het renderen van Klaar verstuurt niets', w.log.fetch.length === 0 && w3.log.fetch.length === 0, w.log.fetch.length);
  }

  console.log('\n— het testbericht —');
  {
    const config = { country: 'BE', language: 'nl', notifyPhone: '+32470123456', aiName: 'Faro', clientName: 'Garage Teljo',
      autoReplyTpl: 'Hallo {naam}, ik ben {ai} van {bedrijf}. Waarmee kan ik helpen?' };
    const w = bouw({ taal: 'nl', config });
    const html1 = w.ctx.wizTestHtml();
    ck('het testnummer is voorgevuld met het meldingsnummer', w.ctx.wizTestState.land === 'BE' && w.ctx.wizTestState.nat === '470123456', kloon(w.ctx.wizTestState));
    ck('en het land staat geselecteerd', /<option value="32" data-land="BE" selected>/.test(html1), null);
    ck('renderen verstuurt niets (alleen een klik doet dat)', w.log.fetch.length === 0, w.log.fetch.length);

    w.telVeld('wizard-test', 'BE', '0470 12 34 56');
    w.els['wizard-test-uit'] = w.mkEl(); w.els['wizard-test-knop'] = w.mkEl();
    await w.ctx.wizTestVerstuur();
    const f = w.log.fetch[0];
    ck('een klik: precies een verzoek naar /api/leads', w.log.fetch.length === 1 && f.url === '/api/leads' && f.o.method === 'POST', w.log.fetch.length);
    ck('met de sleutel van de sessie', f.o.headers['x-api-key'] === 'sleutel' && f.o.headers['Content-Type'] === 'application/json', f.o.headers);
    ck('payload = mode test-message + telefoon + bericht (zoals sendTestMessage)',
      Object.keys(f.body).sort().join() === 'message,mode,phone' && f.body.mode === 'test-message' && f.body.phone === '+32470123456', f.body);
    ck('het bericht is het welkomstbericht met dezelfde invulling als het voorbeeld', f.body.message === 'Hallo Jan, ik ben Faro van Garage Teljo. Waarmee kan ik helpen?', f.body.message);
    ck('het resultaat staat in de live-regio: verzonden naar het nummer',
      w.els['wizard-test-uit'].textContent === i18n.t('nl', 'tst.testVerzonden').replace('{nr}', '32470123456') && /is-ok/.test(w.els['wizard-test-uit'].className), w.els['wizard-test-uit'].textContent);

    const wt = bouw({ taal: 'nl', config, fetchAntwoord: () => ({ ok: true, json: async () => ({ ok: true, sentTo: '32470123456', via: 'template' }) }) });
    wt.telVeld('wizard-test', 'BE', '0470 12 34 56'); wt.els['wizard-test-uit'] = wt.mkEl(); wt.els['wizard-test-knop'] = wt.mkEl();
    await wt.ctx.wizTestVerstuur();
    ck('buiten het 24-uursvenster: de melding over het sjabloon staat er (zoals op "Je assistent")',
      wt.els['wizard-test-uit'].textContent === i18n.t('nl', 'tst.testTemplate').replace('{nr}', '32470123456') && /24/.test(wt.els['wizard-test-uit'].textContent), wt.els['wizard-test-uit'].textContent);

    const wf = bouw({ taal: 'nl', config, fetchAntwoord: () => ({ ok: false, json: async () => ({ error: 'Dagelijkse limiet bereikt' }) }) });
    wf.telVeld('wizard-test', 'BE', '0470 12 34 56'); wf.els['wizard-test-uit'] = wf.mkEl(); wf.els['wizard-test-knop'] = wf.mkEl();
    await wf.ctx.wizTestVerstuur();
    ck('een serverfout wordt getoond, als fout', wf.els['wizard-test-uit'].textContent === 'Dagelijkse limiet bereikt' && /is-fout/.test(wf.els['wizard-test-uit'].className), wf.els['wizard-test-uit'].textContent);
    ck('en de knop is weer vrij', wf.els['wizard-test-knop'].disabled === false, null);

    const we = bouw({ taal: 'nl', config });
    we.telVeld('wizard-test', 'BE', ''); we.els['wizard-test-uit'] = we.mkEl(); we.els['wizard-test-knop'] = we.mkEl();
    await we.ctx.wizTestVerstuur();
    ck('geen nummer: melding en NIETS verstuurd', we.log.fetch.length === 0 && we.els['wizard-test-uit'].textContent === i18n.t('nl', 'tst.testNummer'), we.els['wizard-test-uit'].textContent);
    const wk = bouw({ taal: 'nl', config });
    wk.telVeld('wizard-test', 'BE', '12'); wk.els['wizard-test-uit'] = wk.mkEl(); wk.els['wizard-test-knop'] = wk.mkEl();
    await wk.ctx.wizTestVerstuur();
    ck('een ongeldig nummer: melding en NIETS verstuurd', wk.log.fetch.length === 0 && wk.els['wizard-test-uit'].textContent === i18n.t('nl', 'wiz.mel.telFout'), null);

    const wn = bouw({ taal: 'en', config: { country: 'BE', language: 'en', aiName: 'Faro', autoReplyTpl: '' } });
    wn.telVeld('wizard-test', 'BE', '0470 12 34 56'); wn.els['wizard-test-uit'] = wn.mkEl(); wn.els['wizard-test-knop'] = wn.mkEl();
    await wn.ctx.wizTestVerstuur();
    ck('zonder welkomstbericht: een korte testzin in plaats van een leeg bericht', wn.log.fetch[0] && wn.log.fetch[0].body.message === 'Hello, this is a test message from Faro.', wn.log.fetch[0] && wn.log.fetch[0].body.message);

    const wd = bouw({ taal: 'nl', config });
    wd.telVeld('wizard-test', 'BE', '0470 12 34 56'); wd.els['wizard-test-uit'] = wd.mkEl(); wd.els['wizard-test-knop'] = wd.mkEl();
    wd.ctx.wizTestState.bezig = true;
    await wd.ctx.wizTestVerstuur();
    ck('een tweede klik tijdens het versturen doet niets (geen dubbel bericht)', wd.log.fetch.length === 0, null);

    ck('geen enkele automatische aanroep: de testfunctie wordt alleen aan de knop gehangen',
      (modul.js().match(/wizTestVerstuur\(\)/g) || []).length === 2 && /tk\.onclick = function \(\) \{ wizTestVerstuur\(\); \}/.test(modul.js()), null);
    ck('Enter in het nummerveld verstuurt niets (alleen de knop)', !/keydown|keypress|keyup/.test(modul.js()), null);
  }

  console.log('\n— de CSS —');
  {
    const css = require('../api/_dash/styles').css();
    ck('de nieuwe klassen bestaan', ['.wiz-tel ', '.wiz-tel-land', '.wiz-chip', '.wiz-test-uit', '.wiz-klaar-detail'].every((k) => css.indexOf(k) !== -1), null);
    ck('met zichtbare focus op het telefoonveld en de landkeuze', /\.wiz-tel:focus-within \{[^}]*box-shadow/.test(css) && /\.wiz-tel-land:focus-within \{[^}]*outline/.test(css), null);
    ck('geen font-size in px erbij', !/\.wiz-(tel|chip|test)[^{]*\{[^}]*font-size:\s*[0-9.]+px/.test(css), null);
  }

  /* ══ 6. Eigen WhatsApp-nummer in de wizard ═════════════════════════════════ */
  console.log('\n— WhatsApp-kaart: eigen nummer (wizard-whatsapp.js) —');
  {
    const ES_UIT = { beschikbaar: false, gekoppeld: false, nummer: null };
    const ES_AAN = { beschikbaar: true, appId: '111', configId: '222', gekoppeld: false, nummer: null };
    const ES_GEKOPPELD = { beschikbaar: true, appId: '111', configId: '222', gekoppeld: true, nummer: { number: '+32 470 12 34 56', name: 'Garage Teljo', quality: 'UNKNOWN' } };
    const KLAAR_GEDEELD = { eigenNummer: false, klaar: true, ondersteund: true, taal: 'nl_BE' };
    const BEZIG_GEDEELD = { eigenNummer: false, klaar: false, ondersteund: true, taal: 'nl_BE' };

    /* — de zuivere toestandsfunctie — */
    const w0 = bouw();
    const T = (es, kl, dealer) => kloon(w0.ctx.wizWaToestand(es, kl, dealer));
    ck('niet beschikbaar (dealer): gedeeld nummer, WhatsApp telt als klaar, geen eigen-nummerregel',
      (() => { const t = T(ES_UIT, null, true); return t.soort === 'gedeeld' && t.whatsapp === true && t.eigenNr === null; })(), T(ES_UIT, null, true));
    ck('niet beschikbaar (andere markt): volgt de sjabloonstatus van het gedeelde nummer',
      T(ES_UIT, KLAAR_GEDEELD, false).whatsapp === true && T(ES_UIT, BEZIG_GEDEELD, false).whatsapp === false && T(ES_UIT, null, false).whatsapp === null
      && T(ES_UIT, { klaar: false, ondersteund: false }, false).whatsapp === false, null);
    ck('wa-es-status onbereikbaar: valt terug op gedeeld, zonder eigen-nummerregel', T(null, KLAAR_GEDEELD, false).soort === 'gedeeld' && T(null, KLAAR_GEDEELD, false).eigenNr === null, null);
    ck('beschikbaar en nog niet gekoppeld: koppelbaar, eigen nummer = false (open, optioneel)', T(ES_AAN, KLAAR_GEDEELD, false).soort === 'koppelbaar' && T(ES_AAN, KLAAR_GEDEELD, false).eigenNr === false, null);
    ck('gekoppeld, sjablonen goedgekeurd: eigen + klaar, ook voor een niet-dealer',
      (() => { const t = T(ES_GEKOPPELD, { eigenNummer: true, klaar: true, eigenToestand: { onbekend: false, ingediend: 0, bezig: false } }, false); return t.soort === 'eigen' && t.sjablonen === 'klaar' && t.whatsapp === true && t.eigenNr === true; })(), null);
    ck('gekoppeld, sjablonen nog niet goedgekeurd: bezig; een niet-dealer is dan NIET klaar (hij hangt aan sjablonen), een dealer wel (koper begint)',
      (() => { const kl = { eigenNummer: true, klaar: false, eigenToestand: { onbekend: false, ingediend: 4, bezig: true } };
        return T(ES_GEKOPPELD, kl, false).sjablonen === 'bezig' && T(ES_GEKOPPELD, kl, false).whatsapp === false && T(ES_GEKOPPELD, kl, true).whatsapp === true && T(ES_GEKOPPELD, kl, true).eigenNr === true; })(), null);
    ck('gekoppeld maar sjablonen niet te lezen: onbekend (niet "bezig", niet "klaar")',
      T(ES_GEKOPPELD, { klaar: false, eigenToestand: { onbekend: true } }, false).sjablonen === 'onbekend' && T(ES_GEKOPPELD, null, false).sjablonen === 'onbekend' && T(ES_GEKOPPELD, null, false).whatsapp === null, null);
    ck('een eigen nummer dat al hangt blijft zichtbaar als Embedded Signup zelf uit staat', T({ beschikbaar: false, gekoppeld: true }, null, true).soort === 'eigen', null);

    /* — de kaart — */
    const kaart = async (es, kl, dealer, taal) => {
      const w = bouw({ taal: taal || 'nl', fetchAntwoord: (b) => ({ ok: true, json: async () => (b.mode === 'wa-es-status' ? es : (b.mode === 'wa-readiness' ? kl : {})) }) });
      for (const id of ['wiz-wa-badge', 'wiz-wa-uitleg', 'wiz-wa-extra', 'wiz-wa-knop', 'wiz-wa-eigen-knop']) w.els[id] = w.mkEl();
      await w.ctx.wizWaKaart(dealer);
      return w;
    };
    {
      const w = await kaart(ES_UIT, null, true);
      ck('niet beschikbaar (dealer): oude gedrag - uitleg + knop naar Instellingen, GEEN koppelknop',
        /AutoScout24/.test(w.els['wiz-wa-uitleg'].textContent) && w.els['wiz-wa-uitleg'].textContent.indexOf(i18n.t('nl', 'wiz.wa.dealer.geenEigen')) !== -1
        && w.els['wiz-wa-extra'].innerHTML === '' && w.els['wiz-wa-knop'].textContent === i18n.t('nl', 'wiz.wa.dealer.knop') && w.els['wiz-wa-badge'].textContent === i18n.t('nl', 'wiz.wa.dealer.badge')
        && w.ctx._wizStatus.whatsapp === true, w.els['wiz-wa-uitleg'].textContent);
      const wn = await kaart(ES_UIT, KLAAR_GEDEELD, false);
      ck('niet beschikbaar (andere markt): alleen de sjabloonstatus, geen koppelknop',
        wn.els['wiz-wa-badge'].textContent === i18n.t('nl', 'st.klaar') && wn.els['wiz-wa-extra'].innerHTML === '' && wn.ctx._wizStatus.whatsapp === true, wn.els['wiz-wa-badge'].textContent);
    }
    {
      const w = await kaart(ES_AAN, BEZIG_GEDEELD, false);
      const ex = w.els['wiz-wa-extra'].innerHTML;
      ck('beschikbaar, nog niet gekoppeld (andere markt): shared-status + waarom + primaire knop "Koppel je eigen WhatsApp-nummer"',
        w.els['wiz-wa-badge'].textContent === i18n.t('nl', 'wiz.wa.bezig') && ex.indexOf('wiz-wa-eigen-knop') !== -1 && ex.indexOf(i18n.t('nl', 'wiz.wa.eigen.knop')) !== -1
        && ex.indexOf('jouw bedrijfsnaam') !== -1 && /sms of oproep/.test(ex) && typeof w.els['wiz-wa-eigen-knop'].onclick === 'function'
        && w.ctx._wizStatus.whatsapp === false && w.ctx._wizStatus.eigenNr === false, ex);
      const wd = await kaart(ES_AAN, null, true);
      const exd = wd.els['wiz-wa-extra'].innerHTML;
      ck('beschikbaar (dealer): kopers starten zelf (werkt vandaag al), eigen nummer aanbevolen maar niet verplicht, met koppelknop',
        wd.els['wiz-wa-badge'].textContent === i18n.t('nl', 'wiz.wa.dealer.badge') && /niet verplicht/.test(wd.els['wiz-wa-uitleg'].textContent) && /AutoScout24/.test(wd.els['wiz-wa-uitleg'].textContent)
        && exd.indexOf('wiz-wa-eigen-knop') !== -1 && wd.ctx._wizStatus.whatsapp === true, wd.els['wiz-wa-uitleg'].textContent);
      ck('de kaart verstuurt niets behalve de twee leesaanvragen (wa-es-status, wa-readiness)',
        wd.log.fetch.map((f) => f.body.mode).sort().join() === 'wa-es-status,wa-readiness', wd.log.fetch.map((f) => f.body.mode));
    }
    {
      const wg = await kaart(ES_GEKOPPELD, { eigenNummer: true, klaar: false, eigenToestand: { onbekend: false, ingediend: 4, bezig: true } }, false);
      ck('gekoppeld, sjablonen in behandeling: badge, nummer + naam, eerlijke tekst zonder tijdsbelofte, geen koppelknop',
        wg.els['wiz-wa-badge'].textContent === i18n.t('nl', 'wiz.wa.eigen.badge') && /\+32 470 12 34 56/.test(wg.els['wiz-wa-uitleg'].textContent) && /Garage Teljo/.test(wg.els['wiz-wa-uitleg'].textContent)
        && wg.els['wiz-wa-extra'].innerHTML.indexOf(i18n.t('nl', 'wiz.wa.sjab.bezig')) !== -1 && !/wiz-wa-eigen-knop/.test(wg.els['wiz-wa-extra'].innerHTML)
        && TALEN.every((t) => !/72|paar uur|few hours|quelques heures|Stunden: |minutes|minuten|Minuten/.test(i18n.t(t, 'wiz.wa.sjab.bezig'))) && wg.ctx._wizStatus.whatsapp === false && wg.ctx._wizStatus.eigenNr === true, wg.els['wiz-wa-extra'].innerHTML);
      const wk = await kaart(ES_GEKOPPELD, { eigenNummer: true, klaar: true, eigenToestand: { onbekend: false, ingediend: 0, bezig: false } }, false);
      ck('gekoppeld, sjablonen goedgekeurd: zegt dat ze goedgekeurd zijn, WhatsApp klaar',
        wk.els['wiz-wa-extra'].innerHTML.indexOf(i18n.t('nl', 'wiz.wa.sjab.klaar')) !== -1 && wk.ctx._wizStatus.whatsapp === true, null);
      const wo = await kaart(ES_GEKOPPELD, { eigenNummer: true, klaar: false }, false);
      ck('gekoppeld, sjablonen niet te lezen: eerlijk onbekend', wo.els['wiz-wa-extra'].innerHTML.indexOf(i18n.t('nl', 'wiz.wa.sjab.onbekend')) !== -1 && wo.ctx._wizStatus.whatsapp === null, null);
      const wx = await kaart({ beschikbaar: true, gekoppeld: true, nummer: { number: '', name: '<img src=x onerror=alert(1)>' } }, null, true);
      ck('tekst van de server wordt niet als HTML getekend (naam met <img>) en een ontbrekend nummer geeft de zin zonder nummer',
        wx.els['wiz-wa-uitleg'].textContent.indexOf('<img') !== -1 && wx.els['wiz-wa-uitleg'].textContent.indexOf(i18n.t('nl', 'wiz.wa.eigen.opGeen')) === 0
        && wx.els['wiz-wa-extra'].innerHTML.indexOf('<img') === -1, wx.els['wiz-wa-uitleg'].textContent);
    }

    /* — de gedeelde kern — */
    const FB_OK = (log, gebeurtenis) => ({ login: (cb, opts) => {
      log.loginOpts = opts;
      cb({ authResponse: { code: 'code-uit-meta' } });
      log.listeners.forEach((f) => f({ origin: gebeurtenis.origin || 'https://www.facebook.com', data: JSON.stringify(gebeurtenis.data) }));
    } });
    const FINISH = { data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123456789', phone_number_id: '987654321' } } };
    const kern = async (gebeurtenis, fetchAntwoord) => {
      const log0 = { listeners: [] };
      const w = bouw({ fetchAntwoord });
      w.ctx.window.FB = FB_OK(w.log, gebeurtenis);
      const r = await w.ctx.waesKern(ES_AAN);
      return { r: kloon(r), w };
    };
    {
      const a = await kern(FINISH);
      const f = a.w.log.fetch[0];
      ck('kern: popup met config_id, response_type code en sessionInfoVersion 3', a.w.log.loginOpts && a.w.log.loginOpts.config_id === '222' && a.w.log.loginOpts.response_type === 'code' && a.w.log.loginOpts.extras.sessionInfoVersion === '3', a.w.log.loginOpts);
      ck('kern: een geslaagde koppeling geeft {ok:true} en doet precies een wa-es-complete met code + id\'s, zonder projectcode',
        a.r.ok === true && a.w.log.fetch.length === 1 && f.body.mode === 'wa-es-complete' && f.body.code === 'code-uit-meta' && f.body.wabaId === '123456789' && f.body.phoneNumberId === '987654321'
        && Object.keys(f.body).sort().join() === 'code,mode,phoneNumberId,wabaId', f && f.body);
      const c = await kern({ data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: {} } });
      ck('kern: annuleren in de popup geeft {cancelled:true} en roept de server niet aan', c.r.cancelled === true && c.w.log.fetch.length === 0, c.r);
      const o = await kern({ origin: 'https://evil.example', data: FINISH.data });
      ck('kern: een message van een vreemde origin wordt genegeerd (geeft cancelled, geen verzoek)', o.r.cancelled === true && o.w.log.fetch.length === 0, o.r);
      const e = await kern(FINISH, () => ({ ok: false, json: async () => ({ error: 'Het koppelen is niet afgerond.' }) }));
      ck('kern: een serverfout geeft {error:<zin van de server>}', e.r.error === 'Het koppelen is niet afgerond.' && !e.r.ok, e.r);
      const g = await kern(FINISH, () => { throw new Error('netwerk'); });
      ck('kern: een netwerkfout gooit niet maar geeft {error:""}', g.r.error === '' && !g.r.ok, g.r);
      const u = bouw(); const r0 = await u.ctx.waesKern({ beschikbaar: false });
      ck('kern: zonder beschikbaar doet hij niets', r0.error === '' && u.log.fetch.length === 0, null);
    }

    /* — de knop op de kaart gebruikt die kern, en tekent daarna opnieuw — */
    {
      let gekoppeld = false;
      const w = bouw({ fetchAntwoord: (b) => ({ ok: true, json: async () => {
        if (b.mode === 'wa-es-complete') { gekoppeld = true; return { ok: true }; }
        if (b.mode === 'wa-es-status') return gekoppeld ? ES_GEKOPPELD : ES_AAN;
        if (b.mode === 'wa-readiness') return gekoppeld ? { eigenNummer: true, klaar: false, eigenToestand: { onbekend: false, ingediend: 4, bezig: true } } : KLAAR_GEDEELD;
        return {};
      } }) });
      for (const id of ['wiz-wa-badge', 'wiz-wa-uitleg', 'wiz-wa-extra', 'wiz-wa-knop', 'wiz-wa-eigen-knop']) w.els[id] = w.mkEl();
      w.ctx.window.FB = FB_OK(w.log, FINISH);
      await w.ctx.wizWaKaart(false);
      await w.els['wiz-wa-eigen-knop'].onclick();
      ck('klik op de wizardknop: wa-es-complete via de kern, melding "Gekoppeld", en de kaart toont daarna het eigen nummer',
        w.log.fetch.some((f) => f.body.mode === 'wa-es-complete') && w.log.toast.some((t) => t[0] === 'success' && t[1] === i18n.t('nl', 'set.waes.done'))
        && w.els['wiz-wa-badge'].textContent === i18n.t('nl', 'wiz.wa.eigen.badge') && w.ctx._wizStatus.eigenNr === true, [w.log.toast, w.els['wiz-wa-badge'].textContent]);
      const w2 = bouw({ fetchAntwoord: (b) => ({ ok: true, json: async () => (b.mode === 'wa-es-status' ? ES_AAN : KLAAR_GEDEELD) }) });
      for (const id of ['wiz-wa-badge', 'wiz-wa-uitleg', 'wiz-wa-extra', 'wiz-wa-knop', 'wiz-wa-eigen-knop']) w2.els[id] = w2.mkEl();
      w2.ctx.window.FB = FB_OK(w2.log, { data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: {} } });
      await w2.ctx.wizWaKaart(false);
      await w2.els['wiz-wa-eigen-knop'].onclick();
      ck('annuleren in de wizard: melding, knop weer vrij, niets opgeslagen', w2.log.toast.some((t) => t[0] === 'info' && t[1] === i18n.t('nl', 'set.waes.cancelled'))
        && w2.els['wiz-wa-eigen-knop'].disabled === false && !w2.log.fetch.some((f) => f.body.mode === 'wa-es-complete'), w2.log.toast);
    }

    /* — Klaar: WhatsApp, eigen nummer, Meta-catalogus — */
    console.log('\n— Klaar: WhatsApp, eigen nummer en Meta-catalogus —');
    {
      const rijenVan = (w, dealer) => (w.ctx.wizKlaarHtml(dealer, '', 'v').match(/data-wiz-rij="([a-z]+)"/g) || []).map((x) => x.slice(14, -1));
      const rij = (w, dealer, id) => (w.ctx.wizKlaarHtml(dealer, '', 'v').match(new RegExp('<li class="wiz-klaar-rij" data-wiz-rij="' + id + '">[\\s\\S]*?</li>')) || [''])[0];
      const w = bouw();
      w.ctx.wizKlaarWhatsApp(ES_AAN, KLAAR_GEDEELD, true);
      w.run("_wizStatus.meta = false;");
      ck('dealer, eigen nummer mogelijk maar niet gekoppeld: WhatsApp klaar, eigen-nummerregel open + optioneel met knop naar kanalen, Meta-regel open + optioneel',
        rijenVan(w, true).join() === 'whatsapp,eigennr,alerts,uren,agenda,voorraad,meta,email,website' && /data-wiz-fix="eigennr"/.test(rij(w, true, 'eigennr')) && /wiz-optioneel/.test(rij(w, true, 'eigennr'))
        && /data-wiz-fix="meta"/.test(rij(w, true, 'meta')) && /wiz-optioneel/.test(rij(w, true, 'meta')) && !/data-wiz-fix="whatsapp"/.test(rij(w, true, 'whatsapp')), rijenVan(w, true));
      ck('de optionele regels tellen niet mee in "Nog open"', !/data-wiz-fix="eigennr"[\s\S]*Nog open: [5-9]/.test(w.ctx.wizKlaarHtml(true, '', 'v')), null);
      w.ctx.wizKlaarWhatsApp(ES_GEKOPPELD, { eigenNummer: true, klaar: true, eigenToestand: { onbekend: false, ingediend: 0, bezig: false } }, true);
      ck('dealer met eigen nummer: de eigen-nummerregel is klaar (geen knop)', !/data-wiz-fix="eigennr"/.test(rij(w, true, 'eigennr')) && /is-aan/.test(rij(w, true, 'eigennr')), null);
      w.run("_wizStatus.meta = true;");
      ck('Meta-catalogus actief: regel klaar, geen knop', !/data-wiz-fix="meta"/.test(rij(w, true, 'meta')) && /is-aan/.test(rij(w, true, 'meta')), null);

      const wn = bouw();
      wn.ctx.wizKlaarWhatsApp(ES_UIT, BEZIG_GEDEELD, false);
      ck('andere markt, gedeeld nummer, sjablonen bezig: WhatsApp-regel open (knop), geen eigen-nummerregel en geen Meta-regel',
        rijenVan(wn, false).join() === 'whatsapp,alerts,uren,agenda,email,website' && /data-wiz-fix="whatsapp"/.test(rij(wn, false, 'whatsapp')), rijenVan(wn, false));
      wn.ctx.wizKlaarWhatsApp(ES_AAN, KLAAR_GEDEELD, false);
      ck('andere markt, gedeeld nummer klaar en eigen nummer mogelijk: WhatsApp klaar, eigen-nummerregel optioneel open, nog steeds geen Meta-regel',
        !/data-wiz-fix="whatsapp"/.test(rij(wn, false, 'whatsapp')) && /data-wiz-fix="eigennr"/.test(rij(wn, false, 'eigennr')) && !/data-wiz-rij="meta"/.test(wn.ctx.wizKlaarHtml(false, '', 'v')), rijenVan(wn, false));
      const wo = bouw();
      wo.ctx.wizKlaarWhatsApp(null, null, false);
      ck('niets op te halen: WhatsApp "nog niet gecontroleerd", geen eigen-nummerregel', rij(wo, false, 'whatsapp').indexOf(i18n.t('nl', 'wiz.klaar.onbekend')) !== -1 && !/data-wiz-rij="eigennr"/.test(wo.ctx.wizKlaarHtml(false, '', 'v')), null);
    }

    /* — Meta-catalogus en voorraadbronnen op de stap koppelingen — */
    console.log('\n— koppelingen: Meta-catalogus en voorraadbronnen —');
    {
      const prov = (p) => ({ ok: true, providers: [{ id: 'feed', auth: 'feed_url' }, Object.assign({ id: 'meta', auth: 'catalog_feed', geconfigureerd: false, meta: { ontbreekt: ['addr1', 'postalCode'] } }, p || {})] });
      const w0m = bouw();
      ck('wizMetaToestand: ontbrekende velden, actief met telling, geen antwoord',
        w0m.ctx.wizMetaToestand(prov()).aan === false && w0m.ctx.wizMetaToestand(prov()).mist.join() === 'addr1,postalCode'
        && w0m.ctx.wizMetaToestand(prov({ geconfigureerd: true, feedTelling: { inFeed: 12 } })).inFeed === 12 && w0m.ctx.wizMetaToestand(null) === null && w0m.ctx.wizMetaToestand({ ok: true, providers: [] }) === null, null);
      const kaartMeta = async (antwoord) => {
        const w = bouw({ fetchAntwoord: () => ({ ok: antwoord !== null, json: async () => antwoord }) });
        for (const id of ['wiz-meta-badge', 'wiz-meta-uitleg', 'wiz-meta-knop']) w.els[id] = w.mkEl();
        await w.ctx.wizMetaStatus();
        return w;
      };
      const wa = await kaartMeta(prov());
      ck('Meta nog niet klaar: "Nog in te stellen", noemt wat ontbreekt (straat en nummer, postcode), knop naar Instellingen → Integraties',
        wa.els['wiz-meta-badge'].textContent === i18n.t('nl', 'ig.status.TE_DOEN') && /straat en nummer, postcode/.test(wa.els['wiz-meta-uitleg'].textContent)
        && wa.els['wiz-meta-knop'].textContent === i18n.t('nl', 'wiz.meta.knop') && wa.ctx._wizStatus.meta === false, wa.els['wiz-meta-uitleg'].textContent);
      wa.els['set-integraties'] = wa.mkEl(); wa.els['wiz-meta-knop'].onclick();
      ck('en die knop sluit de wizard en gaat naar Instellingen', wa.log.sluit === 1 && wa.log.nav.join() === 'instellingen', wa.log.nav);
      const wb = await kaartMeta(prov({ geconfigureerd: true, feedTelling: { inFeed: 12, weggelaten: 3 } }));
      ck('Meta klaar: "Actief" en het aantal wagens in de feed', wb.els['wiz-meta-badge'].textContent === i18n.t('nl', 'ig.status.ACTIVE') && /12/.test(wb.els['wiz-meta-uitleg'].textContent) && wb.ctx._wizStatus.meta === true, wb.els['wiz-meta-uitleg'].textContent);
      const wl = await kaartMeta(prov({ geconfigureerd: true, feedTelling: { inFeed: 0, weggelaten: 2 } }));
      ck('Meta klaar maar nog geen wagen in de feed: zegt dat eerlijk', wl.els['wiz-meta-uitleg'].textContent === i18n.t('nl', 'wiz.meta.aanLeeg'), null);
      const wf = await kaartMeta(null);
      ck('status niet op te halen: "nog niet gecontroleerd", niet "klaar", en _wizStatus.meta = null', wf.els['wiz-meta-badge'].textContent === i18n.t('nl', 'wiz.klaar.onbekend') && wf.ctx._wizStatus.meta === null, null);
      ck('de Meta-kaart doet alleen een leesaanvraag (inventory-providers)', wa.log.fetch.length === 1 && wa.log.fetch[0].body.mode === 'inventory-providers', wa.log.fetch.map((f) => f.body.mode));

      ck('voorraadkaart: aantal bronnen (0 = niets, 1, meerdere); publiceerkanalen (Meta) tellen niet mee',
        w0m.ctx.wizVoorraadBronnenTekst({ bronnen: [] }) === '' && w0m.ctx.wizVoorraadBronnenTekst({}) === ''
        && w0m.ctx.wizVoorraadBronnenTekst({ bronnen: [{ id: 'feed' }] }) === i18n.t('nl', 'wiz.voorraad.bronnenAantal.een')
        && w0m.ctx.wizVoorraadBronnenTekst({ bronnen: [{ id: 'feed' }, { id: 'autoscout24' }, { id: 'meta', alleenPubliceren: true }] }) === '2 bronnen gekoppeld', null);
      const wd = bouw(); wd.els['wiz-mail-extra'] = wd.mkEl(); wd.ctx.wizMailDealerZin();
      ck('e-mailkaart (dealer): noemt precies de platformen uit platformlead.js, en is geen belofte zonder voorbehoud',
        ['AutoScout24', '2dehands', '2ememain', 'Marktplaats', 'mobile.de'].every((x) => wd.els['wiz-mail-extra'].innerHTML.indexOf(x) !== -1) && /zodra die in je voorraad staat/.test(wd.els['wiz-mail-extra'].innerHTML), null);
      const PLAT = require('../api/_email/platformlead.js');
      const bronnen = (PLAT.PLATFORMEN || []).map((p) => p.bron);
      ck('de platformen in de zin komen overeen met PLATFORMEN (' + bronnen.join(', ') + ')',
        bronnen.length === 5 && TALEN.every((t) => bronnen.every((b) => i18n.t(t, 'wiz.mail.dealer').indexOf(b === '2dehands' ? '2dehands' : b === '2ememain' ? '2ememain' : b) !== -1)), bronnen);
    }

    /* — vier talen — */
    console.log('\n— WhatsApp/Meta-wizard: vier talen en geen verouderde tekst —');
    {
      const bron = modulWa.js() + modul.js();
      const sleutels = new Set((bron.match(/tr\('((?:wiz|set\.waes|ig\.status|ig\.meta\.mist)\.[A-Za-z.]+)'/g) || []).map((x) => x.slice(4, -1)).filter((k) => !/\.$/.test(k)));
      ['wiz.wa.sjab.klaar', 'wiz.wa.sjab.bezig', 'wiz.wa.sjab.onbekend', 'wiz.voorraad.bronnenAantal', 'wiz.voorraad.bronnenAantal.een', 'wiz.wa.dealer', 'wiz.wa.dealer.badge', 'wiz.wa.dealer.knop',
        'ig.meta.mist.addr1', 'ig.meta.mist.city', 'ig.meta.mist.region', 'ig.meta.mist.postalCode', 'ig.meta.mist.lat', 'ig.meta.mist.lng', 'wiz.klaar.rij.eigenNr', 'wiz.klaar.rij.meta'].forEach((k) => sleutels.add(k));
      const ontbreekt = [], gelijk = [], vars = [];
      const pl = (x) => (x.match(/\{[a-z]+\}/g) || []).sort().join(',');
      for (const k of sleutels) {
        for (const t of TALEN) { const v = i18n.t(t, k); if (typeof v !== 'string' || !v.length || v === k) ontbreekt.push(t + ':' + k); }
        if (TALEN.some((t) => pl(i18n.t(t, k)) !== pl(i18n.t('nl', k)))) vars.push(k);
        if (/^wiz\.(wa|meta|mail\.dealer|voorraad\.bronnenAantal|klaar\.rij\.(eigenNr|meta))/.test(k) && (i18n.t('fr', k) === i18n.t('nl', k) || i18n.t('de', k) === i18n.t('nl', k))) gelijk.push(k);
      }
      ck('elke sleutel van de WhatsApp-module bestaat in nl, fr, en, de (' + sleutels.size + ')', ontbreekt.length === 0, ontbreekt);
      ck('plaatshouders zijn in elke taal dezelfde', vars.length === 0, vars);
      ck('fr en de zijn echt vertaald (niet gekopieerd uit nl)', gelijk.length === 0, gelijk);
      const nieuw = ['wiz.wa.dealer', 'wiz.wa.dealer.geenEigen', 'wiz.wa.eigen.waarom', 'wiz.wa.eigen.later', 'wiz.wa.eigen.knop', 'wiz.wa.eigen.badge', 'wiz.wa.eigen.op', 'wiz.wa.eigen.opGeen',
        'wiz.wa.sjab.klaar', 'wiz.wa.sjab.bezig', 'wiz.wa.sjab.onbekend', 'wiz.mail.dealer', 'wiz.voorraad.bronnenAantal', 'wiz.voorraad.bronnenAantal.een', 'wiz.meta.t', 'wiz.meta.uit', 'wiz.meta.mist',
        'wiz.meta.aan', 'wiz.meta.aanLeeg', 'wiz.meta.aanZonder', 'wiz.meta.knop', 'wiz.klaar.rij.eigenNr', 'wiz.klaar.rij.meta'];
      ck('alle nieuwe sleutels bestaan in vier talen', nieuw.every((k) => TALEN.every((t) => i18n.t(t, k) && i18n.t(t, k) !== k)), nieuw.filter((k) => TALEN.some((t) => !i18n.t(t, k) || i18n.t(t, k) === k)));
      const VEROUDERD = /zodra (dat |het )?(voor jouw account )?(beschikbaar|kan)|dat voor jouw account|once (it is|that is|it.s) available|dès que c.est disponible|sobald das für .{0,20}verfügbar|noch nicht beschikbaar|not yet available/i;
      const alle = [];
      for (const t of TALEN) for (const k of ['wiz.wa.dealer', 'wiz.wa.dealer.geenEigen', 'wiz.wa.dealer.badge', 'wiz.wa.dealer.knop', 'wiz.wa.klaarSub', 'wiz.wa.bezigSub', 'wiz.kan.s', 'wiz.gids.kanalen', 'set.waes.sub', 'set.waes.sub.gekoppeld', 'set.waes.title', 'chk.whatsapp.sub']) alle.push([t + ':' + k, i18n.t(t, k)]);
      ck('geen "zodra dat voor jouw account beschikbaar is"-tekst meer in de WhatsApp-teksten (4 talen)', alle.every(([k, v]) => !VEROUDERD.test(v)), alle.filter(([k, v]) => VEROUDERD.test(v)).map((x) => x[0]));
      const help = fs.readFileSync(path.join(ROOT, 'api/_dash/help.js'), 'utf8');
      ck('geen helpartikel zegt nog dat een eigen nummer niet kan', !/(eigen|own|propre|eigene)[^.<]{0,60}(nog niet|not yet|pas encore|noch nicht|binnenkort|coming soon)/i.test(help), null);
      ck('de oude opmerking "nog nergens aangesloten / geen knop" staat niet meer in dashboard.js', !/is compleet maar nergens aangesloten/.test(lees('api/dashboard.js')), null);
    }
  }

  console.log(`\n  ${pass} geslaagd, ${fail} gefaald\n`);
  process.exit(fail ? 1 : 0);
}
