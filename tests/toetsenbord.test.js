/*
 * Klikbaar zonder muis.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * Zeventien renderfuncties zetten onclick op een <div>, <tr> of <li>. Die
 * elementen zijn niet focusbaar, dus met Tab kwam je er nooit bij: een
 * pipelinekaart openen, een melding aanklikken, een zoekresultaat kiezen --
 * alleen met de muis.
 *
 * hvMakeActivatable() bestond al om dat op te lossen. Hij werd NERGENS
 * aangeroepen. Het mechanisme was er, de knop stond aan, de stekker zat er niet
 * in. Dat is de vervelendste soort dode code: bij een audit ziet het eruit
 * alsof het geregeld is.
 *
 * ── Waarom een observer en geen zeventien aanroepen ─────────────────────────
 * Zeventien aanroepen werken tot iemand de achttiende renderfunctie schrijft.
 * Dan is het weer stil kapot, en niemand merkt het, want wie een muis gebruikt
 * ziet nooit iets.
 *
 * ── Wat deze test WEL en NIET bewijst ───────────────────────────────────────
 * Dit project heeft geen jsdom en krijgt er voor deze ene test ook geen. De
 * DOM hieronder is nagebouwd: genoeg om de BESLISSINGEN te toetsen (wat krijgt
 * focus, wat krijgt welke rol, wat blijft met rust). Het bewijst niet dat een
 * echte browser de Enter-toets doorgeeft -- dat hangt aan de listener, en die
 * wordt hier alleen op aanwezigheid gecontroleerd.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

function pagina() {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return html;
}
const html = pagina();

/* ── Een minimale DOM ─────────────────────────────────────────────────────── */
function El(tag, attrs, kinderen) {
  const a = Object.assign({}, attrs || {});
  const kids = kinderen || [];
  const self = {
    tagName: tag.toUpperCase(),
    _attrs: a,
    kinderen: kids,
    hasAttribute: (k) => Object.prototype.hasOwnProperty.call(a, k),
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    matches(sel) { return sel === '[onclick]' ? this.hasAttribute('onclick') : false; },
    alles() {
      let uit = [];
      for (const k of kids) { uit.push(k); uit = uit.concat(k.alles()); }
      return uit;
    },
    querySelectorAll(sel) {
      const lijst = sel === '[onclick]'
        ? this.alles().filter((e) => e.hasAttribute('onclick'))
        : [];
      lijst.forEach = Array.prototype.forEach.bind(lijst);
      return lijst;
    },
    querySelector(sel) {
      const namen = sel.split(',').map((s) => s.trim());
      return this.alles().find((e) =>
        namen.some((n) => (n === '[onclick]' ? e.hasAttribute('onclick') : e.tagName === n.toUpperCase()))
      ) || null;
    },
  };
  return self;
}

function maakActivatable() {
  const m = html.match(/const HV_ZELF_INTERACTIEF[\s\S]*?\nfunction hvMakeActivatable\(root\) \{[\s\S]*?\n\}/);
  if (!m) return null;
  // eslint-disable-next-line no-new-func
  return new Function('document', m[0] + '; return hvMakeActivatable;')(
    { querySelector: () => null }
  );
}

console.log('\nKlikbaar zonder muis');

const act = maakActivatable();
ck('hvMakeActivatable staat in de uitgestuurde pagina', act !== null, null);

console.log('\n  wat focus krijgt');
{
  const kaal   = El('div', { onclick: 'x()' });
  const rij    = El('tr',  { onclick: 'x()' });
  const knop   = El('button', { onclick: 'x()' });
  const link   = El('a',   { onclick: 'x()', href: '#' });
  const invoer = El('input', { onclick: 'x()' });
  const stil   = El('div', {});
  const root = El('div', {}, [kaal, rij, knop, link, invoer, stil]);
  act(root);

  ck('een div met onclick wordt focusbaar', kaal.getAttribute('tabindex') === '0', kaal._attrs);
  ck('een tr met onclick ook',              rij.getAttribute('tabindex') === '0', rij._attrs);
  ck('een button blijft ongemoeid',         knop.getAttribute('tabindex') === null, knop._attrs);
  ck('een link blijft ongemoeid',           link.getAttribute('tabindex') === null, link._attrs);
  ck('een input blijft ongemoeid',          invoer.getAttribute('tabindex') === null, invoer._attrs);
  ck('iets zonder onclick blijft ongemoeid', stil.getAttribute('tabindex') === null, stil._attrs);
}

