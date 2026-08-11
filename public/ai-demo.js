/* ============================================================================
   Helvaro — live AI-demo voor de website
   ============================================================================
   Vervangt de nagemaakte telefoon-screenshot in de hero door een echt gesprek
   met de echte agent. Zelfde AI, zelfde instellingen, zelfde leadlijst als een
   betalende klant krijgt — alleen via de browser in plaats van via WhatsApp.

   Plaatsen op helvaro.pro:

     <div id="helvaro-ai-demo"></div>
     <script src="https://app.helvaro.pro/ai-demo.js" defer></script>

   Verder niets. Geen build, geen dependencies, geen framework. Het script
   maakt zijn eigen stijl aan onder een eigen prefix (hvd-), dus het kan geen
   bestaande CSS op de site omvergooien.

   Alle tekst staat onderaan in TXT, zodat aanpassen geen zoektocht door de
   code is.
   ============================================================================ */
(function () {
  'use strict';

  var API   = 'https://app.helvaro.pro/api/ai-demo';
  var MOUNT = document.getElementById('helvaro-ai-demo');
  if (!MOUNT) return;

  var TXT = {
    header:      'Mathis · Helvaro',
    status:      'Antwoordt meestal binnen enkele seconden',
    opener:      'Hoi! Ik ben de AI van Helvaro. Vraag me gerust wat we doen, wat het kost, of hoe het bij jouw bedrijf zou werken.',
    placeholder: 'Typ je vraag…',
    send:        'Stuur',
    contactAsk:  'Wil je dat ik dit op WhatsApp overneem? Laat je nummer achter.',
    contactPh:   '+32 4xx xx xx xx',
    contactBtn:  'Ja, bel me',
    contactOk:   'Top — je hoort snel van ons. 👋',
    contactBad:  'Dat nummer herken ik niet. Probeer +32…',
    error:       'Er ging even iets mis. Probeer het opnieuw.',
    busy:        'Even geduld…',
    disclaimer:  'Je praat met een AI. Berichten worden bewaard om contact met je op te nemen.',
  };

  // ── stijl ──────────────────────────────────────────────────────────────────
  // Huisstijlkleuren hard meegegeven, want dit script draait op de
  // marketingsite en kan niet rekenen op de CSS-variabelen van het dashboard.
  var css = ''
    + '#helvaro-ai-demo{--hvd-sand:#E8D7B1;--hvd-deep:#C9AE7C;--hvd-ink:#121212;--hvd-card:#232323;'
    + '--hvd-line:#2E2E2E;--hvd-text:#F9F9F9;--hvd-muted:#B5B5B5;font-family:inherit;}'
    + '.hvd-wrap{background:var(--hvd-ink);border:1px solid var(--hvd-line);border-radius:22px;'
    + 'overflow:hidden;max-width:420px;width:100%;display:flex;flex-direction:column;'
    + 'box-shadow:0 24px 60px rgba(0,0,0,.28)}'
    + '.hvd-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--hvd-line);background:var(--hvd-card)}'
    + '.hvd-av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--hvd-sand),var(--hvd-deep));'
    + 'color:var(--hvd-ink);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}'
    + '.hvd-name{color:var(--hvd-text);font-weight:600;font-size:14px;line-height:1.2}'
    + '.hvd-sub{color:var(--hvd-muted);font-size:11px;margin-top:2px}'
    + '.hvd-log{padding:18px;display:flex;flex-direction:column;gap:10px;height:360px;overflow-y:auto}'
    + '.hvd-b{max-width:82%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}'
    + '.hvd-ai{background:var(--hvd-card);color:var(--hvd-text);border-bottom-left-radius:5px;align-self:flex-start}'
    + '.hvd-me{background:var(--hvd-sand);color:var(--hvd-ink);border-bottom-right-radius:5px;align-self:flex-end}'
    + '.hvd-dots{display:flex;gap:4px;padding:14px}'
    + '.hvd-dots i{width:6px;height:6px;border-radius:50%;background:var(--hvd-muted);animation:hvd-bounce 1.2s infinite}'
    + '.hvd-dots i:nth-child(2){animation-delay:.15s}.hvd-dots i:nth-child(3){animation-delay:.3s}'
    + '@keyframes hvd-bounce{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}'
    + '.hvd-foot{border-top:1px solid var(--hvd-line);padding:12px;background:var(--hvd-card)}'
    + '.hvd-row{display:flex;gap:8px}'
    + '.hvd-in{flex:1;background:var(--hvd-ink);border:1px solid var(--hvd-line);border-radius:12px;'
    + 'padding:11px 14px;color:var(--hvd-text);font-size:14px;font-family:inherit;outline:none;min-width:0}'
    + '.hvd-in:focus{border-color:var(--hvd-deep)}'
    + '.hvd-in::placeholder{color:var(--hvd-muted)}'
    + '.hvd-btn{background:var(--hvd-sand);color:var(--hvd-ink);border:0;border-radius:12px;padding:11px 18px;'
    + 'font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '.hvd-btn:disabled{opacity:.5;cursor:default}'
    + '.hvd-note{color:var(--hvd-muted);font-size:10px;text-align:center;margin-top:8px;line-height:1.4}'
    + '@media(prefers-reduced-motion:reduce){.hvd-dots i{animation:none}}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── opbouw ─────────────────────────────────────────────────────────────────
  // Alles via createElement/textContent, nooit innerHTML met serverdata: wat de
  // AI teruggeeft is tekst, geen markup, en zo kan het dat ook nooit worden.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls)  n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var wrap = el('div', 'hvd-wrap');
  var head = el('div', 'hvd-head');
  var av   = el('div', 'hvd-av', 'M');
  var hbox = el('div');
  hbox.appendChild(el('div', 'hvd-name', TXT.header));
  hbox.appendChild(el('div', 'hvd-sub', TXT.status));
  head.appendChild(av); head.appendChild(hbox);

  var log  = el('div', 'hvd-log');
  var foot = el('div', 'hvd-foot');
  var row  = el('div', 'hvd-row');
  var input = el('input', 'hvd-in');
  input.type = 'text';
  input.placeholder = TXT.placeholder;
  input.setAttribute('aria-label', TXT.placeholder);
  input.maxLength = 400;
  var btn = el('button', 'hvd-btn', TXT.send);
  btn.type = 'button';
  row.appendChild(input); row.appendChild(btn);
  foot.appendChild(row);
  foot.appendChild(el('div', 'hvd-note', TXT.disclaimer));

  wrap.appendChild(head); wrap.appendChild(log); wrap.appendChild(foot);
  MOUNT.appendChild(wrap);

  // ── staat ──────────────────────────────────────────────────────────────────
  var history = [];      // {role, content} — gaat mee naar de server
  var busy    = false;
  var mode    = 'chat';  // 'chat' | 'contact' | 'done'
  var visitorName = '';

  function bubble(who, text) {
    var b = el('div', 'hvd-b ' + (who === 'me' ? 'hvd-me' : 'hvd-ai'), text);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  function typing(on) {
    var old = log.querySelector('.hvd-dots');
    if (old) old.remove();
    if (!on) return;
    var d = el('div', 'hvd-dots');
    d.appendChild(el('i')); d.appendChild(el('i')); d.appendChild(el('i'));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    input.disabled = on;
    btn.textContent = on ? TXT.busy : (mode === 'contact' ? TXT.contactBtn : TXT.send);
  }

  function toContactMode() {
    mode = 'contact';
    input.type = 'tel';
    input.value = '';
    input.placeholder = TXT.contactPh;
    input.maxLength = 24;
    btn.textContent = TXT.contactBtn;
    input.focus();
  }

  async function send() {
    if (busy) return;
    var value = input.value.trim();
    if (!value) return;

    // In contactmodus is de invoer een telefoonnummer, geen chatbericht: het
    // gaat als `contact` mee zodat de server er een lead van maakt.
    var asContact = (mode === 'contact');

    bubble('me', value);
    input.value = '';
    setBusy(true);
    typing(true);

    var payload = asContact
      ? { message: 'contact', contact: value, name: visitorName, history: history }
      : { message: value, name: visitorName, history: history };

    if (!asContact) history.push({ role: 'user', content: value });

    var data = null;
    try {
      var r = await fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      data = await r.json();
      if (!r.ok) throw new Error((data && data.error) || ('http ' + r.status));
    } catch (e) {
      typing(false);
      setBusy(false);
      bubble('ai', (data && data.error) || TXT.error);
      return;
    }

    typing(false);
    setBusy(false);

    if (asContact) {
      if (data.leadCreated) {
        bubble('ai', TXT.contactOk);
        mode = 'done';
        input.disabled = true; btn.disabled = true;
      } else {
        bubble('ai', TXT.contactBad);
        input.focus();
      }
      return;
    }

    bubble('ai', data.reply);
    history.push({ role: 'assistant', content: data.reply });

    if (data.askContact) {
      bubble('ai', TXT.contactAsk);
      toContactMode();
    }
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  bubble('ai', TXT.opener);
  history.push({ role: 'assistant', content: TXT.opener });
})();
