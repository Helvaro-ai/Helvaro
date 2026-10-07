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
  const log = { bewaard: [], sluit: 0, nav: [], fetch: [], scroll: [], ga: [] };
  const els = {};
  const mkEl = (p) => Object.assign({
    value: '', textContent: '', className: '', disabled: false, hidden: false, innerHTML: '',
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
      return opt.fetchAntwoord ? opt.fetchAntwoord() : { ok: true, json: async () => ({ ok: true, sentTo: '32470123456', via: 'vrij' }) };
    },
    navigateTo: (p) => log.nav.push(p),
    wizardSluit: () => { log.sluit++; },
    wizardBewaar: async (v) => { if (opt.bewaarFout) throw new Error('mis'); log.bewaard.push(v); return {}; },
    wizKnop: () => {},
  });
  vm.runInContext(
    "var WIZARD_STAPPEN = ['intro','regio','markt','bedrijf','ai','meldingen','kanalen','koppelingen','klaar'];"
    + 'var _wizardStap = 0;'
    + 'var _wizardConfig = ' + JSON.stringify(opt.config === undefined ? { country: 'BE', language: taal } : opt.config) + ';'
    + "var _wizStatus = { whatsapp: null, email: null, website: null, agenda: null, voorraad: null };"
    + 'function wizardGa(d) { var doel = _wizardStap + d; if (doel < 0 || doel >= WIZARD_STAPPEN.length) return; _wizardStap = doel; __ga.push(doel); }'
    + 'var __ga = [];',
    ctx);
  vm.runInContext(modul.js(), ctx);
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
  ck('de dealer-WhatsApp-uitleg staat nog in de dealer-tak, met de knop erbij',
    /isDealer\(\)\) \{[\s\S]{0,400}wiz\.wa\.dealer[\s\S]{0,300}wizWaDealerKnop\(\);[\s\S]{0,40}\} else \{[\s\S]{0,80}wizardWhatsAppStatus/.test(src), null);
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
        whatsapp: { stap: 'kanalen' }, alerts: { stap: 'meldingen' }, uren: { stap: 'meldingen' }, agenda: { stap: 'koppelingen' },
        voorraad: { sluit: 'panden' }, email: { stap: 'kanalen' }, website: { stap: 'kanalen' } }), kloon(w.ctx.WIZ_FIX));
    ck('elke doelstap bestaat in de stappenlijst', Object.values(kloon(w.ctx.WIZ_FIX)).every((d) => !d.stap || STAPPEN.indexOf(d.stap) !== -1), null);

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
    w.run("_wizStatus = { whatsapp: true, email: false, website: null, agenda: false, voorraad: true };");
    const h = w.ctx.wizKlaarHtml(true, 'https://app.helvaro.pro/start/X', 'volgende zin');
    const rijen = (h.match(/data-wiz-rij="([a-z]+)"/g) || []).map((x) => x.slice(14, -1));
    ck('dealer: zeven regels in de gevraagde volgorde', rijen.join() === 'whatsapp,alerts,uren,agenda,voorraad,email,website', rijen);
    const fix = (h.match(/data-wiz-fix="([a-z]+)"/g) || []).map((x) => x.slice(14, -1));
    ck('alleen open regels hebben een knop (agenda, e-mail, website)', fix.join() === 'agenda,email,website', fix);
    ck('elke knop heeft een naam voor schermlezers (actie + onderdeel)', (h.match(/<button type="button" class="wiz-kaart-knop wiz-klaar-fix" data-wiz-fix="[a-z]+" aria-label="[^"]{6,}">/g) || []).length === 3, null);
    ck('de status staat als tekst, niet alleen als kleur', /klaar<\/span>/.test(h) && /later<\/span>/.test(h) && /nog niet gecontroleerd<\/span>/.test(h), null);
    ck('klaar-regels tonen wat er staat (nummer, uren in leesbare vorm)', /Op \+32470123456/.test(h) && /ma-vr 9-18/.test(h), null);
    ck('"Nog open" telt alleen wat nodig is (agenda), niet de optionele regels', /Nog open: 1\./.test(h), h.match(/Nog open[^<]*/));
    ck('het testbericht-blok staat erin, met knop en live-regio',
      /id="wizard-test-knop"/.test(h) && /id="wizard-test-uit"[^>]*role="status"[^>]*aria-live="polite"/.test(h), null);

    w.run("_wizStatus = { whatsapp: true, email: true, website: true, agenda: true, voorraad: true };");
    const h2 = w.ctx.wizKlaarHtml(true, '', 'v');
    ck('alles groen: geen knoppen en de zin zegt dat alles klaarstaat', !/data-wiz-fix=/.test(h2) && /Alles wat nodig is staat klaar/.test(h2), null);

    const w3 = bouw({ taal: 'nl', config: { country: 'BE', language: 'nl', notifyPhone: '+32470123456', waAlertOff: true, workingHours: '' } });
    w3.run("_wizStatus = { whatsapp: true, email: true, website: true, agenda: true, voorraad: null };");
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

  console.log(`\n  ${pass} geslaagd, ${fail} gefaald\n`);
  process.exit(fail ? 1 : 0);
}
