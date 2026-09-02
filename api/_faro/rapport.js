'use strict';
/*
 * Faro's weekrapport.
 *
 * ── Wat dit is ───────────────────────────────────────────────────────────────
 * "Dit is wat er deze week gebeurde", in Faro's stem, over ECHTE records. Puur:
 * erin gaan de leads die api/_leads-read.js al gemapt heeft, eruit komt een
 * rapportobject. Geen netwerk, geen model, geen Airtable -- dus testbaar zonder
 * base en zonder credits.
 *
 * ── Waarom er geen AI aan te pas komt ────────────────────────────────────────
 * Een model is uitstekend in zelfverzekerd klinken over een patroon dat drie
 * leads breed is. Een drempel is dat niet. Elke zin hieronder is rekenwerk over
 * records die bestaan -- dezelfde afspraak die api/_command.js voor zichzelf
 * maakt, en om dezelfde reden.
 *
 * ── Wat hier NIET in staat ───────────────────────────────────────────────────
 * OPVOLGINGEN. De opdracht vroeg om "Follow-ups sent: 34" in het weekrapport.
 * Dat getal bestaat niet. api/cron-followup.js verstuurt ze wel, maar legt
 * alleen `Conversation State = 'in_progress'` vast, en datzelfde veld krijgt
 * dezelfde waarde wanneer de LEAD antwoordt. Uit het record is dus niet af te
 * leiden wie er iets deed. Een rapport dat het toch noemt, verzint een deel van
 * zijn eigen inhoud -- en dan is de rest ook niet meer te vertrouwen.
 *
 * Zelfde reden ontbreekt "human interventions": dat zou het aantal keren zijn
 * dat een mens het gesprek overnam, en dat wordt nergens geteld. `aiPaused`
 * zegt alleen dat de AI NU gepauzeerd is, niet hoe vaak dat gebeurde.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const DAG = 24 * 60 * 60 * 1000;

/* Een aanbeveling wordt pas gedaan als er genoeg onder ligt. Onder deze grens
   zwijgt het rapport liever: "je conversie daalde 50%" over twee leads is geen
   inzicht maar ruis, en één keer zo'n zin ondermijnt alle andere. */
const MIN_LEADS_VOOR_PATROON = 8;

function alsDatum(w) {
  if (!w) return null;
  const d = w instanceof Date ? w : new Date(w);
  return isNaN(d.getTime()) ? null : d;
}

function inVenster(lead, van, tot) {
  const d = alsDatum(lead && lead.datum);
  if (!d) return false;
  const t = d.getTime();
  return t >= van && t < tot;
}

/**
 * Het rapport over één week.
 *
 * @param {Array}  leads  gemapte leads (api/_leads-read.js)
 * @param {object} opties { tot?: Date }  einde van de periode, standaard nu
 * @returns {object} rapport
 */
function week(leads, opties) {
  const lijst = Array.isArray(leads) ? leads : [];
  const tot = (alsDatum(opties && opties.tot) || new Date()).getTime();
  const van = tot - 7 * DAG;
  const vorigeVan = van - 7 * DAG;

  const dezeWeek = lijst.filter((l) => inVenster(l, van, tot));
  const vorigeWeek = lijst.filter((l) => inVenster(l, vorigeVan, van));

  const tel = (rij) => ({
    leads: rij.length,
    gekwalificeerd: rij.filter((l) => l.qualified === true).length,
    geboekt: rij.filter((l) => l.afspraakGeboekt === true).length,
    boekingslink: rij.filter((l) => l.boekingslinkVerstuurd === true).length,
  });

  const nu = tel(dezeWeek);
  const toen = tel(vorigeWeek);

  /* Aandacht staat los van de week: een lead die tien dagen geleden vastliep
     wacht vandaag nog steeds. Hem weglaten omdat hij buiten het venster valt,
     verbergt precies het ding waarvoor je zou moeten opstaan. */
  const wachtOpJou = lijst.filter((l) => l && l.aiPaused === true);

  /* Gekwalificeerd maar nooit geboekt: dat is de stapel waar geld ligt. Alleen
     leads uit deze week, want een oude lijst is een ander gesprek. */
  const gekwalificeerdZonderAfspraak = dezeWeek.filter(
    (l) => l.qualified === true && l.afspraakGeboekt !== true
  );

  const genoegData = dezeWeek.length >= MIN_LEADS_VOOR_PATROON;

  return {
    van: new Date(van),
    tot: new Date(tot),
    cijfers: nu,
    vorigeWeek: toen,
    /* Vergelijken mag alleen als er vorige week iets stond om mee te
       vergelijken. Anders is "+100%" een verzonnen sprong vanaf nul. */
    vergelijkbaar: vorigeWeek.length > 0,
    verschil: vorigeWeek.length > 0 ? {
      leads: nu.leads - toen.leads,
      gekwalificeerd: nu.gekwalificeerd - toen.gekwalificeerd,
      geboekt: nu.geboekt - toen.geboekt,
    } : null,
    wachtOpJou: wachtOpJou.map((l) => ({ id: l.id, naam: l.naam || '', reden: l.samenvatting || '' })),
    gekwalificeerdZonderAfspraak: gekwalificeerdZonderAfspraak
      .map((l) => ({ id: l.id, naam: l.naam || '', reden: l.reden || '' })),
    genoegData,
    /* Was er iets? Zo niet, dan hoort het rapport dat te zeggen in plaats van
       een tabel met nullen te sturen die eruitziet als een storing. */
    stil: dezeWeek.length === 0 && wachtOpJou.length === 0,
  };
}

/* ── Wat Faro aanraadt ──────────────────────────────────────────────────────
 * Sleutels, geen zinnen: de tekst staat in api/_i18n.js en bestaat daar in vier
 * talen. Elke aanbeveling draagt het getal dat hem rechtvaardigt, zodat de
 * lezer zelf kan zien waar hij vandaan komt.
 *
 * Volgorde is prioriteit. Er komt er hoogstens EEN uit: een rapport met vijf
 * adviezen is een rapport dat niemand opvolgt.
 */
function aanbeveling(rap) {
  if (!rap) return null;

  // Iemand wacht op een mens. Gaat voor alles.
  if (rap.wachtOpJou.length > 0) {
    return {
      sleutel: 'faro.rap.adv.wacht',
      aantal: rap.wachtOpJou.length,
      leads: rap.wachtOpJou.slice(0, 5),
    };
  }

  // Gekwalificeerd, geen afspraak. Daar ligt het geld.
  if (rap.gekwalificeerdZonderAfspraak.length > 0) {
    return {
      sleutel: 'faro.rap.adv.geenAfspraak',
      aantal: rap.gekwalificeerdZonderAfspraak.length,
      leads: rap.gekwalificeerdZonderAfspraak.slice(0, 5),
    };
  }

  /* Pas hier een patroonuitspraak, en alleen met genoeg leads eronder. */
  if (rap.genoegData && rap.vergelijkbaar && rap.verschil && rap.verschil.geboekt > 0) {
    return { sleutel: 'faro.rap.adv.beter', aantal: rap.verschil.geboekt, leads: [] };
  }

  return null;
}

module.exports = { week, aanbeveling, MIN_LEADS_VOOR_PATROON };
