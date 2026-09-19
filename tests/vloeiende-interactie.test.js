'use strict';
/* De "fluid interface"-batch (Apple, Designing Fluid Interfaces, vertaald
   naar het web): kanban met Pointer Events + veren, zoeken zonder debounce,
   wegvegen van het leadpaneel, scrim die materialiseert, tekstschaal in rem
   (schaalt met de tekstgrootte van de gebruiker), en voorkeuren voor minder
   doorschijnendheid / meer contrast. Structurele bewaking; het gedrag zelf is
   met echte pointer-events in de harness nagemeten (drag.js / swipe.js). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
const css  = require('../api/_dash/styles.js').css();
let ok = 0; const ck = (n, c) => { assert.ok(c, n); ok++; };

// kanban
ck('kaarten slepen met Pointer Events, niet met HTML5 drag', dash.includes('onpointerdown="pipelinePointerDown(event)"') && !dash.includes('draggable="true" ondragstart="pipelineDragStart'));
ck('kolommen dragen hun fase als data-stage', dash.includes('data-stage="\\${col.id}"'));
ck('pointer capture + grab-offset', dash.includes('card.setPointerCapture(event.pointerId)') && dash.includes('grabX: event.clientX - rect.left'));
ck('hysterese van 6px voor het slepen begint', dash.includes('Math.abs(dx) < 6 && Math.abs(dy) < 6'));
ck('landingskolom uit de geprojecteerde eindpositie (Apple-projectie)', dash.includes('function pdProject(velocityPxPerS, decelerationRate)') && dash.includes('pdProject(v.x)'));
ck('veer met loslaatsnelheid; 0.8 na een gooi, 1.0 bij terugkeer', dash.includes('damping: thrown ? 0.8 : 1.0'));
ck('rubberband voorbij de bordrand', dash.includes('pdRubberband(over, b.width)'));
ck('reduced motion: geen veer', dash.includes('if (pdReducedMotion()) { finish(); return; }'));
ck('aanraking blijft tikken + scrollen (geen drag op touch)', dash.includes("event.pointerType === 'touch') return"));
ck('klik na een sleep wordt onderdrukt', dash.includes('_pdSuppressClick = true'));
ck('het verplaatsen zelf loopt nog via de bestaande optimistische update + rollback', dash.includes('async function pipelineMoveTo(leadId, newStage)') && dash.includes('Object.assign(lead, prev);'));

// latency
ck('zoeken filtert per toetsaanslag (geen 200 ms debounce meer)', !/debounce\(\(val\) => \{[\s\S]{0,120}\}, 200\)/.test(dash));

// panel
ck('leadpaneel: wegvegen naar rechts met snelheidsbeslissing', dash.includes('var dicht = v.x > 400 || (d.dx > d.w * 0.4 && v.x > -200);'));
ck('paneel: scrim materialiseert via opacity', /\.panel-backdrop \{[^}]*opacity: 0;[^}]*transition: opacity/.test(css) && css.includes('.panel-backdrop.visible { opacity: 1; pointer-events: auto; }'));
ck('paneel: pagina wijkt terug', css.includes('body.panel-open .main-content { transform: scale(0.985); }'));
ck('paneel: body-klasse bij openen en sluiten', dash.includes("document.body.classList.add('panel-open')") && dash.includes("document.body.classList.remove('panel-open')"));

// haptics
ck('haptische tik op succes/fout, zelfde frame als de toast', dash.includes("navigator.vibrate(type === 'error' ? [10, 30, 10] : 8)"));

// type scale
ck('root in %, niet in px (schaalt met tekstgrootte)', css.includes('html { font-size: 93.75%; }'));
ck('geen font-size in px meer', !/font-size:\s*[0-9.]+px/.test(css));
ck('letter-spacing in em', !/letter-spacing:\s*-?[0-9.]+px/.test(css));

// preferences
ck('prefers-reduced-transparency', css.includes('@media (prefers-reduced-transparency: reduce)'));
ck('prefers-contrast: more', css.includes('@media (prefers-contrast: more)'));
ck('geen cartoon-overshoot meer', !fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'ui', 'styles.js'), 'utf8').includes('1.56'));

console.log(`${ok} geslaagd, 0 gefaald`);