console.log('\n  een knop mag geen knoppen bevatten');
{
  /* De pipelinekaart: klikbaar, maar met eigen knoppen erin. role="button" op
     de kaart zou een schermlezer vertellen dat dit één knop is, en de knoppen
     erbinnen onbereikbaar maken in de knopmodus. */
  const binnenknop = El('button', {}, []);
  const kaart = El('div', { onclick: 'open()' }, [binnenknop]);
  const simpel = El('div', { onclick: 'open()' }, [El('span', {}, [])]);
  act(El('div', {}, [kaart, simpel]));

  ck('een kaart met een knop erin krijgt WEL focus', kaart.getAttribute('tabindex') === '0', kaart._attrs);
  ck('maar GEEN role="button"', kaart.getAttribute('role') === null, kaart._attrs);
  ck('en wel de toetsenbordmarkering', kaart.getAttribute('data-hv-act') === '1', kaart._attrs);
  ck('iets zonder interactieve inhoud krijgt wel role="button"',
    simpel.getAttribute('role') === 'button', simpel._attrs);
}

console.log('\n  het overschrijft niets van wat er al stond');
{
  const eigenIndex = El('div', { onclick: 'x()', tabindex: '-1' });
  const eigenRol   = El('div', { onclick: 'x()', role: 'link' });
  act(El('div', {}, [eigenIndex, eigenRol]));
  ck('een bestaande tabindex blijft staan', eigenIndex.getAttribute('tabindex') === '-1', eigenIndex._attrs);
  ck('een bestaande rol blijft staan',      eigenRol.getAttribute('role') === 'link', eigenRol._attrs);
}

console.log('\n  het is ook echt aangesloten');
ck('bindActivatable roept hvMakeActivatable aan bij het opstarten',
  /bindActivatable\(\) \{[\s\S]*?hvMakeActivatable\(document\);/.test(html), null);
ck('en kijkt naar wat er later bij komt',
  /new MutationObserver\([\s\S]{0,600}?\.observe\(document\.body/.test(html), null);
ck('en plant dat werk met een timer, niet met requestAnimationFrame',
  /setTimeout\(verwerk, 0\);/.test(html) && !/requestAnimationFrame\)\(verwerk/.test(html), null);
ck('de toetsafhandeling haakt aan data-hv-act, niet aan de rol',
  /\[data-hv-act="1"\]\[tabindex="0"\]/.test(html), null);
/* Deze controle keek eerst alleen of de aanroep ergens in de pagina stond.
   Dat stond hij -- in navigateTo(), die pas NA het inloggen draait. In de
   echte browser stond _activatableBound daardoor op false terwijl er 103
   klikbare elementen op het scherm stonden. Een aanwezige aanroep is geen
   uitgevoerde aanroep, dus de test eist nu de plek waar hij WEL loopt. */
ck('bindActivatable draait bij het opstarten, niet pas bij het navigeren',
  /hvStartActivatable[\s\S]{0,600}?bindActivatable\(\);/.test(html), null);
/* En niet BLIND op DOMContentLoaded: dit script staat onderaan de body, dus
   die gebeurtenis is meestal al geweest en de listener vuurt nooit. Dat was
   de tweede poging op deze bug, en de browser moest hem opnieuw aanwijzen. */
ck('met een terugval voor het geval de pagina al geladen is',
  /readyState === 'loading'[\s\S]{0,200}?else \{[\s\S]{0,60}?start\(\);/.test(html), null);
ck('en ook nog bij het navigeren, voor pagina\'s die later gemount worden',
  /aria-current[\s\S]{0,200}?bindActivatable\(\);/.test(html), null);

console.log('\n  het valt niet om');
{
  ck('een root zonder querySelectorAll doet niets vervelends',
    (function () { try { act({}); return true; } catch (e) { return false; } })(), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
