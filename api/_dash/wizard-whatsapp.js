'use strict';
/*
 * Eigen WhatsApp-nummer koppelen (Meta Embedded Signup), client-side.
 *
 * Twee plekken gebruiken precies dezelfde koppeling: Instellingen -> WhatsApp
 * (waesKoppelen in api/dashboard.js) en de wizard-stap 'kanalen' (hieronder).
 * De kern staat daarom op EEN plek: waesKern(). Die laadt de Facebook-SDK,
 * opent de popup, wacht op de id's die Meta met een postMessage meestuurt en
 * stuurt code + waba_id + phone_number_id naar 'wa-es-complete'. Er is ook
 * maar EEN message-listener. De projectcode komt nooit uit de browser.
 *
 * Verder in dit bestand:
 *   - de WhatsApp-kaart van de wizard (wizWaKaart): vier toestanden, afgeleid
 *     van wa-es-status + wa-readiness in de zuivere functie wizWaToestand;
 *   - de rij(en) op Klaar die daaruit volgen (wizKlaarWhatsApp);
 *   - de Meta-catalogus-kaart en het aantal voorraadbronnen op de stap
 *     'koppelingen' (dealers);
 *   - een zin over platformmails op de e-mailkaart (dealers).
 *
 * Hoe het erin komt: zoals api/_dash/wizard-volledig.js. De functie hieronder
 * wordt NOOIT op de server uitgevoerd; js() geeft de broncode van haar romp
 * terug en api/dashboard.js plakt die in het clientscript. Geen backticks en
 * geen dollar-accolade in deze romp: het ding wordt in een template literal
 * geplakt. De romp gebruikt de globale namen van het dashboard (tr, escHtml,
 * toast, API_BASE, state, wizKnop, wizBadge, wizUitleg, wizEl,
 * wizNaarInstellingen, wizardTaalNaam, _wizStatus, laadWaes).
 */
/* eslint-disable no-undef, no-unused-vars */
function client() {
/* ── Embedded Signup: de gedeelde kern ──────────────────────────────────── */
var _waesSdkKlaar = null;
var _waesGekozen = null;

function waesSdk(appId) {
  if (_waesSdkKlaar) return _waesSdkKlaar;
  _waesSdkKlaar = new Promise(function (resolve, reject) {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = function () {
      try { FB.init({ appId: appId, autoLogAppEvents: false, xfbml: false, version: 'v23.0' }); resolve(window.FB); }
      catch (e) { reject(e); }
    };
    var sc = document.createElement('script');
    sc.src = 'https://connect.facebook.net/en_US/sdk.js';
    sc.async = true; sc.defer = true; sc.crossOrigin = 'anonymous';
    sc.onerror = function () { reject(new Error('sdk')); };
    document.head.appendChild(sc);
    setTimeout(function () { reject(new Error('sdk-timeout')); }, 15000);
  });
  return _waesSdkKlaar;
}

/* Meta stuurt waba_id + phone_number_id met een postMessage vanuit de popup. */
window.addEventListener('message', function (event) {
  if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
  var data = null;
  try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (e) { return; }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;
  if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
    _waesGekozen = { wabaId: String((data.data && data.data.waba_id) || ''), phoneNumberId: String((data.data && data.data.phone_number_id) || '') };
  } else if (data.event === 'CANCEL') {
    _waesGekozen = { cancelled: true };
  }
});

/* d = het antwoord van wa-es-status (appId, configId). Geeft {ok:true},
   {cancelled:true} of {error:'<zin van de server of leeg>'}; gooit nooit.
   De aanroeper toont zelf de melding en tekent zijn eigen scherm. */
async function waesKern(d) {
  if (!d || !d.beschikbaar) return { error: '' };
  _waesGekozen = null;
  try {
    var FBsdk = await waesSdk(d.appId);
    var antwoord = await new Promise(function (resolve) {
      FBsdk.login(function (resp) { resolve(resp); }, {
        config_id: d.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
      });
    });
    var code = antwoord && antwoord.authResponse && antwoord.authResponse.code;
    /* De message met de id's komt soms net na de login-callback. */
    for (var i = 0; i < 20 && !_waesGekozen; i++) await new Promise(function (r) { setTimeout(r, 150); });
    if (!code || !_waesGekozen || _waesGekozen.cancelled || !_waesGekozen.wabaId || !_waesGekozen.phoneNumberId) {
      return { cancelled: true };
    }
    var r = await fetch(API_BASE + '/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'wa-es-complete', code: code, wabaId: _waesGekozen.wabaId, phoneNumberId: _waesGekozen.phoneNumberId })
    });
    var uit = await r.json().catch(function () { return {}; });
    if (!r.ok) return { error: String((uit && uit.error) || '') };
    return { ok: true };
  } catch (e) {
    return { error: '' };
  }
}

