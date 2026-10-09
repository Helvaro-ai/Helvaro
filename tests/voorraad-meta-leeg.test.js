/*
 * F6 -- Meta-feed: nooit 200 met alleen een kopregel als er wagens te koop zijn
 * die allemaal uitgesloten werden (audit inventory F6).
 */
'use strict';
const pub = require('../api/_voorraad-publiek');
const { teller } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;
const fouten = []; const err = console.error; console.error = (...a) => fouten.push(a.join(' '));

const META = { addr1: 'Kerkstraat 1', city: 'Gent', region: 'Oost-Vlaanderen', postalCode: '9000', country: 'Belgium', lat: 51.05, lng: 3.71 };
const d = { bronRuw: JSON.stringify({ type: 'native', bronnen: [{ provider: 'meta', enabled: true, meta: META }] }) };
const ctx = { code: 'DEAL1', clientName: 'Garage' };
const wagen = (o) => Object.assign({ code: 'V1', merk: 'BMW', model: 'X5', prijs: 50000, km: 1000, inschrijving: '05/2023', kleur: 'Zwart', status: 'beschikbaar',
  gearchiveerd: false, fotos: ['https://img.example/1.jpg'], link: 'https://dealer.example/v/1' }, o);
const res = () => ({ code: 0, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
const vraag = (alle) => { const r = res(); pub._test.metaFeed(r, alle, ctx, d); return r; };

let r = vraag([wagen({ code: 'V1', kleur: '' }), wagen({ code: 'V2', kleur: '' })]);
ck('alle te koop staande wagens vallen uit (kleur): 503', r.code === 503, r.code);
ck('... no-store, geen csv', /no-store/.test(r.headers['cache-control'] || '') && typeof r.body !== 'string', r.headers);
ck('... het ontbrekende veld staat in het antwoord', r.body && r.body.ontbrekend && r.body.ontbrekend.kleur === 2, r.body);
ck('... en in de serverlog', fouten.some((f) => /meta-feed/.test(f) && /kleur/.test(f)), fouten);

r = vraag([wagen({ code: 'V1', kleur: '' }), wagen({ code: 'V2' })]);
ck('een deel valt uit: gewoon 200 met de rest', r.code === 200 && /V2/.test(r.body) && !/V1,/.test(r.body.split('\r\n').slice(1).join('')), r.code);

r = vraag([]);
ck('echt geen wagens: geldige lege feed (200, alleen kop)', r.code === 200 && /^vehicle_id,/.test(r.body) && r.body.trim().split('\r\n').length === 1, r.code);

r = vraag([wagen({ status: 'verkocht' }), wagen({ code: 'V2', gearchiveerd: true, kleur: '' })]);
ck('alleen verkocht/gearchiveerd: dat is "0 te koop" = geldige lege feed', r.code === 200, r.code);
console.error = err;
t.klaar();
