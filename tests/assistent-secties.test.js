/*
 * De pagina "Je assistent" in vier secties (2026-10-03). Sindi: "way too long".
 * Indeling veranderd, inhoud niet: elk veld staat er nog precies één keer, met
 * hetzelfde id, zodat opslaan (saveAiPersona) alles blijft lezen.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
console.log('\nJe assistent: vier secties');
const VELDEN = ['ap-name', 'ap-template', 'ap-instructions', 'ap-learned', 'ap-website', 'ap-address', 'ap-calendly', 'ap-wa-alert',
  'ap-notify-phone', 'ap-notify-phones-extra', 'ap-report-email', 'ap-booking-in_chat', 'ap-booking-callback', 'ap-callback-window',
  'ap-lang-select', 'ap-match-lead-lang', 'ap-hours', 'ap-badges', 'ap-photo-file', 'ap-photo', 'ap-photo-url', 'ap-color', 'ap-color-pick', 'ap-form-intro', 'ap-save-btn'];
const mist = VELDEN.filter((id) => dash.split('id="' + id + '"').length - 1 !== 1);
ck('elk veld staat er precies één keer', mist.length === 0, mist);
const secties = ['gesprek', 'melding', 'bedrijf', 'formulier'];
ck('vier secties met elk een tab', secties.every((n) => dash.includes('id="ap-sectie-' + n + '"') && dash.includes('id="ap-sec-' + n + '"')));
const blok = (n) => { const a = dash.indexOf('id="ap-sectie-' + n + '"'); return dash.slice(a, dash.indexOf('</section>', a)); };
ck('naam, welkom, instructies en taal in Gesprek', ['ap-name', 'ap-template', 'ap-instructions', 'ap-lang-select'].every((id) => blok('gesprek').includes('id="' + id + '"')));
ck('meldingen en overdracht in Overdracht', ['ap-notify-phone', 'ap-report-email', 'ap-booking-in_chat'].every((id) => blok('melding').includes('id="' + id + '"')));
ck('website, adres en uren in Bedrijf', ['ap-website', 'ap-address', 'ap-hours'].every((id) => blok('bedrijf').includes('id="' + id + '"')));
ck('foto, kleur en formuliertekst in Uiterlijk', ['ap-badges', 'ap-photo-file', 'ap-color', 'ap-form-intro'].every((id) => blok('formulier').includes('id="' + id + '"')));
ck('opslaan staat buiten de secties (altijd zichtbaar)', dash.indexOf('id="ap-save-btn"') > dash.indexOf('</section>', dash.indexOf('id="ap-sectie-formulier"')));
ck('de inspiratie is inklapbaar', (dash.match(/<details class="ap-tpl-wrap">/g) || []).length === 2);
ck('de welkomstcontrole is vertaald', !/'Naam van je assistent'|'Website OF instructies'/.test(dash));
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