/* ── Wizard, stap 'kanalen': de WhatsApp-kaart ──────────────────────────── */
function wizWaVraag(mode) {
  return fetch(API_BASE + '/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
    body: JSON.stringify({ mode: mode })
  }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}

/* Wat is er waar? Zuivere functie, geen netwerk.
     es    = antwoord van wa-es-status, of null (niet op te halen)
     klaar = antwoord van wa-readiness, of null
   soort: 'eigen'      er hangt een eigen nummer
          'koppelbaar' Embedded Signup staat aan, nog geen eigen nummer
          'gedeeld'    alleen het gedeelde nummer (Embedded Signup staat uit)
   whatsapp (voor _wizStatus): true / false / null (niet te weten).
   Een dealer draait op het gedeelde nummer al door omdat de koper het gesprek
   zelf begint; een andere markt hangt aan goedgekeurde sjablonen. */
function wizWaToestand(es, klaar, dealer) {
  var beschikbaar = !!(es && es.beschikbaar);
  var eigen = !!(es && es.gekoppeld);
  var t = { soort: eigen ? 'eigen' : (beschikbaar ? 'koppelbaar' : 'gedeeld'), beschikbaar: beschikbaar, sjablonen: '', whatsapp: null,
    eigenNr: (beschikbaar || eigen) ? eigen : null };
  if (eigen) {
    var et = klaar && klaar.eigenToestand;
    t.sjablonen = !et || et.onbekend ? 'onbekend' : (klaar.klaar === true ? 'klaar' : 'bezig');
    if (dealer) t.whatsapp = true;
    else t.whatsapp = t.sjablonen === 'klaar' ? true : (t.sjablonen === 'bezig' ? false : null);
    return t;
  }
  if (dealer) t.whatsapp = true;
  else if (klaar && klaar.ondersteund === false) t.whatsapp = false;
  else if (klaar && typeof klaar.klaar === 'boolean') t.whatsapp = klaar.klaar;
  return t;
}

/* De toestand in _wizStatus zetten; Klaar leest die. */
function wizWaZet(t) {
  _wizStatus.whatsapp = t.whatsapp;
  _wizStatus.eigenNr = t.eigenNr;
}

/* Voor Klaar: dezelfde afleiding zonder tekenen. */
function wizKlaarWhatsApp(es, klaar, dealer) {
  wizWaZet(wizWaToestand(es, klaar, dealer));
}

/* Gedeeld nummer, niet-dealer: de sjabloonstatus per taal. */
function wizWaGedeeldTekst(klaar) {
  if (!klaar) return { badge: tr('wiz.klaar.onbekend'), kleur: '', uitleg: tr('wiz.later.dashboard') };
  var taal = wizardTaalNaam(klaar.taal);
  if (!klaar.ondersteund) return { badge: tr('wiz.wa.nietMogelijk'), kleur: 'var(--danger-ink, #b91c1c)', uitleg: tr('wiz.wa.geenTaal', { taal: taal }) };
  if (klaar.klaar) return { badge: tr('st.klaar'), kleur: 'var(--success-ink, #15803d)', uitleg: tr('wiz.wa.klaarSub', { taal: taal }) };
  return { badge: tr('wiz.wa.bezig'), kleur: 'var(--warning-ink, #b45309)', uitleg: tr('wiz.wa.bezigSub', { taal: taal }) };
}

function wizWaExtra(html) {
  var extra = wizEl('wiz-wa-extra');
  if (extra) extra.innerHTML = html;
}
function wizWaAlinea(tekst) { return '<p class="wiz-kaart-uitleg">' + escHtml(tekst) + '</p>'; }

/* Haalt de stand op en tekent de kaart. Veilig om opnieuw aan te roepen (na
   het koppelen). */
