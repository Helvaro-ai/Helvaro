/*
 * Elke client.fields[...] moet een ECHT Airtable-veld-id gebruiken.
 *
 * ── Wat er misging ──────────────────────────────────────────────────────────
 * getClientByCode() haalt de klantconfig op met returnFieldsByFieldId=true.
 * `record.fields` is daardoor gesleuteld op VELD-ID, niet op veldnaam. Een
 * terugval als `fields['Website']` kan dus per definitie nooit iets vinden --
 * hij ziet eruit als een vangnet en is er geen.
 *
 * Twee regels hadden helemaal geen echt id en leunden volledig op die
 * terugval, en lazen dus ALTIJD undefined:
 *
 *   const website        = fields['fldWebsiteUrl']     || fields['Website'];
 *   const aiInstructions = fields['fldAiInstructions'] || fields['AI Instructions'];
 *
 * Geen van beide id's bestaat. 'fldAiInstructions' is extra gemeen: hij is
 * toevallig precies even lang als een echt id (fld + 14 tekens), dus hij
 * doorstaat elke controle die alleen naar de VORM kijkt.
 *
 * Gevolg: de assistent las de website van de klant nooit, en de instructies
 * van de klant kwamen nooit in de prompt. Allebei velden die op het
 * aanmeldscherm prominent staan -- "Website (sterk aangeraden)" en
 * "Tone-of-voice & instructies".
 *
 * ── Waarom deze test naar ALLE toegangen kijkt ──────────────────────────────
 * De twee regels repareren is niet genoeg: de volgende typefout is net zo
 * onzichtbaar. Daarom staat hieronder de echte veldenlijst van Client Config,
 * en valt elk id dat daar niet in staat om.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');

/* Alleen naar CODE kijken, niet naar commentaar. Het commentaar bij deze
   reparatie citeert de oude, verzonnen id's om uit te leggen waarom ze weg
   zijn -- en zonder deze stap zou de test daarop aanslaan en dus rood staan
   op zijn eigen uitleg.

   Blokcommentaar gaat er integraal uit. Regelcommentaar alleen als de regel
   ERMEE BEGINT: `//` middenin een regel zit ook in elke https://-url, en die
   weghalen zou echte code afkappen. */
const code = bron
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');

/* De echte veld-id's van Client Config, overgenomen uit het live schema van
   de base (Lead Qualification System, tabel Client Config). Komt er een veld
   bij dat whatsapp.js gaat lezen, dan hoort het hier ook bij te komen -- dat
   is precies het moment waarop je wil weten dat je een id verzint. */
const CLIENT_CONFIG_IDS = new Set([
  'fldAnB848Sr5jl6dq', // Client Name
  'fld0BsPnDbBOkTHzr', // Niche
  'fldNEj1ysRgINOOtr', // Calendly Link
  'fld1lqHctRbqFGQf5', // AI Instructions
  'fldCbawcED6zZCqIS', // Active
  'fldN4dL0bGgfBOXwM', // Project Code
  'fldhmnzVjrb2AyqJr', // API Key
  'fldzBclLhryWQ1veO', // Website
  'fldRvoe1JMPOtPWC7', // AI Name
  'fldnFRoxuY4dqhAnS', // Lead Limiet
  'fldDBJCN6dVMA8jax', // Rapport Email
  'fldx17jwQG202JhYF', // Plan
  'fldTvMSdTZOyNgWod', // Adres
  'fldOGdVq6T54xEo6W', // Auto-Reply Template
  'fld2GjRvjpsxI8XD0', // Email
  'fldecVolseGXtQaAN', // Phone
  'fld1iiV9XwSbgAACZ', // Language
  'fldq5oIqw5MG8fKhc', // Working Hours
  'fldUI9BYO0TplgYlm', // Booking Method
  'fldKvMVBalSBRQE7H', // Callback Window
  'fldZEApe0gfse07AU', // Notify Phone
  'fldnbM5YKh274ISAl', // AI Learned Patterns
  'fldkYmK3jAabvytCF', // Google Refresh Token
  'fldXF7qdyHYnSjnGf', // Google Calendar Email
  'fldWBxxhGYEZNIMqA', // Google Calendar ID
  'fld9mvXHNs72zW4fK', // Match Lead Language
  'fldbrhlSrsmlJwcYr', // WhatsApp Phone Number ID
  'fldCEqMp5zs1Wos3T', // WhatsApp WABA ID
  'fldJeZtaPXfHdWcdr', // Vertical
  'fldN3R2xSWisZJAYe', // Max Discount EUR
  'fldzSAjX5kKYwJtMp', // Faro Discount Limit EUR
  'fldsgfhRKASDCMeaT', // Email Verification Status
]);

console.log('\n— de ophaalmethode die dit allemaal veroorzaakt —');
{
  /* Het anker. Verdwijnt returnFieldsByFieldId, dan zijn naam-sleutels ineens
     WEL geldig en verandert de hele redenering van deze test. */
  ck('getClientByCode haalt nog steeds op met returnFieldsByFieldId=true',
     /returnFieldsByFieldId=true/.test(bron),
     'zonder dit zijn veldNAMEN geldig en mag deze test opnieuw gewogen worden');
}

console.log('\n— geen enkel verzonnen veld-id —');
{
  const gebruikt = [...code.matchAll(/client\.fields\[\s*'([^']+)'\s*\]/g)].map((m) => m[1]);
  ck('er worden client.fields-toegangen gevonden', gebruikt.length > 5, gebruikt.length);

  /* Alles wat op een id LIJKT moet ook een echt id ZIJN. Dit is de controle
     die 'fldAiInstructions' had gevangen. */
  const idAchtig = gebruikt.filter((k) => /^fld/.test(k));
  const verzonnen = [...new Set(idAchtig.filter((k) => !CLIENT_CONFIG_IDS.has(k)))];
  ck('elk fld-achtig id bestaat echt in Client Config',
     verzonnen.length === 0,
     'onbekend: ' + verzonnen.join(', '));
}

console.log('\n— de twee regels die stuk waren —');
{
  const website = (code.match(/const website\s*=\s*client\.fields\[[^;]*;/) || [''])[0];
  ck('de website leest een echt veld-id',
     /fldzBclLhryWQ1veO/.test(website), website);
  ck("en niet meer 'fldWebsiteUrl' in de code", !/fldWebsiteUrl/.test(code), null);

  const instr = (code.match(/const aiInstructions\s*=\s*client\.fields\[[^;]*;/) || [''])[0];
  ck('de instructies lezen een echt veld-id',
     /fld1lqHctRbqFGQf5/.test(instr), instr);
  ck("en niet meer 'fldAiInstructions' in de code", !/fldAiInstructions/.test(code), null);
}

console.log('\n— en ze komen ook echt bij de AI terecht —');
{
  /* Zonder dit zou een gerepareerde uitlezing nog steeds nergens heen gaan. */
  ck('aiInstructions en websiteContent gaan mee in de runAI-aanroep',
     /runAI\(\s*history,\s*aiInstructions,[\s\S]{0,120}websiteContent/.test(code), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
