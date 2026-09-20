'use strict';
/* ── WhatsApp-meldingen aan de eigenaar: aan of uit ────────────────────────
   Eén schakelaar op Client Config ("WhatsApp Alert Off", checkbox,
   fldIJcwzKDYvZa9w4), gezet vanuit Instellingen → Meldingen. Staat hij aan,
   dan gaat er GEEN WhatsApp meer naar het Notify Phone van de klant: geen
   "Nieuwe lead", geen "[Afgemeld]", geen escalatie, geen dagmail-ping. De
   e-mailmeldingen blijven; dit gaat alleen over de WhatsApp-kant.

   Waarom dit bestaat (2026-09-20): tijdens de Meta-screencast is Sindi zowel
   de lead als de eigenaar, met één nummer -- en dan staat "Nieuwe lead via
   Helvaro" tussen de berichten die de lead hoort te zien. Maar een klant
   die de meldingen gewoon niet wil (hij zit toch de hele dag in het
   dashboard) heeft dezelfde knop nodig.

   Elke plek die naar de eigenaar appt, haalt het nummer HIER: dan is er één
   regel die bepaalt of het uitgaat, en niet zes kopieën van dezelfde if.
   Klantrecords komen in twee vormen langs (veldnamen en veld-id's), vandaar
   beide sleutels. Afwezig veld = uit = meldingen gaan gewoon, zoals altijd. */

const F_UIT    = 'fldIJcwzKDYvZa9w4';
const F_NOTIFY = 'fldZEApe0gfse07AU';

function waUit(clientFields) {
  const f = clientFields || {};
  return f[F_UIT] === true || f['WhatsApp Alert Off'] === true;
}

/** Het nummer waar eigenaarsmeldingen naartoe mogen, of '' als ze uit staan. */
function nummer(clientFields, terugval) {
  if (waUit(clientFields)) return '';
  const f = clientFields || {};
  return (f[F_NOTIFY] || f['Notify Phone'] || '').toString().trim() || (terugval || '');
}

module.exports = { waUit, nummer, F_UIT, F_NOTIFY };
