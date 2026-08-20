/*
 * Vrije tijden in het boekingsvenster.
 *
 * De regel uit CLAUDE.md: NOOIT een slot tonen als vrij zonder dat de agenda
 * dat bevestigt. Dat ging hier mis. api/leads.js stuurt bij
 * 'appointments-list' twee dingen terug -- Helvaro's eigen afspraken EN de
 * echte Google-agenda van de klant (externalEvents) -- maar het venster
 * "Afspraak inplannen" las alleen het eerste. Gevolg: op hetzelfde scherm
 * stond in het raster een vergadering van de klant, en bood het venster dat
 * halfuur aan als vrij. De makelaar boekte over zijn eigen agenda heen.
 *
 * De code zit in de sjabloonliteral van api/dashboard.js, dus die is hier niet
 * los aan te roepen. Wat deze test wél kan: de functie eruit knippen en hem
 * met een eigen fetch draaien. Zo wordt het ECHTE gedrag gemeten en niet
 * alleen of er een woord in de bron staat.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');

/* ── De functie uit het sjabloon halen ────────────────────────────────────── */
const start = bron.indexOf('async function fetchCalSlots()');
const eind  = bron.indexOf('function calBookSelectSlot(', start);
if (start === -1 || eind === -1) {
  console.log('  FOUT  fetchCalSlots niet gevonden in api/dashboard.js');
  process.exit(1);
}
/* Binnen het sjabloon staat elke backtick en elke ${ } geëscaped. Terugdraaien
   levert de JavaScript op die de browser echt krijgt. */
const kaal = bron.slice(start, eind)
  .replace(/\\`/g, '`')
  .replace(/\\\$\{/g, '${')
  .replace(/\\\\/g, '\\');

/* ── Een omgeving waarin die functie kan draaien ──────────────────────────── */
function maakOmgeving({ appointments = [], externalEvents = [], nu }) {
  const gerenderd = [];
  const omgeving = {
    API_BASE: '/api',
    state: { apiKey: 'x', workHoursLoaded: true, workHours: { startHour: 9, endHour: 18 } },
    calBookState: { date: nu.toISOString().slice(0, 10), slots: [], loading: false, selectedSlot: null },
    renderCalBookBody() { gerenderd.push(this.calBookState.slots.length); },
    applyWorkHours() {},
    console: { error() {}, warn() {} },
    async fetch() {
      return { ok: true, json: async () => ({ appointments, externalEvents }) };
    },
  };
  const fn = new Function(
    'API_BASE', 'state', 'calBookState', 'renderCalBookBody', 'applyWorkHours', 'console', 'fetch',
    kaal + '; return fetchCalSlots;'
  )(omgeving.API_BASE, omgeving.state, omgeving.calBookState, omgeving.renderCalBookBody.bind(omgeving),
    omgeving.applyWorkHours, omgeving.console, omgeving.fetch);
  return { fn, omgeving };
}

function urenVan(slots) {
  return slots.map((s) => {
    const d = new Date(s.startTime);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  });
}

/* Een dag in de toekomst, zodat "in het verleden" nooit meespeelt en de test
   niet afhangt van het uur waarop hij draait. */
const MORGEN = new Date(Date.now() + 24 * 60 * 60 * 1000);
const DAG = MORGEN.toISOString().slice(0, 10);
function opUur(u, m = 0) {
  const d = new Date(DAG + 'T00:00:00');
  d.setHours(u, m, 0, 0);
  return d.toISOString();
}

(async () => {
  console.log('\n— een afspraak in de Google-agenda blokkeert het slot —');
  {
    const { fn, omgeving } = maakOmgeving({
      nu: MORGEN,
      externalEvents: [{ id: 'g1', title: 'Bezichtiging', start: opUur(14), end: opUur(15) }],
    });
    await fn();
    const uren = urenVan(omgeving.calBookState.slots);
    ck('14:00 wordt niet aangeboden', uren.indexOf('14:00') === -1, uren);
    ck('14:30 wordt niet aangeboden (zelfde afspraak)', uren.indexOf('14:30') === -1, uren);
    ck('15:00 wordt wel aangeboden (afspraak is voorbij)', uren.indexOf('15:00') !== -1, uren);
    ck('13:30 wordt wel aangeboden (ervoor)', uren.indexOf('13:30') !== -1, uren);
  }

  console.log('\n— een dagvullend item zet de dag niet dicht —');
  {
    /* "Verlof" of een verjaardag is geen bezet halfuur. Zou dit wel tellen,
       dan kreeg de makelaar bij elke verjaardag in zijn agenda een lege dag
       te zien -- en dat is precies het soort fout dat op een storing lijkt. */
    const { fn, omgeving } = maakOmgeving({
      nu: MORGEN,
      externalEvents: [{ id: 'g2', title: 'Verlof', start: opUur(0), end: opUur(23, 59), allDay: true }],
    });
    await fn();
    ck('er blijven tijden over', omgeving.calBookState.slots.length > 0,
       omgeving.calBookState.slots.length);
  }

  console.log('\n— Helvaro\'s eigen afspraken blijven blokkeren —');
  {
    const { fn, omgeving } = maakOmgeving({
      nu: MORGEN,
      appointments: [{ fields: { 'Start Time': opUur(10), Duration: '60' } }],
    });
    await fn();
    const uren = urenVan(omgeving.calBookState.slots);
    ck('10:00 geblokkeerd', uren.indexOf('10:00') === -1, uren);
    ck('10:30 geblokkeerd (duurt 60 minuten)', uren.indexOf('10:30') === -1, uren);
    ck('11:00 weer vrij', uren.indexOf('11:00') !== -1, uren);
  }

  console.log('\n— allebei tegelijk, want zo ziet een echte week eruit —');
  {
    const { fn, omgeving } = maakOmgeving({
      nu: MORGEN,
      appointments: [{ fields: { 'Start Time': opUur(9), Duration: '30' } }],
      externalEvents: [{ id: 'g3', title: 'Lunch', start: opUur(12), end: opUur(13) }],
    });
    await fn();
    const uren = urenVan(omgeving.calBookState.slots);
    ck('09:00 geblokkeerd door Helvaro', uren.indexOf('09:00') === -1, uren);
    ck('12:00 geblokkeerd door Google', uren.indexOf('12:00') === -1, uren);
    ck('09:30 vrij', uren.indexOf('09:30') !== -1, uren);
  }

  console.log('\n— kapotte tijden laten de lijst niet omvallen —');
  {
    /* Google geeft bij een dagvullend item soms alleen een datum, en bij een
       storing soms onzin. Dat mag hooguit dat ene item kosten. */
    const { fn, omgeving } = maakOmgeving({
      nu: MORGEN,
      externalEvents: [
        { id: 'g4', title: 'Kapot', start: 'niet-een-datum', end: 'ook-niet' },
        { id: 'g5', title: 'Echt', start: opUur(16), end: opUur(16, 30) },
      ],
    });
    await fn();
    const uren = urenVan(omgeving.calBookState.slots);
    ck('de dag valt niet leeg', omgeving.calBookState.slots.length > 0, uren);
    ck('het geldige item blokkeert nog steeds', uren.indexOf('16:00') === -1, uren);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