async function wizWaKaart(dealer) {
  if (dealer) _wizStatus.whatsapp = true;
  var res = await Promise.all([wizWaVraag('wa-es-status'), wizWaVraag('wa-readiness')]);
  var es = res[0], klaar = res[1];
  var t = wizWaToestand(es, klaar, dealer);
  wizWaZet(t);
  if (!wizEl('wiz-wa-badge') || !wizEl('wiz-wa-uitleg')) return t;   // de dealer is al doorgeklikt

  if (t.soort === 'eigen') {
    var n = (es && es.nummer) || {};
    /* De naam hoort bij het nummer, niet achter de laatste zin. */
    var op = n.number ? tr('wiz.wa.eigen.op', { nr: n.number + (n.name ? ' (' + n.name + ')' : '') })
      : tr('wiz.wa.eigen.opGeen') + (n.name ? ' (' + n.name + ')' : '');
    wizBadge('wa', tr('wiz.wa.eigen.badge'), 'var(--success-ink, #15803d)');
    wizUitleg('wa', op);
    wizWaExtra(wizWaAlinea(tr('wiz.wa.sjab.' + t.sjablonen)));
    return t;
  }

  if (dealer) {
    wizBadge('wa', tr('wiz.wa.dealer.badge'));
    wizUitleg('wa', tr('wiz.wa.dealer') + (t.soort === 'gedeeld' ? ' ' + tr('wiz.wa.dealer.geenEigen') : ''));
  } else {
    var g = wizWaGedeeldTekst(klaar);
    wizBadge('wa', g.badge, g.kleur);
    wizUitleg('wa', g.uitleg);
  }

  if (t.soort === 'koppelbaar') {
    wizWaExtra(wizWaAlinea(tr('wiz.wa.eigen.waarom')) + wizWaAlinea(tr('wiz.wa.eigen.later'))
      + '<button id="wiz-wa-eigen-knop" type="button" class="wiz-kaart-knop">' + escHtml(tr('wiz.wa.eigen.knop')) + '</button>');
    var knop = wizEl('wiz-wa-eigen-knop');
    if (knop) knop.onclick = function () { return wizWaKoppel(dealer, es); };
  } else if (dealer) {
    wizWaDealerKnop();
  }
  return t;
}

/* De knop op de kaart: dezelfde kern als Instellingen. */
async function wizWaKoppel(dealer, es) {
  var knop = wizEl('wiz-wa-eigen-knop');
  if (!knop || knop.disabled) return;
  knop.disabled = true;
  knop.textContent = tr('set.waes.busy');
  var r = await waesKern(es);
  if (r.ok) {
    toast(tr('set.waes.done'), 'success');
    wizWaExtra('');
    wizUitleg('wa', tr('wiz.controleren'));
    await wizWaKaart(dealer);
    return;
  }
  if (r.cancelled) toast(tr('set.waes.cancelled'), 'info');
  else toast(r.error || tr('set.waes.failed'), 'error');
  var k2 = wizEl('wiz-wa-eigen-knop');
  if (k2) { k2.disabled = false; k2.textContent = tr('wiz.wa.eigen.knop'); }
}

/* Dealers, e-mailkaart: wat platformmails worden. De platformen staan in
   api/_email/platformlead.js (PLATFORMEN). */
function wizMailDealerZin() {
  var extra = wizEl('wiz-mail-extra');
  if (extra) extra.innerHTML = wizWaAlinea(tr('wiz.mail.dealer'));
}

/* ── Wizard, stap 'koppelingen' (dealers) ───────────────────────────────── */
/* "2 bronnen gekoppeld", of leeg als er geen is. d = inventory-status/check. */
function wizVoorraadBronnenTekst(d) {
  var n = ((d && d.bronnen) || []).filter(function (k) { return k && !k.alleenPubliceren; }).length;
  if (!n) return '';
  return n === 1 ? tr('wiz.voorraad.bronnenAantal.een') : tr('wiz.voorraad.bronnenAantal', { n: n });
}

/* De Meta-kaart uit het antwoord van inventory-providers (of null). Zuiver. */
function wizMetaToestand(d) {
  if (!d || !d.ok || !Array.isArray(d.providers)) return null;
  var p = null;
  for (var i = 0; i < d.providers.length; i++) if (d.providers[i] && d.providers[i].auth === 'catalog_feed') { p = d.providers[i]; break; }
  if (!p) return null;
  var mist = ((p.meta && p.meta.ontbreekt) || []).slice();
  return {
    aan: p.geconfigureerd === true,
    mist: mist,
    inFeed: p.feedTelling && typeof p.feedTelling.inFeed === 'number' ? p.feedTelling.inFeed : null
  };
}

async function wizMetaStatus() {
  var d = await wizWaVraag('inventory-providers');
  var m = wizMetaToestand(d);
  _wizStatus.meta = m ? m.aan : null;
  if (!wizEl('wiz-meta-badge')) return m;
  if (!m) {
    wizBadge('meta', tr('wiz.klaar.onbekend'));
    wizUitleg('meta', tr('wiz.later.instellingen'));
  } else if (m.aan) {
    wizBadge('meta', tr('ig.status.ACTIVE'), 'var(--success-ink, #15803d)');
    wizUitleg('meta', m.inFeed === null ? tr('wiz.meta.aanZonder') : (m.inFeed === 0 ? tr('wiz.meta.aanLeeg') : tr('wiz.meta.aan', { n: m.inFeed })));
  } else {
    wizBadge('meta', tr('ig.status.TE_DOEN'));
    var lijst = m.mist.map(function (k) { return tr('ig.meta.mist.' + k); }).join(', ');
    wizUitleg('meta', tr('wiz.meta.uit') + (lijst ? ' ' + tr('wiz.meta.mist', { lijst: lijst }) : ''));
  }
  wizKnop('meta', tr('wiz.meta.knop'), function () { wizNaarInstellingen('set-integraties'); });
  return m;
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
