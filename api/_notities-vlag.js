'use strict';
/*
 * Gedeelde Notities-merge voor de waFailed-vlag ("Niet bereikbaar").
 *
 * Stond eerst in api/whatsapp.js, terwijl api/form.js een eigen variant had die
 * het hele Notities-veld OVERSCHREEF met een lege envelop. Op het moment dat die
 * overschrijving draaide stonden in Notities al het toestemmingsbewijs (AVG art.
 * 7 lid 1), de voertuigcode en het e-mailadres van de lead -- allemaal weg, juist
 * bij de leads waarvan de WhatsApp-begroeting mislukte. Eén functie voor beide
 * plekken, zodat ze niet meer uit elkaar kunnen lopen.
 *
 * Notities is niet altijd JSON: kale tekst uit de tijd vóór de JSON-envelop
 * wordt als {id:'legacy'}-notitie bewaard in plaats van vernietigd.
 *
 * `detail` (optioneel): Meta's foutcode/titel van een 'failed'-status. Rijdt mee
 * in dezelfde envelop als de bestaande waFailed-vlag.
 */
function mergeWaFailedFlag(raw, detail) {
  const trimmed = raw ? String(raw).trim() : '';
  let data    = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch { /* malformed JSON: fall through, preserve as legacy text below */ }
  }
  if (!handled && trimmed) {
    data.notes = [{ id: 'legacy', text: trimmed, ts: new Date().toISOString() }];
  }
  data.waFailed = true;
  if (detail && (detail.code !== undefined || detail.title !== undefined)) {
    data.waFailedReason = { code: detail.code ?? null, title: detail.title ?? null, at: new Date().toISOString() };
  }
  return JSON.stringify(data);
}

module.exports = { mergeWaFailedFlag };
