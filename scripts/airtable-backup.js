#!/usr/bin/env node
'use strict';
/*
 * Een leesbare momentopname van de hele Airtable-base.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * Alles wat dit product weet staat in Airtable: de leads, de gesprekken, de
 * afspraken, de klantconfiguratie, het grootboek. Airtable heeft revisie-
 * geschiedenis per record, maar dat helpt je niet bij het geval waar je het
 * voor nodig hebt: een base die per ongeluk wordt leeggegooid, een automation
 * die de verkeerde kant op loopt, of een account dat dicht gaat.
 *
 * Dit script haalt alles op en zet het als JSON op schijf. Meer niet. Het
 * SCHRIJFT NIETS naar Airtable en kan dus niets stukmaken.
 *
 *   node scripts/airtable-backup.js              → ./backups/<datum>/
 *   node scripts/airtable-backup.js --check      → alleen kijken of het kan
 *   node scripts/airtable-backup.js --uit /pad   → ergens anders wegschrijven
 *
 * Nodig: API_AIRTABLE en BASE_AIRTABLE (vercel env pull .env.local).
 *
 * ── Waarom de tabellenlijst niet in dit bestand staat ────────────────────────
 * Het zou makkelijker zijn om de tabel-id's hier hard te zetten -- ze staan
 * verspreid door api/ toch al. Maar dan mist deze backup stilzwijgend elke
 * tabel die er later bij komt, en dat merk je pas op de dag dat je hem nodig
 * hebt. Voor een backup is "stil iets overslaan" de duurste fout die er is.
 *
 * Dus vragen we het schema aan Airtable zelf. Lukt dat niet, dan stopt het
 * script met een uitleg in plaats van een halve backup te maken die eruitziet
 * als een hele.
 *
 * ── Wat dit NIET is ──────────────────────────────────────────────────────────
 * Geen restore. Terugzetten is geen omgekeerde van dit script: gekoppelde
 * records verwijzen naar record-id's die bij een herimport nieuw worden, dus
 * dat vraagt een volgorde en een vertaaltabel. Een backup die je nooit hebt
 * teruggezet is een aanname, geen backup -- zie LAUNCH.md.
 */

const fs   = require('fs');
const path = require('path');

const TOKEN = process.env.API_AIRTABLE;
const BASE  = process.env.BASE_AIRTABLE;
const API   = 'https://api.airtable.com/v0';

/* Dezelfde klok als de rest van de codebase. Een backup die blijft hangen op
   een trage verbinding is een cron die nooit afloopt. */
const TIMEOUT_MS = Math.max(5000, Number(process.env.BACKUP_TIMEOUT_MS || 30000));

async function haal(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    const e = new Error(`HTTP ${r.status} — ${t.slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/* Airtable staat 5 verzoeken per seconde toe per base. Ruim eronder blijven:
   dit script heeft geen haast en een 429 midden in een backup is precies wat
   je niet wil. */
const adem = () => new Promise((r) => setTimeout(r, 250));

async function tabellen() {
  const d = await haal(`${API}/meta/bases/${BASE}/tables`);
  return (d.tables || []).map((t) => ({ id: t.id, naam: t.name, velden: (t.fields || []).length }));
}

async function records(tabelId) {
  const uit = [];
  let offset = '';
  /* Geen ronde-limiet zoals elders in de codebase: daar is een plafond een
     bewuste keuze voor een SCHERM, hier zou het betekenen dat de backup
     zwijgend ophoudt. Doorlopen tot Airtable zegt dat het klaar is. */
  do {
    const url = `${API}/${BASE}/${encodeURIComponent(tabelId)}?pageSize=100`
              + (offset ? `&offset=${encodeURIComponent(offset)}` : '');
    const d = await haal(url);
    uit.push(...(d.records || []));
    offset = d.offset || '';
    if (offset) await adem();
  } while (offset);
  return uit;
}

(async () => {
  const args    = process.argv.slice(2);
  const alleenKijken = args.includes('--check');
  const uitIdx  = args.indexOf('--uit');
  const uitBasis = uitIdx !== -1 && args[uitIdx + 1]
    ? args[uitIdx + 1]
    : path.join(__dirname, '..', 'backups');

  if (!TOKEN || !BASE) {
    console.error('API_AIRTABLE en/of BASE_AIRTABLE ontbreken.');
    console.error('Haal ze op met `vercel env pull .env.local` en draai opnieuw.');
    process.exit(1);
  }

  let lijst;
  try {
    lijst = await tabellen();
  } catch (e) {
    console.error('Kon het schema van de base niet opvragen:', e.message);
    if (e.status === 403) {
      console.error('\n403 betekent hier bijna altijd: dit token mist de scope schema.bases:read.');
      console.error('Maak in Airtable een token met data.records:read EN schema.bases:read.');
    }
    console.error('\nGESTOPT. Liever geen backup dan een halve die eruitziet als een hele.');
    process.exit(1);
  }

  if (!lijst.length) {
    console.error('De base meldt nul tabellen. Dat klopt niet — gestopt.');
    process.exit(1);
  }

  console.log(`${lijst.length} tabel(len) gevonden in ${BASE}:`);
  for (const t of lijst) console.log(`  ${t.naam}  (${t.id}, ${t.velden} velden)`);

  if (alleenKijken) {
    console.log('\n--check: alleen gekeken, niets weggeschreven.');
    process.exit(0);
  }

  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const map = path.join(uitBasis, stempel);
  fs.mkdirSync(map, { recursive: true });

  let totaal = 0;
  const overzicht = [];
  for (const t of lijst) {
    process.stdout.write(`  ${t.naam} … `);
    try {
      const rs = await records(t.id);
      const bestand = path.join(map, `${t.id}-${t.naam.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
      fs.writeFileSync(bestand, JSON.stringify({ tabel: t, opgehaald: new Date().toISOString(), records: rs }, null, 2));
      console.log(`${rs.length} record(s)`);
      overzicht.push({ tabel: t.naam, id: t.id, records: rs.length, bestand: path.basename(bestand) });
      totaal += rs.length;
    } catch (e) {
      /* Eén tabel die faalt maakt de rest niet waardeloos, maar de backup is
         dan wel INCOMPLEET en dat moet er dik bovenop liggen. */
      console.log(`MISLUKT — ${e.message}`);
      overzicht.push({ tabel: t.naam, id: t.id, fout: e.message });
    }
    await adem();
  }

  const mislukt = overzicht.filter((o) => o.fout);
  fs.writeFileSync(path.join(map, '_overzicht.json'), JSON.stringify({
    base: BASE, gemaakt: new Date().toISOString(),
    tabellen: overzicht, totaalRecords: totaal, volledig: mislukt.length === 0,
  }, null, 2));

  console.log(`\n${totaal} record(s) uit ${lijst.length - mislukt.length}/${lijst.length} tabel(len) → ${map}`);
  if (mislukt.length) {
    console.log(`\nLET OP: ${mislukt.length} tabel(len) MISLUKT. Deze backup is niet compleet:`);
    for (const m of mislukt) console.log(`  ${m.tabel}: ${m.fout}`);
    process.exit(1);
  }
  console.log('Compleet.');
})().catch((e) => { console.error('\nOnverwachte fout:', e && e.message); process.exit(1); });
