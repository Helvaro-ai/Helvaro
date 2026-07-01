// Publieke, niet-gevoelige health-check voor de dagelijkse social posting.
// Geeft ENKEL aggregaten terug (geen post-content), zodat een lokaal launchd-
// script op de Mac kan alarmeren via iMessage als er iets fout ging.
// GET /api/social-health -> { date, expected, total, posted, failed, pending, ok }

module.exports = async (req, res) => {
  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID = process.env.BASE_AIRTABLE || 'apppcJenvfk8e8vTa';
  const POSTS_TABLE = 'tblPxnfb5MThgsnaA';
  res.setHeader('Cache-Control', 'no-store');
  if (!AIRTABLE_TOKEN) return res.status(200).json({ ok: false, error: 'no airtable token' });

  const today = new Date().toISOString().slice(0, 10);
  const start = today + 'T00:00:00.000Z';
  const end = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00.000Z';
  const f = encodeURIComponent(`AND(IS_AFTER({Scheduled For}, "${start}"), IS_BEFORE({Scheduled For}, "${end}"))`);

  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${POSTS_TABLE}?filterByFormula=${f}&pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'airtable ' + r.status });
    const recs = ((await r.json()).records) || [];
    let posted = 0, failed = 0, pending = 0;
    for (const rec of recs) {
      const s = String((rec.fields && rec.fields.Status) || '').toLowerCase();
      if (s === 'posted') posted++;
      else if (s === 'failed') failed++;
      else if (s === 'approved') pending++;
    }
    const expected = 6;
    // Gezond = geen mislukte posts en er staan minstens 'expected' posts gepland.
    const ok = failed === 0 && recs.length >= expected;
    return res.status(200).json({ date: today, expected, total: recs.length, posted, failed, pending, ok });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'fetch failed' });
  }
};
